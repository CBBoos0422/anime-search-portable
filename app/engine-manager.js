'use strict'

const crypto = require('crypto')
const fs = require('fs')
const net = require('net')
const path = require('path')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

class EngineConsentError extends Error {
  constructor () {
    super('Confirm the qBittorrent license and lawful-use notice before first use.')
    this.name = 'EngineConsentError'
    this.code = 'ENGINE_CONSENT_REQUIRED'
    this.statusCode = 428
  }
}

function parseIni (content = '') {
  const sections = new Map()
  let section = ''
  sections.set(section, new Map())

  String(content).replace(/^\uFEFF/u, '').split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim()
    const sectionMatch = /^\[([^\]]+)\]$/u.exec(trimmed)
    if (sectionMatch) {
      section = sectionMatch[1]
      if (!sections.has(section)) sections.set(section, new Map())
      return
    }
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) return
    const separator = line.indexOf('=')
    if (separator < 0) return
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (key) sections.get(section).set(key, value)
  })
  return sections
}

function buildQbittorrentIni (existingContent, port) {
  const sections = parseIni(existingContent)
  const setValue = (section, key, value) => {
    if (!sections.has(section)) sections.set(section, new Map())
    sections.get(section).set(key, String(value))
  }

  setValue('Preferences', 'WebUI\\Enabled', 'true')
  setValue('Preferences', 'WebUI\\Address', '127.0.0.1')
  setValue('Preferences', 'WebUI\\Port', port)
  setValue('Preferences', 'WebUI\\LocalHostAuth', 'false')
  setValue('Preferences', 'WebUI\\UseUPnP', 'false')
  const preferences = sections.get('Preferences')
  if (!preferences.has('WebUI\\Password_PBKDF2') && !preferences.has('WebUI\\Password_ha1')) {
    const salt = crypto.randomBytes(16)
    const localSecret = crypto.randomBytes(32)
    const derivedKey = crypto.pbkdf2Sync(localSecret, salt, 100000, 64, 'sha512')
    setValue('Preferences', 'WebUI\\Username', 'anime_search_local')
    setValue('Preferences', 'WebUI\\Password_PBKDF2', `"@ByteArray(${salt.toString('base64')}:${derivedKey.toString('base64')})"`)
  }
  setValue('Preferences', 'General\\NoSplashScreen', 'true')
  setValue('Preferences', 'General\\StartMinimized', 'true')
  setValue('Preferences', 'General\\SystrayEnabled', 'false')
  setValue('Preferences', 'General\\MinimizeToTray', 'false')
  setValue('Preferences', 'General\\CloseToTray', 'false')
  setValue('Preferences', 'General\\ExitConfirm', 'false')
  setValue('LegalNotice', 'Accepted', 'true')
  setValue('GUI', 'StartUpWindowState', 'Hidden')

  const output = []
  for (const [section, values] of sections) {
    if (section) output.push(`[${section}]`)
    for (const [key, value] of values) output.push(`${key}=${value}`)
    if (values.size > 0) output.push('')
  }
  return `${output.join('\r\n').trim()}\r\n`
}

function isPortAvailable (port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.unref()
    probe.once('error', () => resolve(false))
    probe.listen(port, host, () => {
      probe.close(() => resolve(true))
    })
  })
}

async function findAvailablePort (start, end, host = '127.0.0.1') {
  for (let port = start; port <= end; port += 1) {
    if (await isPortAvailable(port, host)) return port
  }
  throw new Error(`All ports from ${start} to ${end} are in use. The bundled download engine cannot start.`)
}

