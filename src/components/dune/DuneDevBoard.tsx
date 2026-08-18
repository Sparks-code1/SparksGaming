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
import { resolveStorm, STORM_START, FIRST_STORM_ROLL, STORM_ROLL } from '@/lib/dune/storm'
import type { Occupied } from '@/lib/dune/storm'
import { buildSpiceDeck, shuffle, resolveSpiceBlow } from '@/lib/dune/spiceBlow'
import type { SpiceCard } from '@/lib/dune/spiceBlow'
import type { SectorId, TerritoryId } from '@/types/Dune/Game'

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
function seedForces(): Occupied[] {
  const take = (pred: (t: (typeof DUNE_TERRITORIES)[number]) => boolean, n: number) =>
    DUNE_TERRITORIES.filter(pred).slice(0, n)
  return [
    ...take(t => t.terrain === 'sand' && t.spiceBlow != null, 6),
    ...take(t => t.terrain === 'rock', 3),
    ...take(t => t.stronghold, 2),
  ].flatMap(t =>
    t.cells.map(c => ({ territoryId: t.id as TerritoryId, sector: c.sector as SectorId })))
}

const panel = { border: '1px solid #ffffff22', borderRadius: 6, padding: 10, marginBottom: 10 }

export default function DuneDevBoard() {
  const [svg, setSvg] = useState<string | null>(null)
  const [storm, setStorm] = useState<SectorId>(STORM_START)
  const [turn, setTurn] = useState(1)
  const [roll, setRoll] = useState(3)
  const [forces, setForces] = useState<Occupied[]>(seedForces)
  const [spice, setSpice] = useState<Record<string, number>>({})
  const [deck, setDeck] = useState<SpiceCard[]>(() => shuffle(buildSpiceDeck(), Math.random))
  const [discard, setDiscard] = useState<SpiceCard[]>([])
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
    const out = resolveStorm(storm, roll, forces, onBoard)
    setStorm(out.to)
    setForces(f => f.filter(x => !out.killed.includes(x)))
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
      `${out.killed.length} force(s) to the tanks` +
      (out.spiceCleared.length ? `, spice swept from ${out.spiceCleared.map(name).join(', ')}` : '') + '.',
    )
  }

  function drawSpice() {
    try {
      const out = resolveSpiceBlow({
        deck, discard, forces, spiceOnBoard: spice, firstTurn: turn === 1, rng: Math.random,
      })
      setDeck(out.deck)
      setDiscard(out.discard)
      setForces(f => f.filter(x => !out.toTanks.includes(x)))
      setSpice(s => {
        const next = { ...s }
        for (const d of out.devoured) delete next[d.territoryId]
        if (out.placed) next[out.placed.territoryId] = (next[out.placed.territoryId] ?? 0) + out.placed.amount
        return next
      })
      say([
        out.ignored ? `${out.ignored} worm(s) ignored (turn 1)` : '',
        out.devoured.map(d => `${name(d.territoryId)} devoured (${d.forcesKilled.length} to the tanks)`).join('; '),
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
    setDiscard([])
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
      byCell.set(key, { x: at.x, y: at.y, n: (byCell.get(key)?.n ?? 0) + 1 })
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
        <svg viewBox={DUNE_BOARD.viewBox} style={{ position: 'absolute', inset: 0, width: '100%', pointerEvents: 'none' }}>
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
        </svg>
      </div>

      <div style={{ flex: 1, fontFamily: 'system-ui', fontSize: 14, maxWidth: 420 }}>
        <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Dune — development view</h1>
        <p style={{ opacity: 0.7, margin: '0 0 14px' }}>
          storm <b>{storm}</b> · turn <b>{turn}</b> · deck <b>{deck.length}</b> · discard <b>{discard.length}</b>
        </p>

        <fieldset style={panel}>
          <legend>Storm</legend>
          <label>
            roll{' '}
            <input type="number" value={roll} min={0} max={20} style={{ width: 60 }}
              onChange={e => setRoll(Number(e.target.value))} />
          </label>{' '}
          <button onClick={advanceStorm}>Advance storm</button>
          <p style={{ opacity: 0.6, margin: '8px 0 0' }}>
            turn 1 rolls {FIRST_STORM_ROLL.min}–{FIRST_STORM_ROLL.max}; later turns {STORM_ROLL.min}–{STORM_ROLL.max}
          </p>
        </fieldset>

        <fieldset style={panel}>
          <legend>Spice blow</legend>
          <button onClick={drawSpice}>Draw a spice card</button>
        </fieldset>

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
