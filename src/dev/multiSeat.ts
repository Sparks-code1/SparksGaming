/**
 * Several seats in one browser, without weakening anything.
 *
 * The game is multiplayer-only, so playing a turn end to end normally means one
 * window per seat. This collapses that into one process — and the reason it is
 * safe is the thing worth being precise about:
 *
 *   THE SECRETS BOUNDARY IS A PROPERTY OF THE SESSION, NOT OF THE UI. A seat's
 *   match_secrets row is readable because RLS matches the row's player against
 *   the JWT presented. So this holds ONE AUTHENTICATED CLIENT PER SEAT, each
 *   signed in as that seat's own account, each with its own storageKey so they
 *   do not overwrite one another in a single origin. Switching seats switches
 *   which session is being read from. Nothing on the server changes, no policy
 *   is relaxed, and no request carries "act as" anything.
 *
 * That is the whole design. A toggle that merely changed which seat the UI
 * called "you" would show an empty tray, because this client would still hold
 * only its own secrets; and the ways of making one session see several seats —
 * an actAs parameter, a loosened policy, a service-role key in the browser —
 * all weaken the boundary in code that ships. scripts/check-seat-privacy.mjs
 * passes unchanged under this design, which is the test that says so.
 *
 * WHAT IT IS NOT. Every seat's secrets end up in one process's memory, so this
 * is not a spectator-proof mode: anyone at the machine sees everything. That is
 * true of six windows on one desk as well, so it is not a regression — but it
 * is a convenience boundary, and the security boundary is still RLS.
 *
 * Dev only, and it refuses to build a client outside a dev build.
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase'
import { startSecretsSync, readOwnSecrets } from '@/lib/secretsSync'
import type { Secrets, SecretsStatus } from '@/lib/secretsSync'
import type { FactionId } from '@/types/Dune/Faction'

/** One seat's sign-in, as supplied to the harness. */
export interface SeatLogin {
  faction: FactionId
  /**
   * The seat id in the match — 'p1'..'p6', matching match_players.player_id.
   *
   * NOT DunePlayerPublic.seat, which this used to name. That one is
   * 'player-position-N', the printed circle a player sits at on the board, and
   * it is a different thing entirely: this value is compared against the
   * player_id on the match_secrets row that arrives, to notice a row belonging
   * to somebody else.
   *
   * Getting it wrong does not fail quietly. Every row this seat legitimately
   * owns is then unrecognised, and the harness reports "RLS is not holding" —
   * an alarm about the security boundary raised by a typo in an env var.
   */
  seat: string
  email: string
  password: string
}

export interface SeatSession {
  login: SeatLogin
  client: SupabaseClient
  /** The authenticated user's id, which is what RLS matches rows against. */
  userId: string | null
  /**
   * THIS SEAT'S KEY IN THIS MATCH, read off its own match_players row.
   *
   * It used to be taken from VITE_DEV_SEATS, on the assumption that the line
   * naming the account also named its player_id. That held while the seat key
   * was something a script chose — the seeder still writes 'p1'..'p6' — but a
   * table opened through the LOBBY keys its seats by the account now, so the
   * env's answer is a guess and the guess reads an empty hand.
   *
   * Null until the row is read; the secrets channel does not open before then,
   * because a channel opened on the wrong key delivers nothing and says
   * nothing about why.
   */
  playerId: string | null
  secrets: Secrets | null
  status: SecretsStatus | 'signing-in' | 'failed'
  error?: string
}

/**
 * Refuse outside a dev build.
 *
 * Not a formality. The whole reason this is safe is that it is several real
 * sessions rather than one privileged one — but it still puts several accounts'
 * credentials in one page, which is a thing that should never be reachable from
 * a build a player runs. The guard is here AND the module is asserted to be
 * unreachable from production in tests/multiseattest.
 */
function assertDev(): void {
  if (!import.meta.env.DEV) {
    throw new Error('multiSeat is a development harness and must not run in a production build')
  }
}

/**
 * One client per seat, each with its own session storage.
 *
 * THE storageKey IS WHAT MAKES THIS POSSIBLE AT ALL. supabase-js persists its
 * session under a key derived from the project, so two clients on one origin
 * share it by default and the second sign-in evicts the first — which looks
 * exactly like the harness working, right up until the first seat's requests
 * start going out as the second seat.
 */
export function createSeatClient(seat: string): SupabaseClient {
  assertDev()
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  return createClient(SUPABASE_URL, anon, {
    auth: {
      storageKey: `sb-dev-seat-${seat}`,
      persistSession: true,
      autoRefreshToken: true,
      // Only one client may own the URL's auth fragment; these are not it.
      detectSessionInUrl: false,
    },
  })
}

