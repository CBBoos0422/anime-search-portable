#!/usr/bin/env node

'use strict'

const http = require('http')
const path = require('path')
const fs = require('fs')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')
const { si } = require('nyaapi')
const { extractResourceName } = require('./resource-name')
const { QbittorrentEngine } = require('./engine-manager')
const {
  fetchTorrentPayload,
  resolveTorrentUrl,
  safeTorrentFileName,
  searchAnimeGarden,
  searchNyaa
} = require('./search-sources')
const {
  fetchOnlineTrackerList,
  normalizeTrackerList,
  recommendedTrackers
} = require('./tracker-service')

const HOST = '127.0.0.1'
const PORT = Number(process.env.PORT) || 4173
const APP_VERSION = '1.2.0'
const PUBLIC_DIR = path.join(__dirname, 'public')
const MAX_BODY_SIZE = 32 * 1024
const APP_ROOT = path.resolve(__dirname, '..')
const execFileAsync = promisify(execFile)
const QBITTORRENT_VERSION = '5.2.3'
const QBITTORRENT_SHA256 = 'f69360ae8545a64f4fc84fb6bacef03d77a6aa0793a4c14d4a28651ca26a27d1'
const engine = new QbittorrentEngine({
  executablePath: path.join(APP_ROOT, 'vendor', 'qbittorrent', 'qbittorrent.exe'),
  runtimeDir: path.join(APP_ROOT, 'runtime'),
  expectedVersion: QBITTORRENT_VERSION,
  expectedSha256: QBITTORRENT_SHA256,
  portStart: 18080,
  portEnd: 18120
})
const CATEGORY_NAMES = {
  '1': '动漫',
  '2': '音频',
  '3': '文学',
  '4': '真人影视',
  '5': '图片',
  '6': '软件'
}
const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.mpg', '.mpeg', '.ts', '.m2ts',
  '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma'
])

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/files.html', ['files.html', 'text/html; charset=utf-8']],
  ['/trackers.html', ['trackers.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/files.js', ['files.js', 'text/javascript; charset=utf-8']],
  ['/trackers.js', ['trackers.js', 'text/javascript; charset=utf-8']],
  ['/portable.js', ['portable.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/third-party.html', ['third-party.html', 'text/html; charset=utf-8']]
])

function categoryNameFromCode (category) {
  const majorCode = String(category || '').split('_')[0]
  return CATEGORY_NAMES[majorCode] || '其他'
}

function categoryNameFromTags (tags) {
  const match = String(tags || '').split(',').map((tag) => tag.trim()).find((tag) => tag.startsWith('分类-'))
  return match ? match.slice(3) : '其他'
}

function setSecurityHeaders (response) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'")
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cache-Control', 'no-store')
}

function sendJson (response, status, data) {
  setSecurityHeaders(response)
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

function sendApiError (response, error, fallbackStatus = 400) {
  sendJson(response, Number(error.statusCode) || fallbackStatus, {
    error: error.message,
    ...(error.code ? { code: error.code } : {})
  })
}

function serveStaticFile (response, fileName, contentType) {
  fs.readFile(path.join(PUBLIC_DIR, fileName), (error, data) => {
    if (error) {
      sendJson(response, 500, { error: '页面文件读取失败。' })
      return
    }

    setSecurityHeaders(response)
    response.writeHead(200, { 'Content-Type': contentType })
    response.end(data)
  })
}

function readJsonBody (request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        reject(new Error('请求内容过大。'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('请求格式无效。'))
      }
    })
    request.on('error', reject)
  })
}

function validateSearch (body) {
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const limit = Number(body.limit)
  const filter = Number(body.filter)
  const category = typeof body.category === 'string' ? body.category : '1_0'
  const sort = typeof body.sort === 'string' ? body.sort : 'id'
  const direction = typeof body.direction === 'string' ? body.direction : 'desc'
  const source = typeof body.source === 'string' ? body.source : 'nyaa'

  if (!query || query.length > 200) {
    throw new Error('搜索关键词长度必须在 1 到 200 个字符之间。')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('结果数量必须是 1 到 100 之间的整数。')
  }
  if (![0, 1, 2].includes(filter)) {
    throw new Error('过滤条件无效。')
  }
  if (!/^\d{1,2}_\d{1,2}$/.test(category)) {
    throw new Error('分类格式无效。')
  }
  if (!['id', 'size', 'seeders', 'leechers', 'downloads'].includes(sort)) {
    throw new Error('排序字段无效。')
  }
  if (!['asc', 'desc'].includes(direction)) {
    throw new Error('排序方向无效。')
  }
  if (!['nyaa', 'animegarden', 'all'].includes(source)) {
    throw new Error('搜索来源无效。')
  }

  return { query, limit, filter, category, sort, direction, source }
}

