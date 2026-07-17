'use strict'

const engineState = document.querySelector('#tracker-engine-state')
const configuredCount = document.querySelector('#configured-count')
const torrentCount = document.querySelector('#torrent-count')
const recommendedContainer = document.querySelector('#recommended-trackers')
const editor = document.querySelector('#tracker-editor')
const enableFuture = document.querySelector('#enable-future')
const applyExisting = document.querySelector('#apply-existing')
const saveButton = document.querySelector('#save-trackers-button')
const recommendedButton = document.querySelector('#use-recommended-button')
const refreshOnlineButton = document.querySelector('#refresh-online-button')
const enableEngineButton = document.querySelector('#enable-engine-button')
const onlineSource = document.querySelector('#online-source')
const status = document.querySelector('#tracker-status')
const toast = document.querySelector('#toast')

let recommended = []
let toastTimer = null

function showToast (message, type = 'success') {
  toast.textContent = message
  toast.style.borderColor = type === 'error' ? '#e9a7ad' : ''
  toast.style.background = type === 'error' ? '#fde7e9' : ''
  toast.style.color = type === 'error' ? '#7a1c1c' : ''
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600)
}

function setMessage (message, type = 'normal') {
  status.textContent = message
  status.classList.toggle('error', type === 'error')
  status.classList.toggle('success', type === 'success')
}

function currentTrackerLines () {
  return editor.value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
}

function setEditorTrackers (trackers) {
  editor.value = [...new Set(trackers)].join('\n')
  configuredCount.textContent = String(currentTrackerLines().length)
}

function renderRecommended () {
  recommendedContainer.replaceChildren()
  recommended.forEach((item) => {
    const row = document.createElement('button')
    row.className = 'recommended-tracker-row'
    row.type = 'button'
    const copy = document.createElement('span')
    const label = document.createElement('strong')
    label.textContent = item.label
    const url = document.createElement('code')
    url.textContent = item.url
    copy.append(label, url)
    const group = document.createElement('em')
    group.textContent = item.group
    row.append(copy, group)
    row.addEventListener('click', () => {
      setEditorTrackers([...currentTrackerLines(), item.url])
      showToast(`Added ${item.label}`)
    })
    recommendedContainer.append(row)
  })
}

function updateEngineDisplay (state) {
  const labels = {
    consent_required: 'Awaiting confirmation',
    stopped: 'Stopped',
    starting: 'Starting',
    running: 'Running in background',
    error: 'Start failed'
  }
  engineState.textContent = labels[state] || state || 'Unknown'
  enableEngineButton.hidden = state !== 'consent_required'
  saveButton.disabled = state === 'consent_required' || state === 'starting'
}

async function loadStatus () {
  try {
    const response = await fetch('/api/trackers')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to load Tracker settings.')
    recommended = data.recommended || []
    renderRecommended()
    updateEngineDisplay(data.engineState)
    enableFuture.checked = data.enabled
    torrentCount.textContent = String(data.torrentCount || 0)
    if (data.configured?.length) setEditorTrackers(data.configured)
    else setEditorTrackers(recommended.map((item) => item.url))
    setMessage(data.engineState === 'consent_required'
      ? 'Confirm the license notice before writing Trackers to the bundled qBittorrent engine.'
      : 'Configuration loaded. Choose “Save & Apply” to make changes effective.')
  } catch (error) {
    setMessage(error.message, 'error')
  }
}

recommendedButton.addEventListener('click', () => {
  setEditorTrackers(recommended.map((item) => item.url))
  showToast('Recommended Trackers loaded')
})

refreshOnlineButton.addEventListener('click', async () => {
  refreshOnlineButton.disabled = true
  refreshOnlineButton.textContent = 'Loading…'
  try {
    const response = await fetch('/api/trackers/online')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to retrieve the online list.')
    setEditorTrackers(data.trackers)
    onlineSource.textContent = `Updated from the XIU2 daily list · ${new Date(data.updatedAt).toLocaleString('en')}`
    showToast(`Loaded ${data.trackers.length} Trackers`)
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    refreshOnlineButton.disabled = false
    refreshOnlineButton.textContent = 'Refresh from Daily Online List'
  }
})

enableEngineButton.addEventListener('click', () => window.AnimeEngine?.requireConsent(true))

saveButton.addEventListener('click', async () => {
  const trackers = currentTrackerLines()
  if (!trackers.length) {
    showToast('Enter at least one Tracker', 'error')
    editor.focus()
    return
  }
  saveButton.disabled = true
  saveButton.textContent = 'Applying…'
  try {
    const response = await fetch('/api/trackers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackers,
        enableFuture: enableFuture.checked,
        applyExisting: applyExisting.checked
      })
    })
    const data = await response.json()
    if (!response.ok) {
      if (window.AnimeEngine?.handleApiError(response, data)) return
      throw new Error(data.error || 'Unable to apply Tracker settings.')
    }
    configuredCount.textContent = String(data.configured)
    const existingResult = applyExisting.checked
      ? `; applied to ${data.applied} existing task${data.applied === 1 ? '' : 's'}${data.failed ? `, ${data.failed} failed` : ''}`
      : ''
    setMessage(`Saved ${data.configured} Tracker${data.configured === 1 ? '' : 's'}${existingResult}.`, data.failed ? 'normal' : 'success')
    showToast('Tracker settings applied')
  } catch (error) {
    setMessage(error.message, 'error')
    showToast(error.message, 'error')
  } finally {
    saveButton.textContent = 'Save & Apply'
    saveButton.disabled = false
  }
})

editor.addEventListener('input', () => { configuredCount.textContent = String(currentTrackerLines().length) })
window.addEventListener('anime-engine-state', (event) => {
  updateEngineDisplay(event.detail?.state)
  if (event.detail?.state === 'running') loadStatus()
})

loadStatus()
