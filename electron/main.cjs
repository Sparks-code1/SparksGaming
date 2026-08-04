// Electron main process — Risk Legacy Digital desktop app.
//
// The app is a plain Vite/React SPA that references some assets by ABSOLUTE
// path (e.g. fetch('/Risk_board_wiki.svg'), img.src='/Risk_board.svg.png').
// Those break under file://, so instead of loadFile() we serve the built `dist`
// folder from a tiny localhost HTTP server and load http://127.0.0.1:<port>.
// That makes absolute paths resolve exactly as they do on the web (which is the
// verified-working environment) and gives a real secure-context origin that the
// Supabase client + Web Audio are happy with.

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
const { attachDpiHandling } = require('./dpi.cjs')
const {
  createZoomController, attachZoomShortcuts, formatScale,
  STORE_KEY: ZOOM_KEY, DEFAULT_SCALE,
} = require('./zoom.cjs')

// Dev mode = run against the Vite dev server. Enabled only when explicitly asked
// AND not packaged, so `electron .` on a build previews the real bundle.
const IS_DEV = !app.isPackaged && process.env.ELECTRON_DEV === '1'
const DEV_URL = 'http://localhost:5173'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.map': 'application/json; charset=utf-8',
}

/** Serve `root` over http on an ephemeral localhost port. SPA fallback → index.html. */
function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
        let filePath = path.normalize(path.join(root, pathname))
        // Guard against path traversal outside the served root.
        if (!filePath.startsWith(root)) {
          res.writeHead(403); res.end('Forbidden'); return
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(root, 'index.html') // SPA / directory fallback
        }
        const ext = path.extname(filePath).toLowerCase()
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        fs.createReadStream(filePath).pipe(res)
      } catch (err) {
        res.writeHead(500); res.end(String(err))
      }
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

// ─── Auto-update ─────────────────────────────────────────────────────────────
// Updates come from GitHub Releases (see build.publish in package.json).
//
// The guiding rule here is that updating is entirely optional: the game is
// playable offline, so every failure path — no network, GitHub down, no release
// published yet, electron-updater missing — must leave the app running normally.
// Nothing below is awaited on the startup path, and every entry point is
// wrapped, so a broken update check can only ever change the status indicator.

const UPDATE_CHANNEL = 'update-status'

/** Last status sent, so a renderer that mounts late can catch up. */
let updateState = { state: 'idle' }
let updaterRef = null
let mainWindow = null
/** Guards against a second restart prompt while one is already open. */
let restartPromptOpen = false

function setUpdateState(next) {
  updateState = { ...next, appVersion: app.getVersion() }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATE_CHANNEL, updateState)
  }
}

/**
 * Load electron-updater and attach handlers. Returns null when updating is not
 * possible, which is normal rather than exceptional:
 *  - dev / unpackaged runs have no update metadata to compare against
 *  - the portable .exe cannot self-update (NSIS installs can)
 */
function getUpdater() {
  if (updaterRef !== null) return updaterRef
  if (!app.isPackaged) {
    setUpdateState({ state: 'disabled', reason: 'Updates are only available in the installed app' })
    return (updaterRef = false)
  }
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true          // download in the background
    autoUpdater.autoInstallOnAppQuit = true  // if they never restart, apply on next quit

    autoUpdater.on('checking-for-update', () => setUpdateState({ state: 'checking' }))
    autoUpdater.on('update-not-available', () => setUpdateState({ state: 'current' }))
    autoUpdater.on('update-available', info =>
      setUpdateState({ state: 'downloading', version: info?.version, percent: 0 }))
    autoUpdater.on('download-progress', p =>
      setUpdateState({ state: 'downloading', percent: Math.round(p?.percent ?? 0) }))
    autoUpdater.on('update-downloaded', info => {
      setUpdateState({ state: 'ready', version: info?.version })
      promptRestart(info?.version)
    })
    autoUpdater.on('error', err => {
      // Errors here are expected offline. Surface them quietly; never dialog.
      console.warn('[Update] check failed:', err?.message ?? err)
      setUpdateState({ state: 'error', message: String(err?.message ?? err) })
    })
    return (updaterRef = autoUpdater)
  } catch (err) {
    console.warn('[Update] electron-updater unavailable:', err?.message ?? err)
    setUpdateState({ state: 'disabled', reason: 'Updater unavailable' })
    return (updaterRef = false)
  }
}

