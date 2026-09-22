/**
 * Message Scheduler — desktop app page.
 *
 * The desktop half of the `message-scheduler` plugin. Its Python half lives
 * beside it at `dashboard/plugin_api.py` and the backend mounts it at
 * /api/plugins/message-scheduler/* — exactly the prefix `ctx.rest` is scoped to,
 * so every path below is RELATIVE to that mount ('/jobs', never a full URL).
 *
 * Layout (one package, one install):
 *   ~/.hermes/plugins/message-scheduler/
 *   ├── dashboard/{manifest.json,plugin_api.py,dist/}   ← backend + web tab
 *   └── desktop/plugin.js                               ← this file
 *
 * The Electron shell copies this half into
 * `<HERMES_HOME>/desktop-plugins/message-scheduler/` and hot-reloads it on save.
 * The desktop half is opt-in: it inventories in Settings → Plugins but stays off
 * until the user toggles it. If the page does not appear, check that toggle
 * before debugging anything else.
 *
 * Rules this file obeys (each one has bitten a previous plugin):
 *   - only `@hermes/plugin-sdk`, `react` and `react/jsx-runtime` are imported;
 *   - no JSX syntax — the file loads uncompiled, so UI is built with jsx()/jsxs();
 *   - no hardcoded colours; styling uses the app's theme vars and utility classes;
 *   - every value rendered is either fetched or literal — no invented numbers;
 *   - the loading / ready / failed states are all rendered, and "failed" names
 *     what is actually known instead of guessing a cause.
 */

import {
  Badge,
  Button,
  Codicon,
  EmptyState,
  ErrorState,
  Input,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  STATUSBAR_AREAS,
  ScrollArea,
  Separator,
  Skeleton,
  StatusDot,
  atom,
  cn,
  host,
  useQuery,
  useValue
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Component, useCallback, useMemo, useState } from 'react'

const ID = 'message-scheduler'
const ROUTE = '/message-scheduler'
const REFRESH_MS = 15000
const K_TAB = 'message-scheduler.tab'

const NETWORKS = [
  'telegram', 'whatsapp', 'signal', 'imessage', 'sms', 'email', 'matrix',
  'instagram', 'facebook/messenger', 'linkedin'
]

