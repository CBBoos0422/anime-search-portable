'use strict'

const net = require('net')
const { execFileSync } = require('child_process')

const COMMON_LOCAL_PROXIES = [
  'http://127.0.0.1:10808',
  'http://127.0.0.1:7890',
  'http://127.0.0.1:7897',
  'http://127.0.0.1:1080'
]

function normalizeProxyUrl (value) {
  let raw = String(value || '').trim()
  if (!raw) return ''

  if (raw.includes(';')) {
    const entries = raw.split(';').map((entry) => entry.trim()).filter(Boolean)
    const preferred = entries.find((entry) => /^https=/iu.test(entry)) ||
      entries.find((entry) => /^http=/iu.test(entry)) || entries[0]
    raw = preferred.replace(/^[a-z]+=/iu, '')
  }

  if (/^[a-z]+=/iu.test(raw)) raw = raw.replace(/^[a-z]+=/iu, '')
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(raw)) raw = `http://${raw}`

  try {
    const parsed = new URL(raw)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return ''
    if (!parsed.port) parsed.port = parsed.protocol === 'https:' ? '443' : '80'
    return parsed.href.replace(/\/$/u, '')
  } catch {
    return ''
  }
}

function readWindowsProxyServer () {
  if (process.platform !== 'win32') return ''
  try {
    const output = execFileSync('reg.exe', [
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v',
      'ProxyServer'
    ], { encoding: 'utf8', windowsHide: true, timeout: 2000 })
    const match = output.match(/ProxyServer\s+REG_SZ\s+(.+)$/imu)
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

function buildProxyCandidates (environment = process.env, windowsProxy = readWindowsProxyServer()) {
  const values = [
    environment.ANIME_SEARCH_PROXY,
    environment.HTTPS_PROXY,
    environment.https_proxy,
    environment.HTTP_PROXY,
    environment.http_proxy,
    environment.ALL_PROXY,
    environment.all_proxy,
    windowsProxy,
    ...COMMON_LOCAL_PROXIES
  ]
  return [...new Set(values.map(normalizeProxyUrl).filter(Boolean))]
}

function proxyUrlToAxiosConfig (proxyUrl) {
  const parsed = new URL(proxyUrl)
  const config = {
    protocol: parsed.protocol.slice(0, -1),
    host: parsed.hostname,
    port: Number(parsed.port)
  }
  if (parsed.username || parsed.password) {
    config.auth = {
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password)
    }
  }
  return config
}

function canConnect (proxyUrl, timeout = 700) {
  const parsed = new URL(proxyUrl)
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: parsed.hostname, port: Number(parsed.port) })
    let finished = false
    const finish = (available) => {
      if (finished) return
      finished = true
      socket.destroy()
      resolve(available)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function findReachableProxyCandidates (candidates = buildProxyCandidates()) {
  const states = await Promise.all(candidates.map(async (url) => ({
    url,
    reachable: await canConnect(url)
  })))
  return states.filter((item) => item.reachable).map((item) => item.url)
}

function describeNyaaError (error, triedProxy) {
  const code = String(error?.code || '')
  const message = String(error?.message || 'connection failed')
  const networkFailure = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|timeout|socket hang up/iu.test(`${code} ${message}`)
  if (!networkFailure) return message
  const attempted = triedProxy ? 'A local proxy and a direct connection were tried automatically. ' : 'No available local HTTP proxy was detected. '
  return `The connection timed out or was blocked. ${attempted}Check that your proxy application is running, or switch to AnimeGarden.`
}

module.exports = {
  COMMON_LOCAL_PROXIES,
  buildProxyCandidates,
  describeNyaaError,
  findReachableProxyCandidates,
  normalizeProxyUrl,
  proxyUrlToAxiosConfig,
  readWindowsProxyServer
}
