'use strict'

const form = document.querySelector('#search-form')
const queryInput = document.querySelector('#query')
const searchButton = document.querySelector('#search-button')
const resultsSection = document.querySelector('.results-section')
const resultsContainer = document.querySelector('#results')
const resultTemplate = document.querySelector('#result-template')
const resultTitle = document.querySelector('#result-title')
const resultCount = document.querySelector('#result-count')
const statusCard = document.querySelector('#status')
const toast = document.querySelector('#toast')
const selectionPanel = document.querySelector('#selection-panel')
const selectedCount = document.querySelector('#selected-count')
const selectAllButton = document.querySelector('#select-all-button')
const downloadPathInput = document.querySelector('#download-path')
const chooseFolderButton = document.querySelector('#choose-folder-button')
const downloadSelectedButton = document.querySelector('#download-selected-button')
const downloadMethodSelect = document.querySelector('#download-method')
const downloadsContainer = document.querySelector('#downloads-list')
const downloadsStatus = document.querySelector('#downloads-status')
const downloadTemplate = document.querySelector('#download-template')
const engineStatus = document.querySelector('#engine-status')
const refreshDownloadsButton = document.querySelector('#refresh-downloads-button')
const folderModal = document.querySelector('#folder-modal')
const folderList = document.querySelector('#folder-list')
const currentFolderPath = document.querySelector('#current-folder-path')
const folderUpButton = document.querySelector('#folder-up-button')
const closeFolderButton = document.querySelector('#close-folder-button')
const cancelFolderButton = document.querySelector('#cancel-folder-button')
const confirmFolderButton = document.querySelector('#confirm-folder-button')

let currentSearchRequest = null
let searchItems = []
let downloadPath = localStorage.getItem('nyaa-download-path') || ''
let folderBrowserPath = null
let folderBrowserParent = null
let toastTimer = null
let engineAvailable = window.AnimeEngine?.state?.state === 'running'
const selectedResources = new Set()

if (downloadPath) downloadPathInput.value = downloadPath

function showToast (message, type = 'success') {
  toast.textContent = message
  toast.style.borderColor = type === 'error' ? '#e9a7ad' : ''
  toast.style.background = type === 'error' ? '#fde7e9' : ''
  toast.style.color = type === 'error' ? '#7a1c1c' : ''
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200)
}

function setSearchLoading (loading) {
  searchButton.disabled = loading
  searchButton.classList.toggle('is-loading', loading)
  resultsSection.setAttribute('aria-busy', String(loading))
}

function getSourceStatusText (source) {
  if (source === 'animegarden') {
    return {
      title: 'Connecting to AnimeGarden',
      detail: 'Retrieving AnimeGarden release information. Please wait.'
    }
  }
  if (source === 'all') {
    return {
      title: 'Connecting to Nyaa and AnimeGarden',
      detail: 'Searching both sources. Please wait.'
    }
  }
  return {
    title: 'Connecting to Nyaa',
    detail: 'Searching releases through Nyaa. Please wait.'
  }
}

function showSearchStatus (title, detail, type = 'normal') {
  statusCard.className = `status-card ${type === 'error' ? 'error' : ''}`
  statusCard.replaceChildren()

  const icon = document.createElement('div')
  icon.className = 'status-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = type === 'error' ? '!' : '⌕'
  const strong = document.createElement('strong')
  strong.textContent = title
  const span = document.createElement('span')
  span.textContent = detail
  statusCard.append(icon, strong, span)
  statusCard.hidden = false
  resultsContainer.hidden = true
}

function formatDate (value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat('en', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date)
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

function formatEta (seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 8640000) return 'Unknown time remaining'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `About ${hours}h ${minutes}m`
  return `About ${Math.max(1, minutes)} min`
}

