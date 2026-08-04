import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

/**
 * Where the auth session is kept.
 *
 * In the browser, localStorage is right. In the DESKTOP app it is not: the
 * Electron shell serves the bundle from http://127.0.0.1:<ephemeral port>, and
 * that port changes on every launch. localStorage is partitioned per origin, so
 * a session written under one port is invisible under the next — every restart
 * would look like a fresh sign-in.
 *
 * So when the desktop bridge is present we persist through it instead, into a
 * file in Electron's userData directory, which is stable across launches.
 * supabase-js accepts a promise-returning storage, so the IPC round trip is
 * fine. Falling back to localStorage keeps the web build unchanged.
 */
const desktopStore = typeof window !== 'undefined' ? window.desktop?.store : undefined

const sessionStorageAdapter = desktopStore
  ? {
      // supabase-js requires void-returning setters; the bridge returns a
      // success boolean, so swallow it here rather than widen the contract.
      getItem: (key: string) => desktopStore.get(key),
      setItem: async (key: string, value: string) => { await desktopStore.set(key, value) },
      removeItem: async (key: string) => { await desktopStore.remove(key) },
    }
  : undefined   // undefined = supabase-js default (localStorage)

/** Project URL, re-exported so callers that need to build a Functions URL do
 *  not each reach into `import.meta.env` (which only Vite defines). */
export const SUPABASE_URL = supabaseUrl

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Email/password only — there is no OAuth redirect to detect, and in the
    // desktop shell there is no browser to come back from.
    detectSessionInUrl: false,
    ...(sessionStorageAdapter ? { storage: sessionStorageAdapter } : {}),
  },
})
