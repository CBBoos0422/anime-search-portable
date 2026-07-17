'use strict'

const axios = require('axios')
const {
  describeNyaaError,
  findReachableProxyCandidates,
  proxyUrlToAxiosConfig
} = require('./network-proxy')

const ANIME_GARDEN_API = 'https://api.animes.garden'
const NYAA_BASE = 'https://nyaa.si'

function formatBytes (bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value
  let index = -1
  do {
    size /= 1024
    index += 1
  } while (size >= 1024 && index < units.length - 1)
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
}

function categoryNameFromCode (category) {
  const names = {
    '1': 'Anime',
    '2': 'Audio',
    '3': 'Literature',
    '4': 'Live Action',
    '5': 'Pictures',
    '6': 'Software'
  }
  return names[String(category || '').split('_')[0]] || 'Other'
}

function animeGardenTypeName (type) {
  const names = new Map([
    ['动画', 'Anime'], ['合集', 'Collection'], ['音乐', 'Music'], ['其他', 'Other']
  ])
  const value = String(type || '').trim()
  return names.get(value) || value || 'Anime'
}

function mapNyaaItem (item) {
  return {
    id: String(item.id),
    resultKey: `nyaa:${item.id}`,
    source: 'nyaa',
    sourceName: 'Nyaa',
    name: item.name,
    filesize: item.filesize,
    seeders: Number(item.seeders) || 0,
    leechers: Number(item.leechers) || 0,
    completed: Number(item.completed) || 0,
    date: item.date,
    category: item.category,
    subCategory: item.sub_category,
    categoryName: categoryNameFromCode(item.category),
    magnet: item.magnet,
    torrentAvailable: true,
    detailUrl: `https://nyaa.si/view/${encodeURIComponent(item.id)}`
  }
}

