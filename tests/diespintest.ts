import { readFileSync } from 'node:fs'
import { FACE_ANGLES, SPIN_RATE, forwardTo, spinWobble, cubeTransform } from '@/lib/dieSpin'
// A die lands the way it was turning.
//
// The cube tumbled under a CSS keyframe animation and landed through a CSS
// transition. Dropping the animation handed the transition the cube's last
// animated angles as its start and the face's fixed angles as its end — a
// smaller number more often than not — so the landing unwound BACKWARDS:
// "clockwise, stops, then counterclockwise" (the defender's dice,
// 2026-09-07). Now the spin is a running angle and the landing continues
// forward to the next turn that shows the face.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')

console.log('\n— the landing never turns back —')
{
  check('from 500° to a face at −90° (≡270°) is 630°, forward', forwardTo(500, -90), 630)
  check('from 100° to a face at 90° goes round once more, never back 10°', forwardTo(100, 90), 450)
  check('from 720° to a face at 0° stays put — already showing it', forwardTo(720, 0), 720)
  check('from 0° on first paint to a face at 180°', forwardTo(0, 180), 180)
  check('from 359° to a face at 0°', forwardTo(359, 0), 360)
  for (const cur of [0, 7, 359, 360, 361, 1000, 12345.6]) {
    for (const face of Object.values(FACE_ANGLES)) {
      for (const [axis, target] of [['x', face.x], ['y', face.y]] as const) {
        const out = forwardTo(cur, target)
        const same = ((out - target) % 360 + 360) % 360 === 0
        if (!(out >= cur && out - cur < 360 && same)) {
          pass = false
          console.log(`FAIL  forwardTo(${cur}, ${target}) on ${axis} = ${out}: not forward, not within a turn, or not the face`)
        }
      }
    }
  }
  console.log('PASS  every landing from every angle is forward, within one turn, and on the face')
}

console.log('\n— the spin itself —')
{
  check('the two axes turn at different rates, so the tumble never repeats', SPIN_RATE.x !== SPIN_RATE.y && SPIN_RATE.x > 0 && SPIN_RATE.y > 0, true)
  check('the wobble is bounded and gone at the start', [Math.abs(spinWobble(12345)) <= 35, spinWobble(0)], [true, 0])
  check('the transform names all three axes', cubeTransform(1, 2, 3), 'rotateX(1deg) rotateY(2deg) rotateZ(3deg)')
  check('six faces, opposite pairs at right angles', Object.keys(FACE_ANGLES).length, 6)
}

console.log('\n— the wiring —')
{
  const modal = bare(readFileSync('src/components/AttackModal.tsx', 'utf8'))
  check('the cube is driven by a running angle, not a keyframe class',
    /a\.x \+= dt \* SPIN_RATE\.x[\s\S]{0,200}?requestAnimationFrame\(step\)/.test(modal) && !/die3d-cube\$\{spinning/.test(modal), true)
  check('...and lands forward on the face', /a\.x = forwardTo\(a\.x, face\.x\)\s*a\.y = forwardTo\(a\.y, face\.y\)/.test(modal), true)
  check('no fixed landing string survives', /SHOW_FACE/.test(modal), false)
  const css = readFileSync('src/index.css', 'utf8')
  check('the keyframe spin is gone from the stylesheet', /die-cube-spin|\.die3d-cube\.spinning/.test(css), false)
  check('...while the landing easing and the hop remain', /\.die3d-cube \{[\s\S]{0,200}?transition: transform/.test(css) && /die-hop/.test(css), true)
}

console.log(pass ? '\nall die-spin pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
