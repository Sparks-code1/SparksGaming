import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Execute one command line; returns the lines to print. */
  onCommand: (cmd: string) => string[]
  onClose: () => void
}

/**
 * The backtick admin console — a repair tool for the table owner.
 *
 * Commands are parsed and executed by GameBoard (it owns dispatch and the
 * legacy state); this component is just the terminal: an input, a scrollback,
 * and Escape to close. Everything it does goes through the SAME reducer
 * actions normal play uses, so repairs are server-authoritative online and
 * appear on every machine — this is a spanner, not a cheat: every use writes
 * a history line.
 */
export default function AdminConsole({ onCommand, onClose }: Props) {
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<string[]>([
    '🔧 Admin console — type `help` for commands, Esc to close',
  ])
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  function run() {
    const cmd = input.trim()
    if (!cmd) return
    const out = onCommand(cmd)
    setLines(prev => [...prev, `> ${cmd}`, ...out].slice(-60))
    setInput('')
  }

  return (
    <div style={{
      position: 'fixed', left: 12, bottom: 12, zIndex: 9500,
      width: 520, maxWidth: 'calc(100vw - 24px)',
      background: 'rgba(8,4,0,0.96)', border: '1.5px solid rgba(200,148,10,0.55)',
      borderRadius: 10, padding: '10px 12px',
      fontFamily: 'Consolas, monospace', fontSize: 12, color: '#C8B888',
      boxShadow: '0 10px 40px rgba(0,0,0,0.85)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, letterSpacing: 2, color: '#C8940A', textTransform: 'uppercase' }}>
          🔧 Admin Console
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto', border: 'none', background: 'transparent',
            color: '#7a6040', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          }}>
          ✕
        </button>
      </div>
      <div ref={scrollRef} style={{
        maxHeight: 220, overflowY: 'auto', marginBottom: 8,
        whiteSpace: 'pre-wrap', lineHeight: 1.5,
      }}>
        {lines.map((l, i) => (
          <div key={i} style={{
            color: l.startsWith('> ') ? '#8a7040'
              : l.startsWith('✗') ? '#e08070'
              : l.startsWith('✓') ? '#7ab060' : '#C8B888',
          }}>
            {l}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') run()
          if (e.key === 'Escape') onClose()
          e.stopPropagation()
        }}
        placeholder="troops southeast asia 8 ryan   ·   stars ryan 2"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '7px 10px',
          borderRadius: 6, border: '1px solid rgba(200,148,10,0.40)',
          background: 'rgba(0,0,0,0.55)', color: '#E8DCC8',
          fontFamily: 'inherit', fontSize: 12, outline: 'none',
        }}
      />
    </div>
  )
}