async function copyText (text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function updateSelectionControls () {
  const count = selectedResources.size
  selectedCount.textContent = `${count} selected`
  selectAllButton.textContent = count === searchItems.length && count > 0 ? 'Clear selection' : 'Select all'
  const torrentLimitExceeded = downloadMethodSelect.value === 'torrent' && count > 20
  downloadSelectedButton.disabled = count === 0 || !downloadPath || !engineAvailable || torrentLimitExceeded
  downloadSelectedButton.title = torrentLimitExceeded ? 'Torrent-file downloads are limited to 20 items per batch' : ''
}

function updateSourceFilters () {
  const source = form.querySelector('input[name="source"]:checked')?.value || 'nyaa'
  document.querySelectorAll('.nyaa-filter').forEach((label) => {
    const hidden = source === 'animegarden'
    label.classList.toggle('source-filter-muted', hidden)
    label.querySelectorAll('select, input').forEach((control) => { control.disabled = hidden })
  })
}

form.querySelectorAll('input[name="source"]').forEach((radio) => radio.addEventListener('change', updateSourceFilters))
downloadMethodSelect.addEventListener('change', updateSelectionControls)
updateSourceFilters()

function renderResults (items, query) {
  searchItems = items
  selectedResources.clear()
  resultsContainer.replaceChildren()
  resultTitle.textContent = `Results for “${query}”`
  resultCount.textContent = `${items.length} result${items.length === 1 ? '' : 's'}`

  if (items.length === 0) {
    selectionPanel.hidden = true
    showSearchStatus('No results found', 'Try a shorter keyword or adjust the category and filter settings.')
    return
  }

  const fragment = document.createDocumentFragment()
  items.forEach((item, index) => {
    const card = resultTemplate.content.firstElementChild.cloneNode(true)
    card.querySelector('.result-index').textContent = String(index + 1).padStart(2, '0')
    card.querySelector('.result-name').textContent = item.name
    const sourceBadge = card.querySelector('.source-badge')
    sourceBadge.textContent = item.sourceName
    sourceBadge.classList.add(item.source)
    card.querySelector('.provider-name').textContent = item.providerName || item.categoryName || ''
    card.querySelector('.size').textContent = `Size ${item.filesize}`
    if (item.source === 'animegarden') {
      card.querySelector('.seeders').textContent = `Type ${item.categoryName || 'Anime'}`
      card.querySelector('.leechers').textContent = `${Number(item.trackerCount) || 0} Trackers`
    } else {
      card.querySelector('.seeders').textContent = `Seeders ${item.seeders}`
      card.querySelector('.leechers').textContent = `Leechers ${item.leechers}`
    }
    card.querySelector('.date').textContent = formatDate(item.date)

    const checkbox = card.querySelector('.result-select')
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedResources.add(item.resultKey)
      else selectedResources.delete(item.resultKey)
      card.classList.toggle('selected', checkbox.checked)
      updateSelectionControls()
    })

    const copyButton = card.querySelector('.copy-button')
    copyButton.addEventListener('click', async () => {
      try {
        await copyText(item.magnet)
        copyButton.textContent = 'Copied'
        showToast('Magnet link copied')
        setTimeout(() => { copyButton.textContent = 'Copy Magnet' }, 1400)
      } catch {
        showToast('Copy failed. Check browser permissions.', 'error')
      }
    })
    fragment.append(card)
  })

  resultsContainer.append(fragment)
  selectionPanel.hidden = false
  updateSelectionControls()
  statusCard.hidden = true
  resultsContainer.hidden = false
}

function getSearchOptions () {
  const data = new FormData(form)
  return {
    query: String(data.get('query') || '').trim(),
    source: String(data.get('source') || 'nyaa'),
    category: String(data.get('category') || '1_0'),
    filter: Number(data.get('filter') || 0),
    sort: String(data.get('sort') || 'id'),
    direction: String(data.get('direction') || 'desc'),
    limit: Number(data.get('limit'))
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const options = getSearchOptions()
  if (!options.query) {
    queryInput.focus()
    return
  }

  if (currentSearchRequest) currentSearchRequest.abort()
  const controller = new AbortController()
  currentSearchRequest = controller
  setSearchLoading(true)
  selectionPanel.hidden = true
  resultTitle.textContent = 'Searching…'
  resultCount.textContent = 'Please wait'
  const sourceStatus = getSourceStatusText(options.source)
  showSearchStatus(sourceStatus.title, sourceStatus.detail)

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
      signal: controller.signal
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Search failed.')
    renderResults(data.items, options.query)
    if (data.warnings?.length) showToast(data.warnings.join('；'), 'error')
  } catch (error) {
    if (error.name !== 'AbortError') {
      resultTitle.textContent = 'Search failed'
      resultCount.textContent = '0 results'
      showSearchStatus('Unable to complete the search', error.message, 'error')
    }
  } finally {
    if (currentSearchRequest === controller) {
      setSearchLoading(false)
      currentSearchRequest = null
    }
  }
})

selectAllButton.addEventListener('click', () => {
  const checkboxes = [...resultsContainer.querySelectorAll('.result-select')]
  const shouldSelect = selectedResources.size !== searchItems.length
  selectedResources.clear()
  checkboxes.forEach((checkbox, index) => {
    checkbox.checked = shouldSelect
    checkbox.closest('.result-card').classList.toggle('selected', shouldSelect)
    if (shouldSelect) selectedResources.add(searchItems[index].resultKey)
  })
  updateSelectionControls()
})

