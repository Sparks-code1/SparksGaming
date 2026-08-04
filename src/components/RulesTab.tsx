import { useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import { WEAKNESS_POWERS } from '@/data/weaknessPowers'
import { MISSILE_POWERS } from '@/data/missilePowers'
import { MILESTONES } from '@/data/milestones'
import {
  CARD_TRADE_IN_VALUES, coinTradeInTroops, COIN_CARDS,
  MISSION_CARDS, PRIVATE_MISSION_CARDS,
} from '@/data/cards'
import { CONTINENT_BONUSES } from '@/data/territoryData'
import { CAMPAIGN_GAMES } from '@/lib/campaign'
import { LEAD_FACTION_WORLD_CAPITAL_TROOPS } from '@/lib/gameLogic'

const GOLD = '#C8940A'

const CONTINENT_NAMES: Record<string, string> = {
  'north-america': 'North America',
  'south-america': 'South America',
  'europe':        'Europe',
  'africa':        'Africa',
  'asia':          'Asia',
  'australia':     'Australia',
  'alien-island':  'Alien Island',
}

/**
 * The rulebook, assembled from the game's own data.
 *
 * Two rules govern this component:
 *
 *  1. Anything the code already defines — trade-in values, continent bonuses,
 *     missions, milestones, coin-deck size — is READ from that data, never
 *     retyped. A balance change to the data shows up here automatically instead
 *     of leaving the rules quietly wrong.
 *
 *  2. Content behind an unlock the campaign has not reached is never described.
 *     A locked section shows only how it is unlocked — the same convention the
 *     sealed-envelope Milestones tab uses — so reading the rules cannot spoil
 *     what is coming.
 */
export default function RulesTab({ legacy }: { legacy: LegacyState }) {
  const [open, setOpen] = useState<Set<string>>(new Set(['turn']))

  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // ── What this campaign has unlocked ──────────────────────────────────────
  const secondWin    = !!legacy.doubleWinnerMilestoneTriggered
  const aliens       = !!legacy.alienMilestoneTriggered
  const mutants      = !!legacy.nuclearMilestoneTriggered
  const worldCapital = !!legacy.worldCapitalTerritoryId

  return (
    <div>
      <SectionHead>Rules</SectionHead>
      <div style={{ fontSize: 10, color: '#5a4020', marginBottom: 14, fontStyle: 'italic' }}>
        Drawn from the game's own data, so it always matches what is actually played.
        Sections still sealed show only how to open them.
      </div>

      {/* ── Turn structure ─────────────────────────────────────────────── */}
      <Section id="turn" title="Turn Structure" open={open} toggle={toggle}>
        <Step n={1} name="Draft & Recruit">
          Add up your <B>population</B>: one for each territory you control, plus{' '}
          <B>+1</B> for every minor city and <B>+2</B> for every major city on
          those territories. Divide by 3, rounding down — minimum <B>3</B> troops.
          Then add the bonus for every continent you hold in full. You may also
          trade in cards for extra troops (see Cards).
          <Note>
            Destroyed cities count for nothing, and a city occupied by an HQ is
            not counted separately. The World Capital counts as exactly 5
            population on its own — its city stickers are not added on top.
          </Note>
          <Sub>Continent bonuses</Sub>
          <Table rows={Object.entries(CONTINENT_BONUSES)
            .filter(([id, v]) => v > 0 && (id !== 'alien-island' || aliens))
            .map(([id, v]) => [CONTINENT_NAMES[id] ?? id, `+${v}`])} />
          <Note>
            A continent bonus can be permanently changed by campaign events, so
            the number on the board is always the one that applies.
          </Note>
          <Note>
            <B>Naming bonus.</B> Whoever named a continent collects <B>+1</B> on
            top of its bonus whenever they hold it in full — nobody else does.
            The number on the nameplate is what everyone gets; a <B>★</B> beside
            it marks a named continent, and the name underneath is the player who
            collects the extra troop.
          </Note>
        </Step>
        <Step n={2} name="Attack">
          Attack any adjacent territory held by another player, as many times as
          you like. You need at least 2 troops in the attacking territory. Taking
          a territory by combat is a <B>conquest</B>; moving into an unoccupied
          one is an <B>expansion</B> and is not a conquest — several rules count
          only conquests. Conquer at least one territory and you draw a
          territory/resource card at the end of your turn.
        </Step>
        <Step n={3} name="Fortify">
          Move troops once between two connected territories you control, then
          your turn ends. Some faction abilities change when and where you may
          fortify.
        </Step>
      </Section>

      {/* ── Combat ─────────────────────────────────────────────────────── */}
      <Section id="combat" title="Combat & Dice" open={open} toggle={toggle}>
        <P>
          The attacker rolls up to <B>3</B> dice (one fewer than the troops in
          the attacking territory, maximum 3). The defender rolls up to <B>2</B>.
          Compare highest against highest, then second against second. The lower
          die loses a troop; <B>ties go to the defender</B>.
        </P>
        <P>
          Modifiers from scars, abilities and powers are applied to the dice
          after rolling — they are summed first and the result is capped to 1–6,
          so a bonus and a penalty cancel out rather than one being lost at the
          cap.
        </P>
        <Note>
          When the defender rolls only one die it counts as both their highest
          and their lowest, so a modifier naming either one applies to it.
        </Note>
        <Sub>Missiles</Sub>
        <P>
          You earn a <B>missile</B> for every game you win, and you start each
          game with as many as you have won. Either side may spend missiles
          during a battle: after the dice are rolled, turn one in to change any
          one of your dice to a <B>6</B>.
        </P>
        <Note>
          That 6 is <B>unmodified</B> — missiles are spent after every other
          modifier has already been applied, so nothing can reduce it afterwards.
          You may spend more than one in the same battle.
        </Note>
      </Section>

      {/* ── Red stars ──────────────────────────────────────────────────── */}
      <Section id="stars" title="Red Stars & Winning" open={open} toggle={toggle}>
        <P>
          <B>Red stars</B> win the game. The moment you hold <B>4</B>, the game
          ends immediately and you win it.
        </P>
        <P>
          You hold one star for every <B>HQ</B> you control — your own and any you
          have captured — so taking an enemy HQ moves a star from them to you.
          Further stars are earned during play, most often by completing missions.
        </P>
      </Section>

      {/* ── Cards ──────────────────────────────────────────────────────── */}
      <Section id="cards" title="Territory & Resource Cards" open={open} toggle={toggle}>
        <P>
          Conquer at least one territory during your turn and you draw one card
          at the end of it. There are two kinds, and both count as coins when you
          trade in.
        </P>
        <Sub>The two kinds</Sub>
        <P>
          A <B>territory card</B> names a specific territory and shows that
          territory's resource value. Holding the territory a card names is worth
          extra at draft time, and a card's value can be permanently{' '}
          <B>upgraded</B> during the campaign — the printed value is always what
          counts, so an upgraded card is worth more for the rest of the campaign.
        </P>
        <P>
          A <B>coin card</B> names no territory and is simply worth{' '}
          <B>1 coin</B>. There are only {COIN_CARDS.length} of them, and they
          circulate — coin cards you turn in go back into the resource pile to
          be drawn again.
        </P>
        <Note>
          If the pile ever empties — the <B>last coin card</B> is drawn out of
          it — whoever holds the most territories at that moment earns a{' '}
          <B>red star</B>. If two or more players are tied for the most, nobody
          earns it. Either way this happens <B>once per game</B>: if trade-ins
          refill the pile and it runs out again, no second star is awarded.
        </Note>
        <Sub>Trade-in track</Sub>
        <P>
          During your draft you may turn in any set of cards totalling{' '}
          <B>2 or more coins</B> for troops. More coins buy proportionally more:
        </P>
        <Table
          header={['Coins', 'Troops']}
          rows={CARD_TRADE_IN_VALUES.map((troops, i) => [
            String(i + 2) + (i === CARD_TRADE_IN_VALUES.length - 1 ? '+' : ''),
            String(troops),
          ])}
        />
        <Note>
          {CARD_TRADE_IN_VALUES.length + 1} coins and above all pay{' '}
          {coinTradeInTroops(CARD_TRADE_IN_VALUES.length + 1)} troops — there is
          no reward for hoarding past the top of the track.
        </Note>
      </Section>

      {/* ── Cities & HQs ───────────────────────────────────────────────── */}
      <Section id="cities" title="Cities & HQs" open={open} toggle={toggle}>
        <P>
          Every faction starts with an <B>HQ</B> on its starting territory. An HQ
          is worth a <B>red star</B> to whoever controls it, so capturing one
          takes that star from its owner.
        </P>
        <P>
          Winners found <B>cities</B> on the board. Cities add to the population
          you divide at draft time: <B>+1</B> for a minor city, <B>+2</B> for a
          major one. A player may start a later game on a city they founded
          themselves — never on someone else's. Moving into an unoccupied city
          costs troops on entry.
        </P>
      </Section>

      {/* ── Missions & red stars ───────────────────────────────────────── */}
      <Section id="missions" title="Missions" open={open} toggle={toggle}
        locked={!secondWin}
        lockHint="Sealed until a player signs the board for a second win.">
        <P>
          Completing a mission earns a <B>red star</B> — four of which win the
          game. You may complete at most <B>one mission per turn</B>, and claiming
          one means forgoing your card draw that turn.
        </P>
        <Sub>Missions in the deck</Sub>
        {MISSION_CARDS.map(m => (
          <div key={m.id} style={{ fontSize: 11.5, marginBottom: 4 }}>
            <span style={{ color: '#b09060', fontWeight: 'bold' }}>{m.name}</span>
            <span style={{ color: '#9a8a6a' }}> — {m.description}</span>
          </div>
        ))}
        {worldCapital ? (
          <>
            <Sub>Private missions</Sub>
            <P>
              Completing a private mission earns a red star and claims it as a
              permanent <B>star power</B> for your faction — the card is then
              destroyed so no one else can take it. A faction holding a star power
              can earn 1 extra star per game by completing it again.
            </P>
            {PRIVATE_MISSION_CARDS.map(m => (
              <div key={m.id} style={{ fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ color: '#E74C3C', fontWeight: 'bold' }}>{m.name}</span>
                <span style={{ color: '#9a8a6a' }}> — {m.description}</span>
              </div>
            ))}
          </>
        ) : (
          <Sealed>Further missions appear once the World Capital is founded.</Sealed>
        )}
      </Section>

      {/* ── Weakness / missile powers, only once their milestone is open ─ */}
      {aliens && (
        <Section id="weakness" title="Weakness Powers" open={open} toggle={toggle}>
          <P>Each faction takes one permanent weakness when the aliens arrive.</P>
          {WEAKNESS_POWERS.map(w => (
            <div key={w.id} style={{ fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: w.color, fontWeight: 'bold' }}>{w.name}</span>
              <span style={{ color: '#9a8a6a' }}> — {w.description}</span>
            </div>
          ))}
        </Section>
      )}
      {mutants && (
        <Section id="missiles" title="Missile Powers" open={open} toggle={toggle}>
          <P>Earned with in-game red stars. Each power is unique across factions.</P>
          {MISSILE_POWERS.map(p => (
            <div key={p.id} style={{ fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: '#d0a060', fontWeight: 'bold' }}>{p.name}</span>
              <span style={{ color: '#9a8a6a' }}> — {p.description}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ── Campaign ───────────────────────────────────────────────────── */}
      <Section id="campaign" title="The Campaign" open={open} toggle={toggle}>
        <P>
          A campaign runs <B>{CAMPAIGN_GAMES}</B> games. The player who signs the
          board most often wins the world — decided early if no one else can catch
          them. Winning a game lets you sign the board, found a city, and name a
          continent.
        </P>
        {worldCapital && (
          <P>
            The faction with the most wins is the <B>lead faction</B>: it picks the
            starting face-up mission and begins each game holding the World Capital
            with <B>{LEAD_FACTION_WORLD_CAPITAL_TROOPS}</B> troops. A tie for most
            wins means no lead faction.
          </P>
        )}
        <Sub>Milestones</Sub>
        <div style={{ fontSize: 10.5, color: '#6a5a3a', marginBottom: 7, fontStyle: 'italic' }}>
          Sealed envelopes reveal new rules when their condition is met.
        </div>
        {MILESTONES.map(m => {
          const unlocked = m.isUnlocked(legacy)
          return (
            <div key={m.id} style={{ fontSize: 11.5, marginBottom: 5 }}>
              {unlocked ? (
                <>
                  <span style={{ color: '#27AE60', fontWeight: 'bold' }}>✓ {m.name}</span>
                  <span style={{ color: '#9a8a6a' }}> — {m.reward}</span>
                </>
              ) : (
                <>
                  <span style={{ color: '#6a5030', fontWeight: 'bold' }}>🔒 Sealed</span>
                  {/* Only the condition. Naming the reward would spoil it. */}
                  <span style={{ color: '#6a5a3a' }}> — opens {m.unlock.replace(/^When /, 'when ')}</span>
                </>
              )}
            </div>
          )
        })}
      </Section>
    </div>
  )
}

// ─── Presentational helpers ────────────────────────────────────────────────

function Section({ id, title, open, toggle, locked, lockHint, children }: {
  id: string
  title: string
  open: Set<string>
  toggle: (id: string) => void
  locked?: boolean
  lockHint?: string
  children: React.ReactNode
}) {
  const isOpen = open.has(id) && !locked
  return (
    <div style={{
      border: `1px solid ${locked ? 'rgba(100,80,45,0.20)' : 'rgba(200,148,10,0.22)'}`,
      borderRadius: 8, marginBottom: 8, overflow: 'hidden',
      background: locked ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.22)',
      opacity: locked ? 0.6 : 1,
    }}>
      <button
        onClick={() => !locked && toggle(id)}
        disabled={locked}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 13px',
          background: 'none', border: 'none', cursor: locked ? 'default' : 'pointer',
          color: locked ? '#6a5030' : GOLD, fontFamily: 'Georgia, serif',
          fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8,
        }}>
        <span style={{ fontSize: 10, width: 10 }}>{locked ? '🔒' : isOpen ? '▾' : '▸'}</span>
        {title}
      </button>
      {locked && lockHint && (
        <div style={{ padding: '0 13px 11px 31px', fontSize: 11, color: '#6a5a3a', fontStyle: 'italic' }}>
          {lockHint}
        </div>
      )}
      {isOpen && <div style={{ padding: '0 13px 13px 13px' }}>{children}</div>}
    </div>
  )
}

const P = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11.5, color: '#9a8a6a', lineHeight: 1.6, marginBottom: 9 }}>{children}</div>
)

