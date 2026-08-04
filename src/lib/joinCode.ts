/**
 * Short join codes for sharing a campaign.
 *
 * These get read aloud across a table and typed on a phone, so the alphabet is
 * Crockford Base32: the digits plus the letters, minus `I`, `L`, `O` and `U`.
 * That removes every pair a person actually confuses — `O`/`0` and `I`/`L`/`1` —
 * by only ever GENERATING one member of each pair, while `normalizeJoinCode`
 * still accepts the other on the way in. `U` is dropped so a random code cannot
 * spell something unfortunate.
 *
 * 32^6 ≈ 1.07 billion codes, which is far more than a hobby database needs; the
 * real collision guard is the unique constraint on the column, not the space.
 */

/** Characters a generated code may contain. */
export const JOIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const JOIN_CODE_LENGTH = 6

/**
 * What a person might type → what it means. Only maps the excluded half of each
 * confusable pair onto the included half, so nothing here is lossy.
 */
const CONFUSABLES: Record<string, string> = {
  O: '0',
  I: '1',
  L: '1',
}

/**
 * Clean up a code a person typed.
 *
 * Tolerates lower case, surrounding spaces, and the separators people add when
 * reading a code back ("ABC-123", "ABC 123"). Confusable letters are folded
 * onto the character the generator would actually have produced.
 */
export function normalizeJoinCode(input: string): string {
  return (input ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')          // drop spaces, dashes, punctuation
    .split('')
    .map(ch => CONFUSABLES[ch] ?? ch)
    .filter(ch => JOIN_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, JOIN_CODE_LENGTH)
}

/** True when `code` is exactly a well-formed code, already normalized. */
export function isValidJoinCode(code: string): boolean {
  if (code.length !== JOIN_CODE_LENGTH) return false
  return [...code].every(ch => JOIN_CODE_ALPHABET.includes(ch))
}

/**
 * A fresh code.
 *
 * Uses rejection sampling rather than `% 32` so every character is equally
 * likely. With a 32-character alphabet and 256 byte values there is in fact no
 * modulo bias, but the alphabet is the kind of thing that gets edited later —
 * the rejection loop keeps the guarantee even if it stops dividing 256.
 */
export function generateJoinCode(
  randomBytes: (n: number) => Uint8Array = defaultRandomBytes,
): string {
  const n = JOIN_CODE_ALPHABET.length
  const limit = Math.floor(256 / n) * n     // largest multiple of n under 256
  let out = ''
  while (out.length < JOIN_CODE_LENGTH) {
    const bytes = randomBytes(JOIN_CODE_LENGTH)
    for (const b of bytes) {
      if (b >= limit) continue              // would skew the distribution
      out += JOIN_CODE_ALPHABET[b % n]
      if (out.length === JOIN_CODE_LENGTH) break
    }
  }
  return out
}

function defaultRandomBytes(n: number): Uint8Array {
  const c = globalThis.crypto
  if (c && typeof c.getRandomValues === 'function') {
    return c.getRandomValues(new Uint8Array(n))
  }
  // No CSPRNG (very old webview). Codes only need to be unguessable enough to
  // stop a bored player poking at other people's campaigns, and the unique
  // constraint still prevents duplicates.
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256)
  return out
}

/** Display form — grouped in threes, which is markedly easier to read out. */
export function formatJoinCode(code: string): string {
  if (code.length !== JOIN_CODE_LENGTH) return code
  return `${code.slice(0, 3)}-${code.slice(3)}`
}
