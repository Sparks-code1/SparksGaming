interface Props {
  size?: number
  color?: string
}

/** SVG biohazard symbol — 3 outer lobes + center ring + center dot */
export default function BiohazardIcon({ size = 40, color = '#22CC44' }: Props) {
  const cx = 50, cy = 50

  // Each lobe: outer arc at radius 34, inner cutout radius 14, spanning 100°
  const outerR = 34, innerR = 14, lobeSpan = 100
  const gapHalfDeg = (120 - lobeSpan) / 2  // 10° gap on each side

  function lobe(angleDeg: number) {
    const start = (angleDeg - lobeSpan / 2) * Math.PI / 180
    const end   = (angleDeg + lobeSpan / 2) * Math.PI / 180

    const cos = Math.cos, sin = Math.sin

    // Outer arc points
    const ox1 = cx + outerR * cos(start)
    const oy1 = cy + outerR * sin(start)
    const ox2 = cx + outerR * cos(end)
    const oy2 = cy + outerR * sin(end)

    // Inner arc points (reversed)
    const ix1 = cx + innerR * cos(end)
    const iy1 = cy + innerR * sin(end)
    const ix2 = cx + innerR * cos(start)
    const iy2 = cy + innerR * sin(start)

    return [
      `M ${ox1} ${oy1}`,
      `A ${outerR} ${outerR} 0 0 1 ${ox2} ${oy2}`,  // outer arc CW
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 0 0 ${ix2} ${iy2}`,  // inner arc CCW
      'Z',
    ].join(' ')
  }

  // The three lobes point outward at 270° (top), 30° (bottom-right), 150° (bottom-left)
  // (rotated so one lobe points up)
  const lobeAngles = [-90, 30, 150]

  void gapHalfDeg // used conceptually but lobeSpan already encodes the gaps

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Three outer lobes */}
      {lobeAngles.map(a => (
        <path key={a} d={lobe(a)} fill={color} />
      ))}

      {/* Connecting spokes from center to each lobe gap */}
      {lobeAngles.map(a => {
        const midAngle = a * Math.PI / 180
        const s = Math.sin, c = Math.cos
        return (
          <line
            key={`spoke-${a}`}
            x1={cx + innerR * c(midAngle)}
            y1={cy + innerR * s(midAngle)}
            x2={cx + outerR * c(midAngle)}
            y2={cy + outerR * s(midAngle)}
            stroke={color}
            strokeWidth="7"
          />
        )
      })}

      {/* Center ring */}
      <circle cx={cx} cy={cy} r="11" fill="none" stroke={color} strokeWidth="7" />

      {/* Center dot */}
      <circle cx={cx} cy={cy} r="4" fill={color} />
    </svg>
  )
}
