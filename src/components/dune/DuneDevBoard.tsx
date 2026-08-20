/**
 * A development view: the board, driven by the two phases that exist.
 *
 * Not the game UI. No auth, no multiplayer, no persistence — local state and the
 * pure phase functions, so the rules can be stepped through and watched.
 * Reached at ?dune.
 *
 * The board SVG is fetched and inlined rather than dropped in an <img>, so the
 * overlay can share its coordinate system exactly: markers sit at the numbers
 * boardData already holds, not at numbers measured off a picture.
 */
import { useEffect, useMemo, useState } from 'react'
import { DUNE_BOARD, DUNE_STORM_RING, DUNE_SECTORS, DUNE_TERRITORIES } from '@/data/dune/boardData'
import { resolveStorm, STORM_START, FIRST_STORM_ROLL, stormRollRange } from '@/lib/dune/storm'

import {
  buildSpiceDeck, shuffle, resolveSpiceBlow, applyBlowToBoard,
  beginDoubleSpiceBlow, placeFremenWorms,
} from '@/lib/dune/spiceBlow'
import type { SpiceCard, SpiceBlowAsk, SpiceBlowCarry, SpiceBlowStep } from '@/lib/dune/spiceBlow'
import { isAwaiting } from '@/lib/dune/phase'
import type { Awaiting } from '@/lib/dune/phase'
import type { Force, GameMode, SectorId, TerritoryId } from '@/types/Dune/Game'
import CharityPanel from './CharityPanel'

const { cx, cy } = DUNE_BOARD

