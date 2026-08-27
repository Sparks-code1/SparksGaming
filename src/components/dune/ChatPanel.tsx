/**
 * Table talk, down the left.
 *
 * COLLAPSIBLE because Dune is a game of deals and the deals happen in here —
 * but not during a battle, when the board is the only thing anyone wants to
 * look at. Collapsed it keeps a thin spine with the unread count on it, so a
 * message arriving while it is shut is visible without being in the way.
 *
 * PRESENTATIONAL. It holds no transport, no subscription and no history: the
 * messages come in as a prop and a send goes out as a callback. Whatever
 * carries them is the caller's business, and keeping it out of here means the
 * panel can be rendered from a fixture in a test without a socket.
 *
 * Messages are shown in the sender's faction colour, which is the same colour
 * their seat is on the board and their row is in the HUD — three places, one
 * palette, no legend needed.
 */
import { useEffect, useRef, useState } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import { FACTION_LOOK } from './SeatLayer'

const PALE = '#f0e2bb'

/**
 * How wide the panel is, open and shut.
 *
 * Exported because the tray below has to line up with the BOARD, and where the
 * board starts is this width. Two copies of the number is how a tray ends up
 * centred on nothing in particular the first time one of them changes.
 */
export const CHAT_WIDTH = 250
export const CHAT_SHUT_WIDTH = 34
export const CHAT_MAX_WIDTH = 340
/** Below this a message is more line-breaks than words. */
export const CHAT_MIN_WIDTH = 196

export interface ChatMessage {
  id: string
  /**
   * Who this line was for. Absent means the whole table.
   *
   * A LABEL, NOT A FILTER — see scopeLabel. What a session receives is decided
   * by the select policy on match_chat, so a line being here means it was meant
   * for this seat; the scope tells the reader who ELSE heard it, which is most
   * of what decides whether they repeat it.
   */
  scope?: ChatScope
  /** The seat a player-scoped line was sent to, by player id. */
  toPlayer?: string
  /** Whose it is. Null for the game's own announcements. */
  faction: FactionId | null
  /** Shown when there is no faction — 'Game', a spectator's name. */
  from?: string
  text: string
  /** Epoch ms. Injected like every other clock in this codebase. */
  at: number
  /**
   * The one seat this line is for, or absent for the whole table.
   *
   * FOR THINGS THAT SAY SOMETHING ABOUT A SEAT'S HIDDEN STATE. "Not eligible
   * for charity" is the case that forced it: it is a sentence about how much
   * spice somebody has, and putting it in front of the table hands out exactly
   * what the three-store split exists to withhold. Announcing that they claimed
   * is public — the claim is; what it was worth, and why it was refused, is not.
   *
   * A NOTE ON WHERE THESE MAY COME FROM. A private line must never arrive
   * through matches.state, because that row reaches every client and marking a
   * message private does not make the transport private. These are written
   * locally, by the seat that made the request, out of the response it received
   * — which only it received. The field says who may SEE it; it is not a
   * delivery mechanism, and rendering is the last place to enforce privacy
   * rather than the first.
   */
  to?: FactionId
}

/**
 * Who a line was for, as the row says.
 *
 * A LABEL, NOT A FILTER. What a session receives is decided by the select
 * policy on match_chat — see lib/dune/duneChat — so a line being here means it
 * was meant for this seat. The marking tells the reader whether the rest of the
 * table heard it, which is most of what decides what they say next.
 */
export type ChatScope = 'table' | 'alliance' | 'player'

/** What the composer hands back: the scope, and who if it needs one. */
export type ChatSendScope =
  | { kind: 'table' }
  | { kind: 'alliance' }
  | { kind: 'player'; playerId: string }

export interface ChatPanelProps {
  messages: readonly ChatMessage[]
  /**
   * Which seat is reading, so private lines can be kept from everyone else.
   *
   * Null for a spectator, who sees only the public ones — which is right: a
   * spectator has no hidden state and is entitled to nobody else's.
   */
  seat?: FactionId | null
  collapsed: boolean
  onToggle(): void
  /** Absent for a spectator, who may read but not speak. */
  /**
   * Say something. The scope says who to.
   *
   * Absent for a spectator, who gets no composer at all rather than a box that
   * cannot be typed in.
   */
  onSend?: (text: string, scope: ChatSendScope) => void
  /**
   * Who is at the table, for addressing a line to one of them.
   *
   * Names rather than factions, because that is what a player recognises in a
   * dropdown — and it is the player id the row is keyed by. Empty means no
   * whispering, which is what a lobby-less or one-player table gets.
   */
  talkingTo?: readonly { playerId: string; name: string }[]
  /** Shown on the spine while collapsed. */
  unread?: number
}

