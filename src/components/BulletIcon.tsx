/**
 * Ammo Shortage scar icon — golden bullet in a red "no" circle, matching the
 * board rendering in SVGMapLayer. Renders as an SVG group; `scale` shrinks the
 * whole glyph for compact contexts like map pickers.
 */
export default function BulletIcon({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  const r = 8 * scale
  const bW = 3.5 * scale, bH = 7 * scale, bTip = 2 * scale
  const sw = (w: number) => w * scale
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#c0392b" strokeWidth={sw(1.8)} />
      {/* bullet body */}
      <rect x={cx - bW / 2} y={cy - bH / 2 + bTip} width={bW} height={bH - bTip}
        fill="#D4A017" stroke="rgba(0,0,0,0.5)" strokeWidth={sw(0.5)} rx={sw(0.5)} />
      {/* bullet tip */}
      <path d={`M ${cx - bW / 2} ${cy - bH / 2 + bTip} Q ${cx} ${cy - bH / 2 - bTip} ${cx + bW / 2} ${cy - bH / 2 + bTip}`}
        fill="#F0C040" stroke="rgba(0,0,0,0.5)" strokeWidth={sw(0.5)} />
      {/* casing rim */}
      <rect x={cx - bW / 2 - sw(0.8)} y={cy + bH / 2 - bTip - sw(1)} width={bW + sw(1.6)} height={sw(2)}
        fill="#B8860B" stroke="rgba(0,0,0,0.4)" strokeWidth={sw(0.4)} rx={sw(0.3)} />
      {/* red slash */}
      <line x1={cx - sw(6)} y1={cy + sw(6)} x2={cx + sw(6)} y2={cy - sw(6)}
        stroke="#c0392b" strokeWidth={sw(1.8)} strokeLinecap="round" />
    </g>
  )
}