const B = ({ children }: { children: React.ReactNode }) => (
  <strong style={{ color: '#d8c9a8' }}>{children}</strong>
)

const Sub = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize: 10, color: '#6a5030', letterSpacing: 1.2, textTransform: 'uppercase',
    margin: '11px 0 6px',
  }}>{children}</div>
)

const Note = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize: 10.5, color: '#6a5a3a', fontStyle: 'italic', lineHeight: 1.5,
    borderLeft: '2px solid rgba(200,148,10,0.25)', paddingLeft: 8, margin: '8px 0',
  }}>{children}</div>
)

const Sealed = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize: 10.5, color: '#6a5030', fontStyle: 'italic', marginTop: 8,
    display: 'flex', alignItems: 'center', gap: 6,
  }}>
    <span>🔒</span>{children}
  </div>
)

function Step({ n, name, children }: { n: number; name: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#b09060', fontWeight: 'bold', marginBottom: 4 }}>
        {n}. {name}
      </div>
      <div style={{ paddingLeft: 12 }}>{children}</div>
    </div>
  )
}

function Table({ header, rows }: { header?: string[]; rows: string[][] }) {
  return (
    <div style={{ margin: '6px 0 8px', display: 'inline-block', minWidth: 180 }}>
      {header && (
        <div style={{ display: 'flex', fontSize: 10, color: '#6a5030', letterSpacing: 1, textTransform: 'uppercase', paddingBottom: 3, borderBottom: '1px solid rgba(200,148,10,0.18)' }}>
          {header.map((h, i) => <span key={i} style={{ width: i === 0 ? 70 : 60 }}>{h}</span>)}
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', fontSize: 11.5, color: '#9a8a6a', padding: '2px 0' }}>
          {r.map((cell, j) => (
            <span key={j} style={{ width: j === 0 ? 70 : 60, color: j === 0 ? '#9a8a6a' : '#d8c9a8' }}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, color: GOLD, letterSpacing: 1.5, textTransform: 'uppercase',
      marginBottom: 4,
    }}>{children}</div>
  )
}
