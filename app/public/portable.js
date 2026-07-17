'use strict'

const engineController = {
  state: { state: 'checking', version: '5.2.3', message: null },
  dismissed: false,
  modal: null,

  dispatch (state) {
    this.state = state
    window.dispatchEvent(new CustomEvent('anime-engine-state', { detail: state }))
  },

  buildConsentModal () {
    if (this.modal) return this.modal
    const backdrop = document.createElement('div')
    backdrop.className = 'modal-backdrop engine-consent-modal'
    backdrop.hidden = true
    backdrop.innerHTML = `
      <section class="folder-dialog engine-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="engine-consent-title">
        <p class="eyebrow">FIRST RUN</p>
        <h2 id="engine-consent-title">启用内置下载引擎</h2>
        <p>Anime Search 内置 qBittorrent 5.2.3，用于在本机后台处理磁力链接。它不会打开窗口或系统托盘，下载操作只在本网页中显示。</p>
        <div class="consent-note">
          <strong>使用前请确认</strong>
          <span>qBittorrent 是采用 GNU GPL 发布的自由软件。请只下载和分享你有权获取的内容，并遵守所在地法律。</span>
          <a href="/third-party.html" target="_blank" rel="noopener">查看第三方软件与许可说明</a>
        </div>
        <label class="consent-checkbox">
          <input type="checkbox">
          <span>我已阅读说明，并同意仅将下载功能用于合法内容。</span>
        </label>
        <div class="consent-actions">
          <button class="secondary-button consent-later-button" type="button">暂不启用</button>
          <button class="download-button consent-accept-button" type="button" disabled>确认并启用</button>
        </div>
      </section>`
    document.body.append(backdrop)

    const checkbox = backdrop.querySelector('input')
    const acceptButton = backdrop.querySelector('.consent-accept-button')
    checkbox.addEventListener('change', () => { acceptButton.disabled = !checkbox.checked })
    backdrop.querySelector('.consent-later-button').addEventListener('click', () => {
      this.dismissed = true
      backdrop.hidden = true
      document.body.style.overflow = ''
      this.dispatch({ state: 'consent_required', version: '5.2.3', message: null })
    })
    acceptButton.addEventListener('click', async () => {
      acceptButton.disabled = true
      acceptButton.textContent = '正在启动…'
      try {
        const response = await fetch('/api/engine/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accepted: true })
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '无法启动下载引擎。')
        backdrop.hidden = true
        document.body.style.overflow = ''
        this.dispatch(data)
      } catch (error) {
        const note = backdrop.querySelector('.consent-note span')
        note.textContent = error.message
        note.classList.add('error-text')
        acceptButton.disabled = false
      } finally {
        acceptButton.textContent = '确认并启用'
      }
    })
    this.modal = backdrop
    return backdrop
  },

  requireConsent (force = false) {
    this.dispatch({ state: 'consent_required', version: '5.2.3', message: null })
    if (this.dismissed && !force) return
    const modal = this.buildConsentModal()
    modal.hidden = false
    document.body.style.overflow = 'hidden'
  },

  handleApiError (response, data) {
    if (response.status !== 428 && data?.code !== 'ENGINE_CONSENT_REQUIRED') return false
    this.requireConsent()
    return true
  },

  async refreshStatus () {
    try {
      const response = await fetch('/api/engine/status')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '无法读取下载引擎状态。')
      this.dispatch(data)
      if (data.state === 'consent_required') this.requireConsent()
    } catch (error) {
      this.dispatch({ state: 'error', version: '5.2.3', message: error.message })
    }
  }
}

window.AnimeEngine = engineController

document.querySelectorAll('.exit-app-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const confirmed = window.confirm('将关闭网页窗口并停止后台下载引擎；未完成任务会在下次启动时继续。确定退出 Anime Search 吗？')
    if (!confirmed) return
    button.disabled = true
    button.textContent = '正在关闭…'
    try {
      const response = await fetch('/api/exit', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '退出失败。')
      window.dispatchEvent(new CustomEvent('anime-app-exiting'))
      window.close()

      // Edge/Chrome 的独立应用窗口通常允许自行关闭；普通浏览器标签页可能阻止脚本关窗。
      setTimeout(() => {
        if (window.closed) return
        const screen = document.createElement('div')
        screen.className = 'exit-screen'
        screen.innerHTML = '<div class="exit-screen-card"><h2>正在退出 Anime Search</h2><p>后台下载引擎停止后，专用窗口将自动关闭。</p></div>'
        document.body.append(screen)
      }, 300)
    } catch (error) {
      button.disabled = false
      button.textContent = '退出程序'
      window.alert(error.message)
    }
  })
})

engineController.refreshStatus()