/**
 * What this reader may see.
 *
 * Exported so the filtering can be tested directly rather than inferred from
 * rendered markup, and so the unread count can be taken from the same list the
 * panel shows — a badge counting lines the reader will never find is worse than
 * no badge.
 */
export function visibleTo(
  messages: readonly ChatMessage[], seat: FactionId | null | undefined,
): ChatMessage[] {
  // ABSENT `to` IS PUBLIC. Written this way round deliberately: a message is
  // shown unless it names somebody else, so a line that forgets the field is
  // public rather than invisible. The opposite default would hide game
  // announcements the moment anyone forgot to mark them.
  //
  // THIS FILTER IS ONLY FOR THE GAME'S OWN NOTICES. A line off the transport
  // was already decided by the select policy on match_chat — what a session may
  // not read never reaches it — and none of them carries `to` at all, so they
  // all pass here. A whisper you SENT arrives back the same way, because the
  // policy lets you read your own lines whatever their scope.
  //
  // A CLAUSE THAT ALMOST WENT IN HERE: `|| m.faction === seat`, to keep your own
  // lines. It was unnecessary — see above — and it leaked: a game notice has no
  // faction and a spectator has no seat, so null === null showed every private
  // notice to every spectator. The suite caught it. Left written down because
  // it looks obviously right.
  return messages.filter(m => m.to == null || m.to === seat)
}

/**
 * How a line is labelled, from the reader's side.
 *
 * Nothing is labelled for a line the whole table heard — the absence is the
 * message. Everything else says what kind of privacy it had, because a reader
 * deciding whether to repeat something needs to know who else already knows.
 */
export function scopeLabel(
  m: ChatMessage, seat: FactionId | null | undefined,
): string | null {
  if (m.scope === 'alliance') return 'alliance'
  if (m.scope === 'player') {
    return m.faction === seat ? `to ${m.toPlayer ?? 'them'}` : 'privately'
  }
  // The game's own notices, which never travelled at all.
  if (m.to != null) return 'only you'
  return null
}

