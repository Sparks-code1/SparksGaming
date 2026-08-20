/**
 * A leader disc: portrait, faction colour, name, battle strength.
 *
 * The counter a player commits to a battle. Four things have to be readable at
 * once and they compete for the same round space, so the layout is deliberate
 * rather than incidental:
 *
 *   The portraits are opaque rectangles with no alpha, so they cannot simply sit
 *   on a coloured disc — they would cover it completely. They are clipped to the
 *   circle instead, and the faction colour lives in the rim and the name band,
 *   which is where a printed counter puts it too.
 *
 *   They are cropped to FILL rather than fitted, anchored to the TOP. A portrait
 *   fitted into a circle leaves wedges of dead space at the sides; cropped and
 *   centred it cuts the head off, because faces sit high in a portrait. Anchored
 *   top, the crop takes it off the bottom, which is where the name band goes
 *   anyway.
 *
 *   The name band is opaque, not a translucent scrim. These portraits are dark
 *   and uneven, and cream text over an unknown image is a gamble; over a flat
 *   faction colour it is not.
 *
 * Sizes are all fractions of the radius, so one number scales the whole disc.
 */
import { useId } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import type { Leader } from '@/types/Dune/Faction'
import { FACTION_LOOK } from './SeatLayer'

const PALE = '#f0e2bb'

/**
 * Which portrait belongs to which leader.
 *
 * Keyed by the leader's name exactly as factions.ts writes it, so a rename there
 * shows up here as a missing portrait rather than as the wrong face. Only the
 * Fremen are complete so far; see the notes at the foot of this file.
 */
export const LEADER_PORTRAITS: Record<string, string> = {
  Stilgar: '/dune-leaders/Stilgar.png',
  Chani: '/dune-leaders/Chani.png',
  Otheym: '/dune-leaders/Otheym.png',
  'Shadout Mapes': '/dune-leaders/Shadout_mapes.png',
  Jamis: '/dune-leaders/Jamis.png',
}

export function LeaderDisc({
  leader, faction, r = 60,
}: { leader: Leader; faction: FactionId; r?: number }) {
  const id = useId()
  const clip = `leader-clip-${id}`
  const look = FACTION_LOOK[faction]
  const portrait = LEADER_PORTRAITS[leader.name]

  // The band across the bottom, and the badge at its right end.
  const bandTop = r * 0.40
  const badge = { cx: r * 0.58, cy: r * 0.60, r: r * 0.235 }
  // The name gets what the badge does not: shifted left by half the badge, and
  // shrunk once it runs long. Crude on purpose — a real fit needs text metrics,
  // and this is a disc, not a paragraph.
  const nameSize = r * (leader.name.length > 12 ? 0.145 : leader.name.length > 8 ? 0.17 : 0.2)

  return (
    <g>
      <title>{`${leader.name} — strength ${leader.strength}`}</title>
      <defs>
        <clipPath id={clip}>
          <circle cx="0" cy="0" r={r} />
        </clipPath>
      </defs>

      {/* Faction colour underneath, so any gap in the portrait reads as the
          faction rather than as a hole. */}
      <circle cx="0" cy="0" r={r} fill={look.colour} />

      {portrait && (
        <image
          href={portrait}
          x={-r} y={-r} width={r * 2} height={r * 2}
          preserveAspectRatio="xMidYMin slice"
          clipPath={`url(#${clip})`}
        />
      )}

      {/* The name band, clipped to the disc so it takes the circle's own edge. */}
      <g clipPath={`url(#${clip})`}>
        <rect x={-r} y={bandTop} width={r * 2} height={r - bandTop + 1} fill={look.colour} />
        <rect x={-r} y={bandTop} width={r * 2} height={r * 0.03} fill={PALE} opacity="0.35" />
      </g>

      <text
        x={-badge.r * 0.9} y={r * 0.62}
        fontSize={nameSize} fill={PALE} textAnchor="middle" dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif" letterSpacing={r * 0.006}
      >{leader.name.toUpperCase()}</text>

      {/* Strength, at the right. Cream disc with the faction colour in it, so it
          reads as a token in its own right rather than as part of the name. */}
      <circle cx={badge.cx} cy={badge.cy} r={badge.r} fill={PALE}
        stroke={look.colour} strokeWidth={r * 0.03} />
      <text
        x={badge.cx} y={badge.cy}
        fontSize={r * 0.32} fill={look.colour} textAnchor="middle" dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif" fontWeight="bold"
      >{leader.strength}</text>

      {/* The rim last, so it sits over the portrait and the band alike. */}
      <circle cx="0" cy="0" r={r - r * 0.02} fill="none" stroke={PALE} strokeWidth={r * 0.045} />
    </g>
  )
}

// ─── Portraits still missing, and two that do not belong where they look ─────
//
// public/dune-leaders holds fifteen images. They do not map one-to-one onto the
// leaders in factions.ts:
//
//   Fremen        complete — all five.
//   Harkonnen     four of five by name, plus Captain_IakinNefud.png, which is a
//                 HARKONNEN leader despite sitting between two Emperor ones in
//                 the folder listing. Baron.png is not a leader in the data at
//                 all — the Baron has no disc in Dune.
//   Emperor       four of five. Bashar (strength 2) has no portrait.
//   Atreides      none of the five.
//   Spacing Guild none.
//   Bene Gesserit none.
//
// A leader with no portrait still renders: the disc comes out in the faction
// colour with the name and strength on it, which is a usable counter and an
// obvious gap rather than a broken image.
