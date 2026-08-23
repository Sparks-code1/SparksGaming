/**
 * A traitor card: a leader who will betray their own side.
 *
 * A CARD, not a disc. The disc is what a leader is ON THE BOARD — a counter you
 * move and put in the tanks. A traitor is a card in your hand, and the
 * difference matters more here than anywhere else on the screen: the disc says
 * who, and this has to say what happens too.
 *
 * AND IT TURNS OVER, for the same reason a real one does. Fitting both the face
 * and four sentences of rules on one side left the portrait a nineteen percent
 * band with the top of a head in it — cropped so hard you could not tell one
 * leader from another, which is the one thing the front must do at a glance.
 * The front is the face; the rules are on the back, where they have the whole
 * card and can be read at a comfortable size.
 *
 * The rules are the same on every one of them, which is why they live here
 * rather than in the data: they are printed on the card, not a property of the
 * leader. What varies is the face and the number.
 */
import { useState } from 'react'
import type { FactionId, Leader } from '@/types/Dune/Faction'
import { FACTION_LOOK } from './SeatLayer'
import { LEADER_PORTRAITS } from './LeaderDisc'

const PALE = '#f0e2bb'
const INK = '#2a1c10'
const SERIF = "Georgia, 'Times New Roman', serif"

/** Cards are 5:7, the ratio the generated card art uses. */
export const TRAITOR_CARD_W = 214

/**
 * What the card says, verbatim.
 *
 * Paragraphs rather than one string with newlines in it, because that is what
 * it has to become to be rendered, and splitting on a newline at render time is
 * a step that can go wrong for no gain.
 */
export const TRAITOR_RULES: readonly string[] = [
  'Reveal when Battle Plans are revealed if this leader is used by your opponent.',
  'You immediately win this battle and lose nothing (even if a Lasgun and Shield are revealed).',
  "Enemy leader is killed and you receive it's fighting strength in spice. "
  + 'Both players lose if both their leaders are traitors, and neither player gets any spice.',
]

/**
 * The back: what happens when they turn.
 *
 * Its own component so both faces can be rendered on their own. The claim worth
 * checking is that every line of the rules is on the card, and that is not
 * checkable on a face which only exists after a click.
 */
export function TraitorCardBack(
  { faction, width = TRAITOR_CARD_W }: { faction: FactionId; width?: number },
) {
  return (
    <div data-face="rules" style={{
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      padding: `${width * 0.06}px ${width * 0.065}px`,
      fontSize: width * 0.062, lineHeight: 1.34, color: INK,
    }}>
      {TRAITOR_RULES.map(line => (
        <p key={line.slice(0, 16)} style={{ margin: `0 0 ${width * 0.05}px` }}>{line}</p>
      ))}
      <span style={{ marginTop: 'auto', fontSize: width * 0.05, opacity: 0.5 }}>
        {FACTION_LOOK[faction].name} leader
      </span>
    </div>
  )
}

export function TraitorCard(
  { leader, faction, width = TRAITOR_CARD_W }:
  { leader: Leader; faction: FactionId; width?: number },
) {
  const [back, setBack] = useState(false)
  const look = FACTION_LOOK[faction]
  const portrait = LEADER_PORTRAITS[leader.name]
  const h = width * 1.4
  const pad = width * 0.055

  return (
    <div data-traitor={leader.name} role="button" tabIndex={0}
      aria-label={back
        ? `${leader.name}: what happens when they turn`
        : `${leader.name}, strength ${leader.strength}`}
      onClick={() => setBack(v => !v)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setBack(v => !v) }}
      style={{
        width, height: h, flex: '0 0 auto', cursor: 'pointer', position: 'relative',
        borderRadius: width * 0.05, overflow: 'hidden',
        background: '#f0e2bb', color: INK,
        border: `${Math.max(1, width * 0.012)}px solid ${look.colour}`,
        boxShadow: '0 6px 18px #0007',
        fontFamily: SERIF, display: 'flex', flexDirection: 'column',
      }}>
      {/* The band across the top: what the card is, and whose leader is on it.
          A traitor is only a traitor against the side that owns them. */}
      <div style={{
        background: look.colour, color: PALE,
        padding: `${width * 0.033}px ${width * 0.055}px`,
        fontSize: width * 0.072, letterSpacing: 0.8, display: 'flex',
        justifyContent: 'space-between', alignItems: 'baseline', flex: '0 0 auto',
      }}>
        <span>TRAITOR</span>
        <span style={{ opacity: 0.85, fontSize: width * 0.06 }}>{look.name.toUpperCase()}</span>
      </div>

      {back ? <TraitorCardBack faction={faction} width={width} /> : (
        <div data-face="portrait"
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* CONTAIN, not cover, on its own dark ground. The whole picture: a
              leader you cannot recognise is a front that has failed at the only
              job it has. */}
          <div style={{
            flex: 1, minHeight: 0, background: '#1a1208',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {portrait
              ? <img src={portrait.src} alt="" style={{
                  maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block',
                }} />
              // A leader with no portrait yet still needs a card. An initial
              // reads as a placeholder; a broken image reads as a fault.
              : <span style={{ fontSize: width * 0.4, opacity: 0.3, color: PALE }}>
                  {leader.name[0]}
                </span>}
          </div>

          <div style={{
            flex: '0 0 auto', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: pad,
            padding: `${pad * 0.5}px ${pad}px ${pad * 0.55}px`,
          }}>
            <b style={{ fontSize: width * 0.082, lineHeight: 1.1 }}>{leader.name}</b>
            {/* The strength, which is what you are paid in spice if they turn. */}
            <span data-strength={leader.strength} style={{
              flex: '0 0 auto', width: width * 0.16, height: width * 0.16,
              borderRadius: '50%', background: look.colour, color: PALE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: width * 0.09, fontWeight: 'bold',
            }}>{leader.strength}</span>
          </div>
        </div>
      )}

      {/* Says the card turns over, because otherwise nothing does. */}
      <span aria-hidden style={{
        position: 'absolute', right: width * 0.05, bottom: width * 0.03,
        fontSize: width * 0.06, opacity: 0.5, pointerEvents: 'none',
      }}>↻</span>
    </div>
  )
}

export default TraitorCard