export function ChatPanel({
  messages, seat, collapsed, onToggle, onSend, unread = 0, talkingTo = [],
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  /**
   * Who the next line is for.
   *
   * STICKY, deliberately. Scheming is a conversation rather than a remark, and
   * re-picking the recipient before every line is how somebody eventually sends
   * the wrong one to the whole table. It is shown beside the box at all times
   * so the stickiness is never a surprise.
   */
  const [scope, setScope] = useState<ChatScope>('table')
  const [toPlayer, setToPlayer] = useState<string | null>(null)
  const shown = visibleTo(messages, seat)
  const foot = useRef<HTMLDivElement | null>(null)

  // Newest at the bottom, and the view follows it. Only while open — scrolling
  // a panel nobody can see is how a collapsed panel steals the page's scroll.
  useEffect(() => {
    if (!collapsed) foot.current?.scrollIntoView({ block: 'end' })
  }, [shown.length, collapsed])

  if (collapsed) {
    return (
      <button data-layer="chat" data-collapsed="true" onClick={onToggle}
        aria-label={unread ? `Open chat, ${unread} unread` : 'Open chat'}
        style={{
          width: CHAT_SHUT_WIDTH, flex: '0 0 auto', cursor: 'pointer',
          background: '#131c2e', color: PALE, border: 'none',
          borderRight: '1px solid #ffffff1f', display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 12,
        }}>
        <span aria-hidden style={{ fontSize: 15 }}>›</span>
        <span style={{
          writingMode: 'vertical-rl', letterSpacing: 2, fontSize: 11,
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}>CHAT</span>
        {unread > 0 && (
          <span data-unread={unread} style={{
            background: '#c9542a', color: '#fff', borderRadius: 9, minWidth: 18,
            padding: '1px 5px', fontSize: 11, textAlign: 'center',
          }}>{unread}</span>
        )}
      </button>
    )
  }

  return (
    <section data-layer="chat" data-collapsed="false" aria-label="Chat"
      style={{
        // GROWS, up to a point. The board is bound by the window's height and
        // cannot use spare width, so on a wide screen it goes to the columns that
        // can — more of a conversation visible rather than more bare navy.
        width: CHAT_WIDTH, flex: '1 1 auto',
        minWidth: CHAT_MIN_WIDTH, maxWidth: CHAT_MAX_WIDTH,
        display: 'flex', flexDirection: 'column',
        background: '#131c2e', borderRight: '1px solid #ffffff1f', color: PALE,
      }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 10px', borderBottom: '1px solid #ffffff1f',
        fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: 1.4, fontSize: 12,
      }}>
        CHAT
        <button onClick={onToggle} aria-label="Collapse chat"
          style={{ background: 'none', border: 'none', color: PALE, cursor: 'pointer', fontSize: 15 }}>
          ‹
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', fontSize: 12.5 }}>
        {messages.length === 0 && (
          <p style={{ opacity: 0.5, margin: 0 }}>Nothing said yet.</p>
        )}
        {shown.map(m => (
          <p key={m.id} data-private={m.to ? 'true' : undefined}
            style={{
              margin: '0 0 7px',
              // MARKED AS PRIVATE WHERE IT IS READ. A line only you can see,
              // sitting in the same column as lines everyone can see, is one
              // people answer out loud — so it says so rather than relying on
              // the reader remembering which is which.
              ...(m.to ? {
                borderLeft: '2px solid #c9542a', paddingLeft: 7,
                background: '#c9542a12',
              } : null),
            }}>
            <b style={{ color: m.faction ? FACTION_LOOK[m.faction].colour : PALE }}>
              {m.faction ? FACTION_LOOK[m.faction].name : m.from ?? 'Game'}
            </b>
            {/* WHO ELSE HEARD IT. Nothing is shown for a line the table heard
                — the absence is the message — and everything else says what
                kind of privacy it had, because a reader deciding whether to
                repeat something needs to know who already knows. */}
            {scopeLabel(m, seat) && (
              <span style={{ opacity: 0.6 }}> · {scopeLabel(m, seat)}</span>
            )}
            {'  '}
            <span style={{ opacity: 0.92 }}>{m.text}</span>
          </p>
        ))}
        <div ref={foot} />
      </div>

      {/* A spectator gets no composer at all, rather than a disabled one: a box
          that cannot be typed in is an invitation followed by a refusal. */}
      {onSend && (
        <form
          onSubmit={e => {
            e.preventDefault()
            const text = draft.trim()
            if (!text) return
            // A PLAYER SCOPE WITH NOBODY NAMED would be a line the database
            // refuses and the sender thinks they sent. Fall back to the table
            // rather than swallowing it — saying it too loudly is recoverable,
            // saying it into nothing is not.
            onSend(text, scope === 'player' && toPlayer
              ? { kind: 'player', playerId: toPlayer }
              : scope === 'alliance' ? { kind: 'alliance' } : { kind: 'table' })
            setDraft('')
          }}
          style={{ borderTop: '1px solid #ffffff1f' }}>
          {/* WHO IT IS FOR, above the box and always visible. The scope is
              sticky — scheming is a conversation, not a remark — and a sticky
              setting you cannot see is how somebody eventually tells the whole
              table what they meant to whisper. */}
          <div data-layer="chat-scope" style={{
            display: 'flex', gap: 4, padding: '5px 8px 0', alignItems: 'center', flexWrap: 'wrap',
          }}>
            {([['table', 'Table'], ['alliance', 'Alliance']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setScope(k)}
                aria-pressed={scope === k} aria-label={`Say to ${label}`}
                style={{
                  background: scope === k ? '#ffffff1f' : 'transparent', color: PALE,
                  border: '1px solid #ffffff26', borderRadius: 4,
                  padding: '2px 7px', fontSize: 10.5, cursor: 'pointer',
                }}>{label}</button>
            ))}
            {talkingTo.length > 0 && (
              <select
                aria-label="Whisper to"
                value={scope === 'player' ? (toPlayer ?? '') : ''}
                onChange={e => {
                  const who = e.target.value
                  setToPlayer(who || null)
                  setScope(who ? 'player' : 'table')
                }}
                style={{
                  background: scope === 'player' ? '#ffffff1f' : 'transparent', color: PALE,
                  border: '1px solid #ffffff26', borderRadius: 4,
                  padding: '2px 5px', fontSize: 10.5,
                }}>
                <option value="">Whisper…</option>
                {talkingTo.map(p => (
                  <option key={p.playerId} value={p.playerId}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <div style={{ display: 'flex' }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            aria-label="Message"
            placeholder={scope === 'alliance' ? 'To your alliance…'
              : scope === 'player' ? 'Whisper…' : 'Say something…'}
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none',
              color: PALE, padding: '8px 10px', fontSize: 12.5,
            }} />
          <button type="submit" style={{
            background: 'none', border: 'none', color: PALE, cursor: 'pointer',
            padding: '0 11px', fontSize: 13,
          }}>Send</button>
          </div>
        </form>
      )}
    </section>
  )
}

export default ChatPanel
