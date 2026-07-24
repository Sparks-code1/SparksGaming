/** AI opponent difficulty levels. */
export type AIDifficulty = 'easy' | 'medium' | 'hard'

export const AI_DIFFICULTY_LABEL: Record<AIDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

/** One-letter badge shown in the HUD next to an AI player. */
export const AI_DIFFICULTY_BADGE: Record<AIDifficulty, string> = {
  easy: 'E',
  medium: 'M',
  hard: 'H',
}
