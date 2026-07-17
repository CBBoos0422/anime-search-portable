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
        <h2 id="engine-consent-title">Enable the Bundled Download Engine</h2>
        <p>Anime Search uses qBittorrent 5.2.3 to process magnet links in the background. It does not open a window or system-tray icon; download activity appears only in this web interface.</p>
        <div class="consent-note">
          <strong>Confirmation required</strong>
          <span>qBittorrent is free software released under the GNU GPL. Download and share only content you are authorized to access, and follow applicable law.</span>
          <a href="/third-party.html" target="_blank" rel="noopener">View third-party software and license information</a>
        </div>
        <label class="consent-checkbox">
          <input type="checkbox">
          <span>I have read this notice and will use download features only for lawful content.</span>
        </label>
        <div class="consent-actions">
          <button class="secondary-button consent-later-button" type="button">Not Now</button>
          <button class="download-button consent-accept-button" type="button" disabled>Confirm &amp; Enable</button>
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
      acceptButton.textContent = 'Starting…'
      try {
        const response = await fetch('/api/engine/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accepted: true })
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to start the download engine.')
        backdrop.hidden = true
        document.body.style.overflow = ''
        this.dispatch(data)
      } catch (error) {
        const note = backdrop.querySelector('.consent-note span')
        note.textContent = error.message
        note.classList.add('error-text')
        acceptButton.disabled = false
      } finally {
        acceptButton.textContent = 'Confirm & Enable'
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
      if (!response.ok) throw new Error(data.error || 'Unable to read the download engine status.')
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
    const confirmed = window.confirm('This will close the app window and stop the background download engine. Unfinished tasks will resume the next time you start Anime Search. Exit now?')
    if (!confirmed) return
    button.disabled = true
    button.textContent = 'Closing…'
    try {
      const response = await fetch('/api/exit', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to exit the application.')
      window.dispatchEvent(new CustomEvent('anime-app-exiting'))
      window.close()

      // Edge and Chrome app windows usually allow self-closing; a regular browser tab may block it.
      setTimeout(() => {
        if (window.closed) return
        const screen = document.createElement('div')
        screen.className = 'exit-screen'
        screen.innerHTML = '<div class="exit-screen-card"><h2>Exiting Anime Search</h2><p>The app window will close after the background download engine stops.</p></div>'
        document.body.append(screen)
      }, 300)
    } catch (error) {
      button.disabled = false
      button.textContent = 'Exit App'
      window.alert(error.message)
    }
  })
})

engineController.refreshStatus()