async function search (request, response) {
  try {
    const options = validateSearch(await readJsonBody(request))
    const searches = []
    if (options.source === 'nyaa' || options.source === 'all') {
      searches.push({ source: 'Nyaa', promise: searchNyaa(si, options) })
    }
    if (options.source === 'animegarden' || options.source === 'all') {
      searches.push({ source: 'AnimeGarden', promise: searchAnimeGarden(options) })
    }
    const settled = await Promise.allSettled(searches.map((entry) => entry.promise))
    const items = []
    const warnings = []
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') items.push(...result.value)
      else warnings.push(`${searches[index].source}：${result.reason?.message || '连接失败'}`)
    })
    if (warnings.length === searches.length) {
      const error = new Error(`所有搜索源均不可用（${warnings.join('；')}）。`)
      error.statusCode = 502
      throw error
    }
    sendJson(response, 200, { items, warnings, source: options.source })
  } catch (error) {
    sendApiError(response, error, 400)
  }
}

function validateMagnet (value) {
  const magnet = typeof value === 'string' ? value.trim() : ''
  if (!magnet || magnet.length > 8192) {
    throw new Error('磁力链接为空或过长。')
  }

  let magnetUrl
  try {
    magnetUrl = new URL(magnet)
  } catch {
    throw new Error('磁力链接格式无效。')
  }

  const hasInfoHash = magnetUrl.searchParams
    .getAll('xt')
    .some((item) => /^urn:btih:[a-z0-9]+$/i.test(item))
  if (magnetUrl.protocol !== 'magnet:' || !hasInfoHash) {
    throw new Error('磁力链接缺少有效的 BTIH 信息哈希。')
  }
  return magnet
}

async function qBittorrentRequest (endpoint, options = {}) {
  return engine.request(endpoint, options)
}

function mapDownload (item) {
  return {
    hash: item.hash,
    name: item.name,
    state: item.state,
    progress: Math.round((Number(item.progress) || 0) * 10000) / 100,
    size: Number(item.size) || 0,
    downloaded: Number(item.downloaded) || 0,
    downloadSpeed: Number(item.dlspeed) || 0,
    uploadSpeed: Number(item.upspeed) || 0,
    eta: Number(item.eta) || 0,
    seeds: Number(item.num_seeds) || 0,
    peers: Number(item.num_leechs) || 0,
    savePath: item.save_path,
    contentPath: item.content_path,
    tags: item.tags || '',
    categoryName: categoryNameFromTags(item.tags),
    addedOn: Number(item.added_on) || 0
  }
}

async function listDownloads (response) {
  try {
    const result = await qBittorrentRequest('/api/v2/torrents/info?filter=all&sort=added_on&reverse=true')
    const items = (await result.json()).map(mapDownload)
    sendJson(response, 200, { items, engine: engine.version || QBITTORRENT_VERSION })
  } catch (error) {
    sendApiError(response, error, 503)
  }
}

