/**
 * This build's identity: `<version>+<commit>`, e.g. `0.3.7+46cf45c`.
 *
 * Baked in by vite.config.ts at build time. The version alone is not an
 * identity — the web app redeploys on every push and the desktop app is cut
 * from a release, so two clients can both say 0.3.7 and be running different
 * code. Which is what made the last online bug hard to place: nobody could
 * tell whether the two screens at the table were on the same build.
 *
 * Guarded with `typeof` rather than read bare, because the define exists only
 * when Vite builds the bundle: the unit suites run this module through tsx,
 * where the global is simply absent and a bare read would throw.
 */
export const BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev+nobuild'
