import { type DroidClient, SDK_TAG } from '@factory/droid-sdk'
import { describe, expect, it, vi } from 'vitest'

import { createOxoxLiveDroidSession, loadOxoxLiveDroidSession } from '../droidSdk/liveDroidSession'

class FakeDroidClient {
  sessionId: string | null = null

  readonly initializeSessionCalls: Array<Record<string, unknown>> = []
  readonly loadSessionCalls: Array<Record<string, unknown>> = []
  readonly addUserMessageCalls: Array<Record<string, unknown>> = []
  readonly updateSessionSettingsCalls: Array<Record<string, unknown>> = []
  readonly closeSessionCalls: Array<Record<string, unknown>> = []
  interruptSessionCalls = 0
  closeCalls = 0
  forkSessionCalls = 0

  async initializeSession(params: Record<string, unknown>) {
    this.initializeSessionCalls.push(params)
    this.sessionId = 'session-created'
    return {
      sessionId: 'session-created',
      session: { messages: [] },
      settings: { modelId: 'gpt-5.4' },
      availableModels: [],
      cwd: '/tmp/project',
    }
  }

  async loadSession(params: Record<string, unknown>) {
    this.loadSessionCalls.push(params)
    this.sessionId = String(params.sessionId)
    return {
      session: { messages: [] },
      settings: { modelId: 'gpt-5.4' },
      availableModels: [],
      cwd: '/tmp/project',
    }
  }

  async addUserMessage(params: Record<string, unknown>) {
    this.addUserMessageCalls.push(params)
    return {}
  }

  async updateSessionSettings(params: Record<string, unknown>) {
    this.updateSessionSettingsCalls.push(params)
    return {}
  }

  async interruptSession() {
    this.interruptSessionCalls += 1
    return {}
  }

  async forkSession() {
    this.forkSessionCalls += 1
    return { newSessionId: 'session-forked' }
  }

  async closeSession(params: Record<string, unknown>) {
    this.closeSessionCalls.push(params)
    return {}
  }

  async close() {
    this.closeCalls += 1
  }
}

describe('OxoxLiveDroidSession', () => {
  it('creates SDK DroidSession lifecycle while preserving OXOX add-user-message options', async () => {
    const client = new FakeDroidClient()
    const session = await createOxoxLiveDroidSession(client as unknown as DroidClient, {
      cwd: '/tmp/project',
      settings: { modelId: 'gpt-5.4' },
    })

    const messageId = await session.addUserMessage({
      text: 'Continue from OXOX',
      messageId: 'rewind-boundary-1',
      queuePlacement: 'end_of_turn',
    })
    await session.updateSettings({ reasoningEffort: 'high' })
    await session.interrupt()
    await expect(session.fork()).resolves.toEqual({ newSessionId: 'session-forked' })
    await session.close()

    expect(session.sessionId).toBe('session-created')
    expect(session.initResult).toMatchObject({
      sessionId: 'session-created',
      cwd: '/tmp/project',
    })
    expect(messageId).toBe('rewind-boundary-1')
    expect(client.initializeSessionCalls).toEqual([
      {
        machineId: 'oxox-electron',
        cwd: '/tmp/project',
        modelId: 'gpt-5.4',
        tags: [SDK_TAG],
      },
    ])
    expect(client.addUserMessageCalls).toEqual([
      {
        text: 'Continue from OXOX',
        messageId: 'rewind-boundary-1',
        queuePlacement: 'end_of_turn',
      },
    ])
    expect(client.updateSessionSettingsCalls).toEqual([{ reasoningEffort: 'high' }])
    expect(client.interruptSessionCalls).toBe(1)
    expect(client.forkSessionCalls).toBe(1)
    expect(client.closeSessionCalls).toEqual([{ reason: 'other' }])
    expect(client.closeCalls).toBe(1)
  })

  it('loads an existing session through SDK lifecycle without requiring a cwd', async () => {
    const client = new FakeDroidClient()
    const session = await loadOxoxLiveDroidSession(
      client as unknown as DroidClient,
      'session-existing',
    )

    expect(session.sessionId).toBe('session-existing')
    expect(session.initResult).toMatchObject({
      cwd: '/tmp/project',
    })
    expect(client.loadSessionCalls).toEqual([{ sessionId: 'session-existing' }])
  })

  it('applies lifecycle hook params and closes lifecycle resources with the live session', async () => {
    const client = new FakeDroidClient()
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const prepareInitialize = vi.fn().mockResolvedValue({
      cleanup,
      params: {
        workspaceId: 'workspace-1',
      },
    })

    const session = await createOxoxLiveDroidSession(
      client as unknown as DroidClient,
      {
        cwd: '/tmp/project',
        settings: {
          modelId: 'gpt-5.4',
        },
      },
      {
        lifecycleHooks: [
          {
            prepareInitialize,
          },
        ],
      },
    )

    expect(prepareInitialize).toHaveBeenCalledWith({
      getSessionId: expect.any(Function),
      request: {
        cwd: '/tmp/project',
        settings: {
          modelId: 'gpt-5.4',
        },
      },
    })
    expect(client.initializeSessionCalls[0]).toMatchObject({
      workspaceId: 'workspace-1',
    })

    await session.close()

    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