async function addDownloads (request, response) {
  try {
    const body = await readJsonBody(request)
    const submittedItems = Array.isArray(body.items)
      ? body.items
      : (Array.isArray(body.magnets) ? body.magnets.map((magnet) => ({ magnet })) : [])
    const method = body.method === 'torrent' ? 'torrent' : 'magnet'
    const paused = body.startPaused === true ? 'true' : 'false'
    const maximum = method === 'torrent' ? 20 : 100
    if (submittedItems.length < 1 || submittedItems.length > maximum) {
      throw new Error(`请选择 1 到 ${maximum} 个${method === 'torrent' ? ' BT 种子' : '磁力链接'}。`)
    }
    const savePath = typeof body.savePath === 'string' ? body.savePath.trim() : ''
    if (!savePath || savePath.length > 1000 || !path.isAbsolute(savePath)) {
      throw new Error('请选择有效的绝对下载目录。')
    }
    const pathInfo = fs.existsSync(savePath) ? fs.statSync(savePath) : null
    if (!pathInfo?.isDirectory()) {
      throw new Error('所选下载目录不存在。')
    }

    if (method === 'magnet') {
      const uniqueItems = new Map()
      submittedItems.forEach((item) => {
        const magnet = validateMagnet(item?.magnet)
        if (!uniqueItems.has(magnet)) uniqueItems.set(magnet, item)
      })
      const groups = new Map()
      uniqueItems.forEach((item, magnet) => {
        const categoryName = categoryNameFromCode(item?.category)
        const sourceName = item?.source === 'animegarden' ? 'AnimeGarden' : 'Nyaa'
        const key = `${sourceName}\u0000${categoryName}`
        if (!groups.has(key)) groups.set(key, { sourceName, categoryName, magnets: [] })
        groups.get(key).magnets.push(magnet)
      })

      for (const group of groups.values()) {
        const form = new FormData()
        form.append('urls', group.magnets.join('\n'))
        form.append('savepath', savePath)
        form.append('paused', paused)
        form.append('stopped', paused)
        form.append('autoTMM', 'false')
        form.append('tags', `NyaaWebTool,来源-${group.sourceName},分类-${group.categoryName}`)
        const result = await qBittorrentRequest('/api/v2/torrents/add', { method: 'POST', body: form })
        if (/fails/i.test(await result.text())) {
          throw new Error(`qBittorrent 未能添加“${group.categoryName}”分类中的磁链。`)
        }
      }
      sendJson(response, 200, { ok: true, count: uniqueItems.size, method })
      return
    }

    const uniqueItems = new Map()
    submittedItems.forEach((item) => {
      const source = item?.source === 'animegarden' ? 'animegarden' : 'nyaa'
      const key = source === 'animegarden'
        ? `${source}:${item?.provider}:${item?.providerId}`
        : `${source}:${item?.id}`
      if (!uniqueItems.has(key)) uniqueItems.set(key, { ...item, source })
    })
    let index = 0
    for (const item of uniqueItems.values()) {
      const torrentUrl = await resolveTorrentUrl(item)
      const torrentData = await fetchTorrentPayload(torrentUrl)
      const categoryName = categoryNameFromCode(item.category)
      const sourceName = item.source === 'animegarden' ? 'AnimeGarden' : 'Nyaa'
      const form = new FormData()
      form.append('torrents', new Blob([torrentData], { type: 'application/x-bittorrent' }), safeTorrentFileName(item, index))
      form.append('savepath', savePath)
      form.append('paused', paused)
      form.append('stopped', paused)
      form.append('autoTMM', 'false')
      form.append('tags', `NyaaWebTool,来源-${sourceName},分类-${categoryName}`)
      const result = await qBittorrentRequest('/api/v2/torrents/add', { method: 'POST', body: form })
      if (/fails/i.test(await result.text())) {
        throw new Error(`qBittorrent 未能添加“${item.name || sourceName}”的 BT 种子。`)
      }
      index += 1
    }
    sendJson(response, 200, { ok: true, count: uniqueItems.size, method })
  } catch (error) {
    sendApiError(response, error, 400)
  }
}

async function changeDownloadState (request, response) {
  try {
    const body = await readJsonBody(request)
    const hash = typeof body.hash === 'string' ? body.hash.trim().toLowerCase() : ''
    if (!/^[a-f0-9]{40,64}$/.test(hash)) {
      throw new Error('下载任务哈希无效。')
    }
    const actions = {
      stop: { endpoint: 'stop', fields: { hashes: hash } },
      start: { endpoint: 'start', fields: { hashes: hash } },
      remove: { endpoint: 'delete', fields: { hashes: hash, deleteFiles: 'true' } }
    }
    const action = actions[body.action]
    if (!action) throw new Error('下载操作无效。')

    await qBittorrentRequest(`/api/v2/torrents/${action.endpoint}`, {
      method: 'POST',
      body: new URLSearchParams(action.fields)
    })
    sendJson(response, 200, { ok: true })
  } catch (error) {
    sendApiError(response, error, 400)
  }
}

