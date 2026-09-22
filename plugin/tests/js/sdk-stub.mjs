/**
 * SDK stub for the desktop-plugin tests.
 *
 * Two jobs: (1) every name plugin.js imports must exist here, so a mistyped or
 * forgotten import fails the test instead of the app; (2) queries resolve to fixed
 * fixtures so the ready / loading / error branches can each be rendered on demand.
 * The real export names are additionally checked against the app source by
 * `tests/check_sdk_exports.py`.
 */

export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebarNav'
export const PALETTE_AREA = 'palette'
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }

/** Query fixtures — the shape the REST half returns. */
export const fixtures = {
  '/summary': {
    queued: 2,
    due_now: 1,
    next_at: '2030-01-01T09:00:00Z',
    contacts: 1938,
    history: { sent: 12, failed: 1, missed: 0 },
    db_path: '/tmp/ms/data/scheduler.db',
    media_dir: '/tmp/ms/data/media',
    bridge_url: 'http://127.0.0.1:9190',
    bridge: { reachable: true, url: 'http://127.0.0.1:9190', detail: 'ok' }
  },
  '/jobs': {
    jobs: [
      {
        id: 1,
        person: 'Ana',
        network: 'telegram',
        text: 'hello there',
        time: '2030-01-01T09:00:00Z',
        status: 'pending',
        attachments: ['/media/a.png']
      }
    ],
    count: 1
  },
  '/history': {
    history: [
      {
        id: 7,
        person: 'Bea',
        network: 'whatsapp',
        text: 'sent earlier',
        status: 'sent',
        time: '2026-09-22T09:00:00Z',
        created_at: '2026-09-22 09:00:00',
        error: ''
      }
    ],
    count: 1
  },
  '/settings/notify': { channel: '', identifier: '', user_name: 'there' }
}

/** 'ready' | 'loading' | 'error' — flipped per test. */
export const queryMode = { value: 'ready' }

/** Every relative path useQuery was asked for, in order. */
export const queried = []

export const navigations = []
export const notifications = []

export function atom(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set: next => {
      value = typeof next === 'function' ? next(value) : next
      listeners.forEach(fn => fn(value))
    },
    subscribe: fn => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}

export function useValue(a) {
  return a.get()
}

export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function useQuery(opts) {
  const key = (opts.queryKey || [])[1] || ''
  queried.push(key)
  if (queryMode.value === 'loading') {
    return { data: undefined, isLoading: true, error: null, refetch: () => {} }
  }
  if (queryMode.value === 'error') {
    return { data: undefined, isLoading: false, error: new Error('404 Not Found'), refetch: () => {} }
  }
  return {
    data: fixtures[key.split('?')[0]],
    isLoading: false,
    error: null,
    refetch: () => {}
  }
}

export const host = {
  navigate: path => navigations.push(path),
  notify: message => notifications.push(message),
  notifyError: message => notifications.push(message),
  logs: async () => [],
  state: {}
}

/** Component stubs — extend this list when plugin.js imports a new one. */
const makeComponent = name =>
  function Stub(props) {
    return { type: name, props: props || {} }
  }

export const Badge = makeComponent('Badge')
export const Button = makeComponent('Button')
export const Codicon = makeComponent('Codicon')
export const EmptyState = makeComponent('EmptyState')
export const ErrorState = makeComponent('ErrorState')
export const Input = makeComponent('Input')
export const ScrollArea = makeComponent('ScrollArea')
export const Separator = makeComponent('Separator')
export const Skeleton = makeComponent('Skeleton')
export const StatusDot = makeComponent('StatusDot')
export const Tabs = makeComponent('Tabs')
export const TabsList = makeComponent('TabsList')
export const TabsTrigger = makeComponent('TabsTrigger')

export default {}
