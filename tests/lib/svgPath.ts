/**
 * Flatten an SVG path to a polygon.
 *
 * NOT a general parser — it handles the commands the board generator's own
 * output uses, which is M, L, H, V, C and Z, absolute only.
 *
 * IT EXISTS BECAUSE THE CRUDE VERSION IS WRONG AND LOOKS RIGHT. Reading every
 * number out of a `d` attribute and pairing them off as (x, y) works on a path
 * of straight lines and silently garbles anything with an H or a V in it, since
 * those carry ONE number each and shift the parity of everything after them.
 * The numeral 1 on the turn dial is drawn `M111 42 V59 H107 V45 …`, and paired
 * off that way it reports a position on the wrong side of the dial — a
 * confident, plausible answer that put turn 1 in turn 10's wedge.
 *
 * In tests/lib rather than tests/, because the runner treats every .ts directly
 * in tests/ as a suite and this one asserts nothing.
 */
export type Point = [number, number]

export function flattenPath(d: string, steps = 24): Point[] {
  const pts: Point[] = []
  let cx = 0, cy = 0, sx = 0, sy = 0
  for (const m of d.matchAll(/([MLHVCZmlhvcz])([^MLHVCZmlhvcz]*)/g)) {
    const a = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number)
    switch (m[1]) {
      case 'M': cx = a[0]; cy = a[1]; sx = cx; sy = cy; pts.push([cx, cy]); break
      case 'L': for (let i = 0; i + 1 < a.length; i += 2) { cx = a[i]; cy = a[i + 1]; pts.push([cx, cy]) } break
      case 'H': for (const v of a) { cx = v; pts.push([cx, cy]) } break
      case 'V': for (const v of a) { cy = v; pts.push([cx, cy]) } break
      case 'C':
        for (let i = 0; i + 5 < a.length; i += 6) {
          const [x1, y1, x2, y2, x3, y3] = a.slice(i, i + 6)
          for (let k = 1; k <= steps; k++) {
            const t = k / steps, u = 1 - t
            pts.push([
              u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
              u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
            ])
          }
          cx = x3; cy = y3
        }
        break
      case 'Z': case 'z': pts.push([sx, sy]); break
    }
  }
  return pts
}

/** The bounding box of a flattened path. */
export function bounds(pts: readonly Point[]) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

/** Ray casting. */
export function inPolygon([px, py]: Point, poly: readonly Point[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
