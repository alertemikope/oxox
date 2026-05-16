import type {
  LiveSessionEventBatchPayload,
  LiveSessionSnapshot,
  LiveSessionSnapshotChangedPayload,
} from '../../../shared/ipc/contracts'
import { useObserveEffect } from '../stores/legend'

interface UseLiveSessionPollOptions {
  liveSessionStore: {
    selectedSnapshotId: string | null
    applyEventBatch?: (payload: LiveSessionEventBatchPayload) => void
    refreshSnapshot: (sessionId: string) => Promise<void>
    upsertSnapshot: (snapshot: LiveSessionSnapshot) => void
  }
  sessionApi?: {
    onSnapshotChanged?: (
      listener: (payload: LiveSessionSnapshotChangedPayload) => void,
    ) => (() => void) | undefined
    onEventBatch?: (
      listener: (payload: LiveSessionEventBatchPayload) => void,
    ) => (() => void) | undefined
  }
}

export function useLiveSessionPoll({
  liveSessionStore,
  sessionApi,
}: UseLiveSessionPollOptions): void {
  useObserveEffect(() => {
    const selectedSnapshotId = liveSessionStore.selectedSnapshotId
    let latestSnapshot: LiveSessionSnapshot | null = null
    let pendingEventBatch: LiveSessionEventBatchPayload | null = null
    let pendingFrameId: number | null = null
    let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null

    if (!selectedSnapshotId) {
      return
    }

    void liveSessionStore.refreshSnapshot(selectedSnapshotId)

    const flushLatestSnapshot = () => {
      pendingFrameId = null
      pendingTimeoutId = null

      if (!latestSnapshot) {
        if (pendingEventBatch) {
          const eventBatch = pendingEventBatch
          pendingEventBatch = null
          liveSessionStore.applyEventBatch?.(eventBatch)
        }
        return
      }

      const snapshot = latestSnapshot
      latestSnapshot = null
      pendingEventBatch = null
      liveSessionStore.upsertSnapshot(snapshot)
    }

    const scheduleFlush = () => {
      if (pendingFrameId !== null || pendingTimeoutId !== null) {
        return
      }

      if (typeof requestAnimationFrame === 'function') {
        pendingFrameId = requestAnimationFrame(flushLatestSnapshot)
        return
      }

      pendingTimeoutId = setTimeout(flushLatestSnapshot, 16)
    }

    const unsubscribe = sessionApi?.onSnapshotChanged?.(({ snapshot }) => {
      if (snapshot.sessionId !== selectedSnapshotId) {
        return
      }

      latestSnapshot = snapshot
      scheduleFlush()
    })
    const unsubscribeEventBatch = sessionApi?.onEventBatch?.((payload) => {
      if (payload.sessionId !== selectedSnapshotId || payload.events.length === 0) {
        return
      }

      pendingEventBatch = mergeEventBatches(pendingEventBatch, payload)
      scheduleFlush()
    })

    return () => {
      unsubscribe?.()
      unsubscribeEventBatch?.()

      if (pendingFrameId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrameId)
      }

      if (pendingTimeoutId !== null) {
        clearTimeout(pendingTimeoutId)
      }
    }
  })
}

function mergeEventBatches(
  previous: LiveSessionEventBatchPayload | null,
  next: LiveSessionEventBatchPayload,
): LiveSessionEventBatchPayload {
  if (!previous) {
    return {
      ...next,
      events: [...next.events],
    }
  }

  return {
    sessionId: next.sessionId,
    sequenceStart: Math.min(previous.sequenceStart, next.sequenceStart),
    sequenceEnd: Math.max(previous.sequenceEnd, next.sequenceEnd),
    events: [...previous.events, ...next.events],
  }
}
