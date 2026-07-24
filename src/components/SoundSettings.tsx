import { useEffect, useState } from 'react'
import { getVolume, isMuted, setVolume, toggleMuted, attachUiClickSound } from '@/lib/sounds'

/** Top-corner sound control: mute toggle + volume slider. */
export default function SoundSettings() {
  const [open, setOpen] = useState(false)
  const [vol, setVol] = useState(getVolume())
  const [muted, setMuted] = useState(isMuted())

  useEffect(() => { attachUiClickSound() }, [])

  const icon = muted || vol === 0 ? '🔇' : vol < 0.4 ? '🔈' : vol < 0.75 ? '🔉' : '🔊'

  return (
    <div style={{
      position: 'fixed', top: 10, right: 10, zIndex: 5000,
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: 'Georgia, serif',
    }}>
      {open && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 12px', borderRadius: 8,
          background: 'rgba(10,6,2,0.88)', border: '1px solid rgba(200,148,10,0.35)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}>
          <button
            onClick={() => setMuted(toggleMuted())}
            title={muted ? 'Unmute' : 'Mute'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, padding: 0, color: '#C8940A',
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <input
            type="range" min={0} max={1} step={0.02} value={muted ? 0 : vol}
            onChange={e => {
              const v = Number(e.target.value)
              setVolume(v); setVol(v); setMuted(isMuted())
            }}
            style={{ width: 110, accentColor: '#C8940A', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 10, color: '#9a8060', width: 26, textAlign: 'right' }}>
            {Math.round((muted ? 0 : vol) * 100)}
          </span>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        title="Sound settings"
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(10,6,2,0.88)', border: '1px solid rgba(200,148,10,0.40)',
          color: '#C8940A', fontSize: 16, cursor: 'pointer', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 3px 12px rgba(0,0,0,0.55)',
        }}
      >
        {icon}
      </button>
    </div>
  )
}
