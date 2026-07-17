'use strict'

const filterInput = document.querySelector('#library-filter')
const refreshButton = document.querySelector('#library-refresh-button')
const groupsContainer = document.querySelector('#library-groups')
const statusCard = document.querySelector('#library-status')
const updatedLabel = document.querySelector('#library-updated')
const categoryTotal = document.querySelector('#category-total')
const torrentTotal = document.querySelector('#torrent-total')
const fileTotal = document.querySelector('#file-total')
const playableTotal = document.querySelector('#playable-total')
const toast = document.querySelector('#toast')

let libraryItems = []
let toastTimer = null

function showToast (message, type = 'success') {
  toast.textContent = message
  toast.style.borderColor = type === 'error' ? '#e9a7ad' : ''
  toast.style.background = type === 'error' ? '#fde7e9' : ''
  toast.style.color = type === 'error' ? '#7a1c1c' : ''
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200)
}

function formatBytes (bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = -1
  do {
    size /= 1024
    unitIndex += 1
  } while (size >= 1024 && unitIndex < units.length - 1)
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
}

function showStatus (title, detail, type = 'normal') {
  statusCard.className = `status-card compact ${type === 'error' ? 'error' : ''}`
  statusCard.replaceChildren()
  const icon = document.createElement('div')
  icon.className = 'status-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = type === 'error' ? '!' : '▦'
  const strong = document.createElement('strong')
  strong.textContent = title
  const span = document.createElement('span')
  span.textContent = detail
  statusCard.append(icon, strong, span)
  statusCard.hidden = false
  groupsContainer.hidden = true
}

async function playFile (button, hash, index) {
  button.disabled = true
  button.textContent = '正在打开…'
  try {
    const response = await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, index })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '无法打开播放器。')
    showToast('已交给系统默认播放器')
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    button.disabled = false
    button.textContent = '播放'
  }
}

function createFileRow (torrent, file) {
  const row = document.createElement('div')
  row.className = 'library-file-row'

  const icon = document.createElement('span')
  icon.className = `file-type-icon ${file.media ? 'media' : ''}`
  icon.textContent = file.media ? '▶' : '•'

  const details = document.createElement('div')
  details.className = 'library-file-details'
  const name = document.createElement('strong')
  name.textContent = file.name
  name.title = file.name
  const metadata = document.createElement('span')
  metadata.textContent = `${formatBytes(file.size)} · ${file.progress.toFixed(1)}%`
  details.append(name, metadata)
  row.append(icon, details)

  if (file.media) {
    const playButton = document.createElement('button')
    playButton.className = 'play-file-button'
    playButton.type = 'button'
    playButton.textContent = file.playable ? '播放' : '尚未完成'
    playButton.disabled = !file.playable
    if (file.playable) {
      playButton.addEventListener('click', () => playFile(playButton, torrent.hash, file.index))
    }
    row.append(playButton)
  }
  return row
}

function createTorrentCard (torrent, visibleFiles) {
  const card = document.createElement('article')
  card.className = 'library-torrent-card'

  const header = document.createElement('div')
  header.className = 'library-torrent-header'
  const titleWrap = document.createElement('div')
  const title = document.createElement('h3')
  title.textContent = torrent.name
  const pathLabel = document.createElement('span')
  pathLabel.textContent = torrent.savePath
  pathLabel.title = torrent.savePath
  titleWrap.append(title, pathLabel)
  const progress = document.createElement('strong')
  progress.textContent = `${torrent.progress.toFixed(1)}%`
  header.append(titleWrap, progress)

  const track = document.createElement('div')
  track.className = 'progress-track'
  const value = document.createElement('div')
  value.className = 'progress-value'
  value.style.width = `${Math.min(100, torrent.progress)}%`
  track.append(value)

  const fileList = document.createElement('div')
  fileList.className = 'library-file-list'
  visibleFiles.forEach((file) => fileList.append(createFileRow(torrent, file)))
  card.append(header, track, fileList)
  return card
}

