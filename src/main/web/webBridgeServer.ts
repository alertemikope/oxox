import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { type WebSocket, WebSocketServer } from 'ws'

type IpcHandler = (...args: unknown[]) => unknown

interface WebContentsLike {
  id: number
  once: (event: 'destroyed', listener: () => void) => void
  send: (channel: string, payload: unknown) => void
}

interface VirtualWindowLike {
  isDestroyed: () => boolean
  webContents: WebContentsLike
}

interface IpcMainLike {
  handle: (channel: string, handler: IpcHandler) => void
  removeHandler: (channel: string) => void
}

interface CreateWebBridgeServerOptions {
  host?: string
  port?: number
  registerHandlers: (ipcMain: IpcMainLike) => () => void
}

interface InvokeRequest {
  channel?: string
  args?: unknown[]
  clientId?: string
}

interface WebClient {
  clientId: string
  destroyed: boolean
  destroyedListeners: Array<() => void>
  socket: WebSocket | null
  window: VirtualWindowLike
}

const DEFAULT_HOST = '0.0.0.0'
const DEFAULT_PORT = 3106

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(payload))
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    request.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw.length === 0 ? null : JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function createWebClient(clientId: string, id: number): WebClient {
  const client: WebClient = {
    clientId,
    destroyed: false,
    destroyedListeners: [],
    socket: null,
    window: {
      isDestroyed: () => client.destroyed,
      webContents: {
        id,
        once: (_event, listener) => {
          client.destroyedListeners.push(listener)
        },
        send: (channel, payload) => {
          if (client.destroyed || client.socket?.readyState !== WebSocket.OPEN) {
            return
          }

          client.socket.send(JSON.stringify({ channel, payload }))
        },
      },
    },
  }

  return client
}

export function createWebBridgeServer({
  host = process.env.OXOX_WEB_HOST || DEFAULT_HOST,
  port = Number(process.env.OXOX_WEB_PORT || DEFAULT_PORT),
  registerHandlers,
}: CreateWebBridgeServerOptions) {
  const handlers = new Map<string, IpcHandler>()
  const clientsByClientId = new Map<string, WebClient>()
  let nextClientNumericId = 10_000

  const ipcMain: IpcMainLike = {
    handle: (channel, handler) => {
      handlers.set(channel, handler)
    },
    removeHandler: (channel) => {
      handlers.delete(channel)
    },
  }

  const cleanupHandlers = registerHandlers(ipcMain)

  const getClient = (clientId: string): WebClient => {
    const existingClient = clientsByClientId.get(clientId)

    if (existingClient && !existingClient.destroyed) {
      return existingClient
    }

    const client = createWebClient(clientId, nextClientNumericId++)
    clientsByClientId.set(clientId, client)
    return client
  }

  const destroyClient = (client: WebClient): void => {
    if (client.destroyed) {
      return
    }

    client.destroyed = true
    client.socket = null

    for (const listener of client.destroyedListeners.splice(0)) {
      listener()
    }
  }

  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, null)
      return
    }

    if (request.url === '/__oxox/health') {
      sendJson(response, 200, { ok: true, port })
      return
    }

    if (request.method !== 'POST' || request.url !== '/__oxox/invoke') {
      sendJson(response, 404, { error: 'not_found' })
      return
    }

    try {
      const body = (await readJsonBody(request)) as InvokeRequest | null
      const channel = body?.channel
      const args = Array.isArray(body?.args) ? body.args : []
      const clientId = body?.clientId

      if (!channel || !clientId) {
        sendJson(response, 400, { error: 'invalid_request' })
        return
      }

      const handler = handlers.get(channel)

      if (!handler) {
        sendJson(response, 404, { error: 'unknown_channel', channel })
        return
      }

      const client = getClient(clientId)
      const result = await handler({ sender: client.window.webContents }, ...args)
      sendJson(response, 200, { result })
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  const webSocketServer = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (url.pathname !== '/__oxox/events') {
      socket.destroy()
      return
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request)
    })
  })

  webSocketServer.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    const clientId = url.searchParams.get('clientId')

    if (!clientId) {
      socket.close(1008, 'clientId required')
      return
    }

    const client = getClient(clientId)
    client.socket = socket
    socket.on('close', () => destroyClient(client))
    socket.on('error', () => destroyClient(client))
  })

  return {
    start: () =>
      new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          console.log(`OXOX web bridge listening on http://${host}:${port}`)
          resolve()
        })
      }),
    close: () => {
      cleanupHandlers()
      for (const client of clientsByClientId.values()) {
        destroyClient(client)
      }
      clientsByClientId.clear()
      webSocketServer.close()
      server.close()
    },
    getVirtualWindows: (): VirtualWindowLike[] =>
      [...clientsByClientId.values()]
        .filter((client) => !client.destroyed && client.socket?.readyState === WebSocket.OPEN)
        .map((client) => client.window),
  }
}
