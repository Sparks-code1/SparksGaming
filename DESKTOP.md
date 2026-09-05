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
(`sparks-code1/SparksGaming`), via `electron-updater`.

**The repo was renamed** from `risk-legacy-digital` (2026-08-27). Installed
builds from before the rename carry the old name in their baked-in
`app-update.yml` and reach releases through GitHub's rename redirect — checked
live, the old URL 301s to a 200. That redirect lasts only as long as no new
repository takes the old name, so `risk-legacy-digital` must never be reused
under this account while any pre-rename install is out there.

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
3. Build and upload:
   ```bash
   npm run release
   ```
4. **Publish the draft by hand** on the
   [releases page](https://github.com/sparks-code1/SparksGaming/releases).

That uploads the installer plus the `latest.yml` manifest electron-updater reads,
as a **draft**. Step 4 is not optional and not a tidy-up: a draft is invisible to
update clients, even on a public repo, so until it is published nobody's game
sees the new version.

> **Why a draft rather than a direct publish.** The config used to set
> `releaseType: release`, which publishes in one step — and it kept failing on
> the tag. Uploading to a draft and pressing publish afterwards works reliably,
> so the extra step buys a release that actually goes out. Changed 2026-09-03.

> **Only the NSIS installer auto-updates.** The portable `.exe` has nowhere to
> install to, so portable users must download new versions manually.

> **No blockmap, and no differential updates.** `nsis.differentialPackage` is
> `false`, so each update downloads the whole installer. That is not a
> regression: no published release has ever carried a `.blockmap`, and
> `latest.yml` has never carried the `blockMapSize` field that would make
> electron-updater ask for one, so deltas have never actually worked here.
>
> What the blockmap DID do was produce a second draft on every release. NSIS
> emitted it and the installer back to back with no build work between them, and
> electron-builder's publisher cache is written only after an `await` — so the
> second artifact arrived while the first was still inside that await, found an
> empty cache, and built a SECOND GitHub publisher. Each one then created its
> own draft, because GitHub allows any number of drafts to share a tag name.
> That is why every release since 0.3.4 produced two: one holding just the
> blockmap, one holding everything else.
>
> Turning the blockmap off leaves NSIS emitting a single artifact, which closes
> the window the second publisher was created in. It also drops
> `configureDifferentialAwareArchiveOptions` (1 MB dictionary, solid compression
> off), so the installer comes out slightly smaller. Changed 2026-09-05.
>
> To get deltas back, the blockmap has to reach the PUBLISHED release rather
> than the orphaned draft — which means building and uploading as separate
> steps: `npm run dist`, then upload all four files from `release/` by hand.

> **Pre-creating the draft does not help**, and one failure mode of it is
> silent. electron-builder does look for an existing draft, but it matches
> `tag_name` by exact string against `v<version>` and `<version>` — a draft
> saved from the web UI without confirming a tag has no tag name and is never
> found. Worse, if it finds a matching release that is NOT a draft, it uploads
> NOTHING and logs "GitHub release not created": re-running `npm run release`
> at a version you have already published looks like it worked and ships
> nothing.

> `npm run dist` still builds locally without publishing anything.


### If the update never arrives

Two things silently stop clients seeing a release. Both look like success locally.

1. **The release is still a draft.** A draft is invisible to update clients,
   even on a public repo — and `releaseType: draft` in the publish config means
   every release starts as one, on purpose. `npm run release` uploads; it does
   not publish. If the update never arrives, look here first: the odds are the
   draft is sitting on the releases page waiting for step 4 above.

   Drafts left over from abandoned attempts should be deleted rather than left
   about, so the one waiting to be published is the only one there.

2. **The repo is private.** A client has no token, so every check 404s. The repo
   must be public for auto-update to work as configured.

### Before chasing an online bug: are both screens on the same build?

The badge beside the green **Live** marker reads `v<version>+<commit>` — this
client's build, baked in at build time. Online, every client announces its own
over realtime presence, and the badge shows the table:

- `Live · v0.3.7+46cf45c · 2 here, same build` — everyone is on this build.
- `Live · v0.3.7+46cf45c · ⚠ Linda on 0.3.6+b980bc5` — she is not, and it is
  drawn as loudly as a dropped connection.

The **commit is part of the id on purpose**: the web app redeploys on every
push and the desktop app is cut from a release, so two screens can both say
0.3.7 and be running different code. That is what made the 2026-09-05 rewind
bug hard to place — nobody could say whether the two players were on the same
build. Read both badges first; a mismatch is the first thing to fix, and a
symptom that appears on one screen and not the other is exactly what one
looks like.

Check what a client actually sees. This must return **200**:

```bash
curl -sI -o /dev/null -w "%{http_code}\n" https://github.com/sparks-code1/SparksGaming/releases/latest/download/latest.yml
```

Also: the build fails if the Vite **dev server** is running — its file watcher
holds handles on `release/win-unpacked`, so electron-builder dies partway with
EPERM and leaves no artifacts at all. Stop the dev server first, then check that
`release/` actually contains `latest.yml` and a `Setup <version>.exe` before
assuming the publish step was the problem.
