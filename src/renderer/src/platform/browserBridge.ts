import { createOxoxBridge } from '../../../preload/bridge'
import type { OxoxBridge } from '../../../shared/ipc/contracts'

interface WebBridgeMessage {
  channel?: string
  payload?: unknown
}

type Listener = (event: unknown, payload: unknown) => void

const CLIENT_ID_STORAGE_KEY = 'oxox.webClientId'
const WEB_SECRET_PREFIX = '/dw-7kP9-ilann-droid'
export const BROWSER_DEFAULT_WORKSPACE_PATH = '/Users/mrsachou/droid_web'

type BrowserBridgeWindow = Window &
  typeof globalThis & {
    oxoxWebDefaultWorkspacePath?: string
  }

function getOrCreateClientId(): string {
  const existingClientId = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY)

  if (existingClientId) {
    return existingClientId
  }

  const clientId = window.crypto.randomUUID()
  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId)
  return clientId
}

function getWebSocketUrl(): string {
  const url = new URL(`${getWebBridgePrefix()}/__oxox/events`, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('clientId', getOrCreateClientId())
  return url.toString()
}

function getWebBridgePrefix(): string {
  return window.location.pathname.startsWith(`${WEB_SECRET_PREFIX}/`) ||
    window.location.pathname === WEB_SECRET_PREFIX
    ? WEB_SECRET_PREFIX
    : ''
}

function createBrowserOxoxBridge(): OxoxBridge {
  const listenersByChannel = new Map<string, Set<Listener>>()
  let socket: WebSocket | null = null

  const ensureSocket = (): WebSocket => {
    if (
      socket &&
      (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
    ) {
      return socket
    }

    socket = new WebSocket(getWebSocketUrl())
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as WebBridgeMessage
      const channel = message.channel

      if (!channel) {
        return
      }

      const listeners = listenersByChannel.get(channel)

      if (!listeners) {
        return
      }

      for (const listener of listeners) {
        listener(undefined, message.payload)
      }
    })

    return socket
  }

  ensureSocket()

  const bridge = createOxoxBridge(
    async (channel, ...args) => {
      const response = await fetch(`${getWebBridgePrefix()}/__oxox/invoke`, {
        body: JSON.stringify({
          args,
          channel,
          clientId: getOrCreateClientId(),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? `OXOX web bridge failed for ${channel}`)
      }

      return payload.result
    },
    (channel, listener) => {
      ensureSocket()
      const listeners = listenersByChannel.get(channel) ?? new Set<Listener>()
      listeners.add(listener)
      listenersByChannel.set(channel, listeners)
    },
    (channel, listener) => {
      const listeners = listenersByChannel.get(channel)
      listeners?.delete(listener)
    },
    () => null,
  )

  bridge.dialog.selectDirectory = async () => {
    return BROWSER_DEFAULT_WORKSPACE_PATH
  }

  return bridge
}

export function getBrowserDefaultWorkspacePath(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return (window as BrowserBridgeWindow).oxoxWebDefaultWorkspacePath ?? null
}

export function installBrowserBridgeIfNeeded(): void {
  if (typeof window === 'undefined' || window.oxox) {
    return
  }

  if (!['http:', 'https:'].includes(window.location.protocol)) {
    return
  }

  if (
    typeof window.fetch !== 'function' ||
    typeof window.WebSocket !== 'function' ||
    typeof window.crypto?.randomUUID !== 'function' ||
    typeof window.localStorage?.getItem !== 'function' ||
    typeof window.localStorage?.setItem !== 'function'
  ) {
    return
  }

  ;(window as BrowserBridgeWindow).oxoxWebDefaultWorkspacePath = BROWSER_DEFAULT_WORKSPACE_PATH
  window.oxox = createBrowserOxoxBridge()
}
