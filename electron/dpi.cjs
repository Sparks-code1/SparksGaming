// Per-monitor DPI handling.
//
// The problem: drag the window from a 100% display to a 150% one and the text
// renders too small. Chromium picks a device scale factor for the display the
// window was created on, and on Windows it does not always re-render at the new
// one when the window crosses to a monitor with a different scale — so the UI
// keeps its old pixel size and shrinks physically on the denser screen.
//
// The fix is to MEASURE rather than assume. In Chromium:
//
//     window.devicePixelRatio === deviceScaleFactor * zoomFactor
//
// so `devicePixelRatio` is the ground truth for what the content is actually
// being rendered at. We want that to equal the current display's `scaleFactor`,
// which is what keeps the UI the same physical size on every monitor. Solving
// for the zoom we need:
//
//     nextZoom = currentZoom * (display.scaleFactor / devicePixelRatio)
//
// This is deliberately self-correcting and idempotent. On a setup where Chromium
// DOES track per-monitor DPI natively, devicePixelRatio already equals
// scaleFactor, the ratio is 1, and we leave the zoom exactly where it was — so
// this never double-scales. Where Chromium is stuck at the launch display's
// scale, the ratio compensates precisely.
//
// Everything here follows the same rule as the updater in main.cjs: DPI is a
// nicety, so every failure path must leave the app running normally.

/** Chromium refuses zoom outside roughly this range; clamp rather than throw. */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 5

/**
 * Below this relative change we leave the zoom alone. Re-applying a zoom forces
 * a relayout, and dragging a window generates a lot of near-identical events —
 * without a deadband the UI visibly churns.
 */
const ZOOM_EPSILON = 0.005

/** How long the window must stop moving before we react, in ms. */
const MOVE_DEBOUNCE_MS = 200

/**
 * The zoom factor that makes rendered content match `targetScaleFactor`.
 *
 * Pure, so the arithmetic can be tested without a second monitor. Returns null
 * when any input is unusable — a caller must then do nothing rather than apply
 * a garbage zoom.
 */
function computeZoom({ currentZoom, devicePixelRatio, targetScaleFactor }) {
  const usable = v => typeof v === 'number' && Number.isFinite(v) && v > 0
  if (!usable(currentZoom) || !usable(devicePixelRatio) || !usable(targetScaleFactor)) return null
  const next = currentZoom * (targetScaleFactor / devicePixelRatio)
  if (!Number.isFinite(next)) return null
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
}

/** Whether `next` differs from `current` enough to be worth applying. */
function zoomChanged(current, next) {
  if (next === null) return false
  if (!(current > 0)) return true
  return Math.abs(next - current) / current > ZOOM_EPSILON
}

/**
 * Attach per-monitor DPI handling to a window.
 *
 * `deps` exists for the test harness: it injects a fake `screen` and a fake
 * window so the whole flow can be driven without a real display.
 *
 * Returns a detach function.
 */
