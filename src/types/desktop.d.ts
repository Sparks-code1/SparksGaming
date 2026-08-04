/** Update lifecycle as reported by the Electron main process. */
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'current'      // up to date
  | 'downloading'
  | 'ready'        // downloaded, waiting for a restart
  | 'error'
  | 'disabled'     // dev run, or the updater is unavailable

export interface UpdateStatus {
  state: UpdateState
  /** Version being downloaded / ready to install. */
  version?: string
  /** Download progress, 0–100. */
  percent?: number
  /** Present on 'error'. */
  message?: string
  /** Present on 'disabled'. */
  reason?: string
  /** The version currently running. */
  appVersion?: string
}

/** The user's UI-scale preference, as applied. */
export interface ZoomInfo {
  /** 1 is default; the ladder runs 0.5 → 2.5. */
  scale: number
  /** Ready-to-display form, e.g. "110%". */
  percent: string
  /** What caused the change — 'zoom in' | 'zoom out' | 'reset' | 'set' | 'initial'. */
  reason?: string
}

/** Which monitor the window is on, and the zoom compensating for its DPI. */
export interface DisplayInfo {
  displayId: number
  /** OS scaling of the current display — 1 at 100%, 1.5 at 150%. */
  scaleFactor: number
  /** Zoom the main process applied to keep physical size constant. */
  zoomFactor: number
  displayCount: number
  scaleFactors: number[]
}

export interface DesktopBridge {
  isElectron: true
  version: string
  getAppVersion(): Promise<string>
  /** Read-only DPI diagnostics; rescaling happens in the main process. */
  getDisplayInfo(): Promise<DisplayInfo | null>
  /**
   * Overall UI scale (Ctrl +/- / Ctrl+0). The shortcuts live in the main
   * process; these exist for the readout and any in-app control.
   */
  zoom: {
    onChange(cb: (info: ZoomInfo) => void): () => void
    get(): Promise<ZoomInfo>
    set(scale: number): Promise<number>
    step(dir: number): Promise<number>
    reset(): Promise<number>
  }
  /**
   * Origin-independent storage, backed by a file in Electron's userData.
   * The window's port changes every launch, so localStorage cannot persist
   * anything across restarts — the auth session lives here instead.
   */
  store: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<boolean>
    remove(key: string): Promise<boolean>
  }
  updates: {
    onStatus(cb: (status: UpdateStatus) => void): () => void
    getState(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    restart(): Promise<void>
  }
}

declare global {
  interface Window {
    /** Present only when running inside the Electron desktop app. */
    desktop?: DesktopBridge
  }
}

export {}
