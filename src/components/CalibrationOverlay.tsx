import React, { useState, useRef } from 'react'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT } from '@/data/territoryData'

interface CalibPoint { x: number; y: number }

interface Props {
  containerRef: React.RefObject<HTMLDivElement>
  onClose: () => void
}

// Half-sizes for hit boxes by territory (tweak per-continent for sensible defaults)
const HW: Record<string, [number, number]> = {
  'alaska': [55, 65], 'northwest-territory': [75, 58], 'greenland': [68, 58],
  'alberta': [48, 40], 'ontario': [48, 40], 'quebec': [40, 40],
  'western-us': [52, 40], 'eastern-us': [48, 40], 'central-america': [50, 32],
  'venezuela': [52, 28], 'peru': [40, 45], 'brazil': [62, 65], 'argentina': [52, 48],
  'iceland': [32, 25], 'great-britain': [28, 32], 'scandinavia': [40, 48],
  'northern-europe': [48, 38], 'western-europe': [28, 34], 'southern-europe': [52, 32],
  'ukraine': [60, 88],
  'north-africa': [96, 55], 'egypt': [40, 58], 'east-africa': [44, 68],
  'congo': [72, 55], 'south-africa': [72, 65], 'madagascar': [28, 50],
  'ural': [48, 80], 'siberia': [52, 60], 'yakutsk': [30, 55], 'kamchatka': [44, 80],
  'irkutsk': [58, 37], 'mongolia': [80, 28], 'japan': [40, 43],
  'afghanistan': [52, 45], 'china': [80, 40], 'middle-east': [37, 55],
  'india': [60, 50], 'southeast-asia': [90, 45],
  'indonesia': [72, 28], 'new-guinea': [48, 38],
  'western-australia': [60, 78], 'eastern-australia': [52, 78],
}

const CONTINENT_SECTIONS: { label: string; color: string; ids: string[] }[] = [
  { label: 'North America', color: '#9BBF30', ids: ['alaska','northwest-territory','greenland','alberta','ontario','quebec','western-us','eastern-us','central-america'] },
  { label: 'South America', color: '#CC3322', ids: ['venezuela','peru','brazil','argentina'] },
  { label: 'Europe',        color: '#44AACC', ids: ['iceland','great-britain','scandinavia','northern-europe','western-europe','southern-europe','ukraine'] },
  { label: 'Africa',        color: '#8B6914', ids: ['north-africa','egypt','east-africa','congo','south-africa','madagascar'] },
  { label: 'Asia',          color: '#44AA44', ids: ['ural','siberia','yakutsk','kamchatka','irkutsk','mongolia','japan','afghanistan','china','middle-east','india','southeast-asia'] },
  { label: 'Australia',     color: '#8844CC', ids: ['indonesia','new-guinea','western-australia','eastern-australia'] },
]

// Ordered list matching calibration sequence
const ORDERED_IDS = CONTINENT_SECTIONS.flatMap(s => s.ids)

function nameOf(id: string): string {
  return TERRITORY_DEFINITIONS.find(d => d.id === id)?.name ?? id
}

function hwOf(id: string): [number, number] {
  return HW[id] ?? [48, 38]
}