function attachDpiHandling(win, deps = {}) {
  // `screen` is only available after the app is ready, so it is required here
  // (attach is called from createWindow) rather than at module load.
  const screen = deps.screen ?? require('electron').screen
  const log = deps.log ?? ((...a) => console.log('[DPI]', ...a))
  const warn = deps.warn ?? ((...a) => console.warn('[DPI]', ...a))
  /**
   * The user's own UI-scale preference (Ctrl +/-), multiplied into the target.
   *
   * This module owns setZoomFactor, so the two cannot be set independently —
   * whichever wrote last would win, and a display sync would silently throw the
   * user's choice away. Folding the preference into the TARGET keeps both:
   * physical-size compensation and "I want everything 25% bigger" compose.
   */
  const getUserScale = deps.getUserScale ?? (() => 1)

  /** Display the window was last seen on, so we only react to real changes. */
  let lastDisplayId = null
  let lastScaleFactor = null
  let lastUserScale = null
  let moveTimer = null
  let applying = false
  let detached = false

  const alive = () => !detached && win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()

  function currentDisplay() {
    try {
      return screen.getDisplayMatching(win.getBounds())
    } catch (err) {
      warn('could not resolve the display:', err?.message ?? err)
      return null
    }
  }

  /**
   * Bring the rendered scale in line with the display the window is on.
   *
   * `force` re-applies even when the display has not changed — used after a
   * navigation, because the zoom factor does not survive a page load.
   */
  async function sync(reason, force = false) {
    if (!alive() || applying) return
    const display = currentDisplay()
    if (!display) return

    const userScale = getUserScale()
    const changed = display.id !== lastDisplayId
      || display.scaleFactor !== lastScaleFactor
      || userScale !== lastUserScale
    if (!changed && !force) return
    lastDisplayId = display.id
    lastScaleFactor = display.scaleFactor
    lastUserScale = userScale

    applying = true
    try {
      // devicePixelRatio already folds in whatever zoom is applied, so this
      // measures the real current state instead of trusting an assumption about
      // how Chromium handled the move.
      const dpr = await win.webContents.executeJavaScript('window.devicePixelRatio', true)
      if (!alive()) return
      const currentZoom = win.webContents.getZoomFactor()
      // Physical-size compensation × the user's preference.
      const target = display.scaleFactor * userScale
      const next = computeZoom({
        currentZoom,
        devicePixelRatio: dpr,
        targetScaleFactor: target,
      })
      if (!zoomChanged(currentZoom, next)) {
        log(`${reason}: display ${display.id} @ ${display.scaleFactor}x × user ${userScale} — already correct (dpr ${dpr}, zoom ${currentZoom})`)
        return
      }
      win.webContents.setZoomFactor(next)
      log(`${reason}: display ${display.id} @ ${display.scaleFactor}x × user ${userScale} — zoom ${currentZoom.toFixed(3)} → ${next.toFixed(3)} (dpr was ${dpr})`)
    } catch (err) {
      // A failed rescale leaves the window readable, just not perfectly sized.
      warn('rescale failed:', err?.message ?? err)
    } finally {
      applying = false
    }
  }

  /** Dragging emits `move` continuously; only act once it settles. */
  function onMoveish(reason) {
    return () => {
      if (moveTimer) clearTimeout(moveTimer)
      moveTimer = setTimeout(() => { moveTimer = null; sync(reason) }, MOVE_DEBOUNCE_MS)
    }
  }

  const handlers = {
    move: onMoveish('window moved'),
    // `moved` fires once at the end of a drag on Windows and macOS — the common
    // case, handled immediately rather than waiting out the debounce.
    moved: () => { if (moveTimer) { clearTimeout(moveTimer); moveTimer = null } sync('window moved') },
    // Snapping or resizing can also carry a window onto another display.
    resize: onMoveish('window resized'),
  }
  for (const [event, fn] of Object.entries(handlers)) win.on(event, fn)

  // Display topology or scale changed under us — e.g. the user changed the
  // scale in Settings, or docked a laptop. `display-metrics-changed` also fires
  // for the display the window is already on, so force a re-check.
  const onMetrics = () => sync('display metrics changed', true)
  const onDisplayAdded = () => sync('display added', true)
  const onDisplayRemoved = () => sync('display removed', true)
  screen.on('display-metrics-changed', onMetrics)
  screen.on('display-added', onDisplayAdded)
  screen.on('display-removed', onDisplayRemoved)

  // Zoom is not preserved across a page load, so re-apply once the content is up.
  const onLoad = () => sync('page loaded', true)
  win.webContents.on('did-finish-load', onLoad)

  // Establish the baseline for the display we launched on.
  sync('initial', true)

  function detach() {
    detached = true
    if (moveTimer) { clearTimeout(moveTimer); moveTimer = null }
    try {
      for (const [event, fn] of Object.entries(handlers)) win.removeListener(event, fn)
      win.webContents.removeListener('did-finish-load', onLoad)
    } catch { /* window already gone */ }
    screen.removeListener('display-metrics-changed', onMetrics)
    screen.removeListener('display-added', onDisplayAdded)
    screen.removeListener('display-removed', onDisplayRemoved)
  }

  // `resync` lets the zoom controller re-apply after the user changes their
  // preference — it must go through here, because this module owns the zoom.
  return { detach, resync: (reason = 'user zoom') => sync(reason, true) }
}

module.exports = {
  attachDpiHandling,
  computeZoom,
  zoomChanged,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_EPSILON,
  MOVE_DEBOUNCE_MS,
}
