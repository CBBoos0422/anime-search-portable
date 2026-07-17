'use strict'

const path = require('path')

const TECHNICAL_SEGMENT = /(?:^|[\s._-])(?:2160p|1440p|1080[pi]|720p|576p|480p|4k|8k|web[ ._-]?(?:dl|rip)|blu[ ._-]?ray|b[dr]rip|hdtv|remux|x26[45]|h[ ._-]?26[45]|avc|hevc|av1|vp9|10[ ._-]?bit|8[ ._-]?bit|hi10p|aac|flac|truehd|dts(?:-?hd)?|ac-?3|e-?ac-?3|ddp?\s*\d(?:\.\d)?|opus|mp3|baha|cr|netflix|nf|amazon|amzn|disney\+?|multi[ ._-]?sub|ch[st]|chs|cht|简[繁日]?|繁[简日]?|内封|内嵌|外挂|字幕|raws?|fansub|batch)(?:$|[\s._-])/iu
const INLINE_TECHNICAL = /\b(?:2160p|1440p|1080[pi]|720p|576p|480p|4k|8k|web[ ._-]?(?:dl|rip)|blu[ ._-]?ray|b[dr]rip|hdtv|remux|x26[45]|h[ ._-]?26[45]|avc|hevc|av1|vp9|10[ ._-]?bit|8[ ._-]?bit|hi10p|aac|flac|truehd|dts(?:-?hd)?|ac-?3|e-?ac-?3|opus|mp3|baha|cr|netflix|amazon|amzn|multi[ ._-]?sub|chs|cht|raws?|fansub|batch)\b/giu
const GENERIC_NAME = /^(?:\d{1,4}(?:v\d+)?|e(?:p(?:isode)?)?\s*\d+|第\s*\d+\s*[集话話]|sample|font|fonts|cover|poster|readme|screenshot|thumb(?:nail)?s?)$/iu

function isMetadataSegment (segment) {
  const value = String(segment || '').normalize('NFKC').trim()
  if (!value) return true
  if (/^(?:[a-f0-9]{8}|[a-f0-9]{16,64})$/iu.test(value)) return true
  if (/^\d{3,4}[x×]\d{3,4}$/u.test(value)) return true
  if (/^(?:ep(?:isode)?\s*)?\d{1,4}(?:v\d+)?$/iu.test(value)) return true
  return TECHNICAL_SEGMENT.test(` ${value} `)
}

function cleanCandidate (input) {
  let value = String(input || '').normalize('NFKC').trim()
  if (!value) return ''

  value = value.replace(/\.[a-z0-9]{1,8}$/iu, '')
  value = value.replace(/^\s*[\[【]([^\]】]{1,100})[\]】]\s*/u, (match, segment) => {
    return /^(?:19|20)\d{2}$/u.test(segment.trim()) ? ` ${segment.trim()} ` : ' '
  })
  value = value.replace(/[\[【]([^\]】]{1,120})[\]】]/gu, (match, segment) => {
    if (/^(?:19|20)\d{2}$/u.test(segment.trim())) return ` ${segment.trim()} `
    return isMetadataSegment(segment) ? ' ' : ` ${segment} `
  })
  value = value.replace(/\(([^)]{1,120})\)/gu, (match, segment) => {
    if (/^(?:19|20)\d{2}$/u.test(segment.trim())) return ` ${segment.trim()} `
    return isMetadataSegment(segment) ? ' ' : ` ${segment} `
  })

  value = value.replace(/\bS(?:eason)?\s*0*(\d{1,2})\s*E(?:p(?:isode)?)?\s*0*\d{1,4}(?:v\d+)?\b/giu, ' Season $1 ')
  value = value.replace(/\b(?:EP(?:ISODE)?|E)\s*[._-]?\s*\d{1,4}(?:v\d+)?\b/giu, ' ')
  value = value.replace(/第\s*\d{1,4}\s*[集话話]/gu, ' ')
  value = value.replace(/\b\d{3,4}[x×]\d{3,4}\b/gu, ' ')
  value = value.replace(INLINE_TECHNICAL, ' ')
  value = value.replace(/\b(?:CHS|CHT|GB|BIG5|JPN|JAP|ENG|JP|EN)\b/giu, ' ')
  value = value.replace(/\b[a-f0-9]{8,64}\b/giu, ' ')
  value = value.replace(/\s*[-–—]\s*\d{1,4}(?:v\d+)?\s*$/iu, ' ')
  value = value.replace(/\s+(?!(?:19|20)\d{2}\s*$)\d{2,4}(?:v\d+)?\s*$/iu, ' ')
  value = value.replace(/[._]+/gu, ' ')
  value = value.replace(/\s*[-–—]+\s*$/gu, ' ')
  value = value.replace(/^[\s._-]+|[\s._-]+$/gu, '')
  value = value.replace(/\s{2,}/gu, ' ').trim()
  return value
}

function extractResourceName (fileName, fallbackName = '') {
  const normalizedPath = String(fileName || '').replaceAll('\\', '/')
  const parts = normalizedPath.split('/').filter(Boolean)
  const fileCandidate = cleanCandidate(parts.at(-1) || '')
  if (fileCandidate && !GENERIC_NAME.test(fileCandidate)) return fileCandidate

  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const folderCandidate = cleanCandidate(parts[index])
    if (folderCandidate && !GENERIC_NAME.test(folderCandidate)) return folderCandidate
  }

  const fallbackCandidate = cleanCandidate(path.basename(String(fallbackName || '')))
  return fallbackCandidate && !GENERIC_NAME.test(fallbackCandidate) ? fallbackCandidate : '未命名资源'
}

module.exports = { cleanCandidate, extractResourceName, isMetadataSegment }
