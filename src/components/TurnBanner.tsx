import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FACTION_COLORS, NEUTRAL_COLOR } from '@/data/mockGameState'

const FACTION_NAMES: Record<string, string> = {
  'enclave-of-the-bear': 'Enclave of the Bear',
  'imperial-balkania': 'Imperial Balkania',
  'khan-industries': 'Khan Industries',
  'saharan-republic': 'Saharan Republic',
  'die-mechaniker': 'Die Mechaniker',
  'aliens': 'The Aliens',
  'mutants': 'The Mutants — Bringer of Nuclear Fire',
}

export interface TurnBannerInfo {
  playerName: string
  factionId: string
  isAI?: boolean
  seq: number
}

/** Animated banner sliding in from the left announcing whose turn it is.
 *  Auto-dismisses after ~2.2s via onDone. */
export default function TurnBanner({ info, onDone }: { info: TurnBannerInfo | null; onDone: () => void }) {
  useEffect(() => {
    if (!info) return
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.seq])

  const hex = info ? (FACTION_COLORS[info.factionId] ?? NEUTRAL_COLOR) : NEUTRAL_COLOR
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff
  const rgb = `${r},${g},${b}`

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          key={info.seq}
          initial={{ x: '-110%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '110%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          style={{
            position: 'absolute', top: '18%', left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
            zIndex: 90, pointerEvents: 'none',
            fontFamily: 'Georgia, serif',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '13px 34px',
            background: `linear-gradient(90deg, rgba(10,5,0,0) 0%, rgba(10,5,0,0.88) 12%, rgba(10,5,0,0.88) 88%, rgba(10,5,0,0) 100%)`,
            borderTop: `2px solid rgba(${rgb},0.75)`,
            borderBottom: `2px solid rgba(${rgb},0.75)`,
            boxShadow: `0 0 40px rgba(${rgb},0.25)`,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: `rgb(${rgb})`,
              boxShadow: `0 0 12px rgb(${rgb})`,
              flexShrink: 0,
            }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 22, fontWeight: 'bold', color: `rgb(${rgb})`,
                letterSpacing: 2, whiteSpace: 'nowrap',
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
              }}>
                {info.isAI ? '🤖 ' : ''}{info.playerName}'s Turn
              </div>
              <div style={{ fontSize: 10, color: 'rgba(232,220,200,0.55)', letterSpacing: 3, textTransform: 'uppercase', marginTop: 2 }}>
                {FACTION_NAMES[info.factionId] ?? info.factionId}
              </div>
            </div>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: `rgb(${rgb})`,
              boxShadow: `0 0 12px rgb(${rgb})`,
              flexShrink: 0,
            }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
