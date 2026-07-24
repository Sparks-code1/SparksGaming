/**
 * Game audio manager (Howler.js).
 *
 * There are no bundled sound files, so every effect is SYNTHESIZED with the
 * Web Audio API into a short WAV data-URI, then handed to Howler for playback.
 * Howler manages master volume/mute, the looping ambient bed, overlap, and the
 * browser autoplay-unlock. Sounds are kept subtle and board-game appropriate.
 */
import { Howl, Howler } from 'howler'

const SR = 44100

// ─── WAV encoding (Float32 samples → 16-bit PCM WAV data URI) ─────────────────

function floatToWavDataURI(samples: Float32Array): string {
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, SR, true); view.setUint32(28, SR * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  writeStr(36, 'data'); view.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    off += 2
  }
  const bytes = new Uint8Array(buffer)
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as unknown as number[])
  }
  return 'data:audio/wav;base64,' + btoa(bin)
}

// ─── Synthesis primitives ─────────────────────────────────────────────────────

function buf(seconds: number): Float32Array {
  return new Float32Array(Math.floor(SR * seconds))
}

/** Add a shaped tone (sine/triangle) with an attack/decay envelope. */
function addTone(
  b: Float32Array, startT: number, dur: number, freq: number,
  gain: number, type: 'sine' | 'triangle' | 'square' = 'sine',
  attack = 0.005, decayCurve = 3,
) {
  const s0 = Math.floor(startT * SR)
  const n = Math.floor(dur * SR)
  for (let i = 0; i < n; i++) {
    const idx = s0 + i
    if (idx >= b.length) break
    const t = i / SR
    const p = 2 * Math.PI * freq * t
    let w: number
    if (type === 'sine') w = Math.sin(p)
    else if (type === 'triangle') w = Math.asin(Math.sin(p)) * (2 / Math.PI)
    else w = Math.sign(Math.sin(p))
    // Envelope: quick attack then exponential decay
    const env = (t < attack ? t / attack : 1) * Math.pow(1 - i / n, decayCurve)
    b[idx] += w * gain * env
  }
}

/** Add a filtered noise burst (percussive clack / knock). */
function addNoise(b: Float32Array, startT: number, dur: number, gain: number, decayCurve = 2.5, lp = 0.5) {
  const s0 = Math.floor(startT * SR)
  const n = Math.floor(dur * SR)
  let last = 0
  for (let i = 0; i < n; i++) {
    const idx = s0 + i
    if (idx >= b.length) break
    const white = Math.random() * 2 - 1
    last = last + lp * (white - last) // simple one-pole lowpass
    const env = Math.pow(1 - i / n, decayCurve)
    b[idx] += last * gain * env
  }
}

// ─── Effect synths ────────────────────────────────────────────────────────────

function synthDice(): Float32Array {
  const b = buf(0.5)
  // A handful of little wooden clacks tumbling
  const clacks = [0.0, 0.07, 0.13, 0.21, 0.3, 0.38]
  for (const t of clacks) {
    addNoise(b, t + Math.random() * 0.01, 0.05, 0.5, 3, 0.35)
    addTone(b, t, 0.05, 180 + Math.random() * 120, 0.15, 'triangle', 0.002, 4)
  }
  return b
}

function synthVictory(): Float32Array {
  const b = buf(0.9)
  // Soft major arpeggio C-E-G-C
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => addTone(b, i * 0.09, 0.5, f, 0.22, 'triangle', 0.01, 2.2))
  // gentle shimmer on top
  addTone(b, 0.28, 0.6, 1567.98, 0.06, 'sine', 0.03, 2)
  return b
}

function synthElimination(): Float32Array {
  const b = buf(1.1)
  // Low dramatic descending sting
  addTone(b, 0.0, 1.0, 130.81, 0.28, 'sine', 0.02, 1.6)
  addTone(b, 0.0, 1.0, 98.0, 0.22, 'triangle', 0.02, 1.6)
  addTone(b, 0.05, 0.9, 65.41, 0.18, 'sine', 0.02, 1.4)
  addNoise(b, 0.0, 0.25, 0.12, 3, 0.2)
  return b
}

function synthCoin(): Float32Array {
  const b = buf(0.35)
  // Bright metallic double-ping
  addTone(b, 0.0, 0.18, 1760, 0.16, 'sine', 0.001, 5)
  addTone(b, 0.04, 0.22, 2637, 0.1, 'sine', 0.001, 5)
  addTone(b, 0.0, 0.2, 3520, 0.05, 'sine', 0.001, 6)
  return b
}

function synthCity(): Float32Array {
  const b = buf(0.4)
  // Warm woody knock + soft chime
  addNoise(b, 0.0, 0.08, 0.4, 4, 0.25)
  addTone(b, 0.0, 0.35, 392, 0.18, 'triangle', 0.004, 2.5)
  addTone(b, 0.02, 0.3, 587.33, 0.1, 'sine', 0.01, 2.5)
  return b
}

function synthMilestone(): Float32Array {
  const b = buf(1.3)
  // Rising bell swell — sense of unlocking
  const notes = [392, 493.88, 587.33, 783.99, 987.77]
  notes.forEach((f, i) => addTone(b, i * 0.12, 0.9 - i * 0.05, f, 0.16, 'sine', 0.02, 1.8))
  addTone(b, 0.5, 0.8, 1174.66, 0.07, 'triangle', 0.05, 1.6)
  return b
}