function resolveFilePath (savePath, relativeName) {
  const root = path.resolve(savePath)
  const filePath = path.resolve(root, String(relativeName).replaceAll('/', path.sep))
  const rootPrefix = `${root}${path.sep}`.toLowerCase()
  if (filePath.toLowerCase() !== root.toLowerCase() && !filePath.toLowerCase().startsWith(rootPrefix)) {
    throw new Error('文件路径超出下载目录。')
  }
  return filePath
}

function mapLibraryFile (torrent, item) {
  const filePath = resolveFilePath(torrent.save_path, item.name)
  const extension = path.extname(item.name).toLowerCase()
  const complete = Number(item.progress) >= 1
  const media = MEDIA_EXTENSIONS.has(extension)
  return {
    index: Number(item.index),
    name: item.name,
    resourceName: extractResourceName(item.name, torrent.name),
    size: Number(item.size) || 0,
    progress: Math.round((Number(item.progress) || 0) * 10000) / 100,
    complete,
    media,
    playable: complete && media && fs.existsSync(filePath)
  }
}

async function getTorrentFiles (torrent) {
  if (torrent.state === 'metaDL') return []
  try {
    const result = await qBittorrentRequest(`/api/v2/torrents/files?hash=${encodeURIComponent(torrent.hash)}`)
    const files = await result.json()
    return files.map((item) => mapLibraryFile(torrent, item))
  } catch (error) {
    if (/HTTP (404|409)/.test(error.message)) return []
    throw error
  }
}

async function listLibrary (response) {
  try {
    const result = await qBittorrentRequest('/api/v2/torrents/info?filter=all&tag=NyaaWebTool&sort=added_on&reverse=true')
    const torrents = await result.json()
    const items = await Promise.all(torrents.map(async (torrent) => ({
      hash: torrent.hash,
      name: torrent.name,
      resourceName: extractResourceName(torrent.name),
      categoryName: categoryNameFromTags(torrent.tags),
      progress: Math.round((Number(torrent.progress) || 0) * 10000) / 100,
      state: torrent.state,
      savePath: torrent.save_path,
      addedOn: Number(torrent.added_on) || 0,
      files: await getTorrentFiles(torrent)
    })))
    sendJson(response, 200, { items })
  } catch (error) {
    sendApiError(response, error, 503)
  }
}

async function getPlayableFile (hash, index) {
  if (!/^[a-f0-9]{40,64}$/.test(hash) || !Number.isInteger(index) || index < 0) {
    throw new Error('媒体文件标识无效。')
  }
  const torrentResult = await qBittorrentRequest(`/api/v2/torrents/info?hashes=${encodeURIComponent(hash)}`)
  const torrent = (await torrentResult.json())[0]
  if (!torrent) throw new Error('下载任务不存在。')

  const fileResult = await qBittorrentRequest(`/api/v2/torrents/files?hash=${encodeURIComponent(hash)}&indexes=${index}`)
  const file = (await fileResult.json()).find((item) => Number(item.index) === index)
  if (!file) throw new Error('任务中不存在该文件。')
  if (Number(file.progress) < 1) throw new Error('文件尚未下载完成。')
  if (!MEDIA_EXTENSIONS.has(path.extname(file.name).toLowerCase())) {
    throw new Error('该文件不是受支持的音视频格式。')
  }

  const filePath = resolveFilePath(torrent.save_path, file.name)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error('磁盘上的媒体文件不存在。')
  }
  return filePath
}

async function playMediaFile (request, response) {
  try {
    const body = await readJsonBody(request)
    const hash = typeof body.hash === 'string' ? body.hash.trim().toLowerCase() : ''
    const index = Number(body.index)
    const filePath = await getPlayableFile(hash, index)
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-Command',
      'Invoke-Item -LiteralPath $env:NYAA_MEDIA_FILE'
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, NYAA_MEDIA_FILE: filePath }
    })
    child.unref()
    sendJson(response, 200, { ok: true })
  } catch (error) {
    sendApiError(response, error, 400)
  }
}

