'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  fetchOnlineTrackerList,
  normalizeTrackerList,
  recommendedTrackers
} = require('./tracker-service')

test('recommended trackers include anime-specific endpoints', () => {
  const list = recommendedTrackers()
  assert.ok(list.some((item) => item.url.includes('bangumi.moe')))
  assert.ok(list.some((item) => item.url.includes('acg.rip')))
  assert.ok(list.every((item) => ['动漫专用', '公共网络'].includes(item.group)))
})

test('tracker normalization removes blanks and duplicates', () => {
  const list = normalizeTrackerList('udp://tracker.example:80/announce\n\nUDP://TRACKER.EXAMPLE:80/announce\nhttps://two.example/announce')
  assert.deepEqual(list, ['udp://tracker.example:80/announce', 'https://two.example/announce'])
})

test('tracker normalization rejects non-BitTorrent protocols', () => {
  assert.throws(() => normalizeTrackerList('file:///C:/tracker'), /协议不受支持/u)
})

test('online list is merged with anime trackers', async () => {
  const result = await fetchOnlineTrackerList(async () => new Response(
    'udp://tracker.example:80/announce\n\nhttps://tracker-two.example/announce\n',
    { status: 200 }
  ))
  assert.ok(result.trackers.some((url) => url.includes('bangumi.moe')))
  assert.ok(result.trackers.includes('udp://tracker.example:80/announce'))
})
