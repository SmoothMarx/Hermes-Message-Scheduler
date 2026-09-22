/**
 * Desktop-half contracts.
 *
 * Renders the plugin outside Electron with the SDK stubbed, so a forgotten import,
 * a bad area constant or a broken handler fails here rather than showing up as a
 * blank pane (or a load-error toast) in the app.
 *
 *   node --test plugin/tests/desktop_plugin.test.mjs
 */

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

register(new URL('./js/loader.mjs', import.meta.url))

const sdk = await import('./js/sdk-stub.mjs')
const plugin = (await import('../desktop/plugin.js')).default

/* ------------------------------------------------------------ mini renderer */

const PRESENTATIONAL = new Set(['className', 'key', 'slot', 'variant', 'size', 'role', 'aria-hidden'])

function isElement(node) {
  return node && typeof node === 'object' && 'type' in node && 'props' in node
}

/** Every element in the tree, expanding function components and classes. */
function collect(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach(child => collect(child, out))
    return out
  }
  if (!isElement(node)) return out
  out.push(node)
  const { type, props } = node
  if (typeof type === 'function') {
    const isClass = type.prototype && typeof type.prototype.render === 'function'
    collect(isClass ? new type(props).render() : type(props), out)
  } else {
    collect(props.children, out)
  }
  return out
}

/**
 * The text a user would see. Includes string props (label, title, description…)
 * because the SDK components render those as visible text — a stub that only
 * walked children would miss half the UI.
 */
function visibleText(node) {
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
      const isClass = type.prototype && typeof type.prototype.render === 'function'
      walk(isClass ? new type(props).render() : type(props))
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

/** Element whose visible text matches, e.g. the Cancel button in a queue row. */
function findByText(node, pattern) {
  return collect(node).find(el => pattern.test(visibleText(el)))
}

/** The innermost element whose *own* label matches — i.e. the control itself. */
function findByLabel(node, pattern) {
  const matches = collect(node).filter(el => {
    const own = typeof el.props.children === 'string'
      ? el.props.children
      : el.props.label || el.props.title || ''
    return typeof own === 'string' && pattern.test(own)
  })
  return matches.length ? matches[matches.length - 1] : null
}

function findClickable(node, pattern) {
  return collect(node).find(
    el => typeof el.props.onClick === 'function' && pattern.test(visibleText(el))
  )
}

function text(tree) {
  return visibleText(tree)
}

/* ------------------------------------------------------------------ harness */

function createCtx() {
  const registrations = []
  const restCalls = []
  const ctx = {
    rest: (path, opts) => {
      restCalls.push({ path, opts })
      return Promise.resolve({ status: 'cancelled' })
    },
    storage: { get: () => null, set: () => {} },
    register: contribution => registrations.push(contribution)
  }
  return { ctx, registrations, restCalls }
}

function mount() {
  const harness = createCtx()
  sdk.queryMode.value = 'ready'
  plugin.register(harness.ctx)
  return harness
}

const byArea = (registrations, area) => registrations.filter(r => r.area === area)

/* -------------------------------------------------------------------- tests */

test('exports the plugin contract Hermes loads', () => {
  assert.equal(plugin.id, 'message-scheduler')
  assert.equal(typeof plugin.name, 'string')
  assert.equal(typeof plugin.register, 'function')
})

test('registers a page, a sidebar row and a statusbar chip', () => {
  const { registrations } = mount()

  const pages = byArea(registrations, sdk.ROUTES_AREA)
  assert.equal(pages.length, 1)
  assert.equal(pages[0].data.path, '/message-scheduler')
  assert.equal(typeof pages[0].render, 'function')

  const nav = byArea(registrations, sdk.SIDEBAR_NAV_AREA)
  assert.equal(nav.length, 1)
  assert.equal(nav[0].data.path, pages[0].data.path)
  assert.ok(nav[0].data.label)
  assert.ok(nav[0].data.codicon)

  const chips = byArea(registrations, sdk.STATUSBAR_AREAS.right)
  assert.equal(chips.length, 1)
  assert.equal(typeof chips[0].render, 'function')
})

test('the page renders the ready state with real numbers from the backend', () => {
  const { registrations } = mount()
  const page = byArea(registrations, sdk.ROUTES_AREA)[0]

  const out = text(page.render())

  assert.match(out, /Message Scheduler/)
  assert.match(out, /queued/)
  assert.match(out, /1938/) // contacts fixture
  assert.match(out, /Ana/) // queued job
  assert.match(out, /bridge ok/)
  assert.match(out, /Run dispatcher/)
})

test('the page renders a loading state without inventing data', () => {
  const { ctx, registrations } = createCtx()
  sdk.queryMode.value = 'loading'
  plugin.register(ctx)

  const out = text(byArea(registrations, sdk.ROUTES_AREA)[0].render())

  assert.match(out, /Message Scheduler/)
  assert.ok(!/bridge ok/.test(out), 'no bridge claim while loading')
  assert.ok(!/1938/.test(out), 'no counts while loading')
})

test('the page says the backend is unreachable instead of showing zeros', () => {
  const { ctx, registrations } = createCtx()
  sdk.queryMode.value = 'error'
  plugin.register(ctx)

  const out = text(byArea(registrations, sdk.ROUTES_AREA)[0].render())

  assert.match(out, /not reachable/)
  assert.match(out, /404 Not Found/)
  assert.match(out, /Retry/)
})

test('it asks the backend for the paths its REST half serves', () => {
  sdk.queried.length = 0
  const { registrations } = mount()
  text(byArea(registrations, sdk.ROUTES_AREA)[0].render())

  for (const path of ['/summary', '/jobs', '/history?limit=50', '/settings/notify']) {
    assert.ok(sdk.queried.includes(path), `expected a query for ${path}, got ${sdk.queried}`)
  }
})

test('cancelling a queued message calls DELETE on that job', async () => {
  const { registrations, restCalls } = mount()
  const page = byArea(registrations, sdk.ROUTES_AREA)[0]

  const cancel = findClickable(page.render(), /Cancel/)
  assert.ok(cancel, 'expected a Cancel control in the queue')

  cancel.props.onClick()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(restCalls[0], { path: '/jobs/1', opts: { method: 'DELETE' } })
})

test('the statusbar chip shows the queue depth and opens the page', () => {
  const { registrations } = mount()
  const chip = byArea(registrations, sdk.STATUSBAR_AREAS.right)[0]

  const out = text(chip.render())
  assert.match(out, /2/) // queued

  const button = collect(chip.render()).find(el => typeof el.props.onClick === 'function')
  assert.ok(button, 'expected the chip to be clickable')

  sdk.navigations.length = 0
  button.props.onClick()
  assert.deepEqual(sdk.navigations, ['/message-scheduler'])
})

test('the compose panel offers the fields and blocks an incomplete message', () => {
  const { registrations } = mount()
  const page = byArea(registrations, sdk.ROUTES_AREA)[0]

  const composeTab = findClickable(page.render(), /Compose/)
  assert.ok(composeTab, 'expected a Compose tab')
  composeTab.props.onClick()

  const tree = page.render()
  const fields = collect(tree).filter(el => typeof el.props.onChange === 'function')
  assert.ok(fields.length >= 4, `expected recipient/network/time/message fields, saw ${fields.length}`)

  const schedule = findByLabel(tree, /^Schedule$/)
  const sendNow = findByLabel(tree, /^Send now$/)
  assert.ok(schedule && sendNow, 'expected both send controls')

  // Empty fields must not be submittable: the guards are what stop a blank POST.
  assert.equal(schedule.props.disabled, true)
  assert.equal(sendNow.props.disabled, true)
})