async function engineStatus (response) {
  try {
    sendJson(response, 200, await engine.getStatus())
  } catch (error) {
    sendApiError(response, error, 500)
  }
}

async function acceptEngineConsent (request, response) {
  try {
    const body = await readJsonBody(request)
    if (body.accepted !== true) throw new Error('必须明确确认后才能启动内置下载引擎。')
    sendJson(response, 200, { ok: true, ...(await engine.acceptConsent()) })
  } catch (error) {
    sendApiError(response, error, 400)
  }
}

let exiting = false

async function closeAppBrowser () {
  if (process.platform !== 'win32') return
  const profilePath = path.join(APP_ROOT, 'runtime', 'browser-profile')
  const statePath = path.join(APP_ROOT, 'runtime', 'browser-window.json')
  const command = [
    '$profile = [IO.Path]::GetFullPath($env:ANIME_BROWSER_PROFILE)',
    '$items = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {',
    '  $_.Name -in @("msedge.exe", "chrome.exe") -and $_.CommandLine -and',
    '  $_.CommandLine.IndexOf($profile, [StringComparison]::OrdinalIgnoreCase) -ge 0',
    '}',
    '$items | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  ].join('\n')
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command
    ], {
      windowsHide: true,
      timeout: 5000,
      env: { ...process.env, ANIME_BROWSER_PROFILE: profilePath }
    })
  } catch (error) {
    console.error(`关闭应用窗口失败：${error.message}`)
  }
  await fs.promises.rm(statePath, { force: true }).catch(() => {})
}

async function exitApplication (response) {
  if (exiting) {
    sendJson(response, 200, { ok: true, exiting: true })
    return
  }
  exiting = true
  sendJson(response, 200, { ok: true, exiting: true })
  setTimeout(async () => {
    try { await engine.stop() } catch (error) { console.error(`停止下载引擎失败：${error.message}`) }
    await closeAppBrowser()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  }, 120).unref()
}

function listDriveRoots () {
  const drives = []
  for (let code = 65; code <= 90; code += 1) {
    const drivePath = `${String.fromCharCode(code)}:\\`
    if (fs.existsSync(drivePath)) {
      drives.push({ name: `本地磁盘 (${drivePath.slice(0, 2)})`, path: drivePath })
    }
  }
  return drives
}

function listDownloadFolders (url, response) {
  try {
    const requestedPath = url.searchParams.get('path')
    if (!requestedPath) {
      sendJson(response, 200, { path: null, parent: null, directories: listDriveRoots() })
      return
    }
    if (requestedPath.length > 1000 || !path.isAbsolute(requestedPath)) {
      throw new Error('目录路径无效。')
    }

    const currentPath = fs.realpathSync(requestedPath)
    if (!fs.statSync(currentPath).isDirectory()) {
      throw new Error('所选路径不是文件夹。')
    }
    const parentPath = path.dirname(currentPath)
    const directories = fs.readdirSync(currentPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: path.join(currentPath, entry.name) }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))

    sendJson(response, 200, {
      path: currentPath,
      parent: parentPath === currentPath ? null : parentPath,
      directories
    })
  } catch (error) {
    sendJson(response, 400, { error: `无法读取该目录（${error.message}）` })
  }
}

function parseStoredTrackers (value) {
  const candidates = String(value || '').split(/[\r\n]+/u).map((item) => item.trim()).filter(Boolean)
  if (candidates.length === 0) return []
  try {
    return normalizeTrackerList(candidates)
  } catch {
    return candidates
  }
}

async function trackerStatus (response) {
  try {
    const status = await engine.getStatus()
    const base = {
      engineState: status.state,
      recommended: recommendedTrackers(),
      enabled: false,
      configured: [],
      torrentCount: 0
    }
    if (status.state === 'consent_required') {
      sendJson(response, 200, base)
      return
    }
    const [preferencesResult, torrentsResult] = await Promise.all([
      qBittorrentRequest('/api/v2/app/preferences'),
      qBittorrentRequest('/api/v2/torrents/info?filter=all')
    ])
    const preferences = await preferencesResult.json()
    const torrents = await torrentsResult.json()
    sendJson(response, 200, {
      ...base,
      engineState: 'running',
      enabled: Boolean(preferences.add_trackers_enabled),
      configured: parseStoredTrackers(preferences.add_trackers),
      torrentCount: torrents.length
    })
  } catch (error) {
    sendApiError(response, error, 503)
  }
}

