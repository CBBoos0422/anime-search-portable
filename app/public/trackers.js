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
      showToast(`已加入 ${item.label}`)
    })
    recommendedContainer.append(row)
  })
}

function updateEngineDisplay (state) {
  const labels = {
    consent_required: '等待首次确认',
    stopped: '尚未启动',
    starting: '正在启动',
    running: '后台运行中',
    error: '启动失败'
  }
  engineState.textContent = labels[state] || state || '未知'
  enableEngineButton.hidden = state !== 'consent_required'
  saveButton.disabled = state === 'consent_required' || state === 'starting'
}

async function loadStatus () {
  try {
    const response = await fetch('/api/trackers')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '无法读取 Tracker 配置。')
    recommended = data.recommended || []
    renderRecommended()
    updateEngineDisplay(data.engineState)
    enableFuture.checked = data.enabled
    torrentCount.textContent = String(data.torrentCount || 0)
    if (data.configured?.length) setEditorTrackers(data.configured)
    else setEditorTrackers(recommended.map((item) => item.url))
    setMessage(data.engineState === 'consent_required'
      ? '确认许可后才能把 Tracker 写入内置 qBittorrent。'
      : '配置已读取。点击“保存并应用”后生效。')
  } catch (error) {
    setMessage(error.message, 'error')
  }
}

recommendedButton.addEventListener('click', () => {
  setEditorTrackers(recommended.map((item) => item.url))
  showToast('已载入推荐 Tracker')
})

refreshOnlineButton.addEventListener('click', async () => {
  refreshOnlineButton.disabled = true
  refreshOnlineButton.textContent = '正在获取…'
  try {
    const response = await fetch('/api/trackers/online')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '在线列表获取失败。')
    setEditorTrackers(data.trackers)
    onlineSource.textContent = `已从 XIU2 每日列表更新 · ${new Date(data.updatedAt).toLocaleString('zh-CN')}`
    showToast(`已载入 ${data.trackers.length} 个 Tracker`)
  } catch (error) {
    showToast(error.message, 'error')
  } finally {
    refreshOnlineButton.disabled = false
    refreshOnlineButton.textContent = '从在线每日列表刷新'
  }
})

enableEngineButton.addEventListener('click', () => window.AnimeEngine?.requireConsent(true))

saveButton.addEventListener('click', async () => {
  const trackers = currentTrackerLines()
  if (!trackers.length) {
    showToast('请至少填写一个 Tracker', 'error')
    editor.focus()
    return
  }
  saveButton.disabled = true
  saveButton.textContent = '正在应用…'
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
      throw new Error(data.error || 'Tracker 应用失败。')
    }
    configuredCount.textContent = String(data.configured)
    const existingResult = applyExisting.checked
      ? `；已应用到 ${data.applied} 个现有任务${data.failed ? `，${data.failed} 个失败` : ''}`
      : ''
    setMessage(`已保存 ${data.configured} 个 Tracker${existingResult}。`, data.failed ? 'normal' : 'success')
    showToast('Tracker 配置已生效')
  } catch (error) {
    setMessage(error.message, 'error')
    showToast(error.message, 'error')
  } finally {
    saveButton.textContent = '保存并应用'
    saveButton.disabled = false
  }
})

editor.addEventListener('input', () => { configuredCount.textContent = String(currentTrackerLines().length) })
window.addEventListener('anime-engine-state', (event) => {
  updateEngineDisplay(event.detail?.state)
  if (event.detail?.state === 'running') loadStatus()
})

loadStatus()