export default function CalibrationOverlay({ containerRef, onClose }: Props) {
  const [points, setPoints] = useState<Record<string, CalibPoint>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [screenDots, setScreenDots] = useState<Array<{ sx: number; sy: number; num: number; id: string }>>([])
  const clickNum = useRef(0)

  const total = ORDERED_IDS.length
  const done = Object.keys(points).length
  const allDone = done === total
  const currentId = ORDERED_IDS[currentIdx] ?? null

  function toMapCoords(e: React.MouseEvent): { mapX: number; mapY: number; sx: number; sy: number } | null {
    if (!containerRef.current) return null
    const rect = containerRef.current.getBoundingClientRect()
    const sw = rect.width, sh = rect.height
    const scale = Math.min(sw / MAP_WIDTH, sh / MAP_HEIGHT)
    const offX = (sw - MAP_WIDTH * scale) / 2
    const offY = (sh - MAP_HEIGHT * scale) / 2
    const mapX = Math.round((e.clientX - rect.left - offX) / scale)
    const mapY = Math.round((e.clientY - rect.top  - offY) / scale)
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    return { mapX, mapY, sx, sy }
  }

  function handleMapClick(e: React.MouseEvent) {
    if (allDone || !currentId) return
    const coords = toMapCoords(e)
    if (!coords) return
    const { mapX, mapY, sx, sy } = coords
    clickNum.current += 1
    setPoints(prev => ({ ...prev, [currentId]: { x: mapX, y: mapY } }))
    setScreenDots(prev => [...prev, { sx, sy, num: clickNum.current, id: currentId }])
    // Advance to next uncalibrated
    let next = currentIdx + 1
    while (next < total && points[ORDERED_IDS[next]] !== undefined) next++
    setCurrentIdx(next)
    console.log(`[CAL] #${clickNum.current} ${currentId}: (${mapX}, ${mapY})`)
  }

  function handleUndo() {
    if (done === 0) return
    // Find the last calibrated entry
    let lastIdx = currentIdx - 1
    while (lastIdx >= 0 && points[ORDERED_IDS[lastIdx]] === undefined) lastIdx--
    if (lastIdx < 0) return
    const lastId = ORDERED_IDS[lastIdx]
    setPoints(prev => { const n = { ...prev }; delete n[lastId]; return n })
    setScreenDots(prev => prev.filter(d => d.id !== lastId))
    setCurrentIdx(lastIdx)
  }

  function generateExport(): string {
    const lines: string[] = []
    lines.push(`import type { Territory, ContinentId } from '@/types/territory'`)
    lines.push(``)
    lines.push(`// Canvas dimensions match the Risk board image exactly: /public/Risk_board.svg.png`)
    lines.push(`export const MAP_WIDTH  = 960`)
    lines.push(`export const MAP_HEIGHT = 665`)
    lines.push(``)
    lines.push(`export const CONTINENT_COLORS: Record<ContinentId, number> = {`)
    lines.push(`  'north-america': 0x9BBF30,`)
    lines.push(`  'south-america': 0xCC3322,`)
    lines.push(`  'europe':        0x44AACC,`)
    lines.push(`  'africa':        0x8B6914,`)
    lines.push(`  'asia':          0x44AA44,`)
    lines.push(`  'australia':     0x8844CC,`)
    lines.push(`}`)
    lines.push(``)
    lines.push(`export const CONTINENT_BONUSES: Record<ContinentId, number> = {`)
    lines.push(`  'north-america': 5,`)
    lines.push(`  'south-america': 2,`)
    lines.push(`  'europe':        5,`)
    lines.push(`  'africa':        3,`)
    lines.push(`  'asia':          7,`)
    lines.push(`  'australia':     2,`)
    lines.push(`}`)
    lines.push(``)
    lines.push(`type TerritoryDef = Omit<Territory, 'occupyingPlayerId' | 'troops' | 'scars' | 'cities'> & {`)
    lines.push(`  polygon: number[][]`)
    lines.push(`}`)
    lines.push(``)
    lines.push(`// ─── Helpers ──────────────────────────────────────────────────────────────────`)
    lines.push(``)
    lines.push(`/** Rectangle hit area: top-left (x1,y1) → bottom-right (x2,y2) */`)
    lines.push(`function r(x1: number, y1: number, x2: number, y2: number): number[][] {`)
    lines.push(`  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]`)
    lines.push(`}`)
    lines.push(`function lbl(x: number, y: number) { return { labelX: x, labelY: y } }`)
    lines.push(``)
    lines.push(`// ─── Territory definitions ────────────────────────────────────────────────────`)
    lines.push(`// All coordinates are pixel positions on the 960×665 Risk_board.svg.png image.`)
    lines.push(`// polygon = rectangular hit area; labelX/Y = troop bubble center.`)
    lines.push(``)
    lines.push(`export const TERRITORY_DEFINITIONS: TerritoryDef[] = [`)
    lines.push(``)

    for (const section of CONTINENT_SECTIONS) {
      lines.push(`  // ── ${section.label} ${'─'.repeat(Math.max(0, 68 - section.label.length))}`)
      for (const id of section.ids) {
        const def = TERRITORY_DEFINITIONS.find(d => d.id === id)!
        const pt = points[id]
        const cx = pt?.x ?? def.labelX
        const cy = pt?.y ?? def.labelY
        const [hw, hh] = hwOf(id)
        const x1 = cx - hw, y1 = cy - hh, x2 = cx + hw, y2 = cy + hh
        const adj = def.adjacentIds.map(a => `'${a}'`).join(', ')
        lines.push(`  {`)
        lines.push(`    id: '${id}', name: '${def.name}', continentId: '${def.continentId}', shape: '',`)
        lines.push(`    ...lbl(${cx}, ${cy}),`)
        lines.push(`    polygon: r(${x1}, ${y1}, ${x2}, ${y2}),`)
        lines.push(`    adjacentIds: [${adj}],`)
        lines.push(`  },`)
      }
      lines.push(``)
    }

    lines.push(`]`)
    lines.push(``)
    lines.push(`export function buildTerritory(`)
    lines.push(`  def: TerritoryDef & { polygon: number[][] },`)
    lines.push(`  overrides?: Partial<Territory>,`)
    lines.push(`): Territory {`)
    lines.push(`  return {`)
    lines.push(`    id: def.id,`)
    lines.push(`    name: def.name,`)
    lines.push(`    continentId: def.continentId,`)
    lines.push(`    shape: JSON.stringify(def.polygon),`)
    lines.push(`    labelX: def.labelX,`)
    lines.push(`    labelY: def.labelY,`)
    lines.push(`    adjacentIds: def.adjacentIds,`)
    lines.push(`    occupyingPlayerId: null,`)
    lines.push(`    troops: 0,`)
    lines.push(`    scars: [],`)
    lines.push(`    cities: [],`)
    lines.push(`    ...overrides,`)
    lines.push(`  }`)
    lines.push(`}`)

    return lines.join('\n')
  }

  function handleExport() {
    const content = generateExport()
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'territoryData.ts'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleCopyExport() {
    navigator.clipboard.writeText(generateExport())
      .then(() => alert('Copied to clipboard!'))
      .catch(() => alert('Copy failed — use Download instead'))
  }

  const currentName = currentId ? nameOf(currentId) : null

  return (
    <>
      {/* Click capture layer */}
      <div
        onClick={handleMapClick}
        style={{
          position: 'absolute', inset: 0, zIndex: 80,
          cursor: allDone ? 'default' : 'crosshair',
        }}
      />

      {/* Red dots + numbered labels */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 81, pointerEvents: 'none' }}>
        {screenDots.map((dot, i) => (
          <React.Fragment key={i}>
            <div style={{
              position: 'absolute',
              left: dot.sx - 5, top: dot.sy - 5,
              width: 10, height: 10, borderRadius: '50%',
              background: '#ff2222', boxShadow: '0 0 3px #000',
            }} />
            <div style={{
              position: 'absolute',
              left: dot.sx + 8, top: dot.sy - 9,
              fontSize: 10, color: '#ff2222', fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.72)', padding: '1px 4px', borderRadius: 3,
              whiteSpace: 'nowrap', lineHeight: 1.4,
            }}>
              {dot.num}. {nameOf(dot.id)}
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Sidebar panel */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: 220, zIndex: 82,
        background: 'rgba(10,8,4,0.93)',
        borderLeft: '1px solid rgba(200,148,10,0.30)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Georgia, serif', color: '#E8DCC8',
        overflowY: 'auto',
      }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid rgba(200,148,10,0.20)' }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#C8940A', marginBottom: 4 }}>
            🎯 Calibration Mode
          </div>
          <div style={{ fontSize: 10, color: '#7a6040' }}>
            {done}/{total} territories placed
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: '#1a1208', borderRadius: 2, marginTop: 6 }}>
            <div style={{ height: '100%', width: `${(done / total) * 100}%`, background: '#C8940A', borderRadius: 2, transition: 'width 0.2s' }} />
          </div>
        </div>

        {/* Current target */}
        {!allDone && currentName && (
          <div style={{
            margin: '8px 10px', padding: '8px 10px', borderRadius: 6,
            background: 'rgba(200,148,10,0.10)', border: '1px solid rgba(200,148,10,0.40)',
            fontSize: 11,
          }}>
            <div style={{ color: '#7a6040', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Click on map →</div>
            <div style={{ color: '#E8DCC8', fontWeight: 'bold' }}>{currentName}</div>
            <div style={{ color: '#7a6040', fontSize: 9, marginTop: 2 }}>#{currentIdx + 1} of {total}</div>
          </div>
        )}

        {allDone && (
          <div style={{ margin: '8px 10px', padding: '8px 10px', borderRadius: 6, background: 'rgba(39,174,96,0.15)', border: '1px solid rgba(39,174,96,0.40)', fontSize: 11, color: '#27AE60' }}>
            ✓ All {total} territories calibrated!
          </div>
        )}

        {/* Territory list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {CONTINENT_SECTIONS.map(section => (
            <div key={section.label}>
              <div style={{
                padding: '5px 14px 3px',
                fontSize: 9, color: section.color, letterSpacing: 1.2,
                textTransform: 'uppercase', fontWeight: 'bold',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}>
                {section.label}
              </div>
              {section.ids.map(id => {
                const globalIdx = ORDERED_IDS.indexOf(id)
                const isCurrent = globalIdx === currentIdx
                const isDone = points[id] !== undefined
                const pt = points[id]
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 14px',
                    background: isCurrent ? 'rgba(200,148,10,0.08)' : 'transparent',
                    borderLeft: isCurrent ? '2px solid #C8940A' : '2px solid transparent',
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? 'rgba(39,174,96,0.25)' : 'rgba(100,75,25,0.20)',
                      border: `1px solid ${isDone ? 'rgba(39,174,96,0.6)' : 'rgba(100,75,25,0.3)'}`,
                      fontSize: 8, color: isDone ? '#27AE60' : '#4a3820',
                    }}>
                      {isDone ? '✓' : <span style={{ color: isCurrent ? '#C8940A' : '#4a3820', fontSize: 8 }}>{globalIdx + 1}</span>}
                    </div>
                    <div style={{ flex: 1, fontSize: 10, color: isDone ? '#b09060' : isCurrent ? '#E8DCC8' : '#5a4030' }}>
                      {nameOf(id)}
                    </div>
                    {isDone && pt && (
                      <div style={{ fontSize: 8, color: '#4a3820', fontFamily: 'monospace' }}>
                        {pt.x},{pt.y}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(200,148,10,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {done > 0 && (
            <button onClick={handleUndo} style={btnStyle('#7a6040')}>
              ↩ Undo Last
            </button>
          )}
          {allDone && (
            <>
              <button onClick={handleExport} style={btnStyle('#27AE60')}>
                ⬇ Download territoryData.ts
              </button>
              <button onClick={handleCopyExport} style={btnStyle('#2980B9')}>
                📋 Copy to Clipboard
              </button>
            </>
          )}
          <button onClick={onClose} style={btnStyle('#c0392b')}>
            ✕ Exit Calibration
          </button>
        </div>
      </div>
    </>
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 11,
    border: `1px solid ${color}`, background: `${color}22`,
    color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
  }
}