async function onlineTrackers (response) {
  try {
    sendJson(response, 200, await fetchOnlineTrackerList())
  } catch (error) {
    sendApiError(response, error, 502)
  }
}

async function saveTrackers (request, response) {
  try {
    const body = await readJsonBody(request)
    const trackers = normalizeTrackerList(body.trackers)
    const enableFuture = body.enableFuture !== false
    const applyExisting = body.applyExisting === true
    await qBittorrentRequest('/api/v2/app/setPreferences', {
      method: 'POST',
      body: new URLSearchParams({
        json: JSON.stringify({
          add_trackers_enabled: enableFuture,
          add_trackers: trackers.join('\n')
        })
      })
    })

    let applied = 0
    let failed = 0
    if (applyExisting) {
      const torrentsResult = await qBittorrentRequest('/api/v2/torrents/info?filter=all')
      const torrents = await torrentsResult.json()
      for (const torrent of torrents) {
        try {
          await qBittorrentRequest('/api/v2/torrents/addTrackers', {
            method: 'POST',
            body: new URLSearchParams({ hash: torrent.hash, urls: trackers.join('\n') })
          })
          applied += 1
        } catch {
          failed += 1
        }
      }
    }
    sendJson(response, 200, {
      ok: true,
      configured: trackers.length,
      enableFuture,
      applied,
      failed
    })
  } catch (error) {
    sendApiError(response, error, 400)
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${HOST}:${PORT}`)

  if (request.method === 'POST' && url.pathname === '/api/search') {
    search(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { app: 'anime-search', version: APP_VERSION, pid: process.pid })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/engine/status') {
    engineStatus(response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/engine/accept') {
    acceptEngineConsent(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/exit') {
    exitApplication(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/downloads') {
    listDownloads(response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/downloads') {
    addDownloads(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/downloads/action') {
    changeDownloadState(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/library') {
    listLibrary(response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/play') {
    playMediaFile(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/directories') {
    listDownloadFolders(url, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/trackers') {
    trackerStatus(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/trackers/online') {
    onlineTrackers(response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/trackers') {
    saveTrackers(request, response)
    return
  }

  if (request.method === 'GET' && staticFiles.has(url.pathname)) {
    const [fileName, contentType] = staticFiles.get(url.pathname)
    serveStaticFile(response, fileName, contentType)
    return
  }

  sendJson(response, 404, { error: '未找到该页面。' })
})

function openBrowser (url) {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LocalAppData || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ]
    const appBrowser = candidates.find((candidate) => candidate && fs.existsSync(candidate))
    if (!appBrowser) {
      console.error('未找到 Microsoft Edge 或 Google Chrome，无法打开独立应用窗口。')
      return
    }
    const browserProfile = path.join(APP_ROOT, 'runtime', 'browser-profile')
    fs.mkdirSync(browserProfile, { recursive: true })
    const child = spawn(appBrowser, [
      `--user-data-dir=${browserProfile}`,
      `--app=${url}`,
      '--no-first-run',
      '--disable-session-crashed-bubble'
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    child.unref()
    fs.writeFileSync(path.join(APP_ROOT, 'runtime', 'browser-window.json'), `${JSON.stringify({
      pid: child.pid,
      executablePath: appBrowser,
      profilePath: browserProfile,
      startedAt: new Date().toISOString()
    }, null, 2)}\n`, 'utf8')
    return
  }
  const platformCommands = {
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]]
  }
  const command = platformCommands[process.platform]
  if (!command) return

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.unref()
}

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`
  console.log(`Anime Search 界面已启动：${url}`)
  console.log('关闭此窗口或按 Ctrl+C 可停止服务。')
  if (process.env.NO_OPEN !== '1') openBrowser(url)
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，请关闭旧窗口后重试。`)
  } else {
    console.error(`服务启动失败：${error.message}`)
  }
  process.exitCode = 1
})
