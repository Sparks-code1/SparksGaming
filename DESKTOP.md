# Risk Legacy — Windows desktop app (Electron)

The game is packaged as a standalone Windows application with Electron, so it
installs and runs like any desktop program — no browser, no terminal, no
`npm run dev`.

## Install & run (for players)

Build produces two artifacts in `release/`:

- **`Risk Legacy Setup <version>.exe`** — the installer (NSIS). Double-click,
  choose an install location, and it adds Start-menu + desktop shortcuts.
- **`Risk Legacy <version>.exe`** — a portable single executable (no install;
  just run it).

## Build the app (for you)

```bash
npm run dist
```

That runs `vite build` then `electron-builder --win`, producing the installer +
portable exe in `release/`. Use `npm run dist:dir` for a faster unpacked build
(a runnable folder in `release/win-unpacked/`, no installer) while iterating.

> **Gotcha:** don't leave the Vite **dev server** (`npm run dev` /
> `electron:dev`) running while you build the installer. Its file watcher holds
> handles on the files electron-builder writes into `release/`, which makes the
> Electron-extraction step fail with `EPERM: … rename win-unpacked.tmp`. Stop the
> dev server first (or build into a folder outside the project with
> `electron-builder --win -c.directories.output=C:/Temp/risk-release`).

## Develop with live reload

```bash
npm run electron:dev
```

Starts the Vite dev server and opens the app in an Electron window pointed at it
(HMR works, DevTools open detached).

## How it works

- `electron/main.cjs` — the main process. In a packaged build it serves the
  built `dist/` folder from a tiny **localhost HTTP server** and loads
  `http://127.0.0.1:<port>`. This is deliberate: the app fetches a couple of
  assets by absolute path (`/Risk_board_wiki.svg`, `/Risk_board.svg.png`), which
  `file://` can't resolve — a localhost origin makes them work exactly as they
  do on the web, and gives a real secure-context origin the Supabase client and
  Web Audio are happy with.
- `electron/preload.cjs` — minimal, security-hardened (`contextIsolation` on,
  `nodeIntegration` off). Exposes only a read-only `window.desktop` info object.
- External links open in the OS browser, not inside the app window.

## Notes

- **Supabase config is baked in at build time** from `.env`
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Rebuild after changing it.
  The app still needs internet to reach Supabase for saved-campaign persistence.
- **App icon:** none is set yet, so builds use the default Electron icon. To
  brand it, drop a 256×256+ `icon.ico` in a `build/` folder at the repo root
  (electron-builder picks it up automatically via `buildResources`).
- Build output (`release/`) is git-ignored.

## Auto-updates

The installed app updates itself from **GitHub Releases**
(`sparks-code1/risk-legacy-digital`), via `electron-updater`.

**What players see.** A few seconds after launch the app quietly checks for a
newer release. If there is one it downloads in the background — a small pill in
the bottom-left corner shows the progress — and when it is ready a dialog offers
to restart. Declining is fine: the update installs on next quit either way.
Hovering the pill reveals a **Check for updates** button for a manual check.

Updating is entirely optional. With no network, no GitHub, or no release
published yet, the check fails silently, the pill shows the failure, and the game
runs as normal — nothing on the startup path waits on it.

### Publishing a release

1. Bump `version` in `package.json` (updates are decided by version comparison,
   so this must go up).
2. Set a GitHub token with `repo` scope:
   ```bash
   export GH_TOKEN=ghp_your_token_here
   ```
3. Build and publish:
   ```bash
   npm run release
   ```

That uploads the installer plus the `latest.yml` manifest electron-updater reads.
Publish the GitHub release (not a draft) or clients will not see it.

> **Only the NSIS installer auto-updates.** The portable `.exe` has nowhere to
> install to, so portable users must download new versions manually.

> `npm run dist` still builds locally without publishing anything.


### If the update never arrives

Two things silently stop clients seeing a release. Both look like success locally.

1. **The release is a draft.** electron-builder creates drafts by default, and a
   draft is invisible to update clients — even on a public repo. The publish
   config sets `releaseType: release` so `npm run release` publishes directly.
   Drafts left over from earlier attempts must be published or deleted by hand
   on the GitHub releases page.

2. **The repo is private.** A client has no token, so every check 404s. The repo
   must be public for auto-update to work as configured.

Check what a client actually sees. This must return **200**:

```bash
curl -sI -o /dev/null -w "%{http_code}\n" https://github.com/sparks-code1/risk-legacy-digital/releases/latest/download/latest.yml
```

Also: the build fails if the Vite **dev server** is running — its file watcher
holds handles on `release/win-unpacked`, so electron-builder dies partway with
EPERM and leaves no artifacts at all. Stop the dev server first, then check that
`release/` actually contains `latest.yml` and a `Setup <version>.exe` before
assuming the publish step was the problem.