function renderLibrary () {
  const query = filterInput.value.trim().toLocaleLowerCase('zh-CN')
  const grouped = new Map()
  const visibleTorrentHashes = new Set()
  let visibleFileCount = 0
  let visiblePlayableCount = 0

  const addToResource = (resourceName, torrent, file) => {
    const name = resourceName || torrent.resourceName || torrent.name || '未命名资源'
    if (!grouped.has(name)) grouped.set(name, [])
    const entries = grouped.get(name)
    let entry = entries.find((candidate) => candidate.torrent.hash === torrent.hash)
    if (!entry) {
      entry = { torrent, visibleFiles: [] }
      entries.push(entry)
    }
    if (file) entry.visibleFiles.push(file)
  }

  libraryItems.forEach((torrent) => {
    const torrentSearchText = `${torrent.name} ${torrent.resourceName || ''}`.toLocaleLowerCase('zh-CN')
    const torrentMatches = torrentSearchText.includes(query)
    const visibleFiles = torrent.files.filter((file) => {
      const fileSearchText = `${file.name} ${file.resourceName || ''}`.toLocaleLowerCase('zh-CN')
      return !query || torrentMatches || fileSearchText.includes(query)
    })
    if (query && !torrentMatches && visibleFiles.length === 0) return

    if (visibleFiles.length === 0) {
      addToResource(torrent.resourceName, torrent, null)
    } else {
      visibleFiles.forEach((file) => addToResource(file.resourceName, torrent, file))
    }

    visibleTorrentHashes.add(torrent.hash)
    visibleFileCount += visibleFiles.length
    visiblePlayableCount += visibleFiles.filter((file) => file.playable).length
  })

  categoryTotal.textContent = grouped.size
  torrentTotal.textContent = visibleTorrentHashes.size
  fileTotal.textContent = visibleFileCount
  playableTotal.textContent = visiblePlayableCount
  groupsContainer.replaceChildren()

  if (grouped.size === 0) {
    showStatus(query ? '没有匹配的文件' : '文件库暂时为空', query ? '请尝试其他筛选文字。' : '完成搜索并添加下载任务后，文件会出现在这里。')
    return
  }

  const names = [...grouped.keys()].sort((left, right) => {
    return left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' })
  })

  names.forEach((resourceName) => {
    const group = document.createElement('section')
    group.className = 'library-category-group'
    const heading = document.createElement('div')
    heading.className = 'category-heading'
    const title = document.createElement('h2')
    title.textContent = resourceName
    const count = document.createElement('span')
    const entries = grouped.get(resourceName)
    const resourceFileCount = entries.reduce((total, entry) => total + entry.visibleFiles.length, 0)
    count.textContent = `${resourceFileCount} 个文件 · ${entries.length} 个任务`
    heading.append(title, count)
    group.append(heading)
    entries.forEach(({ torrent, visibleFiles }) => {
      group.append(createTorrentCard(torrent, visibleFiles))
    })
    groupsContainer.append(group)
  })

  statusCard.hidden = true
  groupsContainer.hidden = false
}

async function refreshLibrary () {
  refreshButton.disabled = true
  refreshButton.textContent = '正在刷新…'
  try {
    const response = await fetch('/api/library')
    const data = await response.json()
    if (!response.ok) {
      if (window.AnimeEngine?.handleApiError(response, data)) {
        updatedLabel.textContent = '下载引擎尚未启用'
        showStatus('尚未启用下载引擎', '确认许可后即可读取和管理下载文件。')
        return
      }
      throw new Error(data.error || '无法读取文件库。')
    }
    libraryItems = data.items
    updatedLabel.textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    renderLibrary()
  } catch (error) {
    updatedLabel.textContent = '读取失败'
    showStatus('无法读取文件库', error.message, 'error')
  } finally {
    refreshButton.disabled = false
    refreshButton.textContent = '刷新文件库'
  }
}

filterInput.addEventListener('input', renderLibrary)
refreshButton.addEventListener('click', refreshLibrary)
window.addEventListener('anime-engine-state', (event) => {
  if (event.detail?.state === 'running') refreshLibrary()
})
refreshLibrary()