async function searchNyaa (si, options, network = {}) {
  const findProxies = network.findReachableProxyCandidates || findReachableProxyCandidates
  const proxies = await findProxies()
  const routes = proxies.length > 0 ? [...proxies, null] : [null]
  const searchOptions = {
    category: options.category,
    filter: options.filter,
    sort: options.sort,
    direction: options.direction
  }
  let lastError

  si.cli.defaults.timeout = 12000
  for (const proxyUrl of routes) {
    si.cli.defaults.proxy = proxyUrl ? proxyUrlToAxiosConfig(proxyUrl) : false
    try {
      const results = await si.search(options.query, options.limit, searchOptions)
      return results.map(mapNyaaItem)
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(describeNyaaError(lastError, proxies.length > 0))
}

function validateAnimeGardenPayload (payload) {
  if (!payload || payload.status !== 'OK' || !Array.isArray(payload.resources)) {
    throw new Error('AnimeGarden returned an unrecognized API response.')
  }
  return payload.resources
}

function mapAnimeGardenItem (item) {
  const sizeBytes = Math.max(0, Number(item.size) || 0) * 1024
  const magnet = `${item.magnet || ''}${item.tracker || ''}`
  let trackerCount = 0
  try {
    trackerCount = new URL(magnet).searchParams.getAll('tr').filter(Boolean).length
  } catch {}
  return {
    id: String(item.id),
    resultKey: `animegarden:${item.provider}:${item.providerId}`,
    source: 'animegarden',
    sourceName: 'AnimeGarden',
    provider: String(item.provider || ''),
    providerId: String(item.providerId || ''),
    providerName: item.fansub?.name || item.publisher?.name || item.provider || 'AnimeGarden',
    name: String(item.title || ''),
    filesize: formatBytes(sizeBytes),
    sizeBytes,
    seeders: null,
    leechers: null,
    completed: null,
    date: item.createdAt,
    category: '1_0',
    subCategory: '',
    categoryName: animeGardenTypeName(item.type),
    magnet,
    trackerCount,
    torrentAvailable: true,
    detailUrl: item.href || ''
  }
}

async function searchAnimeGarden (options, fetchImpl = fetch) {
  const url = new URL('/resources', ANIME_GARDEN_API)
  url.searchParams.set('page', '1')
  url.searchParams.set('pageSize', String(options.limit))
  url.searchParams.set('search', options.query)
  url.searchParams.set('tracker', 'true')
  if (String(options.category || '').startsWith('1_')) url.searchParams.set('type', '动画')

  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Anime-Search/1.2' },
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) throw new Error(`AnimeGarden API returned HTTP ${response.status}.`)
  return validateAnimeGardenPayload(await response.json()).map(mapAnimeGardenItem)
}

function validateProviderReference (provider, providerId) {
  const safeProvider = String(provider || '').trim().toLowerCase()
  const safeProviderId = String(providerId || '').trim()
  if (!/^[a-z0-9_-]{1,40}$/u.test(safeProvider) || !/^[a-z0-9_-]{1,120}$/iu.test(safeProviderId)) {
    throw new Error('Invalid AnimeGarden release identifier.')
  }
  return { provider: safeProvider, providerId: safeProviderId }
}

async function resolveTorrentUrl (item, fetchImpl = fetch) {
  if (item.source === 'nyaa') {
    const id = String(item.id || '').trim()
    if (!/^\d{1,12}$/u.test(id)) throw new Error('Invalid Nyaa release identifier.')
    return `${NYAA_BASE}/download/${id}.torrent`
  }
  if (item.source !== 'animegarden') throw new Error('Unsupported torrent source.')

  const ref = validateProviderReference(item.provider, item.providerId)
  const url = new URL(`/detail/${encodeURIComponent(ref.provider)}/${encodeURIComponent(ref.providerId)}`, ANIME_GARDEN_API)
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Anime-Search/1.2' },
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) throw new Error(`AnimeGarden detail API returned HTTP ${response.status}.`)
  const payload = await response.json()
  const links = Array.isArray(payload?.detail?.magnets) ? payload.detail.magnets : []
  const torrent = links.find((entry) => {
    try {
      const link = new URL(entry?.url)
      return ['http:', 'https:'].includes(link.protocol) && /\.torrent(?:$|[?#])/iu.test(link.pathname)
    } catch {
      return false
    }
  })
  if (!torrent) throw new Error('This AnimeGarden release does not provide a usable torrent file.')
  return torrent.url
}

function safeTorrentFileName (item, index) {
  const base = String(item.name || `${item.source}-${item.id || index + 1}`)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_')
    .slice(0, 120)
    .trim()
  return `${base || `anime-search-${index + 1}`}.torrent`
}

async function fetchTorrentPayload (url, fetchImpl, network = {}) {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid torrent URL protocol.')
  if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[?::1\]?)/iu.test(parsed.hostname)) {
    throw new Error('Torrent URLs on local or private networks are not allowed.')
  }
  if (!fetchImpl) {
    const client = network.axios || axios
    const findProxies = network.findReachableProxyCandidates || findReachableProxyCandidates
    const proxies = await findProxies()
    const routes = proxies.length > 0 ? [...proxies, null] : [null]
    let response
    let lastError
    for (const proxyUrl of routes) {
      try {
        response = await client.get(parsed.href, {
          responseType: 'arraybuffer',
          timeout: 20000,
          maxContentLength: 8 * 1024 * 1024,
          maxBodyLength: 8 * 1024 * 1024,
          proxy: proxyUrl ? proxyUrlToAxiosConfig(proxyUrl) : false,
          headers: {
            Accept: 'application/x-bittorrent, application/octet-stream;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Anime-Search/1.2'
          }
        })
        break
      } catch (error) {
        lastError = error
      }
    }
    if (!response) {
      const status = lastError?.response?.status
      throw new Error(status ? `Torrent download failed (HTTP ${status}).` : `Torrent download failed (${lastError?.message || 'connection failed'}).`)
    }
    const data = Buffer.from(response.data)
    if (data.length < 16 || data.length > 8 * 1024 * 1024 || data[0] !== 0x64) {
      throw new Error('The downloaded content is not a valid torrent file.')
    }
    return data
  }

  const response = await fetchImpl(parsed, {
    redirect: 'follow',
    headers: { Accept: 'application/x-bittorrent, application/octet-stream;q=0.9', 'User-Agent': 'Anime-Search/1.2' },
    signal: AbortSignal.timeout(20000)
  })
  if (!response.ok) throw new Error(`Torrent download failed (HTTP ${response.status}).`)
  const declaredSize = Number(response.headers.get('content-length')) || 0
  if (declaredSize > 8 * 1024 * 1024) throw new Error('The torrent file exceeds the 8 MB limit.')
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length < 16 || data.length > 8 * 1024 * 1024 || data[0] !== 0x64) {
    throw new Error('The downloaded content is not a valid torrent file.')
  }
  return data
}

module.exports = {
  ANIME_GARDEN_API,
  fetchTorrentPayload,
  formatBytes,
  mapAnimeGardenItem,
  mapNyaaItem,
  resolveTorrentUrl,
  safeTorrentFileName,
  searchAnimeGarden,
  searchNyaa,
  validateProviderReference
}
