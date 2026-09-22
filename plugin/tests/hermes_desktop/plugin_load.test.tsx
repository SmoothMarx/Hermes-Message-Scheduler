/**
 * Integration harness: the desktop half through the desktop app's REAL runtime loader.
 *
 * This is NOT a unit test — it does not run from this repo's own suite. It is copied
 * into `apps/desktop/src/contrib/` by `tests/run_desktop_harness.sh`, which then runs
 * it with the app's own vitest project, so the plugin is exercised by:
 *
 *   - the real loader (`loadRuntimePlugin`: integrity gate, bare-specifier allow-list,
 *     blob import, `register(createPluginContext(...))`),
 *   - the real SDK shim and real `ctx` (rest/storage/host/atoms),
 *   - the real contribution registry and real React.
 *
 * Point it at any installed copy with MS_DESKTOP_PLUGIN_JS — e.g.
 *   `<HERMES_HOME>/plugins/message-scheduler/desktop/plugin.js`.
 *
 * The app cannot import `blob:` URLs under Vite, so the load is wrapped in the same
 * `withBlobReroute` trick the app's own runtime-loader.test.ts uses.
 *
 * Editors will flag every import here: the file sits outside the app tree, where the
 * `@/` aliases and the app's node_modules do not resolve. That is expected — the
 * runner copies it inside before running it.
 */
import { readFileSync } from 'node:fs'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROUTES_AREA, SIDEBAR_NAV_AREA, STATUSBAR_AREAS } from '@/sdk'

import { $pluginRecords } from './plugins-store'
import { registry } from './registry'
import { loadRuntimePlugin, unloadRuntimePlugin } from './runtime-loader'

const PLUGIN_ID = 'message-scheduler'
const PLUGIN_JS = process.env.MS_DESKTOP_PLUGIN_JS ?? ''

const withBlobReroute = () => {
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation(
      blob =>
        `data:text/javascript;base64,${Buffer.from(
          (blob as unknown as { parts: string[] }).parts.join('')
        ).toString('base64')}`
    )
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const RealBlob = globalThis.Blob
  vi.stubGlobal(
    'Blob',
    class {
      parts: string[]
      constructor(parts: string[]) {
        this.parts = parts
      }
    }
  )

  return () => {
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    vi.stubGlobal('Blob', RealBlob)
  }
}

const ids = (area: string) =>
  (registry.getArea(area) as unknown as { id?: string }[]).map(c => c?.id)

describe('message-scheduler desktop half — real loader, real SDK', () => {
  afterEach(() => {
    unloadRuntimePlugin(PLUGIN_ID)
  })

  it('requires MS_DESKTOP_PLUGIN_JS so the check cannot silently pass', () => {
    expect(PLUGIN_JS, 'set MS_DESKTOP_PLUGIN_JS to the installed desktop/plugin.js').not.toBe('')
  })

  it('loads and registers its page, nav entry and statusbar chip', async () => {
    const restore = withBlobReroute()

    try {
      const id = await loadRuntimePlugin(readFileSync(PLUGIN_JS, 'utf8'), PLUGIN_JS)

      expect(id).toBe(PLUGIN_ID)
      expect($pluginRecords.get()[PLUGIN_ID]).toMatchObject({ status: 'loaded' })
      expect(ids(ROUTES_AREA)).toContain(`${PLUGIN_ID}:page`)
      expect(ids(SIDEBAR_NAV_AREA)).toContain(`${PLUGIN_ID}:nav`)
      expect(ids(STATUSBAR_AREAS.right)).toContain(`${PLUGIN_ID}:chip`)
    } finally {
      restore()
    }
  })

  it('paints its own UI, and fails honestly rather than blank or fabricated', async () => {
    const restore = withBlobReroute()

    try {
      await loadRuntimePlugin(readFileSync(PLUGIN_JS, 'utf8'), PLUGIN_JS)

      const contribution = registry
        .getArea(ROUTES_AREA)
        .find(c => (c as { id?: string }).id === `${PLUGIN_ID}:page`) as unknown as {
        render: () => import('react').ReactNode
      }
      expect(typeof contribution?.render).toBe('function')

      // The app shell supplies this provider; without it the page shows its own
      // pane-error state (also correct, but not what we are proving here).
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { container } = render(
        <QueryClientProvider client={client}>{contribution.render()}</QueryClientProvider>
      )

      await waitFor(() => expect((container.textContent ?? '').length).toBeGreaterThan(10), {
        timeout: 10_000
      })

      const text = container.textContent ?? ''
      expect(text).toContain('Message Scheduler')
      // The plugin's own tab set — stable contract, not a snapshot of live data.
      for (const tab of ['Queue', 'Compose', 'History', 'Settings']) {
        expect(text, `tab ${tab} missing`).toContain(tab)
      }
    } finally {
      restore()
    }
  })
})
