import { batch, type Observable } from '@legendapp/state'
import type { LiveSessionSnapshot } from '../../../../../shared/ipc/contracts'
import { createForkWorkflowState$, type ForkWorkflowState } from './fork-workflow.state'

export interface ForkSessionApi {
  fork?: (sessionId: string, title?: string) => Promise<LiveSessionSnapshot>
  forkViaDaemon?: (sessionId: string, title?: string) => Promise<LiveSessionSnapshot>
}

export class ForkWorkflowStore {
  readonly state$: Observable<ForkWorkflowState> = createForkWorkflowState$()

  private readonly getSelectedSessionId: () => string | null
  private readonly getSelectedSession: () => { title: string } | null
  private readonly sessionApi: ForkSessionApi
  private readonly onForked?: (snapshot: LiveSessionSnapshot) => Promise<void>

  constructor(
    getSelectedSessionId: () => string | null,
    getSelectedSession: () => { title: string } | null,
    sessionApi: ForkSessionApi,
    onForked?: (snapshot: LiveSessionSnapshot) => Promise<void>,
  ) {
    this.getSelectedSessionId = getSelectedSessionId
    this.getSelectedSession = getSelectedSession
    this.sessionApi = sessionApi
    this.onForked = onForked
  }

  get forkDraft(): string {
    return this.state$.forkDraft.get()
  }

  set forkDraft(value: string) {
    this.state$.forkDraft.set(value)
  }

  get isForkDialogOpen(): boolean {
    return this.state$.isForkDialogOpen.get()
  }

  set isForkDialogOpen(value: boolean) {
    this.state$.isForkDialogOpen.set(value)
  }

  get forkingSessionId(): string | null {
    return this.state$.forkingSessionId.get()
  }

  set forkingSessionId(value: string | null) {
    this.state$.forkingSessionId.set(value)
  }

  get error(): string | null {
    return this.state$.error.get()
  }

  set error(value: string | null) {
    this.state$.error.set(value)
  }

  openForkDialog = (): void => {
    const selectedSessionId = this.getSelectedSessionId()

    if (!selectedSessionId) {
      return
    }

    this.forkDraft = `[Fork] ${this.getSelectedSession()?.title ?? 'session'}`
    this.isForkDialogOpen = true
    this.error = null
  }

  closeForkDialog = (): void => {
    this.isForkDialogOpen = false
    this.forkDraft = ''
  }

  setForkDraft = (value: string): void => {
    this.forkDraft = value
  }

  submitFork = async (): Promise<LiveSessionSnapshot | null> => {
    const selectedSessionId = this.getSelectedSessionId()
    const forkTitle = this.forkDraft.trim()
    const fork = this.sessionApi.fork ?? this.sessionApi.forkViaDaemon

    if (!selectedSessionId || forkTitle.length === 0 || !fork) {
      return null
    }

    batch(() => {
      this.forkingSessionId = selectedSessionId
      this.error = null
    })

    try {
      const snapshot = await fork(selectedSessionId, forkTitle)
      await this.onForked?.(snapshot)

      batch(() => {
        this.closeForkDialog()
      })

      return snapshot
    } catch (error) {
      batch(() => {
        this.error = error instanceof Error ? error.message : 'Unable to fork the selected session.'
      })
      return null
    } finally {
      batch(() => {
        this.forkingSessionId = null
      })
    }
  }
}