function polar(bearing: number, r: number): [number, number] {
  const a = ((bearing - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

/** The storm marker: a wedge filling its sector of the ring the board draws. */
function stormWedge(sector: SectorId): string | null {
  const s = DUNE_SECTORS.find(x => x.id === sector)
  if (!s) return null
  const { inner, outer } = DUNE_STORM_RING
  let span = s.toBearing - s.fromBearing
  if (span < 0) span += 360
  const [x1, y1] = polar(s.fromBearing, inner)
  const [x2, y2] = polar(s.fromBearing, outer)
  const [x3, y3] = polar(s.fromBearing + span, outer)
  const [x4, y4] = polar(s.fromBearing + span, inner)
  const big = span > 180 ? 1 : 0
  return [
    'M', x1, y1, 'L', x2, y2,
    'A', outer, outer, 0, big, 1, x3, y3,
    'L', x4, y4,
    'A', inner, inner, 0, big, 0, x1, y1, 'Z',
  ].join(' ')
}

/** Where a stack stands: the cell for this (territory, sector). */
function cellAt(territoryId: string, sector: string) {
  const t = DUNE_TERRITORIES.find(x => x.id === territoryId)
  return t?.cells.find(c => c.sector === sector)?.at ?? t?.centroid ?? null
}

/** Stacks over sand, rock and strongholds, so the storm and the worm can be
 *  seen treating them differently. */
/**
 * Stacks over sand, rock and strongholds, owned alternately by the Fremen and
 * the Harkonnen — so a storm sweeping sand shows the two treated differently in
 * the advanced game and identically in the basic one.
 */
function seedForces(): Force[] {
  const take = (pred: (t: (typeof DUNE_TERRITORIES)[number]) => boolean, n: number) =>
    DUNE_TERRITORIES.filter(pred).slice(0, n)
  const chosen = [
    ...take(t => t.terrain === 'sand' && t.spiceBlow != null, 6),
    ...take(t => t.terrain === 'rock', 3),
    ...take(t => t.stronghold, 2),
  ]
  return chosen.flatMap((t, i) =>
    t.cells.map(c => ({
      faction: (i % 2 === 0 ? 'fremen' : 'harkonnen') as Force['faction'],
      territoryId: t.id as TerritoryId,
      sector: c.sector as SectorId,
      count: 3,
    })))
}

const panel = { border: '1px solid #ffffff22', borderRadius: 6, padding: 10, marginBottom: 10 }

export default function DuneDevBoard() {
  const [svg, setSvg] = useState<string | null>(null)
  const [storm, setStorm] = useState<SectorId>(STORM_START)
  const [turn, setTurn] = useState(1)
  const [roll, setRoll] = useState(3)
  const [forces, setForces] = useState<Force[]>(seedForces)
  const [mode, setMode] = useState<GameMode>('basic')
  const [spice, setSpice] = useState<Record<string, number>>({})
  const [deck, setDeck] = useState<SpiceCard[]>(() => shuffle(buildSpiceDeck(), Math.random))
  // Two piles, because the advanced game reveals two cards against two piles.
  // The basic game uses pile A alone, which is what it always did.
  const [discardA, setDiscardA] = useState<SpiceCard[]>([])
  const [discardB, setDiscardB] = useState<SpiceCard[]>([])
  // The phase, stopped mid-way, waiting for the Fremen. Null when nothing is
  // owed. While this is set the board is a picker and pile B is face down.
  const [pending, setPending] = useState<Awaiting<SpiceBlowAsk, SpiceBlowCarry> | null>(null)
  const [picks, setPicks] = useState<TerritoryId[]>([])
  // Where a worm surfaced this turn, so the board can show one.
  const [worms, setWorms] = useState<TerritoryId[]>([])
  const [log, setLog] = useState<string[]>(['Ready. Storm at sector-1.'])

  useEffect(() => {
    fetch('/dune-board.svg')
      .then(r => r.text())
      // Drop the fixed width/height so the board scales to its container off its
      // viewBox alone. Left in place it renders at its natural 970px, overflows,
      // and the overlay — which IS sized to the container — stops lining up with
      // it. The two must share one coordinate system or every marker is wrong.
      .then(t => t.replace(/<svg([^>]*)>/, (_m, attrs: string) =>
        '<svg' + attrs.replace(/\s(width|height)="[^"]*"/g, '') +
        ' width="100%" style="display:block">'))
      .then(setSvg)
      .catch(() => setSvg(null))
  }, [])

  const say = (line: string) => setLog(l => [line, ...l].slice(0, 40))
  const name = (id: string) => DUNE_TERRITORIES.find(t => t.id === id)?.displayName ?? id

  function advanceStorm() {
    const onBoard = Object.entries(spice).flatMap(([id, n]) => {
      const t = DUNE_TERRITORIES.find(x => x.id === id)
      return n > 0 && t?.spiceSector
        ? [{ territoryId: id as TerritoryId, sector: t.spiceSector as SectorId }]
        : []
    })
    const out = resolveStorm(storm, roll, forces, mode, onBoard)
    setStorm(out.to)
    setForces(out.forcesAfter)
    setSpice(s => {
      const next = { ...s }
      for (const id of out.spiceCleared) delete next[id]
      return next
    })
    // NOT setTurn here. The storm is phase 1 OF a turn, not the end of one —
    // advancing the counter here made every later phase in turn 1 believe it was
    // turn 2, so the spice blow stopped setting worms aside and refused the first
    // worm it drew against an empty discard. The turn ends when End turn says so.
    say(
      `Storm ${out.from} to ${out.to}, sweeping ${out.swept.length} sector(s). ` +
      `${out.killed.reduce((n, k) => n + k.count, 0)} force(s) to the tanks` +
      (out.casualties.some(c => c.survived > 0)
        ? ` (${out.casualties.filter(c => c.survived > 0).map(c => `${c.force.faction} kept ${c.survived}`).join(', ')})`
        : '') +
      (out.spiceCleared.length ? `, spice swept from ${out.spiceCleared.map(name).join(', ')}` : '') + '.',
    )
  }

  /**
   * Take a stopped-or-finished phase and put it on screen.
   *
   * The two halves of the seam meet here: a phase that stopped becomes a picker
   * on the board, and a phase that finished becomes state. Nothing else in this
   * component needs to know which of the two it is holding.
   */
  function handleStep(step: SpiceBlowStep) {
    if (isAwaiting(step)) {
      setPending(step)
      setPicks([])
      say(
        `pile ${step.ask.pile} handed back ${step.ask.worms} worm(s) — `
        + (step.ask.pile === 'A'
          ? 'pile B stays face down until the Fremen have placed them'
          : 'the turn ends once they are placed'),
      )
      return
    }
    const out = step.result
    setPending(null)
    setPicks([])
    setDeck(out.deck)
    setDiscardA(out.discardA)
    setDiscardB(out.discardB)
    // The phase returns the board rather than the caller rebuilding it: getting
    // here by hand means two placements and any number of devours, in order.
    setSpice(out.spiceOnBoard)
    setForces(f => f.filter(x => !out.toTanks.includes(x)))
    setWorms([...out.a.devoured, ...out.b.devoured, ...out.devouredByFremen]
      .map(d => d.territoryId as TerritoryId))
    say([
      out.ignored ? `${out.ignored} worm(s) set aside (turn 1)` : '',
      out.nexus ? 'NEXUS' : '',
      `A: ${out.a.placed ? `${out.a.placed.amount} on ${name(out.a.placed.territoryId)}` : '—'}`,
      `B: ${out.b.placed ? `${out.b.placed.amount} on ${name(out.b.placed.territoryId)}` : '—'}`,
      out.devouredByFremen.length
        ? `Fremen worms took ${out.devouredByFremen.map(d => name(d.territoryId)).join(', ')}`
        : '',
      out.reshuffled ? 'deck reshuffled' : '',
    ].filter(Boolean).join(' · '))
  }

  /** The Fremen answer, and the phase carries on from where it stopped. */
  function submitWorms(at: TerritoryId[]) {
    if (!pending) return
    try {
      handleStep(placeFremenWorms(pending.carry, at, Math.random))
    } catch (e) {
      say(`REFUSED: ${(e as Error).message}`)
    }
  }

  function drawSpice() {
    if (pending) {
      say('the phase is waiting on the Fremen — place or decline the worms first')
      return
    }
    try {
      if (mode === 'advanced') {
        handleStep(beginDoubleSpiceBlow({
          deck, discardA, discardB, forces, fremenInPlay: true,
          spiceOnBoard: spice, firstTurn: turn === 1, rng: Math.random,
        }))
        return
      }
      const out = resolveSpiceBlow({
        deck, discard: discardA, forces, mode, fremenInPlay: true,
        spiceOnBoard: spice, firstTurn: turn === 1, rng: Math.random,
      })
      setDeck(out.deck)
      setDiscardA(out.discard)
      setForces(f => f.filter(x => !out.toTanks.includes(x)))
      if (out.wormsForFremenToPlace) {
        say(`${out.wormsForFremenToPlace} worm(s) for the Fremen to place — not resolved here`)
      }
      // SET, not add, and the devoured lose theirs first. One call, because
      // doing it by hand is where the add-vs-set bug lived.
      setSpice(s => applyBlowToBoard(s, out))
      setWorms(out.devoured.map(d => d.territoryId as TerritoryId))
      say([
        out.ignored ? `${out.ignored} worm(s) ignored (turn 1)` : '',
        out.devoured.map(d =>
          `${name(d.territoryId)} devoured (${d.forcesKilled.reduce((n, k) => n + k.count, 0)} to the tanks`
          + (d.forcesSpared.length ? `, ${d.forcesSpared.reduce((n, k) => n + k.count, 0)} Fremen spared` : '')
          + ')').join('; '),
        out.placed ? `${out.placed.amount} spice on ${name(out.placed.territoryId)} in ${out.placed.sector}` : '',
      ].filter(Boolean).join(' — ') || 'nothing happened')
    } catch (e) {
      // The phase refuses states the rules cannot produce. Surfaced rather than
      // swallowed: that refusal is the interesting part.
      say(`REFUSED: ${(e as Error).message}`)
    }
  }

  function reset() {
    setDeck(shuffle(buildSpiceDeck(), Math.random))
    setDiscardA([])
    setDiscardB([])
    setPending(null)
    setPicks([])
    setWorms([])
    setSpice({})
    setForces(seedForces())
    setStorm(STORM_START)
    setTurn(1)
    setLog(['Reset.'])
  }

  const stacks = useMemo(() => {
    const byCell = new Map<string, { x: number; y: number; n: number }>()
    for (const f of forces) {
      const at = cellAt(f.territoryId, f.sector)
      if (!at) continue
      const key = `${f.territoryId}|${f.sector}`
      byCell.set(key, { x: at.x, y: at.y, n: (byCell.get(key)?.n ?? 0) + f.count })
    }
    return [...byCell.entries()]
  }, [forces])

  const wedge = stormWedge(storm)

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16, background: '#0d1220', minHeight: '100vh', color: '#f0e2bb' }}>
      <div style={{ position: 'relative', flex: '0 0 auto', width: 680 }}>
        {svg
          ? <div dangerouslySetInnerHTML={{ __html: svg }} />
          : <p>loading /dune-board.svg…</p>}
        <svg viewBox={DUNE_BOARD.viewBox} style={{
          position: 'absolute', inset: 0, width: '100%',
          // The board only takes clicks while the phase is stopped and waiting.
          pointerEvents: pending ? 'auto' : 'none',
        }}>
          {wedge && <path d={wedge} fill="#c9542a" fillOpacity="0.55" stroke="#f2d9a0" strokeWidth="2" />}
          {stacks.map(([key, s]) => (
            <g key={key}>
              <circle cx={s.x} cy={s.y} r="9" fill="#1d3f70" stroke="#f0e2bb" strokeWidth="1.5" />
              <text x={s.x} y={s.y} fontSize="10" fill="#f0e2bb" textAnchor="middle"
                dominantBaseline="central" fontFamily="Georgia, serif">{s.n}</text>
            </g>
          ))}
          {Object.entries(spice).map(([id, n]) => {
            const t = DUNE_TERRITORIES.find(x => x.id === id)
            const at = t ? cellAt(id, t.spiceSector ?? '') ?? t.centroid : null
            if (!at || n <= 0) return null
            return (
              <g key={id}>
                <circle cx={at.x + 15} cy={at.y - 13} r="10" fill="#c98a1e" stroke="#3f2c1a" strokeWidth="1.4" />
                <text x={at.x + 15} y={at.y - 13} fontSize="11" fill="#3f2c1a" textAnchor="middle"
                  dominantBaseline="central" fontWeight="bold" fontFamily="Georgia, serif">{n}</text>
              </g>
            )
          })}
          {/* A worm surfaced here this turn. */}
          {worms.map(id => {
            const t = DUNE_TERRITORIES.find(x => x.id === id)
            const at = t ? cellAt(id, t.spiceSector ?? '') ?? t.centroid : null
            if (!at) return null
            return (
              <image key={id} href="/icons/sandworm.svg"
                x={at.x - 20} y={at.y - 20} width="40" height="40" />
            )
          })}

          {/* While the phase waits, every territory is a target. */}
          {pending && DUNE_TERRITORIES.map(t => {
            const chosen = picks.includes(t.id as TerritoryId)
            return (
              <circle key={t.id} cx={t.centroid.x} cy={t.centroid.y} r={chosen ? 12 : 7}
                fill={chosen ? '#c9542a' : '#ffffff26'} stroke="#f0e2bb"
                strokeWidth={chosen ? 2 : 1} style={{ cursor: 'pointer' }}
                onClick={() => setPicks(p => p.includes(t.id as TerritoryId)
                  ? p.filter(x => x !== t.id)
                  : p.length < pending.ask.worms ? [...p, t.id as TerritoryId] : p)}>
                <title>{t.displayName}</title>
              </circle>
            )
          })}
        </svg>
      </div>

      <div style={{ flex: 1, fontFamily: 'system-ui', fontSize: 14, maxWidth: 420 }}>
        <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Dune — development view</h1>
        <p style={{ opacity: 0.7, margin: '0 0 14px' }}>
          storm <b>{storm}</b> · turn <b>{turn}</b> · deck <b>{deck.length}</b>
          {' '}· pile A <b>{discardA.length}</b>
          {mode === 'advanced' && <> · pile B <b>{discardB.length}</b></>}
        </p>

        <fieldset style={panel}>
          <legend>Game</legend>
          {/* Not a cosmetic toggle: the advanced game changes the storm's own
              range and what the Fremen lose to it. */}
          <label>
            <input type="checkbox" checked={mode === 'advanced'}
              onChange={e => setMode(e.target.checked ? 'advanced' : 'basic')} />
            {' '}advanced game
          </label>
        </fieldset>

        <fieldset style={panel}>
          <legend>Storm</legend>
          <label>
            roll{' '}
            <input type="number" value={roll} min={0} max={20} style={{ width: 60 }}
              onChange={e => setRoll(Number(e.target.value))} />
          </label>{' '}
          <button onClick={advanceStorm}>Advance storm</button>
          <p style={{ opacity: 0.6, margin: '8px 0 0' }}>
            turn 1 rolls {FIRST_STORM_ROLL.min}–{FIRST_STORM_ROLL.max}; later turns{' '}
            {stormRollRange(mode).min}–{stormRollRange(mode).max}
          </p>
        </fieldset>

        <fieldset style={panel}>
          <legend>Spice blow</legend>
          <button onClick={drawSpice} disabled={pending !== null}>
            {mode === 'advanced' ? 'Reveal both piles' : 'Draw a spice card'}
          </button>
          {mode === 'advanced' && !pending && (
            <p style={{ opacity: 0.6, margin: '8px 0 0' }}>
              Two piles off one deck. The phase stops between them if the Fremen
              have worms to place.
            </p>
          )}
        </fieldset>

        {/* The seam, made visible. The phase is stopped here — nothing else can
            proceed until the Fremen answer, which is the point. */}
        {pending && (
          <fieldset style={{ ...panel, borderColor: '#c9542a' }}>
            <legend>Fremen — place worms</legend>
            <p style={{ margin: '0 0 8px' }}>
              Pile {pending.ask.pile} handed back <b>{pending.ask.worms}</b> worm(s).{' '}
              {pending.ask.pile === 'A'
                ? 'Pile B is still face down.'
                : 'The turn ends once these are down.'}
            </p>
            <p style={{ margin: '0 0 8px', opacity: 0.75 }}>
              Click territories on the board — {picks.length}/{pending.ask.worms} chosen
              {picks.length ? ': ' + picks.map(name).join(', ') : ''}
            </p>
            <button onClick={() => submitWorms(picks)}>
              Place {picks.length} worm{picks.length === 1 ? '' : 's'}
            </button>{' '}
            {/* Legal: the rule says the worms CAN be placed, not must. */}
            <button onClick={() => submitWorms([])}>Decline</button>
          </fieldset>
        )}

        <CharityPanel say={say} />

        <fieldset style={panel}>
          <legend>Turn</legend>
          {/* Explicit, because a turn is nine phases and two of them exist. The
              counter only matters to the blow, which ignores worms on turn 1. */}
          <button onClick={() => { setTurn(t => t + 1); say(`— end of turn ${turn} —`) }}>
            End turn
          </button>{' '}
          <button onClick={reset}>Reset</button>
        </fieldset>

        <ol style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: 1.5 }}>
          {log.map((l, i) => (
            <li key={i} style={{ opacity: i ? 0.55 : 1, borderTop: '1px solid #ffffff14', padding: '5px 0' }}>{l}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}
