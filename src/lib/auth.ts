import { supabase } from './supabase'

/**
 * Email/password authentication.
 *
 * Auth is OPTIONAL here. The game is fully playable without an account, so
 * nothing in this module may ever block play: every call resolves to a result
 * object rather than throwing, and an unreachable auth service is reported as a
 * message the UI can show next to a working "Continue Without Account" button.
 *
 * Email/password specifically — not OAuth — because the desktop build has no
 * browser to redirect out to and back from.
 */

export interface AuthUser {
  id: string
  email: string
}

export type AuthOutcome =
  | { ok: true; user: AuthUser }
  /** Signed up, but the account needs an email confirmation before sign-in. */
  | { ok: true; user: null; needsConfirmation: true; email: string }
  | { ok: false; message: string }

/** Map Supabase's error text to something a player can act on. */
function friendlyError(raw: string | undefined): string {
  const m = (raw ?? '').toLowerCase()
  if (!m) return 'Something went wrong. Please try again.'
  if (m.includes('invalid login credentials')) return 'That email and password do not match an account.'
  if (m.includes('email not confirmed')) return 'Check your email and confirm your account before signing in.'
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'An account with that email already exists — try signing in instead.'
  }
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'That email address is not valid.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts — wait a minute and try again.'
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('fetch')) {
    return 'Could not reach the sign-in service. You can still play without an account.'
  }
  return raw ?? 'Something went wrong. Please try again.'
}

function toUser(u: { id: string; email?: string | null } | null | undefined): AuthUser | null {
  return u ? { id: u.id, email: u.email ?? '' } : null
}

/** Basic client-side checks, so obvious mistakes never cost a round trip. */
export function validateCredentials(email: string, password: string): string | null {
  if (!email.trim()) return 'Enter your email address.'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'That email address is not valid.'
  if (password.length < 6) return 'Password must be at least 6 characters.'
  return null
}

export async function signIn(email: string, password: string): Promise<AuthOutcome> {
  const invalid = validateCredentials(email, password)
  if (invalid) return { ok: false, message: invalid }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    })
    if (error) return { ok: false, message: friendlyError(error.message) }
    const user = toUser(data.user)
    return user ? { ok: true, user } : { ok: false, message: 'Signed in but no account was returned.' }
  } catch (e) {
    return { ok: false, message: friendlyError(e instanceof Error ? e.message : String(e)) }
  }
}

export async function signUp(email: string, password: string): Promise<AuthOutcome> {
  const invalid = validateCredentials(email, password)
  if (invalid) return { ok: false, message: invalid }
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) return { ok: false, message: friendlyError(error.message) }
    // With email confirmation required, signUp returns a user but NO session.
    // Treat that as success-pending rather than as a sign-in.
    if (data.user && !data.session) {
      return { ok: true, user: null, needsConfirmation: true, email: email.trim() }
    }
    const user = toUser(data.user)
    return user ? { ok: true, user } : { ok: false, message: 'Account created but no session was returned.' }
  } catch (e) {
    return { ok: false, message: friendlyError(e instanceof Error ? e.message : String(e)) }
  }
}

export async function signOut(): Promise<{ ok: boolean; message?: string }> {
  try {
    const { error } = await supabase.auth.signOut()
    return error ? { ok: false, message: friendlyError(error.message) } : { ok: true }
  } catch (e) {
    return { ok: false, message: friendlyError(e instanceof Error ? e.message : String(e)) }
  }
}

/**
 * The signed-in user, or null. Never throws — if the auth service is down this
 * resolves to null and the app carries on without an account.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return toUser(data.session?.user)
  } catch {
    return null
  }
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onAuthChange(fn: (user: AuthUser | null) => void): () => void {
  try {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      fn(toUser(session?.user))
    })
    return () => data.subscription.unsubscribe()
  } catch {
    return () => {}
  }
}
