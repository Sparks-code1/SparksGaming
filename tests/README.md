# Tests

```bash
npm test                    # everything (~3s)
npm test -- worldcapital    # just the files matching a substring
npm test -- --verbose       # print every assertion, not just failures
```

Exits non-zero if anything fails, so it works in a pre-commit hook or CI.

## What these are

Every suite here exists because something broke in a real game. They are not
coverage for its own sake — each one pins down a rule that was already wrong
once, usually in a way that cost a campaign something permanent.

There is no framework. A test file is a plain script that imports real project
code, prints `ok` / `FAIL` lines, and exits non-zero if anything failed. The
runner (`scripts/run-tests.mjs`) bundles each file with esbuild — resolving the
`@/` alias and stubbing the Vite env vars — then runs it with Node. Bundling per
file keeps them independent, so one blowing up cannot take the rest with it.

## Writing one

Copy the shape of any existing file:

```ts
import { countCitiesOn } from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

console.log('\n— what this section is about —')
check('the thing does the thing', countCitiesOn(territory, 'brazil') === 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
```

**The last line is not optional.** `privatemissiontest` was written without it
and spent weeks printing `FAIL` while the runner counted it green. A test that
cannot fail is worse than no test, because it looks like cover.

Two habits worth keeping, both visible throughout:

- **Assert the old behaviour too.** Most suites check what the buggy version did
  as well as what the fixed one does. It documents the bug and proves the test
  would have caught it.
- **Name the assertion in plain language.** `ok the World Capital is a target`
  reads better in a failure than `ok test_wc_1`.

## What they cover

Board rules — city counting, continent bonuses, entry costs, fallout, fortify,
combat dice, turn advance and reset.

Campaign permanence — the World Capital replacing a city, ruins, scars and the
4-per-campaign cancel limit, sticker supplies, sea lines, missions (shared and
private), milestones, faction powers and homelands.

Event rewards — Join the Cause, Resistance, Control the People and Riot, all of
which pay a player the *board* picks rather than whoever is taking the turn.
That distinction is what several of these suites are guarding.

Accounts and campaigns — join codes, roster rules, join-by-code refusals.

Server authority — that the server's dice cannot be forged, that a client
cannot hand the server a board, and that hotseat behaviour is unchanged.

## Not covered

Anything that needs React, PIXI or a live Supabase connection. Those were
verified by driving the real app in a browser instead. The rendering layer,
the PIXI map and the Electron shell have no automated coverage at all.
