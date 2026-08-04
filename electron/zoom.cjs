// User-controlled UI scale — Ctrl+Plus / Ctrl+Minus / Ctrl+0.
//
// This does NOT call setZoomFactor itself. dpi.cjs owns the zoom factor,
// because it also has to compensate for per-monitor DPI; if both wrote to it,
// the next display sync would silently discard the user's choice. Instead the
// preference is multiplied into the DPI module's target, so the two compose:
//
//     effective scale = display.scaleFactor × userScale
//
// Zooming this way — rather than scaling a CSS root font size — means the
// PixiJS canvas scales with everything else, since Chromium's zoom applies to
// the whole frame including canvas backing stores.

/** Chrome's ladder, which is what people's fingers already expect. */
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5]

const DEFAULT_SCALE = 1
const MIN_SCALE = ZOOM_STEPS[0]
const MAX_SCALE = ZOOM_STEPS[ZOOM_STEPS.length - 1]

/** Where the preference lives in the userData store (see main.cjs). */
const STORE_KEY = 'riskLegacy:uiScale'

/** A usable scale, or the default. Guards against a corrupt persisted value. */
function clampScale(value) {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return DEFAULT_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n))
}

/**
 * The next rung up (`dir > 0`) or down.
 *
 * Works from any starting value, not just an exact rung — a scale persisted by
 * an older build with a different ladder still steps sensibly instead of
 * snapping to an arbitrary index.
 */
function nextStep(current, dir) {
  const c = clampScale(current)
  const EPS = 1e-9
  if (dir > 0) return ZOOM_STEPS.find(s => s > c + EPS) ?? MAX_SCALE
  const below = ZOOM_STEPS.filter(s => s < c - EPS)
  return below.length > 0 ? below[below.length - 1] : MIN_SCALE
}

/** "110%" — for the on-screen readout. */
function formatScale(scale) {
  return `${Math.round(clampScale(scale) * 100)}%`
}

/**
 * Owns the preference and its persistence.
 *
 * `readScale`/`writeScale` are injected so this is testable without Electron,
 * and so main.cjs can keep using its single userData JSON file (the window's
 * origin has an ephemeral port, so localStorage cannot persist anything).
 */
function createZoomController({ readScale, writeScale, onChange, warn } = {}) {
  const warnFn = warn ?? ((...a) => console.warn('[Zoom]', ...a))
  let scale = DEFAULT_SCALE
  try {
    scale = clampScale(readScale?.())
  } catch (err) {
    warnFn('could not read the saved scale:', err?.message ?? err)
  }

  function apply(next, reason) {
    const clamped = clampScale(next)
    if (clamped === scale) return scale        // nothing to persist or re-render
    scale = clamped
    try {
      writeScale?.(scale)
    } catch (err) {
      // A failed write costs persistence, not the zoom itself.
      warnFn('could not save the scale:', err?.message ?? err)
    }
    try {
      onChange?.(scale, reason)
    } catch (err) {
      warnFn('zoom listener failed:', err?.message ?? err)
    }
    return scale
  }

  return {
    get: () => scale,
    set: v => apply(v, 'set'),
    step: dir => apply(nextStep(scale, dir), dir > 0 ? 'zoom in' : 'zoom out'),
    reset: () => apply(DEFAULT_SCALE, 'reset'),
    /** Re-emit without changing anything — used to push the initial value out. */
    announce: () => { try { onChange?.(scale, 'initial') } catch { /* ignore */ } },
  }
}

/**
 * Which zoom action a key event maps to, or null.
 *
 * Split out from the listener so every accelerator can be checked in a test.
 * Both the digit row and the numpad are accepted, and `=` counts as Plus
 * because that is the unshifted key people actually press.
 */
function zoomActionFor(input, platform = process.platform) {
  if (!input || input.type !== 'keyDown') return null
  const mod = platform === 'darwin' ? input.meta : input.control
  if (!mod || input.alt) return null
  const code = input.code ?? ''
  const key = input.key ?? ''
  if (code === 'Equal' || code === 'NumpadAdd' || key === '+' || key === '=') return 'in'
  if (code === 'Minus' || code === 'NumpadSubtract' || key === '-' || key === '_') return 'out'
  if (code === 'Digit0' || code === 'Numpad0' || key === '0') return 'reset'
  return null
}

/**
 * Bind the accelerators on a window. Returns a detach function.
 *
 * `before-input-event` is used rather than a global shortcut so the keys only
 * work while this window has focus, and rather than a renderer listener so they
 * still fire when focus is inside the PixiJS canvas. Chromium has its own
 * built-in Ctrl+/- zoom, which would move the zoom factor behind the DPI
 * module's back — preventDefault stops it so there is exactly one owner.
 */
function attachZoomShortcuts(win, controller, deps = {}) {
  const platform = deps.platform ?? process.platform
  const onInput = (event, input) => {
    const action = zoomActionFor(input, platform)
    if (!action) return
    event.preventDefault()
    if (action === 'in') controller.step(+1)
    else if (action === 'out') controller.step(-1)
    else controller.reset()
  }
  win.webContents.on('before-input-event', onInput)
  return function detach() {
    try { win.webContents.removeListener('before-input-event', onInput) } catch { /* gone */ }
  }
}

module.exports = {
  ZOOM_STEPS,
  DEFAULT_SCALE,
  MIN_SCALE,
  MAX_SCALE,
  STORE_KEY,
  clampScale,
  nextStep,
  formatScale,
  createZoomController,
  attachZoomShortcuts,
  zoomActionFor,
}