const TABS = [
  { id: 'queue', label: 'Queue' },
  { id: 'compose', label: 'Compose' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' }
]

let rest = null
let storage = null

const $tab = atom('queue')

/* ------------------------------------------------------------------ utils */

function persistGet(key) {
  try {
    if (!storage) return null
    if (typeof storage.get === 'function') return storage.get(key)
    if (typeof storage.getItem === 'function') return storage.getItem(key)
  } catch {
    /* storage is best-effort — a failure must never break the pane */
  }
  return null
}

function persistSet(key, value) {
  try {
    if (!storage) return
    if (typeof storage.set === 'function') storage.set(key, value)
    else if (typeof storage.setItem === 'function') storage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

/** SQLite 'YYYY-MM-DD HH:MM:SS' (UTC unless offset-bearing) -> local string. */
function fmtWhen(value) {
  if (!value) return '—'
  const iso = String(value).replace(' ', 'T')
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`
  const d = new Date(withZone)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function fmtClock(value) {
  if (!value) return ''
  const iso = String(value).replace(' ', 'T')
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`
  const d = new Date(withZone)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Local wall time -> the ISO string the API stores (offset included). */
function localInputToIso(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

function statusTone(status) {
  if (status === 'sent') return 'good'
  if (status === 'failed' || status === 'missed') return 'bad'
  if (status === 'dispatching') return 'warn'
  return 'muted'
}

/** One paginated-at-the-edges query hook; every panel reads through this. */
function useApi(path, opts = {}) {
  return useQuery({
    queryKey: ['message-scheduler', path],
    queryFn: () => rest(path),
    refetchInterval: opts.refresh ?? REFRESH_MS,
    staleTime: 5000,
    retry: 1,
    enabled: opts.enabled !== false
  })
}

/* ----------------------------------------------------------- small pieces */

function Pill({ active, onClick, children, title }) {
  return jsx(Button, {
    variant: active ? 'secondary' : 'ghost',
    size: 'sm',
    title,
    onClick,
    children
  })
}

function Stat({ value, label, tone }) {
  return jsxs('div', {
    className: 'flex items-baseline gap-1.5',
    children: [
      jsx('span', {
        className: cn(
          'text-base font-semibold tabular-nums',
          tone === 'bad' ? 'text-(--ui-text-secondary)' : null
        ),
        children: value
      }),
      jsx('span', {
        className: 'text-[0.6875rem] text-(--ui-text-quaternary)',
        children: label
      })
    ]
  })
}

function Field({ label, children }) {
  return jsxs('label', {
    className: 'flex flex-col gap-1',
    children: [
      jsx('span', { className: 'text-[0.6875rem] text-(--ui-text-quaternary)', children: label }),
      children
    ]
  })
}

function Notice({ tone, children }) {
  if (!children) return null
  return jsx('div', {
    className: cn(
      'rounded-md px-2 py-1 text-[0.6875rem]',
      tone === 'bad' ? 'text-(--ui-text-secondary)' : 'text-(--ui-text-quaternary)'
    ),
    style: { border: '1px solid var(--ui-stroke-secondary)' },
    children
  })
}

/* ---------------------------------------------------------------- panels */

function QueuePanel({ jobs, loading, error, onCancel, busy }) {
  if (loading && !jobs) {
    return jsxs('div', {
      className: 'flex flex-col gap-2',
      children: [
        jsx(Skeleton, { className: 'h-10 w-full' }),
        jsx(Skeleton, { className: 'h-10 w-full' }),
        jsx(Skeleton, { className: 'h-10 w-full' })
      ]
    })
  }
  if (error && !jobs) {
    return jsx(ErrorState, { title: 'Queue unavailable', description: `${error.message || error}` })
  }
  if (!jobs || jobs.length === 0) {
    return jsx(EmptyState, {
      title: 'Nothing queued',
      description: 'Messages you schedule appear here with the time they will be sent.'
    })
  }
  return jsx('div', {
    className: 'flex flex-col gap-1',
    children: jobs.map(job =>
      jsxs('div', {
        className: 'flex items-center gap-2 rounded-md px-2 py-1',
        style: { border: '1px solid var(--ui-stroke-secondary)' },
        children: [
          jsx('span', {
            className: 'w-28 shrink-0 text-[0.6875rem] text-(--ui-text-quaternary)',
            title: job.time,
            children: fmtWhen(job.time)
          }),
          jsx('span', { className: 'w-36 shrink-0 truncate text-xs', children: job.person }),
          jsx(Badge, { variant: 'outline', children: job.network }),
          jsx('span', {
            className: 'min-w-0 flex-1 truncate text-xs text-(--ui-text-secondary)',
            title: job.text,
            children: job.text
          }),
          job.attachments && job.attachments.length
            ? jsxs('span', {
                className: 'flex items-center gap-0.5 text-[0.6875rem] text-(--ui-text-quaternary)',
                children: [
                  jsx(Codicon, { name: 'attach', size: 12 }),
                  jsx('span', { children: String(job.attachments.length) })
                ]
              })
            : null,
          jsx(StatusDot, { tone: statusTone(job.status) }),
          jsx(Button, {
            variant: 'ghost',
            size: 'sm',
            disabled: busy,
            onClick: () => onCancel(job.id),
            children: 'Cancel'
          })
        ]
      })
    )
  })
}

function ComposePanel({ busy, onSubmit, notice }) {
  const [person, setPerson] = useState('')
  const [network, setNetwork] = useState('telegram')
  const [when, setWhen] = useState('')
  const [text, setText] = useState('')

  const ready = person.trim() && network.trim() && text.trim()

  const sendNow = useCallback(() => {
    onSubmit('send', { person: person.trim(), network: network.trim(), text })
  }, [network, onSubmit, person, text])

  const schedule = useCallback(() => {
    const iso = localInputToIso(when)
    if (!iso) {
      onSubmit('invalid', {})
      return
    }
    onSubmit('schedule', { person: person.trim(), network: network.trim(), text, when: iso })
  }, [network, onSubmit, person, text, when])

  return jsxs('div', {
    className: 'flex flex-col gap-3',
    children: [
      jsxs('div', {
        className: 'flex flex-wrap gap-3',
        children: [
          jsx(Field, {
            label: 'Recipient (name or id)',
            children: jsx(Input, {
              value: person,
              placeholder: 'Ana, +3519…, @handle, !beeper:room',
              onChange: e => setPerson(e.target.value)
            })
          }),
          jsx(Field, {
            label: 'Network',
            children: jsxs('select', {
              value: network,
              className: 'h-8 rounded-md px-2 text-xs',
              style: {
                border: '1px solid var(--ui-stroke-secondary)',
                background: 'transparent',
                color: 'inherit'
              },
              onChange: e => setNetwork(e.target.value),
              children: NETWORKS.map(n => jsx('option', { value: n, children: n }, n))
            })
          }),
          jsx(Field, {
            label: 'Send at (local time)',
            children: jsx(Input, {
              type: 'datetime-local',
              value: when,
              onChange: e => setWhen(e.target.value)
            })
          })
        ]
      }),
      jsx(Field, {
        label: 'Message',
        children: jsx('textarea', {
          value: text,
          rows: 6,
          placeholder: 'Write the message…',
          className: 'w-full resize-y rounded-md p-2 text-xs',
          style: {
            border: '1px solid var(--ui-stroke-secondary)',
            background: 'transparent',
            color: 'inherit'
          },
          onChange: e => setText(e.target.value)
        })
      }),
      jsx(Notice, { tone: notice?.tone, children: notice?.message }),
      jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          jsx(Button, {
            disabled: !ready || !when || busy,
            onClick: schedule,
            children: 'Schedule'
          }),
          jsx(Button, {
            variant: 'secondary',
            disabled: !ready || busy,
            onClick: sendNow,
            children: 'Send now'
          }),
          jsx('span', {
            className: 'text-[0.6875rem] text-(--ui-text-quaternary)',
            children: "'Send now' reaches a real person as soon as the dispatcher ticks."
          })
        ]
      })
    ]
  })
}

function HistoryPanel({ entries, loading, error }) {
  if (loading && !entries) {
    return jsxs('div', {
      className: 'flex flex-col gap-2',
      children: [
        jsx(Skeleton, { className: 'h-8 w-full' }),
        jsx(Skeleton, { className: 'h-8 w-full' })
      ]
    })
  }
  if (error && !entries) {
    return jsx(ErrorState, { title: 'History unavailable', description: `${error.message || error}` })
  }
  if (!entries || entries.length === 0) {
    return jsx(EmptyState, { title: 'No sends recorded yet', description: 'Results land here as the dispatcher runs.' })
  }
  return jsx('div', {
    className: 'flex flex-col gap-1',
    children: entries.map(entry =>
      jsxs('div', {
        className: 'flex items-center gap-2 px-2 py-1 text-xs',
        children: [
          jsx('span', {
            className: 'w-24 shrink-0 text-[0.6875rem] text-(--ui-text-quaternary)',
            children: fmtWhen(entry.time) || fmtClock(entry.created_at)
          }),
          jsx('span', { className: 'w-32 shrink-0 truncate', children: entry.person }),
          jsx('span', { className: 'w-24 shrink-0 text-(--ui-text-quaternary)', children: entry.network }),
          jsx(StatusDot, { tone: statusTone(entry.status) }),
          jsx('span', { className: 'w-14 shrink-0', children: entry.status }),
          jsx('span', {
            className: 'min-w-0 flex-1 truncate text-(--ui-text-quaternary)',
            title: entry.error || entry.text,
            children: entry.error || entry.text
          })
        ]
      }, entry.id)
    )
  })
}

function SettingsPanel({ notify, busy, onSave, notice }) {
  const [channel, setChannel] = useState(notify.channel || '')
  const [identifier, setIdentifier] = useState(notify.identifier || '')
  const [userName, setUserName] = useState(notify.user_name || 'there')

  return jsxs('div', {
    className: 'flex flex-col gap-3',
    children: [
      jsx('p', {
        className: 'text-xs text-(--ui-text-secondary)',
        children: 'Where the scheduler reports each send result. Leave blank to stay silent.'
      }),
      jsxs('div', {
        className: 'flex flex-wrap gap-3',
        children: [
          jsx(Field, {
            label: 'Channel',
            children: jsx(Input, { value: channel, onChange: e => setChannel(e.target.value) })
          }),
          jsx(Field, {
            label: 'Your id on that channel',
            children: jsx(Input, { value: identifier, onChange: e => setIdentifier(e.target.value) })
          }),
          jsx(Field, {
            label: 'Your name in the message',
            children: jsx(Input, { value: userName, onChange: e => setUserName(e.target.value) })
          })
        ]
      }),
      jsx(Notice, { tone: notice?.tone, children: notice?.message }),
      jsx('div', {
        children: jsx(Button, {
          disabled: busy,
          onClick: () => onSave({ channel, identifier, user_name: userName }),
          children: 'Save'
        })
      })
    ]
  })
}

/* ----------------------------------------------------------------- panel */

function Panel() {
  const tab = useValue($tab)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const summaryQuery = useApi('/summary')
  const jobsQuery = useApi('/jobs')
  const historyQuery = useApi('/history?limit=50')
  const notifyQuery = useApi('/settings/notify', { refresh: 60000 })

  const summary = summaryQuery.data
  const jobs = jobsQuery.data?.jobs
  const history = historyQuery.data?.history

  const refreshAll = useCallback(() => {
    void summaryQuery.refetch()
    void jobsQuery.refetch()
    void historyQuery.refetch()
  }, [historyQuery, jobsQuery, summaryQuery])

  const act = useCallback(
    async (label, run) => {
      setBusy(true)
      setNotice(null)
      try {
        const result = await run()
        setNotice({ message: `${label}: ${result?.status || 'done'}` })
        refreshAll()
      } catch (err) {
        setNotice({ message: `${label} failed: ${err?.message || err}`, tone: 'bad' })
      } finally {
        setBusy(false)
      }
    },
    [refreshAll]
  )

  const onCancel = useCallback(
    jobId => {
      void act(`cancel #${jobId}`, () => rest(`/jobs/${jobId}`, { method: 'DELETE' }))
    },
    [act]
  )

  const onSubmit = useCallback(
    (kind, body) => {
      if (kind === 'invalid') {
        setNotice({ message: 'Pick a send time first.', tone: 'bad' })
        return
      }
      if (kind === 'send') {
        void act('send now', () => rest('/send', { method: 'POST', body }))
        return
      }
      void act('schedule', () => rest('/jobs', { method: 'POST', body }))
    },
    [act]
  )

  const onSaveNotify = useCallback(
    body => {
      void act('notification settings', () => rest('/settings/notify', { method: 'POST', body }))
    },
    [act]
  )

  if (summaryQuery.error && !summary) {
    return jsx(ErrorState, {
      title: 'Message Scheduler backend not reachable',
      description: cn(
        `${summaryQuery.error.message || summaryQuery.error}.`,
        'A 404 or "Plugin not found" means the Python half is not enabled for this profile, or the backend has not been restarted since the plugin was installed.'
      ),
      children: jsx(Button, {
        variant: 'secondary',
        onClick: () => summaryQuery.refetch(),
        children: 'Retry'
      })
    })
  }

  return jsxs('div', {
    className: 'flex h-full flex-col gap-3 p-3',
    children: [
      jsxs('div', {
        className: 'flex flex-wrap items-center justify-between gap-2',
        children: [
          jsxs('div', {
            className: 'flex flex-wrap items-baseline gap-4',
            children: [
              jsx('span', { className: 'text-sm font-semibold', children: 'Message Scheduler' }),
              summary ? jsx(Stat, { value: summary.queued, label: 'queued' }) : null,
              summary ? jsx(Stat, { value: summary.due_now, label: 'due now', tone: summary.due_now ? 'bad' : undefined }) : null,
              summary ? jsx(Stat, { value: summary.contacts, label: 'contacts' }) : null,
              summary ? jsx(Stat, { value: summary.history.sent, label: 'sent' }) : null,
              summary && summary.history.failed
                ? jsx(Stat, { value: summary.history.failed, label: 'failed', tone: 'bad' })
                : null
            ]
          }),
          jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              jsx(StatusDot, {
                tone: summary?.bridge?.reachable ? 'good' : 'bad'
              }),
              jsx('span', {
                className: 'text-[0.6875rem] text-(--ui-text-quaternary)',
                title: summary ? `${summary.bridge_url} — ${summary.bridge?.detail || ''}` : '',
                children: summary?.bridge?.reachable ? 'bridge ok' : 'bridge unreachable'
              }),
              jsx(Button, {
                size: 'sm',
                disabled: busy,
                onClick: () => act('dispatcher', () => rest('/dispatch', { method: 'POST' })),
                children: 'Run dispatcher'
              }),
              jsx(Button, {
                size: 'sm',
                variant: 'ghost',
                disabled: busy,
                onClick: refreshAll,
                children: 'Refresh'
              })
            ]
          })
        ]
      }),

      summary?.next_at
        ? jsx('p', {
            className: 'text-[0.6875rem] text-(--ui-text-quaternary)',
            children: `Next send: ${fmtWhen(summary.next_at)}`
          })
        : null,

      jsx('div', {
        className: 'flex gap-1',
        children: TABS.map(entry =>
          jsx(
            Pill,
            {
              active: tab === entry.id,
              onClick: () => {
                $tab.set(entry.id)
                persistSet(K_TAB, entry.id)
              },
              children: entry.label
            },
            entry.id
          )
        )
      }),

      jsx(Notice, { tone: notice?.tone, children: notice?.message }),
      jsx(Separator, {}),

      jsx(ScrollArea, {
        className: 'min-h-0 flex-1',
        children:
          tab === 'queue'
            ? jsx(QueuePanel, {
                jobs,
                loading: jobsQuery.isLoading,
                error: jobsQuery.error,
                busy,
                onCancel
              })
            : tab === 'compose'
              ? jsx(ComposePanel, { busy, onSubmit, notice })
              : tab === 'history'
                ? jsx(HistoryPanel, {
                    entries: history,
                    loading: historyQuery.isLoading,
                    error: historyQuery.error
                  })
                : notifyQuery.data
                  ? jsx(SettingsPanel, {
                      notify: notifyQuery.data,
                      busy,
                      onSave: onSaveNotify,
                      notice
                    })
                  : jsx(Skeleton, { className: 'h-24 w-full' })
      }),

      summary
        ? jsx('p', {
            className: 'text-[0.6875rem] text-(--ui-text-quaternary)',
            children: `Database: ${summary.db_path}`
          })
        : null
    ]
  })
}

