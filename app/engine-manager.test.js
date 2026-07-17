'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const { buildQbittorrentIni, extractWebUiPort, findAvailablePort } = require('./engine-manager')

test('portable qBittorrent config is local-only and invisible', () => {
  const config = buildQbittorrentIni('[Preferences]\r\nGeneral\\Locale=zh_CN\r\n', 18091)
  assert.match(config, /WebUI\\Address=127\.0\.0\.1/u)
  assert.match(config, /WebUI\\Port=18091/u)
  assert.match(config, /General\\SystrayEnabled=false/u)
  assert.match(config, /General\\NoSplashScreen=true/u)
  assert.match(config, /WebUI\\Username=anime_search_local/u)
  assert.match(config, /WebUI\\Password_PBKDF2="@ByteArray\([A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+\)"/u)
  assert.match(config, /\[LegalNotice\]\r\nAccepted=true/u)
  assert.match(config, /General\\Locale=zh_CN/u)
})

test('existing WebUI credentials are preserved', () => {
  const existing = '[Preferences]\r\nWebUI\\Username=existing\r\nWebUI\\Password_PBKDF2="@ByteArray(salt:hash)"\r\n'
  const config = buildQbittorrentIni(existing, 18092)
  assert.match(config, /WebUI\\Username=existing/u)
  assert.match(config, /WebUI\\Password_PBKDF2="@ByteArray\(salt:hash\)"/u)
})

test('port selection skips an occupied engine port', async () => {
  const occupied = net.createServer()
  await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve))
  const usedPort = occupied.address().port
  const selected = await findAvailablePort(usedPort, usedPort + 1)
  assert.equal(selected, usedPort + 1)
  await new Promise((resolve) => occupied.close(resolve))
})

test('engine port is recovered from an owned qBittorrent command line', () => {
  assert.equal(extractWebUiPort('qbittorrent.exe --profile=D:\\Portable --webui-port=18080'), 18080)
  assert.equal(extractWebUiPort('qbittorrent.exe --webui-port 18081 --no-splash'), 18081)
  assert.equal(extractWebUiPort('qbittorrent.exe --webui-port=70000'), null)
})
