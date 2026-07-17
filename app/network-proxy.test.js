'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildProxyCandidates,
  normalizeProxyUrl,
  proxyUrlToAxiosConfig
} = require('./network-proxy')
const { searchNyaa } = require('./search-sources')

test('normalizes Windows and environment proxy formats', () => {
  assert.equal(normalizeProxyUrl('127.0.0.1:10808'), 'http://127.0.0.1:10808')
  assert.equal(normalizeProxyUrl('http=127.0.0.1:7890;https=127.0.0.1:7897'), 'http://127.0.0.1:7897')
  assert.equal(normalizeProxyUrl('socks5://127.0.0.1:1080'), '')
})

test('deduplicates proxy candidates and supports proxy authentication', () => {
  const candidates = buildProxyCandidates({
    HTTPS_PROXY: 'http://127.0.0.1:10808',
    HTTP_PROXY: '127.0.0.1:10808'
  }, '')
  assert.equal(candidates.filter((item) => item === 'http://127.0.0.1:10808').length, 1)
  assert.deepEqual(proxyUrlToAxiosConfig('http://user:pass@proxy.example:8080'), {
    protocol: 'http',
    host: 'proxy.example',
    port: 8080,
    auth: { username: 'user', password: 'pass' }
  })
})

test('Nyaa search applies a reachable proxy before making the request', async () => {
  const fakeSi = {
    cli: { defaults: {} },
    async search () {
      assert.deepEqual(this.cli.defaults.proxy, {
        protocol: 'http',
        host: '127.0.0.1',
        port: 10808
      })
      return [{ id: 1, name: 'Example' }]
    }
  }
  const items = await searchNyaa(fakeSi, {
    query: 'Example',
    limit: 1,
    category: '1_0',
    filter: 0,
    sort: 'id',
    direction: 'desc'
  }, {
    findReachableProxyCandidates: async () => ['http://127.0.0.1:10808']
  })
  assert.equal(items[0].name, 'Example')
})

test('Nyaa search reports a useful error after proxy and direct retries fail', async () => {
  const fakeSi = {
    cli: { defaults: {} },
    async search () {
      const error = new Error('connect ETIMEDOUT 31.13.95.33:443')
      error.code = 'ETIMEDOUT'
      throw error
    }
  }
  await assert.rejects(searchNyaa(fakeSi, {
    query: 'Example',
    limit: 1,
    category: '1_0',
    filter: 0,
    sort: 'id',
    direction: 'desc'
  }, {
    findReachableProxyCandidates: async () => ['http://127.0.0.1:10808']
  }), /local proxy and a direct connection were tried automatically/u)
  assert.equal(fakeSi.cli.defaults.proxy, false)
})
