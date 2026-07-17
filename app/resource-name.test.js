'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { extractResourceName } = require('./resource-name')

const examples = [
  ['[SubsPlease] Sousou no Frieren - 01 (1080p) [A1B2C3D4].mkv', 'Sousou no Frieren'],
  ['[ANi] 葬送的芙莉莲 - 01 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4', '葬送的芙莉莲'],
  ['[Lilith-Raws] SPY x FAMILY S02E03 Baha WEB-DL 1080p AVC AAC CHT.mp4', 'SPY x FAMILY Season 2'],
  ['One Piece/One Piece - 1122 [1080p][HEVC].mkv', 'One Piece'],
  ['86 - Eighty Six - 03 [1080p].mkv', '86 - Eighty Six'],
  ['Frieren/01.mkv', 'Frieren'],
  ['Movie Title (2024) [BluRay 2160p HEVC TrueHD].mkv', 'Movie Title 2024'],
  ['[ReleaseGroup] [Oshi no Ko] - 02 [1080p].mkv', 'Oshi no Ko'],
  ['[2024] Movie Title - 01 [2160p].mkv', '2024 Movie Title'],
  ['[Group] One Piece 1122 1080p WEB-DL.mkv', 'One Piece']
]

for (const [fileName, expected] of examples) {
  test(`extracts resource name from ${fileName}`, () => {
    assert.equal(extractResourceName(fileName), expected)
  })
}