async function loadFolder (folderPath) {
  folderList.replaceChildren()
  const loading = document.createElement('div')
  loading.className = 'folder-empty'
  loading.textContent = 'Loading folders…'
  folderList.append(loading)

  try {
    const query = folderPath ? `?path=${encodeURIComponent(folderPath)}` : ''
    const response = await fetch(`/api/directories${query}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to read the directory.')

    folderBrowserPath = data.path
    folderBrowserParent = data.parent
    currentFolderPath.textContent = data.path || 'This PC'
    currentFolderPath.title = data.path || 'This PC'
    folderUpButton.disabled = !data.path
    confirmFolderButton.disabled = !data.path
    folderList.replaceChildren()

    if (data.directories.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'folder-empty'
      empty.textContent = 'This directory contains no subfolders'
      folderList.append(empty)
      return
    }

    data.directories.forEach((directory) => {
      const button = document.createElement('button')
      button.className = 'folder-item'
      button.type = 'button'
      button.textContent = directory.name
      button.title = directory.path
      button.addEventListener('click', () => loadFolder(directory.path))
      folderList.append(button)
    })
  } catch (error) {
    folderList.replaceChildren()
    const message = document.createElement('div')
    message.className = 'folder-empty'
    message.textContent = error.message
    folderList.append(message)
  }
}

function closeFolderDialog () {
  folderModal.hidden = true
  document.body.style.overflow = ''
  chooseFolderButton.focus()
}

chooseFolderButton.addEventListener('click', () => {
  folderModal.hidden = false
  document.body.style.overflow = 'hidden'
  loadFolder(downloadPath || null)
})

folderUpButton.addEventListener('click', () => {
  loadFolder(folderBrowserParent)
})

confirmFolderButton.addEventListener('click', () => {
  if (!folderBrowserPath) return
  downloadPath = folderBrowserPath
  downloadPathInput.value = downloadPath
  localStorage.setItem('nyaa-download-path', downloadPath)
  updateSelectionControls()
  closeFolderDialog()
  showToast('Download directory selected')
})

closeFolderButton.addEventListener('click', closeFolderDialog)
cancelFolderButton.addEventListener('click', closeFolderDialog)
folderModal.addEventListener('click', (event) => {
  if (event.target === folderModal) closeFolderDialog()
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !folderModal.hidden) closeFolderDialog()
})

downloadSelectedButton.addEventListener('click', async () => {
  if (selectedResources.size === 0 || !downloadPath) return
  downloadSelectedButton.disabled = true
  downloadSelectedButton.textContent = 'Submitting…'
  try {
    const response = await fetch('/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: searchItems
          .filter((item) => selectedResources.has(item.resultKey))
          .map((item) => ({
            id: item.id,
            source: item.source,
            provider: item.provider,
            providerId: item.providerId,
            name: item.name,
            magnet: item.magnet,
            category: item.category
          })),
        method: downloadMethodSelect.value,
        savePath: downloadPath
      })
    })
    const data = await response.json()
    if (!response.ok) {
      if (window.AnimeEngine?.handleApiError(response, data)) {
        engineAvailable = false
        showToast('Confirm and enable the bundled download engine first', 'error')
        return
      }
      throw new Error(data.error || 'Unable to add download tasks.')
    }
    showToast(`Added ${data.count} download task${data.count === 1 ? '' : 's'}`)
    selectedResources.clear()
    resultsContainer.querySelectorAll('.result-select').forEach((checkbox) => {
      checkbox.checked = false
      checkbox.closest('.result-card').classList.remove('selected')
    })
    updateSelectionControls()
    await refreshDownloads()
    document.querySelector('.downloads-section').scrollIntoView({ behavior: 'smooth' })
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    downloadSelectedButton.textContent = 'Download Selected'
    updateSelectionControls()
  }
})

const stoppedStates = new Set(['stoppedDL', 'stoppedUP', 'pausedDL', 'pausedUP'])
const errorStates = new Set(['error', 'missingFiles', 'unknown'])

function stateLabel (state, progress) {
  if (errorStates.has(state)) return 'Error'
  if (stoppedStates.has(state)) return 'Paused'
  if (state === 'metaDL') return 'Retrieving metadata'
  if (state === 'checkingDL' || state === 'checkingUP' || state === 'checkingResumeData') return 'Checking'
  if (state === 'queuedDL' || state === 'queuedUP') return 'Queued'
  if (state === 'stalledDL') return 'Waiting for peers'
  if (state === 'stalledUP') return 'Seeding stalled'
  if (state === 'uploading' || state === 'forcedUP') return 'Seeding'
  if (state === 'downloading' || state === 'forcedDL') return 'Downloading'
  if (state === 'moving') return 'Moving files'
  if (progress >= 100) return 'Completed'
  return state || 'Unknown status'
}

function showDownloadsStatus (title, detail, type = 'normal') {
  downloadsStatus.className = `status-card compact ${type === 'error' ? 'error' : ''}`
  downloadsStatus.replaceChildren()
  const icon = document.createElement('div')
  icon.className = 'status-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = type === 'error' ? '!' : '↓'
  const strong = document.createElement('strong')
  strong.textContent = title
  const span = document.createElement('span')
  span.textContent = detail
  downloadsStatus.append(icon, strong, span)
  downloadsStatus.hidden = false
  downloadsContainer.hidden = true
}

async function runTaskAction (button, hash, action) {
  button.disabled = true
  try {
    const response = await fetch('/api/downloads/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, action })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Task action failed.')
    await refreshDownloads(true)
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    button.disabled = false
  }
}

function renderDownloads (items) {
  downloadsContainer.replaceChildren()
  if (items.length === 0) {
    showDownloadsStatus('No download tasks', 'Select releases and choose a directory above to start downloading.')
    return
  }

  const fragment = document.createDocumentFragment()
  items.forEach((item) => {
    const card = downloadTemplate.content.firstElementChild.cloneNode(true)
    const isStopped = stoppedStates.has(item.state)
    const hasError = errorStates.has(item.state)
    card.classList.toggle('stopped', isStopped)
    card.classList.toggle('error', hasError)
    card.querySelector('.download-name').textContent = item.name || 'Retrieving magnet metadata…'
    card.querySelector('.download-state').textContent = stateLabel(item.state, item.progress)
    card.querySelector('.progress-value').style.width = `${Math.min(100, item.progress)}%`
    card.querySelector('.progress-text').textContent = `${item.progress.toFixed(1)}% · ${formatBytes(item.downloaded)} / ${formatBytes(item.size)}`
    card.querySelector('.download-speed').textContent = `↓ ${formatBytes(item.downloadSpeed)}/s`
    card.querySelector('.upload-speed').textContent = `↑ ${formatBytes(item.uploadSpeed)}/s`
    card.querySelector('.download-eta').textContent = formatEta(item.eta)
    card.querySelector('.save-path').textContent = `Saved to ${item.savePath}`
    card.querySelector('.save-path').title = item.savePath

    const toggleButton = card.querySelector('.toggle-task-button')
    toggleButton.textContent = isStopped ? 'Resume' : 'Pause'
    toggleButton.addEventListener('click', () => {
      runTaskAction(toggleButton, item.hash, isStopped ? 'start' : 'stop')
    })

    const removeButton = card.querySelector('.remove-task-button')
    removeButton.addEventListener('click', () => {
      const shouldRemove = window.confirm('This permanently removes the download task and its files from disk. Continue?')
      if (shouldRemove) runTaskAction(removeButton, item.hash, 'remove')
    })
    fragment.append(card)
  })

  downloadsContainer.append(fragment)
  downloadsStatus.hidden = true
  downloadsContainer.hidden = false
}

async function refreshDownloads (silent = false) {
  if (!silent) {
    refreshDownloadsButton.disabled = true
    engineStatus.textContent = 'Connecting to download engine'
  }
  try {
    const response = await fetch('/api/downloads')
    const data = await response.json()
    if (!response.ok) {
      if (window.AnimeEngine?.handleApiError(response, data)) {
        engineAvailable = false
        engineStatus.textContent = 'Download engine not enabled'
        engineStatus.classList.remove('online')
        updateSelectionControls()
        if (!silent) showDownloadsStatus('Download engine not enabled', 'You can still search and copy magnet links. Confirm the license notice to add download tasks.')
        return
      }
      throw new Error(data.error || 'Unable to load download tasks.')
    }
    engineAvailable = true
    engineStatus.textContent = `qBittorrent ${data.engine} · Running in background`
    engineStatus.classList.add('online')
    updateSelectionControls()
    renderDownloads(data.items)
  } catch (error) {
    engineStatus.textContent = 'Download engine offline'
    engineStatus.classList.remove('online')
    if (!silent) showDownloadsStatus('Unable to connect to the download engine', error.message, 'error')
  } finally {
    refreshDownloadsButton.disabled = false
  }
}

refreshDownloadsButton.addEventListener('click', () => refreshDownloads())

window.addEventListener('anime-engine-state', (event) => {
  const state = event.detail?.state
  engineAvailable = state === 'running'
  updateSelectionControls()
  if (state === 'running') refreshDownloads()
  if (state === 'consent_required') {
    engineStatus.textContent = 'Download engine not enabled'
    engineStatus.classList.remove('online')
  }
})

refreshDownloads()
const downloadsRefreshTimer = setInterval(() => {
  if (document.visibilityState === 'visible') refreshDownloads(true)
}, 2500)
window.addEventListener('anime-app-exiting', () => clearInterval(downloadsRefreshTimer))