/** Offer a restart once an update is on disk. Declining keeps them playing. */
async function promptRestart(version) {
  if (restartPromptOpen || !mainWindow || mainWindow.isDestroyed()) return
  restartPromptOpen = true
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Risk Legacy ${version ?? ''} is ready to install.`.trim(),
      detail: 'The update will be applied when you restart. You can keep playing and restart whenever you like — it installs on quit either way.',
    })
    if (response === 0) restartAndInstall()
  } catch (err) {
    console.warn('[Update] restart prompt failed:', err?.message ?? err)
  } finally {
    restartPromptOpen = false
  }
}

function restartAndInstall() {
  const updater = getUpdater()
  if (!updater) return
  try {
    // isSilent=false so the installer UI shows; isForceRunAfter=true reopens the game.
    updater.quitAndInstall(false, true)
  } catch (err) {
    console.warn('[Update] quitAndInstall failed:', err?.message ?? err)
    setUpdateState({ state: 'error', message: 'Could not start the installer' })
  }
}

/** Kick off a check. Never throws, never blocks. */
function checkForUpdates() {
  const updater = getUpdater()
  if (!updater) return updateState
  try {
    const result = updater.checkForUpdates()
    // checkForUpdates rejects when GitHub is unreachable — swallow it, the
    // 'error' handler above has already reported it to the indicator.
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch (err) {
    console.warn('[Update] check threw:', err?.message ?? err)
    setUpdateState({ state: 'error', message: String(err?.message ?? err) })
  }
  return updateState
}

// ─── Origin-independent key/value store ──────────────────────────────────────
// The window's origin includes an ephemeral port, so localStorage cannot hold
// anything across restarts. This backs the renderer's `desktop.store` with a
// single JSON file in userData, which is stable. Used for the auth session.

const STORE_FILE = () => path.join(app.getPath('userData'), 'session-store.json')

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE(), 'utf8'))
  } catch {
    return {}   // missing or corrupt file behaves as empty, never fatal
  }
}

function writeStore(data) {
  try {
    fs.writeFileSync(STORE_FILE(), JSON.stringify(data), 'utf8')
    return true
  } catch (err) {
    console.warn('[Store] write failed:', err?.message ?? err)
    return false
  }
}

ipcMain.handle('store:get', (_e, key) => readStore()[key] ?? null)
ipcMain.handle('store:set', (_e, key, value) => {
  const data = readStore()
  data[key] = value
  return writeStore(data)
})
ipcMain.handle('store:remove', (_e, key) => {
  const data = readStore()
  delete data[key]
  return writeStore(data)
})

/** Diagnostics for the DPI handling — what display are we on, and at what zoom. */
ipcMain.handle('display:info', () => {
  try {
    const { screen } = require('electron')
    const win = mainWindow
    if (!win || win.isDestroyed()) return null
    const d = screen.getDisplayMatching(win.getBounds())
    return {
      displayId: d.id,
      scaleFactor: d.scaleFactor,
      zoomFactor: win.webContents.getZoomFactor(),
      displayCount: screen.getAllDisplays().length,
      scaleFactors: screen.getAllDisplays().map(x => x.scaleFactor),
    }
  } catch (err) {
    console.warn('[DPI] display:info failed:', err?.message ?? err)
    return null
  }
})

// ─── UI scale (Ctrl +/-/0) ───────────────────────────────────────────────────
// The controller only holds the preference; dpi.cjs applies it, because that
// module owns the zoom factor and also has per-monitor compensation folded in.

const ZOOM_CHANNEL = 'zoom-changed'

/** Set once the window exists, so a scale change can be re-applied. */
let resyncZoom = null

const zoom = createZoomController({
  readScale: () => readStore()[ZOOM_KEY],
  writeScale: value => {
    const data = readStore()
    data[ZOOM_KEY] = value
    writeStore(data)
  },
  onChange: (scale, reason) => {
    console.log(`[Zoom] ${reason} → ${formatScale(scale)}`)
    // Re-apply through the DPI module rather than setting the zoom directly.
    try { resyncZoom?.(`user zoom ${formatScale(scale)}`) } catch (err) {
      console.warn('[Zoom] could not apply:', err?.message ?? err)
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ZOOM_CHANNEL, { scale, percent: formatScale(scale), reason })
    }
  },
  warn: (...a) => console.warn('[Zoom]', ...a),
})

ipcMain.handle('zoom:get', () => ({ scale: zoom.get(), percent: formatScale(zoom.get()) }))
ipcMain.handle('zoom:set', (_e, scale) => { zoom.set(scale); return zoom.get() })
ipcMain.handle('zoom:step', (_e, dir) => { zoom.step(dir > 0 ? 1 : -1); return zoom.get() })
ipcMain.handle('zoom:reset', () => { zoom.reset(); return zoom.get() })

ipcMain.handle('updates:check', () => checkForUpdates())
ipcMain.handle('updates:state', () => updateState)
ipcMain.handle('updates:restart', () => { restartAndInstall() })
ipcMain.handle('app:version', () => app.getVersion())

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#1a1008',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow = win
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })

  // Keep the UI the same physical size across monitors with different DPI
  // scaling, with the user's own zoom preference folded into the target.
  // Attached before the first load so the initial sync runs against the display
  // the window actually opened on, and at the saved scale.
  let detachDpi = null
  try {
    const dpi = attachDpiHandling(win, { getUserScale: () => zoom.get() })
    detachDpi = dpi.detach
    resyncZoom = dpi.resync
  } catch (err) {
    // Wrong physical size is a blemish; failing to open the window is not.
    console.warn('[DPI] could not attach per-monitor handling:', err?.message ?? err)
  }

  // Ctrl +/-/0. Bound on the window so they work with focus in the canvas.
  // Also tell a freshly-loaded renderer what the scale is, so the readout is
  // right from the start rather than only after the first keypress.
  let detachZoomKeys = null
  try {
    detachZoomKeys = attachZoomShortcuts(win, zoom)
    win.webContents.on('did-finish-load', () => zoom.announce())
  } catch (err) {
    // Same rule as the updater: a broken nicety must never stop the window.
    console.warn('[Zoom] could not bind shortcuts:', err?.message ?? err)
  }

  win.on('closed', () => {
    try { detachDpi?.() } catch { /* already gone */ }
    try { detachZoomKeys?.() } catch { /* already gone */ }
    resyncZoom = null
  })

  win.once('ready-to-show', () => win.show())

  // External links (e.g. anything that opens a new window) go to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (IS_DEV) {
    await win.loadURL(DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Packaged: dist ships next to the app (asar disabled). Unpackaged preview:
    // dist sits at the project root.
    const distRoot = path.join(__dirname, '..', 'dist')
    const server = await startStaticServer(distRoot)
    const { port } = server.address()
    await win.loadURL(`http://127.0.0.1:${port}/`)
  }
}

app.whenReady().then(createWindow)

// Check for updates AFTER the window is up, and off the startup path entirely.
// A slow or failing GitHub request must never delay the game appearing, so this
// is fired on a timer, unawaited, and independently guarded.
app.whenReady().then(() => {
  setTimeout(() => {
    try { checkForUpdates() } catch (err) {
      console.warn('[Update] startup check failed:', err?.message ?? err)
    }
  }, 4000)
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
