import {
  IPC_CHANNELS,
  type LiveSessionEventBatchPayload,
  type LiveSessionEventRecord,
} from '../shared/ipc/contracts'

interface BrowserWindowLike {
  isDestroyed: () => boolean
  webContents: {
    id: number
    send: (channel: string, payload: unknown) => void
  }
}

type TimerHandle = ReturnType<typeof setTimeout>

export interface CreateLiveSessionEventBroadcasterOptions {
  getAllWindows: () => BrowserWindowLike[]
  isRendererAttachedToSession: (webContentsId: number, sessionId: string) => boolean
  schedule?: (callback: () => void, delayMs: number) => TimerHandle
  clearScheduled?: (timer: TimerHandle) => void
  coalesceWindowMs?: number
}

const DEFAULT_COALESCE_WINDOW_MS = 16

export function createLiveSessionEventBroadcaster({
  clearScheduled = clearTimeout,
  coalesceWindowMs = DEFAULT_COALESCE_WINDOW_MS,
  getAllWindows,
  isRendererAttachedToSession,
  schedule = setTimeout,
}: CreateLiveSessionEventBroadcasterOptions) {
  const pendingEventsBySessionId = new Map<string, LiveSessionEventRecord[]>()
  const nextSequenceBySessionId = new Map<string, number>()
  let timer: TimerHandle | null = null

  const flush = () => {
    timer = null
    const entries = [...pendingEventsBySessionId.entries()]
    pendingEventsBySessionId.clear()

    for (const [sessionId, events] of entries) {
      if (events.length === 0) {
        continue
      }

      const subscribedWindows = getAllWindows().filter(
        (window) =>
          !window.isDestroyed() && isRendererAttachedToSession(window.webContents.id, sessionId),
      )

      if (subscribedWindows.length === 0) {
        continue
      }

      const sequenceStart = nextSequenceBySessionId.get(sessionId) ?? 1
      const sequenceEnd = sequenceStart + events.length - 1
      nextSequenceBySessionId.set(sessionId, sequenceEnd + 1)

      const payload: LiveSessionEventBatchPayload = {
        sessionId,
        sequenceStart,
        sequenceEnd,
        events,
      }

      for (const window of subscribedWindows) {
        window.webContents.send(IPC_CHANNELS.sessionEventBatch, payload)
      }
    }
  }

  const ensureScheduled = () => {
    if (timer !== null) {
      return
    }

    timer = schedule(flush, coalesceWindowMs)
  }

  return {
    broadcast: ({ sessionId, event }: { sessionId: string; event: LiveSessionEventRecord }) => {
      const events = pendingEventsBySessionId.get(sessionId) ?? []
      events.push(event)
      pendingEventsBySessionId.set(sessionId, events)
      ensureScheduled()
    },
    dispose: () => {
      pendingEventsBySessionId.clear()

      if (timer !== null) {
        clearScheduled(timer)
        timer = null
      }
    },
  }
}
