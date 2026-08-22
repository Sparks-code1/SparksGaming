// Why a realtime subscription is silent — the logic, not the socket.
//
// This exists because the logic was wrong and nothing could see it. It lived
// inline in a script that only runs against a live database, it branched on the
// service-role probe before looking at the seat at all, and so it announced
// "PUBLICATION — matches is not reaching the changefeed" on a run whose very
// next lines reported frames arriving for that seat. The report and the
// observations contradicted each other and the report was the wrong one.
//
// Pure inputs, pure output, six cases. The last one is the bug.
import { diagnoseRealtime } from '../scripts/lib/diagnoseRealtime.js'
import type { Probe } from '../scripts/lib/diagnoseRealtime.js'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const heard: Probe = { status: 'SUBSCRIBED', got: true }
const silent: Probe = { status: 'SUBSCRIBED', got: false }
const refused: Probe = { status: 'CHANNEL_ERROR: nope', got: false }

// ── the seat is fine ───────────────────────────────────────────────────────
check('a seat that receives frames has nothing wrong with it',
  diagnoseRealtime({ seat: heard, service: heard }).cause, 'none')
check('...and is reported as working',
  diagnoseRealtime({ seat: heard, service: heard }).working, true)

// ── the seat is not fine, and the service probe explains why ──────────────
check('a seat that only hears after setAuth was missing its token',
  diagnoseRealtime({ seat: silent, seatAfterAuth: heard, service: heard }).cause, 'token')
check('...and still counts as working, because it does now',
  diagnoseRealtime({ seat: silent, seatAfterAuth: heard, service: heard }).working, true)
check('nobody hears anything and the service role could not subscribe: the socket',
  diagnoseRealtime({ seat: silent, seatAfterAuth: silent, service: refused }).cause, 'socket')
check('nobody hears anything but the service role subscribed fine: the publication',
  diagnoseRealtime({ seat: silent, seatAfterAuth: silent, service: silent }).cause, 'publication')
check('the service role hears and the seat does not, even authed: RLS',
  diagnoseRealtime({ seat: silent, seatAfterAuth: silent, service: heard }).cause, 'rls')

// ── THE BUG ────────────────────────────────────────────────────────────────
// The service probe is an instrument, and instruments fail. When it disagrees
// with the seat, the seat wins: it is the thing being measured, and a frame it
// actually received is not undone by a second subscription that missed one.
//
// The old order asked !service.got first and answered "publication" here, which
// is a claim that the table emits nothing — contradicted by the frames the seat
// was holding at the time.
{
  const d = diagnoseRealtime({ seat: heard, service: silent })
  check('a seat receiving frames is never blamed on the publication', d.cause, 'none')
  check('...nor reported as broken', d.working, true)
  check('...and the text does not name a transport fault',
    /SOCKET|PUBLICATION|RLS/.test(d.text), false)
}
// Same again with the service probe failing outright, which is the louder
// version of the same disagreement.
check('...and not on the socket either',
  diagnoseRealtime({ seat: heard, service: refused }).cause, 'none')

// ── every cause says something, and says which it is ──────────────────────
// A diagnosis whose text does not name its own cause is one somebody has to
// cross-reference to act on.
{
  const all = [
    diagnoseRealtime({ seat: heard, service: heard }),
    diagnoseRealtime({ seat: silent, seatAfterAuth: heard, service: heard }),
    diagnoseRealtime({ seat: silent, seatAfterAuth: silent, service: refused }),
    diagnoseRealtime({ seat: silent, seatAfterAuth: silent, service: silent }),
    diagnoseRealtime({ seat: silent, seatAfterAuth: silent, service: heard }),
  ]
  check('every diagnosis carries a distinct cause',
    new Set(all.map(d => d.cause)).size, 5)
  check('...and text that names it',
    all.filter(d => !d.text.toLowerCase().includes(d.cause === 'rls' ? 'rls' : d.cause)).map(d => d.cause), [])
  check('...and only the two working ones report working',
    all.map(d => d.working), [true, true, false, false, false])
}

// A missing seatAfterAuth means the retry never ran, which is what happens when
// the seat heard on the first attempt — it must not be read as a failed retry.
check('no retry recorded is not the same as a failed retry',
  diagnoseRealtime({ seat: silent, service: heard }).cause, 'rls')

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
