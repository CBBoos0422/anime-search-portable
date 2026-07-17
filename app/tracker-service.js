'use strict'

const ONLINE_TRACKER_LIST = 'https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/best.txt'

const ANIME_TRACKERS = [
  { url: 'https://tr.bangumi.moe:9696/announce', label: 'Bangumi Moe HTTPS', group: 'Anime-focused' },
  { url: 'udp://tr.bangumi.moe:6969/announce', label: 'Bangumi Moe UDP', group: 'Anime-focused' },
  { url: 'http://t.acg.rip:6699/announce', label: 'ACG.RIP', group: 'Anime-focused' },
  { url: 'http://open.acgtracker.com:1096/announce', label: 'ACG Tracker', group: 'Anime-focused' }
]

const FALLBACK_PUBLIC_TRACKERS = [
  { url: 'udp://tracker.opentrackr.org:1337/announce', label: 'OpenTrackr', group: 'Public network' },
  { url: 'udp://open.stealth.si:80/announce', label: 'Open Stealth', group: 'Public network' },
  { url: 'udp://exodus.desync.com:6969/announce', label: 'Exodus', group: 'Public network' },
  { url: 'udp://tracker.torrent.eu.org:451/announce', label: 'Torrent.eu.org', group: 'Public network' },
  { url: 'udp://tracker.openbittorrent.com:6969/announce', label: 'OpenBitTorrent', group: 'Public network' }
]

function normalizeTrackerUrl (value) {
  const text = String(value || '').trim()
  if (!text || text.length > 500) throw new Error('The Tracker URL is empty or too long.')
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error(`Invalid Tracker URL: ${text}`)
  }
  if (!['http:', 'https:', 'udp:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported Tracker protocol: ${parsed.protocol}`)
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`Invalid Tracker URL: ${text}`)
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
  if (unique.size < 1) throw new Error('Provide at least one valid Tracker.')
  if (unique.size > maximum) throw new Error(`The Tracker list cannot contain more than ${maximum} entries.`)
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
  if (!response.ok) throw new Error(`The online Tracker list returned HTTP ${response.status}.`)
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
