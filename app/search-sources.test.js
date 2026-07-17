'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  fetchTorrentPayload,
  mapAnimeGardenItem,
  resolveTorrentUrl,
  searchAnimeGarden
} = require('./search-sources')

test('AnimeGarden resources are clearly mapped with full tracker magnet', () => {
  const item = mapAnimeGardenItem({
    id: 12,
    provider: 'dmhy',
    providerId: '345',
    title: 'Example',
    type: '动画',
    magnet: 'magnet:?xt=urn:btih:ABC',
    tracker: '&tr=https%3A%2F%2Ftracker.example%2Fannounce',
    size: 1024,
    createdAt: '2026-01-01T00:00:00.000Z',
    publisher: { name: 'Publisher' }
  })
  assert.equal(item.source, 'animegarden')
  assert.equal(item.filesize, '1.0 MB')
  assert.match(item.magnet, /&tr=/u)
  assert.equal(item.trackerCount, 1)
  assert.equal(item.resultKey, 'animegarden:dmhy:345')
})

test('AnimeGarden search uses the official resources API', async () => {
  let requestedUrl = ''
  const items = await searchAnimeGarden({ query: 'Frieren', limit: 5, category: '1_0' }, async (url) => {
    requestedUrl = String(url)
    return new Response(JSON.stringify({ status: 'OK', resources: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  })
  assert.deepEqual(items, [])
  assert.match(requestedUrl, /^https:\/\/api\.animes\.garden\/resources\?/u)
  assert.match(requestedUrl, /search=Frieren/u)
  assert.match(requestedUrl, /tracker=true/u)
})

test('AnimeGarden detail API resolves a torrent file URL', async () => {
  const resolved = await resolveTorrentUrl({ source: 'animegarden', provider: 'dmhy', providerId: '720365' }, async () => {
    return new Response(JSON.stringify({
      detail: {
        magnets: [
          { name: '磁力链接', url: 'magnet:?xt=urn:btih:ABC' },
          { name: '种子', url: 'https://dl.dmhy.org/file/example.torrent' }
        ]
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  assert.equal(resolved, 'https://dl.dmhy.org/file/example.torrent')
})

test('torrent payload validation accepts bencoded files and rejects HTML', async () => {
  const valid = Buffer.from('d4:infod4:name4:testee')
  const data = await fetchTorrentPayload('https://files.example/test.torrent', async () => new Response(valid, { status: 200 }))
  assert.deepEqual(data, valid)
  await assert.rejects(
    fetchTorrentPayload('https://files.example/test.torrent', async () => new Response('<html>blocked</html>', { status: 200 })),
    /不是有效的 BT 种子文件/u
  )
})

test('torrent download uses a detected local proxy without environment variables', async () => {
  const valid = Buffer.from('d4:infod4:name4:testee')
  let requestOptions
  const data = await fetchTorrentPayload('https://nyaa.si/download/123.torrent', null, {
    findReachableProxyCandidates: async () => ['http://127.0.0.1:10808'],
    axios: {
      async get (url, options) {
        assert.equal(url, 'https://nyaa.si/download/123.torrent')
        requestOptions = options
        return { data: valid }
      }
    }
  })
  assert.deepEqual(data, valid)
  assert.deepEqual(requestOptions.proxy, { protocol: 'http', host: '127.0.0.1', port: 10808 })
})
