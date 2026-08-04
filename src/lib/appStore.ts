/**
 * Small persistent key/value store for app-level pointers (which campaign is
 * active, and so on).
 *
 * In the desktop build this goes through the Electron bridge into userData.
 * That matters because the shell serves the window from
 * http://127.0.0.1:<ephemeral port>, and localStorage is partitioned per
 * origin — anything written under one launch's port is invisible on the next.
 * The browser build falls back to localStorage, which is stable there.
 *
 * The API is async because the desktop path crosses an IPC boundary.
 */

const bridge = () => (typeof window !== 'undefined' ? window.desktop?.store : undefined)

export async function storeGet(key: string): Promise<string | null> {
  const b = bridge()
  if (b) {
    try { return await b.get(key) } catch { return null }
  }
  try { return localStorage.getItem(key) } catch { return null }
}

export async function storeSet(key: string, value: string): Promise<void> {
  const b = bridge()
  if (b) {
    try { await b.set(key, value) } catch { /* non-fatal: a lost pointer only means the picker opens */ }
    return
  }
  try { localStorage.setItem(key, value) } catch { /* private mode / quota */ }
}

export async function storeRemove(key: string): Promise<void> {
  const b = bridge()
  if (b) {
    try { await b.remove(key) } catch { /* non-fatal */ }
    return
  }
  try { localStorage.removeItem(key) } catch { /* non-fatal */ }
}