/** What the harness hands back: how to stop, and how to re-read a seat's row. */
export interface MultiSeat {
  stop(): void
  /**
   * Re-read one seat's secrets from its own session, now.
   *
   * READ-YOUR-OWN-WRITES. The changefeed is the normal path and this does not
   * replace it, but a client that has just POSTed an action knows something
   * changed and should not be left waiting on a frame to find out what. A
   * dropped or delayed UPDATE then shows up as spice that never leaves the
   * winner's purse — the row is right in the database and wrong on the screen,
   * which is the most misleading way for this to fail.
   *
   * Goes through the SEAT'S OWN CLIENT, so it reads under the same RLS as
   * everything else and can only ever see that seat's row.
   */
  refresh(faction: FactionId): Promise<void>
}

/**
 * Sign every seat in and open its own secrets channel.
 *
 * Each seat is independent: one failing to sign in leaves the others working,
 * and says so, rather than taking the harness down — a missing test account is
 * the commonest thing to get wrong here.
 */
export function startMultiSeat(
  matchId: string,
  logins: readonly SeatLogin[],
  onChange: (sessions: SeatSession[]) => void,
): MultiSeat {
  assertDev()

  const sessions: SeatSession[] = logins.map(login => ({
    login, client: createSeatClient(login.seat), userId: null,
    playerId: null, secrets: null, status: 'signing-in',
  }))
  const stops: Array<() => void> = []
  let cancelled = false
  const publish = () => { if (!cancelled) onChange([...sessions]) }
  publish()

  for (const session of sessions) {
    void session.client.auth
      .signInWithPassword({ email: session.login.email, password: session.login.password })
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error) {
          session.status = 'failed'
          session.error = error.message
          publish()
          return
        }
        session.userId = data.user?.id ?? null

        // THE SEAT'S KEY, ASKED FOR RATHER THAN ASSUMED. RLS returns this
        // account's own roster row and no other, so the answer is this seat's
        // by construction. A match this account is not in returns nothing,
        // which is a failure worth saying out loud rather than a channel that
        // opens on a guessed key and stays silent forever.
        const { data: mine } = await session.client
          .from('match_players')
          .select('player_id')
          .eq('match_id', matchId)
          .maybeSingle()
        if (cancelled) return
        const playerId = (mine as { player_id?: string } | null)?.player_id ?? null
        if (!playerId) {
          session.status = 'failed'
          session.error = 'this account holds no seat in that match'
          publish()
          return
        }
        session.playerId = playerId

        stops.push(startSecretsSync(matchId, {
          client: session.client,
          // Its OWN seat. Passed so a row for anybody else is recognised as the
          // RLS failure it would be — the harness is the one place several
          // seats are in play at once, so it is the best place to notice.
          expectPlayerId: playerId,
          onSecrets: row => {
            session.secrets = row.data
            publish()
          },
          onForeignRow: row => {
            session.status = 'failed'
            session.error = `received seat ${row.playerId}'s row — RLS is not holding`
            publish()
          },
          onStatus: (status, message) => {
            session.status = status
            if (message) session.error = message
            publish()
          },
        }))
        publish()
      })
  }

  return {
    stop() {
      cancelled = true
      for (const stop of stops) stop()
      for (const session of sessions) void session.client.auth.signOut()
    },
    async refresh(faction) {
      const session = sessions.find(s => s.login.faction === faction)
      if (!session || cancelled || !session.playerId) return
      // THE SHARED READER, so the harness and the real screen cannot come to
      // disagree about what "read my own row" means. It goes through this
      // SEAT'S own client, which is what makes the harness safe, and on the key
      // the roster gave rather than the one the env guessed.
      const row = await readOwnSecrets(matchId, session.playerId, session.client)
      if (!row || cancelled) return
      // THE SAME OBJECTS the changefeed mutates, so the two paths cannot
      // disagree about what this seat holds. A copy kept beside them would be
      // a second answer, and the next published frame would silently win.
      session.secrets = row
      publish()
    },
  }
}

/**
 * Seat logins from the environment, or none.
 *
 * Read from Vite env vars so no credential is committed. The shape mirrors
 * scripts/check-seat-privacy.mjs, which already uses SEAT_A_EMAIL and friends —
 * one convention for "the test accounts", not two.
 *
 * VITE_DEV_SEATS is a semicolon-separated list of `faction,seat,email,password`,
 * where `seat` is the match_players.player_id — 'p1', 'p2' — and not the
 * board position. scripts/seed-dune-match.mjs prints the line ready to paste.
 */
export function seatLoginsFromEnv(): SeatLogin[] {
  const raw = import.meta.env.VITE_DEV_SEATS as string | undefined
  if (!raw) return []
  return raw.split(';').map(entry => entry.split(',').map(s => s.trim()))
    .filter(parts => parts.length === 4)
    .map(([faction, seat, email, password]) => ({
      faction: faction as FactionId, seat, email, password,
    }))
}
