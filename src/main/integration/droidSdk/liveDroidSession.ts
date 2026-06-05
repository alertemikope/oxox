import { randomUUID } from 'node:crypto'

import type {
  AddMcpServerRequestParams,
  AddMcpServerResult,
  AuthenticateMcpServerRequestParams,
  AuthenticateMcpServerResult,
  CompactSessionRequestParams,
  CompactSessionResult,
  ExecuteRewindRequestParams,
  ExecuteRewindResult,
  ForkSessionResult,
  GetContextStatsResult,
  GetRewindInfoRequestParams,
  GetRewindInfoResult,
  InitializeSessionResult,
  ListMcpServersResult,
  ListMcpToolsResult,
  ListSkillsResult,
  ListToolsRequestParams,
  ListToolsResult,
  LoadSessionResult,
  RemoveMcpServerRequestParams,
  RemoveMcpServerResult,
  RenameSessionRequestParams,
  RenameSessionResult,
  ToggleMcpServerRequestParams,
  ToggleMcpServerResult,
  UpdateSessionSettingsRequestParams,
  UpdateSessionSettingsResult,
} from '@factory/droid-sdk'
import { type DroidClient, DroidSession, SDK_TAG } from '@factory/droid-sdk'

import type { LiveSessionAddUserMessageRequest } from '../../../shared/ipc/contracts'
import type { InitializeSessionRequest } from '../sessions/types'

export type OxoxLiveDroidSessionInitResult = InitializeSessionResult | LoadSessionResult

export interface OxoxLiveDroidSessionAddUserMessageRequest
  extends LiveSessionAddUserMessageRequest {
  messageId?: string
}

export class OxoxLiveDroidSession {
  constructor(
    private readonly client: DroidClient,
    private readonly sdkSession: DroidSession,
  ) {}

  get sessionId(): string {
    return this.sdkSession.sessionId
  }

  get initResult(): OxoxLiveDroidSessionInitResult {
    return this.sdkSession.initResult
  }

  async addUserMessage(request: OxoxLiveDroidSessionAddUserMessageRequest): Promise<string> {
    const messageId = request.messageId ?? randomUUID()
    await this.client.addUserMessage({
      ...request,
      messageId,
    })
    return messageId
  }

  async interrupt(): Promise<void> {
    await this.sdkSession.interrupt()
  }

  async close(): Promise<void> {
    await this.sdkSession.close()
  }

  async updateSettings(
    params: Partial<UpdateSessionSettingsRequestParams>,
  ): Promise<UpdateSessionSettingsResult> {
    return this.sdkSession.updateSettings(params)
  }

  async addMcpServer(params: AddMcpServerRequestParams): Promise<AddMcpServerResult> {
    return this.sdkSession.addMcpServer(params)
  }

  async removeMcpServer(params: RemoveMcpServerRequestParams): Promise<RemoveMcpServerResult> {
    return this.sdkSession.removeMcpServer(params)
  }

  async toggleMcpServer(params: ToggleMcpServerRequestParams): Promise<ToggleMcpServerResult> {
    return this.sdkSession.toggleMcpServer(params)
  }

  async authenticateMcpServer(
    params: AuthenticateMcpServerRequestParams,
  ): Promise<AuthenticateMcpServerResult> {
    return this.sdkSession.authenticateMcpServer(params)
  }

  async listMcpServers(): Promise<ListMcpServersResult> {
    return this.sdkSession.listMcpServers()
  }

  async listMcpTools(): Promise<ListMcpToolsResult> {
    return this.sdkSession.listMcpTools()
  }

  async listTools(params: ListToolsRequestParams = {}): Promise<ListToolsResult> {
    return this.sdkSession.listTools(params)
  }

  async listSkills(): Promise<ListSkillsResult> {
    return this.sdkSession.listSkills()
  }

  async getRewindInfo(params: GetRewindInfoRequestParams): Promise<GetRewindInfoResult> {
    return this.sdkSession.getRewindInfo(params)
  }

  async executeRewind(params: ExecuteRewindRequestParams): Promise<ExecuteRewindResult> {
    return this.sdkSession.executeRewind(params)
  }

  async compactSession(params?: CompactSessionRequestParams): Promise<CompactSessionResult> {
    return this.sdkSession.compactSession(params)
  }

  async fork(): Promise<ForkSessionResult> {
    return this.sdkSession.forkSession()
  }

  async getContextStats(): Promise<GetContextStatsResult> {
    return this.sdkSession.getContextStats()
  }

  async renameSession(params: RenameSessionRequestParams): Promise<RenameSessionResult> {
    return this.sdkSession.renameSession(params)
  }
}

export async function createOxoxLiveDroidSession(
  client: DroidClient,
  request: InitializeSessionRequest,
): Promise<OxoxLiveDroidSession> {
  const result = await client.initializeSession({
    machineId: 'oxox-electron',
    cwd: request.cwd,
    ...request.settings,
    tags: [SDK_TAG],
  })

  return new OxoxLiveDroidSession(client, new DroidSession(client, result.sessionId, result))
}

export async function loadOxoxLiveDroidSession(
  client: DroidClient,
  sessionId: string,
): Promise<OxoxLiveDroidSession> {
  const result = await client.loadSession({ sessionId })
  return new OxoxLiveDroidSession(client, new DroidSession(client, sessionId, result))
}

export function attachOxoxLiveDroidSession(
  client: DroidClient,
  sessionId: string,
): OxoxLiveDroidSession {
  return new OxoxLiveDroidSession(
    client,
    new DroidSession(client, sessionId, {
      session: { messages: [] },
    }),
  )
}
