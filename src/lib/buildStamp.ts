/**
 * A human-readable stamp for WHICH build a window is running.
 *
 * Bumped by hand on every online-play fix. It exists because three rounds of
 * debugging were spent unsure whether a test window had reloaded into the
 * current code — the stamp is shown on the campaign screen and logged at
 * boot, so "are both windows on the same build" is answered by looking.
 */
export const BUILD_STAMP = 'S14 · 2026-08-08'
