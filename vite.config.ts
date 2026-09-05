import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

/**
 * The build's identity, baked in at build time: `<version>+<commit>`.
 *
 * THE VERSION ALONE IS NOT AN IDENTITY. The web app redeploys on every push and
 * the desktop app is cut from a release, so two clients can both say 0.3.7 and
 * be different builds — which is exactly the case that made the last online
 * bug hard to place: nobody could tell whether the two screens at the table
 * were running the same code. The short commit is what distinguishes them.
 *
 * Vercel exposes the commit as an env var at deploy; a local build (dev, the
 * harness, electron-builder) asks git. A tree with no git at all still builds,
 * marked so nobody mistakes it for a release.
 */
const buildId = (() => {
  const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  const fromGit = () => {
    try { return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
    catch { return 'nogit' }
  }
  return `${version}+${fromEnv || fromGit()}`
})()

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
