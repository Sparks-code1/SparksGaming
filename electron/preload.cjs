// Preload runs before the page loads, in an isolated context. The game is a
// self-contained web app and needs no privileged Node/Electron APIs, so this is
// intentionally minimal — an app version for display, plus a narrow update API.
// contextIsolation is ON and nodeIntegration is OFF (see main.cjs) for safety:
// the renderer gets these three functions and nothing else, no ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron')

const UPDATE_CHANNEL = 'update-status'
const ZOOM_CHANNEL = 'zoom-changed'

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  version: process.versions.electron,
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  /**
   * Origin-independent key/value store, backed by a file in userData.
   *
   * The window is served from http://127.0.0.1:<ephemeral port>, so the origin
   * changes every launch and localStorage cannot hold anything across restarts.
   * The Supabase client persists its auth session through this instead.
   */
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    remove: (key) => ipcRenderer.invoke('store:remove', key),
  },

  /**
   * Which display the window is on and at what zoom. Read-only diagnostics —
   * the rescaling itself is done in the main process, because only it sees the
   * window move between monitors.
   */
  getDisplayInfo: () => ipcRenderer.invoke('display:info'),

  /**
   * Overall UI scale. The keyboard shortcuts are bound in the main process, so
   * these are for showing the level and for any in-app control — the source of
   * truth stays on the main side, which owns the zoom factor.
   */
  zoom: {
    onChange(callback) {
      const listener = (_event, info) => callback(info)
      ipcRenderer.on(ZOOM_CHANNEL, listener)
      return () => ipcRenderer.removeListener(ZOOM_CHANNEL, listener)
    },
    get: () => ipcRenderer.invoke('zoom:get'),
    set: (scale) => ipcRenderer.invoke('zoom:set', scale),
    step: (dir) => ipcRenderer.invoke('zoom:step', dir),
    reset: () => ipcRenderer.invoke('zoom:reset'),
  },

  updates: {
    /** Subscribe to update status. Returns an unsubscribe function. */
    onStatus(callback) {
      const listener = (_event, status) => callback(status)
      ipcRenderer.on(UPDATE_CHANNEL, listener)
      return () => ipcRenderer.removeListener(UPDATE_CHANNEL, listener)
    },
    /** Current status — lets a component mounting late catch up. */
    getState: () => ipcRenderer.invoke('updates:state'),
    /** Manual "Check for Updates". */
    check: () => ipcRenderer.invoke('updates:check'),
    /** Quit and install a downloaded update. */
    restart: () => ipcRenderer.invoke('updates:restart'),
  },
})