function delay (milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function extractWebUiPort (commandLine = '') {
  const match = /(?:^|\s)--webui-port(?:=|\s+)(\d{1,5})(?=\s|$)/iu.exec(String(commandLine))
  if (!match) return null
  const port = Number(match[1])
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

async function atomicWriteJson (filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.promises.rename(temporaryPath, filePath)
}

async function readJsonFile (filePath) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

class QbittorrentEngine {
  constructor (options) {
    this.executablePath = path.resolve(options.executablePath)
    this.runtimeDir = path.resolve(options.runtimeDir)
    this.profilePath = this.runtimeDir
    this.expectedVersion = options.expectedVersion
    this.expectedSha256 = String(options.expectedSha256 || '').toLowerCase()
    this.portStart = options.portStart || 18080
    this.portEnd = options.portEnd || 18120
    this.consentPath = path.join(this.runtimeDir, 'qbt-consent.json')
    this.statePath = path.join(this.runtimeDir, 'qbt-engine.json')
    this.configPath = path.join(this.profilePath, 'qBittorrent', 'config', 'qBittorrent.ini')
    this.starting = null
    this.port = null
    this.pid = null
    this.version = null
    this.lastError = null
  }

  async hasConsent () {
    const consent = await readJsonFile(this.consentPath)
    return Boolean(consent?.accepted && consent.qbittorrentVersion === this.expectedVersion)
  }

  async acceptConsent () {
    await atomicWriteJson(this.consentPath, {
      accepted: true,
      qbittorrentVersion: this.expectedVersion,
      acceptedAt: new Date().toISOString()
    })
    this.lastError = null
    await this.ensureRunning()
    return this.getStatus()
  }

  apiBase (port = this.port) {
    return `http://127.0.0.1:${port}`
  }

  async probe (port = this.port) {
    if (!Number.isInteger(port)) return false
    const base = this.apiBase(port)
    try {
      const response = await fetch(`${base}/api/v2/app/version`, {
        headers: { Referer: base },
        signal: AbortSignal.timeout(1000)
      })
      if (!response.ok) return false
      this.version = (await response.text()).replace(/^v/iu, '')
      return this.version === this.expectedVersion
    } catch {
      return false
    }
  }

  async processInfo (pid) {
    if (!Number.isInteger(pid) || pid <= 0 || process.platform !== 'win32') return null
    const command = [
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      '$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $env:ANIME_ENGINE_PID" -ErrorAction SilentlyContinue',
      'if ($processInfo) {',
      '  [pscustomobject]@{ ProcessId = $processInfo.ProcessId; ExecutablePath = $processInfo.ExecutablePath; CommandLine = $processInfo.CommandLine } | ConvertTo-Json -Compress',
      '}'
    ].join('; ')
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', command
      ], {
        windowsHide: true,
        timeout: 3500,
        env: { ...process.env, ANIME_ENGINE_PID: String(pid) }
      })
      return stdout.trim() ? JSON.parse(stdout.trim()) : null
    } catch {
      return null
    }
  }

  async ownedProcesses () {
    if (process.platform !== 'win32') return []
    const command = [
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      '$items = @(Get-CimInstance Win32_Process -Filter "Name = \'qbittorrent.exe\'" -ErrorAction SilentlyContinue | ForEach-Object {',
      '  [pscustomobject]@{ ProcessId = $_.ProcessId; ExecutablePath = $_.ExecutablePath; CommandLine = $_.CommandLine }',
      '})',
      'if ($items.Count -gt 0) { $items | ConvertTo-Json -Compress }'
    ].join('; ')
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', command
      ], { windowsHide: true, timeout: 5000 })
      if (!stdout.trim()) return []
      const parsed = JSON.parse(stdout.trim())
      return (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => this.isExpectedProcess(item))
    } catch {
      return []
    }
  }

  isExpectedProcess (processInfo) {
    if (!processInfo?.ExecutablePath) return false
    const actualExecutable = path.resolve(processInfo.ExecutablePath).toLowerCase()
    const expectedExecutable = this.executablePath.toLowerCase()
    const commandLine = String(processInfo.CommandLine || '').toLowerCase()
    return actualExecutable === expectedExecutable && commandLine.includes(this.profilePath.toLowerCase())
  }

  async hideOwnedWindows (pid) {
    if (process.platform !== 'win32') return true
    const processInfo = await this.processInfo(pid)
    if (!this.isExpectedProcess(processInfo)) return false

    const command = [
      `$memberDefinition = '[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command); public delegate bool EnumWindowsProc(IntPtr window, IntPtr extraData);'`,
      'Add-Type -MemberDefinition $memberDefinition -Name NativeMethods -Namespace AnimeSearch',
      '$targetPid = [uint32]$env:ANIME_ENGINE_PID',
      'for ($attempt = 0; $attempt -lt 30; $attempt += 1) {',
      '  [AnimeSearch.NativeMethods]::EnumWindows({ param($window, $extraData) $windowPid = [uint32]0; [void][AnimeSearch.NativeMethods]::GetWindowThreadProcessId($window, [ref]$windowPid); if ($windowPid -eq $targetPid) { [void][AnimeSearch.NativeMethods]::ShowWindow($window, 0) }; return $true }, [IntPtr]::Zero) | Out-Null',
      '  Start-Sleep -Milliseconds 100',
      '}'
    ].join('; ')
    try {
      await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command
      ], {
        windowsHide: true,
        timeout: 7000,
        env: { ...process.env, ANIME_ENGINE_PID: String(pid) }
      })
      return true
    } catch {
      return false
    }
  }

  async reconnect () {
    const state = await readJsonFile(this.statePath)
    const stateMatches = state &&
      path.resolve(String(state.executablePath || '')).toLowerCase() === this.executablePath.toLowerCase() &&
      path.resolve(String(state.profilePath || '')).toLowerCase() === this.profilePath.toLowerCase() &&
      Number.isInteger(state.pid) && Number.isInteger(state.port) &&
      state.port >= this.portStart && state.port <= this.portEnd

    if (stateMatches) {
      const processInfo = await this.processInfo(state.pid)
      if (this.isExpectedProcess(processInfo) && await this.probe(state.port)) {
        this.pid = state.pid
        this.port = state.port
        await this.hideOwnedWindows(this.pid)
        this.lastError = null
        return true
      }
    }

    const owned = await this.ownedProcesses()
    for (const processInfo of owned) {
      const commandPort = extractWebUiPort(processInfo.CommandLine)
      const configuredPort = await this.configuredPort()
      const candidatePorts = [...new Set([commandPort, configuredPort, stateMatches ? state.port : null])]
        .filter((port) => Number.isInteger(port) && port >= this.portStart && port <= this.portEnd)
      for (const port of candidatePorts) {
        if (!await this.probe(port)) continue
        this.pid = Number(processInfo.ProcessId)
        this.port = port
        await atomicWriteJson(this.statePath, {
          pid: this.pid,
          port,
          executablePath: this.executablePath,
          profilePath: this.profilePath,
          startedAt: state?.startedAt || new Date().toISOString(),
          recoveredAt: new Date().toISOString()
        })
        await this.hideOwnedWindows(this.pid)
        this.lastError = null
        return true
      }
    }
    return false
  }

  async configuredPort () {
    try {
      const sections = parseIni(await fs.promises.readFile(this.configPath, 'utf8'))
      const port = Number(sections.get('Preferences')?.get('WebUI\\Port'))
      return Number.isInteger(port) ? port : null
    } catch {
      return null
    }
  }

  async verifyExecutable () {
    let stat
    try {
      stat = await fs.promises.stat(this.executablePath)
    } catch {
      throw new Error('The bundled qBittorrent executable is missing. Extract the complete portable package again.')
    }
    if (!stat.isFile()) throw new Error('The bundled qBittorrent path is invalid.')
    if (!this.expectedSha256) return

    const hash = crypto.createHash('sha256')
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(this.executablePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    if (hash.digest('hex') !== this.expectedSha256) {
      throw new Error('Bundled qBittorrent verification failed. Obtain a fresh official portable package.')
    }
  }

  async ensureConfig (port) {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true })
    let existing = ''
    try {
      existing = await fs.promises.readFile(this.configPath, 'utf8')
    } catch {}
    await fs.promises.writeFile(this.configPath, buildQbittorrentIni(existing, port), 'utf8')
  }

  async start () {
    await this.verifyExecutable()
    if (await this.reconnect()) return

    const orphanedOwnedProcesses = await this.ownedProcesses()
    if (orphanedOwnedProcesses.length > 0) {
      throw new Error('A qBittorrent process left by this project was detected, but its Web API is unreachable. Exit Anime Search and open it again.')
    }

    const port = await findAvailablePort(this.portStart, this.portEnd)
    await this.ensureConfig(port)
    const child = spawn(this.executablePath, [
      `--profile=${this.profilePath}`,
      '--no-splash',
      `--webui-port=${port}`
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
    this.pid = child.pid
    this.port = port
    await atomicWriteJson(this.statePath, {
      pid: this.pid,
      port,
      executablePath: this.executablePath,
      profilePath: this.profilePath,
      startedAt: new Date().toISOString()
    })

    let windowsHidden = false
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await delay(250)
      if (!windowsHidden) windowsHidden = await this.hideOwnedWindows(this.pid)
      if (await this.probe(port)) {
        this.lastError = null
        return
      }
      const processInfo = await this.processInfo(this.pid)
      if (!processInfo) break
    }
    const failedPid = this.pid
    const failedProcess = await this.processInfo(failedPid)
    if (this.isExpectedProcess(failedProcess)) {
      try { process.kill(failedPid) } catch {}
    }
    this.pid = null
    this.port = null
    await fs.promises.rm(this.statePath, { force: true })
    throw new Error('The bundled qBittorrent background service timed out while starting.')
  }

  async ensureRunning () {
    if (!await this.hasConsent()) throw new EngineConsentError()
    if (await this.probe()) return
    if (this.starting) return this.starting

    this.starting = this.start().catch((error) => {
      this.lastError = error.message
      throw error
    }).finally(() => {
      this.starting = null
    })
    return this.starting
  }

  async request (endpoint, options = {}) {
    await this.ensureRunning()
    const base = this.apiBase()
    const response = await fetch(`${base}${endpoint}`, {
      ...options,
      headers: {
        Referer: base,
        ...(options.headers || {})
      },
      signal: options.signal || AbortSignal.timeout(15000)
    })
    if (!response.ok) throw new Error(`qBittorrent API returned HTTP ${response.status}.`)
    return response
  }

  async getStatus () {
    if (!await this.hasConsent()) {
      return { state: 'consent_required', version: this.expectedVersion, message: null }
    }
    if (this.starting) return { state: 'starting', version: this.expectedVersion, message: null }
    if (await this.probe() || await this.reconnect()) {
      return { state: 'running', version: this.version || this.expectedVersion, message: null }
    }
    if (this.lastError) return { state: 'error', version: this.expectedVersion, message: this.lastError }
    return { state: 'stopped', version: this.expectedVersion, message: null }
  }

  async stop () {
    if ((!this.pid || !this.port) && !await this.reconnect()) {
      await fs.promises.rm(this.statePath, { force: true })
      return
    }

    const processInfo = await this.processInfo(this.pid)
    if (!this.isExpectedProcess(processInfo)) {
      this.pid = null
      this.port = null
      await fs.promises.rm(this.statePath, { force: true })
      return
    }

    const base = this.apiBase()
    try {
      await fetch(`${base}/api/v2/app/shutdown`, {
        method: 'POST',
        headers: { Referer: base },
        signal: AbortSignal.timeout(2500)
      })
    } catch {}

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await delay(250)
      if (!await this.processInfo(this.pid)) break
    }

    const remaining = await this.processInfo(this.pid)
    if (this.isExpectedProcess(remaining)) {
      try { process.kill(this.pid) } catch {}
    }
    this.pid = null
    this.port = null
    this.version = null
    this.lastError = null
    await fs.promises.rm(this.statePath, { force: true })
  }
}

module.exports = {
  EngineConsentError,
  QbittorrentEngine,
  buildQbittorrentIni,
  extractWebUiPort,
  findAvailablePort,
  isPortAvailable
}
