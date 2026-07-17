'use strict'

const ONLINE_TRACKER_LIST = 'https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/best.txt'

const ANIME_TRACKERS = [
  { url: 'https://tr.bangumi.moe:9696/announce', label: 'Bangumi Moe HTTPS', group: '动漫专用' },
  { url: 'udp://tr.bangumi.moe:6969/announce', label: 'Bangumi Moe UDP', group: '动漫专用' },
  { url: 'http://t.acg.rip:6699/announce', label: 'ACG.RIP', group: '动漫专用' },
  { url: 'http://open.acgtracker.com:1096/announce', label: 'ACG Tracker', group: '动漫专用' }
]

const FALLBACK_PUBLIC_TRACKERS = [
  { url: 'udp://tracker.opentrackr.org:1337/announce', label: 'OpenTrackr', group: '公共网络' },
  { url: 'udp://open.stealth.si:80/announce', label: 'Open Stealth', group: '公共网络' },
  { url: 'udp://exodus.desync.com:6969/announce', label: 'Exodus', group: '公共网络' },
  { url: 'udp://tracker.torrent.eu.org:451/announce', label: 'Torrent.eu.org', group: '公共网络' },
  { url: 'udp://tracker.openbittorrent.com:6969/announce', label: 'OpenBitTorrent', group: '公共网络' }
]

function normalizeTrackerUrl (value) {
  const text = String(value || '').trim()
  if (!text || text.length > 500) throw new Error('Tracker 地址为空或过长。')
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error(`Tracker 地址格式无效：${text}`)
  }
  if (!['http:', 'https:', 'udp:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`Tracker 协议不受支持：${parsed.protocol}`)
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`Tracker 地址无效：${text}`)
  }
  return text
}

function normalizeTrackerList (input, maximum = 200) {
  const values = Array.isArray(input)
    ? input
    : String(input || '').split(/[\r\n,]+/u)
  const unique = new Map()
  values.forEach((value) => {
    const text = String(value || '').trim()
    if (!text || text.startsWith('#')) return
    const normalized = normalizeTrackerUrl(text)
    const key = normalized.toLowerCase().replace(/\/$/u, '')
    if (!unique.has(key)) unique.set(key, normalized)
  })
  if (unique.size < 1) throw new Error('请至少提供一个有效的 Tracker。')
  if (unique.size > maximum) throw new Error(`Tracker 数量不能超过 ${maximum} 个。`)
  return [...unique.values()]
}

function recommendedTrackers () {
  return [...ANIME_TRACKERS, ...FALLBACK_PUBLIC_TRACKERS]
}

async function fetchOnlineTrackerList (fetchImpl = fetch) {
  const response = await fetchImpl(ONLINE_TRACKER_LIST, {
    headers: { Accept: 'text/plain', 'User-Agent': 'Anime-Search/1.2' },
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) throw new Error(`在线 Tracker 列表返回 HTTP ${response.status}。`)
  const online = normalizeTrackerList(await response.text(), 200)
  const merged = normalizeTrackerList([
    ...ANIME_TRACKERS.map((item) => item.url),
    ...online
  ], 200)
  return {
    source: ONLINE_TRACKER_LIST,
    trackers: merged,
    updatedAt: new Date().toISOString()
  }
}

module.exports = {
  ANIME_TRACKERS,
  FALLBACK_PUBLIC_TRACKERS,
  ONLINE_TRACKER_LIST,
  fetchOnlineTrackerList,
  normalizeTrackerList,
  normalizeTrackerUrl,
  recommendedTrackers
}
