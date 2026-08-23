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
  /** Whose it is. Null for the game's own announcements. */
  faction: FactionId | null
  /** Shown when there is no faction — 'Game', a spectator's name. */
  from?: string
  text: string
  /** Epoch ms. Injected like every other clock in this codebase. */
  at: number
}

export interface ChatPanelProps {
  messages: readonly ChatMessage[]
  collapsed: boolean
  onToggle(): void
  /** Absent for a spectator, who may read but not speak. */
  onSend?: (text: string) => void
  /** Shown on the spine while collapsed. */
  unread?: number
}

export function ChatPanel({ messages, collapsed, onToggle, onSend, unread = 0 }: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const foot = useRef<HTMLDivElement | null>(null)

  // Newest at the bottom, and the view follows it. Only while open — scrolling
  // a panel nobody can see is how a collapsed panel steals the page's scroll.
  useEffect(() => {
    if (!collapsed) foot.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, collapsed])

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
        {messages.map(m => (
          <p key={m.id} style={{ margin: '0 0 7px' }}>
            <b style={{ color: m.faction ? FACTION_LOOK[m.faction].colour : PALE }}>
              {m.faction ? FACTION_LOOK[m.faction].name : m.from ?? 'Game'}
            </b>
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
            onSend(text)
            setDraft('')
          }}
          style={{ display: 'flex', borderTop: '1px solid #ffffff1f' }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            aria-label="Message" placeholder="Say something…"
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none',
              color: PALE, padding: '8px 10px', fontSize: 12.5,
            }} />
          <button type="submit" style={{
            background: 'none', border: 'none', color: PALE, cursor: 'pointer',
            padding: '0 11px', fontSize: 13,
          }}>Send</button>
        </form>
      )}
    </section>
  )
}

export default ChatPanel