function synthTroop(): Float32Array {
  const b = buf(0.09)
  addNoise(b, 0.0, 0.05, 0.35, 4, 0.4)
  addTone(b, 0.0, 0.05, 320, 0.12, 'triangle', 0.001, 5)
  return b
}

function synthButton(): Float32Array {
  const b = buf(0.06)
  addNoise(b, 0.0, 0.03, 0.2, 5, 0.6)
  addTone(b, 0.0, 0.035, 900, 0.08, 'sine', 0.001, 6)
  return b
}

/** Slow, quiet evolving drone — seamless-ish loop bed. */
function synthAmbient(): Float32Array {
  const dur = 8
  const b = buf(dur)
  const base = [55, 82.41, 110, 164.81] // low A drone + fifth
  for (let i = 0; i < b.length; i++) {
    const t = i / SR
    // Slow amplitude LFOs so the pad breathes; fully continuous → loops cleanly
    let v = 0
    base.forEach((f, k) => {
      const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * (0.05 + k * 0.017) * t)
      v += Math.sin(2 * Math.PI * f * t) * lfo * (0.05 - k * 0.008)
    })
    // gentle high shimmer
    v += Math.sin(2 * Math.PI * 660 * t) * 0.008 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.03 * t))
    b[i] = v
  }
  return b
}

// ─── Howl instances (lazy, built once) ───────────────────────────────────────

type SoundKey = 'dice' | 'victory' | 'elimination' | 'coin' | 'city' | 'milestone' | 'troop' | 'button'

interface SoundDef { synth: () => Float32Array; volume: number; cutoff: boolean }

const DEFS: Record<SoundKey, SoundDef> = {
  dice:        { synth: synthDice,        volume: 0.7,  cutoff: false }, // dice may overlap
  victory:     { synth: synthVictory,     volume: 0.6,  cutoff: false },
  elimination: { synth: synthElimination, volume: 0.7,  cutoff: false },
  coin:        { synth: synthCoin,        volume: 0.5,  cutoff: false },
  city:        { synth: synthCity,        volume: 0.6,  cutoff: false },
  milestone:   { synth: synthMilestone,   volume: 0.6,  cutoff: false },
  troop:       { synth: synthTroop,       volume: 0.4,  cutoff: true },  // rapid — cut off
  button:      { synth: synthButton,      volume: 0.35, cutoff: true },  // rapid — cut off
}

const howls: Partial<Record<SoundKey, Howl>> = {}
let ambient: Howl | null = null

function getHowl(key: SoundKey): Howl {
  let h = howls[key]
  if (!h) {
    const def = DEFS[key]
    h = new Howl({ src: [floatToWavDataURI(def.synth())], volume: def.volume, preload: true })
    howls[key] = h
  }
  return h
}

// ─── Settings (persisted) ─────────────────────────────────────────────────────

const LS_VOL = 'risk-sound-volume'
const LS_MUTE = 'risk-sound-muted'

let masterVolume = (() => {
  const v = parseFloat(localStorage.getItem(LS_VOL) ?? '')
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6
})()
let muted = localStorage.getItem(LS_MUTE) === '1'

// Apply to Howler master
Howler.volume(masterVolume)
Howler.mute(muted)

export function getVolume(): number { return masterVolume }
export function isMuted(): boolean { return muted }

export function setVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v))
  localStorage.setItem(LS_VOL, String(masterVolume))
  Howler.volume(masterVolume)
  // Raising volume off zero un-mutes for convenience
  if (masterVolume > 0 && muted) setMuted(false)
}

export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem(LS_MUTE, m ? '1' : '0')
  Howler.mute(m)
}

export function toggleMuted(): boolean {
  setMuted(!muted)
  return muted
}

// ─── Playback API ─────────────────────────────────────────────────────────────

function play(key: SoundKey) {
  if (muted) return
  try {
    const h = getHowl(key)
    if (DEFS[key].cutoff) h.stop() // cut off rapid re-triggers (UI clicks, troop drops)
    h.play()
  } catch { /* audio unavailable — ignore */ }
}

export const playDice        = () => play('dice')
export const playVictory     = () => play('victory')
export const playElimination = () => play('elimination')
export const playCoin        = () => play('coin')
export const playCity        = () => play('city')
export const playMilestone   = () => play('milestone')
export const playTroop       = () => play('troop')
export const playButton      = () => play('button')

// ─── Ambient background loop ──────────────────────────────────────────────────

export function startAmbient() {
  if (ambient) { if (!ambient.playing()) ambient.play(); return }
  try {
    ambient = new Howl({ src: [floatToWavDataURI(synthAmbient())], loop: true, volume: 0.25, preload: true })
    ambient.play()
  } catch { /* ignore */ }
}

export function stopAmbient() {
  ambient?.stop()
}

// ─── Global UI-click sound ────────────────────────────────────────────────────

let clickListenerAttached = false
/** Play a subtle click on any <button> press (UI feedback). Cut off if rapid. */
export function attachUiClickSound() {
  if (clickListenerAttached) return
  clickListenerAttached = true
  document.addEventListener('pointerdown', e => {
    const el = e.target as HTMLElement | null
    if (el && el.closest('button')) playButton()
  }, { capture: true })
}
