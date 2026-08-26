// Which game a match is, and both endpoints refusing one that is not theirs.
//
// WHY THIS EXISTS. `matches` holds a campaign id, a game number, a status and a
// `state` blob, and until now nothing on the row said whether that blob was a
// Risk board or a Dune one. apply-action's only gate was `status = 'active'`.
// scripts/seed-dune-match.mjs writes Dune rows with exactly that status.
//
// So a Dune match was one POST to the Risk endpoint away from being handed to
// gameReducer, which would read a state with no territories and no continents,
// make what it could of it, and write the result back over the row. Nothing
// would have refused it and nothing would have said so afterwards.
//
// THE COLUMN IS THE CHEAP HALF. A label nothing reads protects nothing, so most
// of what is below is about the two guards, not the column.
import { readFileSync, readdirSync } from 'node:fs'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** Source with its comments stripped: a check that matches prose proves nothing. */
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── the column exists, and says what it may hold ──────────────────────────
{
  const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'))
  const named = files.filter(f => f.includes('game_type'))
  check('a migration adds it', named.length, 1)

  const sql = readFileSync(`supabase/migrations/${named[0]}`, 'utf8')
  check('...to matches', /alter table matches/i.test(sql), true)
  check('...as a column with a default',
    /add column if not exists game_type text not null default 'risk'/i.test(sql), true)
  // NAMED VALUES. A typo should be a failed write, not a match nothing will
  // play — every reader of this column branches on it.
  check('...constrained to the games that exist',
    /check \(game_type in \('risk', 'dune'\)\)/i.test(sql), true)

  // THE ROWS ALREADY THERE. Defaulting everything to 'risk' would relabel the
  // seeded Dune matches as Risk ones, which is precisely the confusion this
  // migration exists to end — and would then have dune-action refuse them.
  check('...and the Dune rows already in the table are relabelled',
    /set game_type = 'dune'/i.test(sql), true)
  // By the one piece of evidence there is: no Risk state has ever had a spice
  // deck in it.
  check('...identified by the shape of their own state',
    /state \? 'spiceDeck'/.test(sql), true)
}

// ── Risk's endpoint refuses a Dune match ──────────────────────────────────
{
  const fn = code('supabase/functions/apply-action/index.ts')

  check('apply-action checks the game', /match\.game_type/.test(fn), true)
  check('...refusing anything that is not Risk',
    /!== 'risk'/.test(fn), true)
  check('...with a code a caller can branch on', /'wrong-game'/.test(fn), true)

  // BEFORE THE STATE IS TOUCHED. A guard that runs after the reducer has read
  // the row is a guard that has already lost.
  const guard = fn.indexOf('game_type')
  const reduce = fn.indexOf('gameReducer(state')
  check('...before the reducer sees the state', guard > 0 && guard < reduce, true)

  // AND BEFORE THE STATUS CHECK IS BESIDE THE POINT — but the status check is
  // what used to be the only gate, so the two being adjacent is what says the
  // gap has actually been filled rather than a second gate added elsewhere.
  const status = fn.indexOf("code: 'not-active'")
  check('...alongside the gate that used to be the only one',
    guard < status, true)

  // A ROW FROM BEFORE THE COLUMN is a Risk match, which is what the migration
  // decided too. The two must agree or old rows stop working.
  check('...treating a row with no game as Risk',
    /game_type \?\? 'risk'/.test(fn), true)
}

// ── Dune's endpoint refuses a Risk match ──────────────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')

  check('dune-action reads the game off the row',
    /game_type/.test(fn), true)
  check('...selecting it with everything else it needs',
    /\.select\('[^']*game_type[^']*'\)/.test(fn), true)
  check('...refusing anything that is not Dune', /!== 'dune'/.test(fn), true)
  check('...with the same code', /'wrong-game'/.test(fn), true)

  // BEING SEATED SAYS NOTHING ABOUT WHICH GAME IT IS. The seat lookup passes
  // for a Risk match the caller legitimately holds a seat in, so this guard
  // has to be its own check rather than something the seat check implies.
  const seat = fn.indexOf("code: 'not-seated'")
  const guard = fn.indexOf("code: 'wrong-game'")
  check('...as a check of its own, after the seat is known',
    seat > 0 && guard > seat, true)

  // AND BEFORE ANY PHASE RUNS. The first action case is where state starts
  // being read and written.
  const firstCase = fn.indexOf("case 'OPEN_CHARITY'")
  check('...and before any phase touches the state',
    guard < firstCase, true)
}

// ── both sides of the app say which game they are making ──────────────────
{
  const lobby = code('src/lib/lobby.ts')
  check('the lobby makes Risk matches and says so',
    /game_type: 'risk'/.test(lobby), true)
  // ON THE INSERT, not somewhere it could be forgotten. A row that acquires its
  // game later is a row that spent time being neither.
  const insert = lobby.slice(lobby.indexOf(".from('matches')"), lobby.indexOf('.select(', lobby.indexOf(".from('matches')")))
  check('...at the moment the row is created', /game_type: 'risk'/.test(insert), true)

  const seed = readFileSync('scripts/seed-dune-match.mjs', 'utf8')
  check('the seed makes Dune matches and says so',
    /game_type: 'dune'/.test(seed), true)
  const seedInsert = seed.slice(seed.indexOf("from('matches').insert("),
    seed.indexOf('.select(', seed.indexOf("from('matches').insert(")))
  check('...on the row it inserts', /game_type: 'dune'/.test(seedInsert), true)
}

// ── the two labels are the two the constraint allows ──────────────────────
// A third value written anywhere would be refused by the database, which is a
// failed seed rather than a silent mislabel — but the failure would be at
// runtime, and this is cheaper.
{
  const written = new Set<string>()
  for (const f of ['src/lib/lobby.ts', 'scripts/seed-dune-match.mjs']) {
    for (const m of readFileSync(f, 'utf8').matchAll(/game_type: '([a-z]+)'/g)) written.add(m[1])
  }
  check('only the games that exist are ever written',
    [...written].sort(), ['dune', 'risk'])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
