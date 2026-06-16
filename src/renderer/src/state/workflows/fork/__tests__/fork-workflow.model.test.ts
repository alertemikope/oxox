// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveSessionSnapshot, OxoxBridge } from '../../../../../../shared/ipc/contracts'
import { ForkWorkflowStore } from '../fork-workflow.model'

function createSnapshot(overrides: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot {
  return {
    sessionId: 'session-fork',
    title: 'Forked session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 42,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/project',
    parentSessionId: 'session-alpha',
    availableModels: [],
    settings: {},
    messages: [],
    events: [],
    ...overrides,
  }
}

function createSessionApi(overrides: Partial<OxoxBridge['session']> = {}) {
  return {
    fork: vi.fn().mockResolvedValue(createSnapshot()),
    forkViaDaemon: vi.fn().mockResolvedValue(createSnapshot({ sessionId: 'session-daemon-fork' })),
    ...overrides,
  }
}

describe('ForkWorkflowStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('opens with a default fork title and closes', () => {
    const store = new ForkWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha session' }),
      createSessionApi(),
    )

    store.openForkDialog()

    expect(store.isForkDialogOpen).toBe(true)
    expect(store.forkDraft).toBe('[Fork] Alpha session')

    store.closeForkDialog()

    expect(store.isForkDialogOpen).toBe(false)
    expect(store.forkDraft).toBe('')
  })

  it('does not open dialog when no session is selected', () => {
    const store = new ForkWorkflowStore(
      () => null,
      () => null,
      createSessionApi(),
    )

    store.openForkDialog()

    expect(store.isForkDialogOpen).toBe(false)
  })

  it('submits the edited fork title through the primary fork api', async () => {
    const snapshot = createSnapshot({ title: '[Fork] Custom title' })
    const fork = vi.fn().mockResolvedValue(snapshot)
    const forkViaDaemon = vi.fn().mockResolvedValue(createSnapshot())
    const onForked = vi.fn().mockResolvedValue(undefined)
    const store = new ForkWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha session' }),
      createSessionApi({ fork, forkViaDaemon }),
      onForked,
    )

    store.openForkDialog()
    store.setForkDraft(' [Fork] Custom title ')
    await store.submitFork()

    expect(fork).toHaveBeenCalledWith('session-alpha', '[Fork] Custom title')
    expect(forkViaDaemon).not.toHaveBeenCalled()
    expect(onForked).toHaveBeenCalledWith(snapshot)
    expect(store.isForkDialogOpen).toBe(false)
    expect(store.forkingSessionId).toBeNull()
  })

  it('falls back to the daemon fork api', async () => {
    const forkViaDaemon = vi.fn().mockResolvedValue(createSnapshot())
    const store = new ForkWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha session' }),
      createSessionApi({ fork: undefined, forkViaDaemon }),
    )

    store.openForkDialog()
    await store.submitFork()

    expect(forkViaDaemon).toHaveBeenCalledWith('session-alpha', '[Fork] Alpha session')
  })

  it('surfaces errors from the fork call', async () => {
    const fork = vi.fn().mockRejectedValue(new Error('Fork failed'))
    const store = new ForkWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha session' }),
      createSessionApi({ fork }),
    )

    store.openForkDialog()
    await store.submitFork()

    expect(store.error).toBe('Fork failed')
    expect(store.forkingSessionId).toBeNull()
  })
})
