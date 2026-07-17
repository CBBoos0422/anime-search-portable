'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const roots = ['app', 'scripts'].map(directory => path.join(root, directory))

function collectJavaScriptFiles (directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectJavaScriptFiles(fullPath)
      return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : []
    })
}

const files = roots.flatMap(collectJavaScriptFiles).sort()
let failed = false

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    failed = true
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`)
  }
}

if (failed) process.exit(1)
console.log(`Syntax check passed for ${files.length} JavaScript files.`)
