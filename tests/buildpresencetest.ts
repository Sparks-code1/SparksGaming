// Which build every seat at the table is running — visible, not deduced.
//
// Two players on different builds is invisible until it produces a symptom,
// and then it produces a confusing one: the last online bug spent an evening
// being placed because nobody could say whether the two screens were running
// the same code. Each client now announces `<version>+<commit>` over presence,
// the badge beside Live shows this build, and a table on more than one build is
// called out by name.
//
// The presence channel itself needs Supabase; the two-seat browser spec proves
// the round trip (each browser sees the other's build). This file pins the pure
// halves and the shape of what is wired.
import { readFileSync } from 'node:fs'
import { flattenPresence, buildMismatches } from '@/lib/buildPresence'

let pass = 0, fail = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  ok   ${label}`) }
  else {
    fail++
    console.log(`  FAIL ${label}\n         got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
  }
}

console.log('\n— presence state becomes one flat list of builds —')
{
  // Keyed by seat, an ARRAY of metas per key — a seat open in two tabs is two.
  const state = {
    p1: [{ presence_ref: 'a', seat: 'p1', name: 'Ryan', build: '0.3.7+46cf45c' }],
    p2: [
      { presence_ref: 'b', seat: 'p2', name: 'Linda', build: '0.3.6+b980bc5' },
      { presence_ref: 'c', seat: 'p2', name: 'Linda', build: '0.3.7+46cf45c' },
    ],
  }
  check('every meta that carries a seat and a build is listed',
    flattenPresence(state).map(p => `${p.name}:${p.build}`),
    ['Ryan:0.3.7+46cf45c', 'Linda:0.3.6+b980bc5', 'Linda:0.3.7+46cf45c'])
  check('a meta with no build is not a client', flattenPresence({ p3: [{ presence_ref: 'd', seat: 'p3' }] }), [])
  check('a missing name falls back to the seat',
    flattenPresence({ p4: [{ presence_ref: 'e', seat: 'p4', build: 'x' }] })[0].name, 'p4')
}

console.log('\n— a mismatch is anyone on a build other than mine —')
{
  const peers = [
    { seat: 'p2', name: 'Linda', build: '0.3.6+b980bc5' },
    { seat: 'p3', name: 'Grant', build: '0.3.7+46cf45c' },
  ]
  check('the seat on another build is named',
    buildMismatches('0.3.7+46cf45c', peers).map(p => p.name), ['Linda'])
  check('a table all on my build has none', buildMismatches('0.3.7+46cf45c', [peers[1]]), [])
  // The version alone is NOT an identity — same 0.3.7, different commit, is a
  // mismatch, and it is the case that made the last bug hard to place.
  check('the same version on a different commit is a mismatch',
    buildMismatches('0.3.7+46cf45c', [{ seat: 'p2', name: 'Linda', build: '0.3.7+b980bc5' }]).length, 1)
}

console.log('\n— and it is wired all the way through —')
{
  const vite = readFileSync('vite.config.ts', 'utf8')
  check('the build id is version PLUS commit, never the version alone',
    /`\$\{version\}\+\$\{fromEnv \|\| fromGit\(\)\}`/.test(vite), true)
  check('...defined for the bundle', /__BUILD_ID__: JSON\.stringify\(buildId\)/.test(vite), true)

  const badge = readFileSync('src/components/LiveStatusBadge.tsx', 'utf8')
  check('the badge shows this build beside the marker', /· v\{build\}/.test(badge), true)
  check('...names whoever is on another build',
    /differing\.map\(d => `\$\{d\.name\} on \$\{d\.build\}`\)/.test(badge), true)
  // LOUD. A quiet marker at 0.75 opacity with pointer events off is right for
  // "all is well"; a table on two builds is not all well.
  check('...and a mismatch is as loud as a dropped connection',
    /const loud = degraded \|\| mismatch/.test(badge) && /opacity: loud \? 1 : 0\.75/.test(badge), true)

  const board = readFileSync('src/components/GameBoard.tsx', 'utf8')
  check('the board announces its build and hands the table to the badge',
    /useBuildPresence\(/.test(board) && /peers=\{buildPeers\}/.test(board) && /build=\{BUILD_ID\}/.test(board), true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