/* -------------------------------------------------------------- boundary */

class PaneBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    try {
      console.error(`[${ID}] pane render failed`, error)
    } catch {
      /* ignore */
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return jsx(ErrorState, {
      title: 'Message Scheduler pane hit a rendering error',
      description: `${this.state.error?.message || this.state.error}`,
      children: jsx(Button, {
        variant: 'secondary',
        onClick: () => this.setState({ error: null }),
        children: 'Retry'
      })
    })
  }
}

/** Statusbar chip: queue depth at a glance, click to open the page. */
function QueueChip() {
  const query = useApi('/summary', { refresh: 60000 })
  const queued = query.data?.queued ?? 0
  const due = query.data?.due_now ?? 0
  return jsxs(Button, {
    variant: 'ghost',
    size: 'sm',
    title: `${queued} queued, ${due} due now`,
    onClick: () => {
      host.navigate(ROUTE)
      $tab.set('queue')
    },
    children: [
      jsx(Codicon, { name: 'send', size: 12 }),
      jsx('span', { className: 'text-[0.6875rem]', children: queued > 0 ? ` ${queued}` : ' —' }),
      due > 0 ? jsx(StatusDot, { tone: 'warn' }) : null
    ]
  })
}

/* ------------------------------------------------------------- register */

export default {
  id: ID,
  name: 'Message Scheduler',
  register(ctx) {
    rest = ctx.rest
    storage = ctx.storage

    const savedTab = persistGet(K_TAB)
    if (savedTab && TABS.some(t => t.id === savedTab)) $tab.set(String(savedTab))

    ctx.register({
      id: 'page',
      area: ROUTES_AREA,
      data: { path: ROUTE },
      render: () => jsx(PaneBoundary, { children: jsx(Panel, {}) })
    })

    ctx.register({
      id: 'nav',
      area: SIDEBAR_NAV_AREA,
      data: { path: ROUTE, label: 'Messages', codicon: 'send' }
    })

    ctx.register({
      id: 'chip',
      area: STATUSBAR_AREAS.right,
      render: () => jsx(QueueChip, {})
    })
  }
}
