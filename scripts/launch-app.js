'use strict'

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const APP_ROOT = path.resolve(__dirname, '..')
const APP_URL = 'http://127.0.0.1:4173/'
const HEALTH_URL = `${APP_URL}api/health`
const NODE_PATH = path.join(APP_ROOT, 'vendor', 'node', 'node.exe')
const QBIT_PATH = path.join(APP_ROOT, 'vendor', 'qbittorrent', 'qbittorrent.exe')
const SERVER_PATH = path.join(APP_ROOT, 'app', 'server.js')
const RUNTIME_DIR = path.join(APP_ROOT, 'runtime')
const BROWSER_PROFILE = path.join(RUNTIME_DIR, 'browser-profile')
const BROWSER_STATE = path.join(RUNTIME_DIR, 'browser-window.json')

function delay (milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function serviceReady () {
  try {
    const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(900) })
    const data = await response.json()
    return response.ok && data.app === 'anime-search'
  } catch {
    return false
  }
}

function findBrowser () {
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.LocalAppData || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function showError (message) {
  const escaped = String(message).replace(/'/gu, "''")
  const command = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${escaped}', 'Anime Search', 'OK', 'Error') | Out-Null`
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.unref()
}

async function startService () {
  const logPath = path.join(APP_ROOT, 'nyaa-gui.log')
  const log = fs.openSync(logPath, 'a')
  const child = spawn(NODE_PATH, [SERVER_PATH], {
    cwd: APP_ROOT,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
    env: { ...process.env, NO_OPEN: '1' }
  })
  child.unref()
  fs.closeSync(log)

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(250)
    if (await serviceReady()) return
  }
  throw new Error(`无法启动 Anime Search。请检查日志：${logPath}`)
}

async function main () {
  if (!fs.existsSync(NODE_PATH) || !fs.existsSync(QBIT_PATH)) {
    throw new Error('便携包不完整，缺少 Node.js 或 qBittorrent。请重新解压完整便携包。')
  }
  await fs.promises.mkdir(BROWSER_PROFILE, { recursive: true })
  await fs.promises.access(RUNTIME_DIR, fs.constants.W_OK)
  if (!await serviceReady()) await startService()

  const browser = findBrowser()
  if (!browser) throw new Error('未找到 Microsoft Edge 或 Google Chrome，无法打开独立应用窗口。')
  const child = spawn(browser, [
    `--user-data-dir=${BROWSER_PROFILE}`,
    `--app=${APP_URL}`,
    '--no-first-run',
    '--disable-session-crashed-bubble'
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  })
  child.unref()
  await fs.promises.writeFile(BROWSER_STATE, `${JSON.stringify({
    pid: child.pid,
    executablePath: browser,
    profilePath: BROWSER_PROFILE,
    startedAt: new Date().toISOString()
  }, null, 2)}\n`, 'utf8')
}

main().catch((error) => {
  try { fs.appendFileSync(path.join(APP_ROOT, 'nyaa-gui.log'), `\n启动器错误：${error.stack || error.message}\n`, 'utf8') } catch {}
  showError(error.message)
  process.exitCode = 1
})
