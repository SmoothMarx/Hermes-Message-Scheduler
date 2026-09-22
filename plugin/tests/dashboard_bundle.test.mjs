/**
 * Web-dashboard bundle contracts.
 *
 * The dashboard loads `dashboard/dist/index.js` as a plain IIFE against
 * `window.__HERMES_PLUGIN_SDK__` — no bundler, no JSX transform. This test runs the
 * shipped file in a VM with a stub SDK, drives the mount effects, and re-renders, so
 * the ready / error branches are both real.
 *
 *   node --test plugin/tests/dashboard_bundle.test.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BUNDLE = path.join(here, '..', 'dashboard', 'dist', 'index.js')
const PREFIX = '/api/plugins/message-scheduler'

const FIXTURES = {
  '/summary': {
    queued: 2, due_now: 1, next_at: '2030-01-01T09:00:00Z', contacts: 1938,
    history: { sent: 12, failed: 1, missed: 0 }, db_path: '/tmp/ms/data/scheduler.db',
    bridge_url: 'http://127.0.0.1:9190', bridge: { reachable: true, detail: 'ok' }
  },
  '/jobs': {
    jobs: [{ id: 1, person: 'Ana', network: 'telegram', text: 'hello there',
             time: '2030-01-01T09:00:00Z', status: 'pending', attachments: [] }],
    count: 1
  },
  '/history?limit=50': {
    history: [{ id: 7, person: 'Bea', network: 'whatsapp', text: 'earlier', status: 'sent',
                time: '2026-09-22T09:00:00Z', error: '' }],
    count: 1
  },
  '/settings/notify': { channel: '', identifier: '', user_name: 'there' }
}

function createHarness(fetchImpl) {
  const calls = []
  const registered = []
  const state = { store: [], index: 0, effects: [] }

  const h = (type, props, ...children) => {
    const merged = { ...(props || {}) }
    // Only override children when they were passed positionally — the bundle
    // sometimes passes a children array inside the props object instead.
    if (children.length) merged.children = children.length === 1 ? children[0] : children
    return { type, props: merged }
  }

  const React = {
    createElement: h,
    useState(initial) {
      const i = state.index++
      if (!(i in state.store)) state.store[i] = initial
      return [
        state.store[i],
        next => {
          state.store[i] = typeof next === 'function' ? next(state.store[i]) : next
        }
      ]
    },
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useRef: value => ({ current: value }),
    useEffect: fn => state.effects.push(fn)
  }

  const component = name =>
    function Stub(props) {
      return h('div', { 'data-slot': name, ...(props || {}) })
    }

  const SDK = {
    React,
    hooks: React,
    components: {
      Card: component('card'),
      CardHeader: component('card-header'),
      CardTitle: component('card-title'),
      CardContent: component('card-content'),
      Badge: component('badge'),
      Button: component('button'),
      Input: component('input'),
      Label: component('label'),
      Select: component('select'),
      SelectOption: component('select-option'),
      Separator: component('separator'),
      Tabs: component('tabs'),
      TabsList: component('tabs-list'),
      TabsTrigger: component('tabs-trigger')
    },
    utils: { cn: (...p) => p.filter(Boolean).join(' '), timeAgo: () => '', isoTimeAgo: () => '' },
    fetchJSON: (url, opts) => {
      calls.push({ url, opts })
      return fetchImpl(url, opts)
    },
    useI18n: () => key => key
  }

  const sandbox = {
    window: {
      __HERMES_PLUGIN_SDK__: SDK,
      __HERMES_PLUGINS__: { register: (name, comp) => registered.push({ name, comp }) }
    },
    console,
    Date,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {}
  }
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), sandbox, { filename: 'dashboard/dist/index.js' })

  return {
    registered,
    calls,
    sandbox,
    /** Render once, run mount effects, let promises settle, render again. */
    async mount() {
      state.index = 0
      state.effects = []
      const first = registered[0].comp()
      state.effects.splice(0).forEach(fn => fn())
      await new Promise(resolve => setTimeout(resolve, 0))
      await new Promise(resolve => setTimeout(resolve, 0))
      state.index = 0
      state.effects = []
      const second = registered[0].comp()
      state.effects.splice(0).forEach(fn => fn())
      return [first, second]
    }
  }
}

const PRESENTATIONAL = new Set(['className', 'key', 'slot', 'variant', 'size', 'role', 'aria-hidden'])

/** Flatten a React-ish tree to the text a user would see (children + string props). */
function textOf(node) {
  const parts = []
  const walk = n => {
    if (n === null || n === undefined || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n))
      return
    }
    if (Array.isArray(n)) {
      n.forEach(walk)
      return
    }
    if (typeof n !== 'object' || !('props' in n)) return
    const { type, props } = n
    if (typeof type === 'function') {
      walk(type(props))
      return
    }
    for (const [key, value] of Object.entries(props)) {
      if (PRESENTATIONAL.has(key) || key === 'children') continue
      if (typeof value === 'string' || typeof value === 'number') parts.push(String(value))
    }
    walk(props.children)
  }
  walk(node)
  return parts.join(' ')
}

const okFetch = url => {
  const suffix = url.replace(PREFIX, '') || '/summary'
  const key = Object.keys(FIXTURES).find(k => suffix.startsWith(k.split('?')[0])) || suffix
  return Promise.resolve(FIXTURES[key])
}

test('registers under the name the manifest declares', () => {
  const harness = createHarness(okFetch)
  assert.equal(harness.registered.length, 1)
  assert.equal(harness.registered[0].name, 'message-scheduler')
  assert.equal(typeof harness.registered[0].comp, 'function')
})

test('mount asks its own REST namespace for data', async () => {
  const harness = createHarness(okFetch)
  await harness.mount()

  const urls = harness.calls.map(c => c.url)
  for (const path of ['/summary', '/jobs', '/history?limit=50', '/settings/notify']) {
    assert.ok(urls.includes(PREFIX + path), `expected ${PREFIX + path} in ${urls}`)
  }
  assert.ok(urls.every(u => u.startsWith(PREFIX)), 'never talks to another plugin')
})

test('the ready state renders the counts and the queue it was given', async () => {
  const harness = createHarness(okFetch)
  const [, after] = await harness.mount()
  const out = textOf(after)

  assert.match(out, /Message Scheduler/)
  assert.match(out, /queued/)
  assert.match(out, /1938/)
  assert.match(out, /Ana/)
  assert.match(out, /bridge ok/)
})

test('a failing backend renders an explanation and a retry, not zeros', async () => {
  const harness = createHarness(() => Promise.reject(new Error('404 Not Found')))
  const [, after] = await harness.mount()
  const out = textOf(after)

  assert.match(out, /not reachable/)
  assert.match(out, /404 Not Found/)
  assert.match(out, /Retry/)
})

test('the bundle never builds a URL outside its own plugin namespace', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  const literals = source.match(/'\/api\/[^']*'/g) || []
  assert.ok(literals.length > 0, 'expected at least one API path literal')
  for (const literal of literals) {
    assert.ok(literal.includes('/api/plugins/message-scheduler'),
      `absolute API path outside the plugin namespace: ${literal}`)
  }
})
