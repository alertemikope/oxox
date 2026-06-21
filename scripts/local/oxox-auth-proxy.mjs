import { randomBytes, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import net from 'node:net'

const HOST = '0.0.0.0'
const PORT = 3110
const STATIC_TARGET = { host: '127.0.0.1', port: 3105 }
const BRIDGE_TARGET = { host: '127.0.0.1', port: 3106 }
const PASSWORD = process.env.OXOX_WEB_PASSWORD || 'DroidWeb-2026-Ilann-7Kp9'
const COOKIE_NAME = 'oxox_session'
const SESSION_TOKEN = process.env.OXOX_WEB_SESSION_TOKEN || randomBytes(32).toString('hex')

function safeEqual(a, b) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  )
}

function isAuthenticated(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] === SESSION_TOKEN
}

function redirect(res, location) {
  res.writeHead(302, { Location: location })
  res.end()
}

function renderLogin(res, error = '') {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(`<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Droid Login</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.card{width:min(90vw,380px);padding:28px;border:1px solid #262a35;border-radius:18px;background:#12151d;box-shadow:0 20px 80px #0008}h1{margin:0 0 18px;font-size:22px}input,button{box-sizing:border-box;width:100%;border-radius:12px;border:1px solid #303545;padding:13px 14px;font-size:16px}input{background:#0b0d12;color:#fff}button{margin-top:14px;background:#f97316;color:#111;border:0;font-weight:700}.err{color:#fb7185;margin:0 0 12px}</style></head>
<body><form class="card" method="post" action="/login"><h1>Droid Web</h1>${error ? `<p class="err">${error}</p>` : ''}<input name="password" type="password" placeholder="Mot de passe" autocomplete="current-password" autofocus><button type="submit">Se connecter</button></form></body></html>`)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function proxyHttp(req, res, target) {
  const headers = { ...req.headers, host: `${target.host}:${target.port}` }
  const proxyReq = http.request(
    { host: target.host, port: target.port, method: req.method, path: req.url, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )
  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('upstream unavailable')
  })
  req.pipe(proxyReq)
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/login' && req.method === 'GET') {
    renderLogin(res)
    return
  }

  if (req.url === '/login' && req.method === 'POST') {
    const body = await readBody(req)
    const params = new URLSearchParams(body)
    if (safeEqual(params.get('password') || '', PASSWORD)) {
      res.writeHead(302, {
        Location: '/',
        'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(SESSION_TOKEN)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`,
      })
      res.end()
      return
    }
    renderLogin(res, 'Mot de passe incorrect')
    return
  }

  if (req.url === '/logout') {
    res.writeHead(302, {
      Location: '/login',
      'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
    })
    res.end()
    return
  }

  if (!isAuthenticated(req)) {
    redirect(res, '/login')
    return
  }

  proxyHttp(req, res, req.url?.startsWith('/__oxox/') ? BRIDGE_TARGET : STATIC_TARGET)
})

server.on('upgrade', (req, socket, head) => {
  if (!isAuthenticated(req) || !req.url?.startsWith('/__oxox/')) {
    socket.write('HTTP/1.1 302 Found\r\nLocation: /login\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  const upstream = net.connect(BRIDGE_TARGET.port, BRIDGE_TARGET.host, () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`)
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${name}: ${item}\r\n`)
      } else if (value !== undefined) {
        upstream.write(`${name}: ${value}\r\n`)
      }
    }
    upstream.write('\r\n')
    if (head.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
})

server.listen(PORT, HOST, () => {
  console.log(`OXOX auth proxy listening on http://${HOST}:${PORT}`)
})
