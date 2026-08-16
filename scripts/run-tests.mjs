// Test runner.
//
// Each file in tests/ is a standalone script that imports real project code,
// asserts against it, and exits non-zero on failure. There is no framework:
// esbuild bundles each one (resolving the `@/` alias and stubbing the Vite env
// vars that `import.meta.env` would otherwise leave undefined), then Node runs
// it. Bundling per file keeps them independent — one blowing up cannot take the
// rest with it.
//
//   npm test                 run everything
//   npm test -- worldcapital run the files matching a substring
//   npm test -- --verbose    show each assertion, not just failures
//
// Every suite here exists because something broke in a real game. Adding to
// them is cheaper than rediscovering the same bug.
import { build } from 'esbuild'
import { readdirSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, basename } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = join(root, 'tests')
const OUT = join(root, 'node_modules', '.test-build')

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const filters = args.filter(a => !a.startsWith('--'))

const files = readdirSync(TESTS)
  .filter(f => f.endsWith('.ts'))
  .filter(f => filters.length === 0 || filters.some(x => f.toLowerCase().includes(x.toLowerCase())))
  .sort()

if (files.length === 0) {
  console.error(filters.length ? `No test files match: ${filters.join(', ')}` : 'No test files found in tests/')
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const failures = []
let passed = 0
const started = Date.now()

/**
 * Assertions written BELOW a suite's `process.exit` never run.
 *
 * Every file here ends by reporting its own verdict and exiting, which is what
 * gives the runner an exit code to read. `process.exit` stops the process
 * there and then — so anything appended after it is dead, and appending is the
 * natural way to add a case to an existing suite. The file still exits 0, the
 * runner still prints a tick, and the new asserts contribute nothing.
 *
 * That is a test failing OPEN: it does not go red and demand attention, it
 * goes green and tells you the code is fine. It cost two suites tonight, and
 * was only caught because a deliberate sabotage came back clean.
 *
 * What it looks for is dead ASSERTIONS specifically — a `check(` below the
 * exit. Not "any statement": one suite wraps itself in an async run() whose
 * exit sits inside the function, with the `void run()` that STARTS it on the
 * last line. That is correct, and an over-eager check called it a bug.
 */
function deadAssertionsAfterExit(source) {
  const lines = source.split('\n')
  let lastExit = -1
  for (let i = 0; i < lines.length; i++) {
    if (/process\.exit\s*\(/.test(lines[i]) && !/^\s*(\/\/|\*|\/\*)/.test(lines[i])) lastExit = i
  }
  if (lastExit < 0) return null   // no exit at all is a different problem
  for (let i = lastExit + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue
    if (/\bcheck\s*\(/.test(line)) return { line: i + 1, text: line.slice(0, 80) }
  }
  return null
}

for (const file of files) {
  const name = basename(file, '.ts')
  const outfile = join(OUT, `${name}.mjs`)

  const dead = deadAssertionsAfterExit(readFileSync(join(TESTS, file), 'utf8'))
  if (dead) {
    failures.push({
      name,
      stage: 'dead assertions',
      output: `Line ${dead.line} comes after this suite's process.exit and will never run:\n`
        + `    ${dead.text}\n\n`
        + 'Move the summary + process.exit to the very end of the file. Anything\n'
        + 'below them is skipped silently, and the suite still reports success.',
    })
    console.log(`  ✗ ${name}  (assertions after process.exit — line ${dead.line})`)
    continue
  }

  try {
    await build({
      entryPoints: [join(TESTS, file)],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node18',
      alias: { '@': join(root, 'src') },
      // The app reads these through Vite. Nothing here talks to Supabase, but
      // importing a module that constructs the client would throw without them.
      define: {
        'import.meta.env.VITE_SUPABASE_URL': '"http://test.invalid"',
        'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
      },
      logLevel: 'silent',
    })
  } catch (e) {
    failures.push({ name, stage: 'build', output: String(e.message ?? e).slice(0, 1200) })
    console.log(`  ✗ ${name}  (did not compile)`)
    continue
  }

  try {
    const out = execFileSync(process.execPath, [outfile], { encoding: 'utf8', stdio: 'pipe' })
    passed++
    const count = (out.match(/^\s*ok\s/gm) ?? []).length || (out.match(/^PASS/gm) ?? []).length
    console.log(`  ✓ ${name}${count ? `  (${count})` : ''}`)
    if (verbose) console.log(indent(out))
  } catch (e) {
    const output = `${e.stdout ?? ''}${e.stderr ?? ''}`
    failures.push({ name, stage: 'run', output })
    const bad = output.split('\n').filter(l => /FAIL/.test(l))
    console.log(`  ✗ ${name}`)
    for (const line of bad.slice(0, 8)) console.log(`      ${line.trim()}`)
    if (bad.length > 8) console.log(`      … and ${bad.length - 8} more`)
    if (bad.length === 0) console.log(indent(output.slice(-800)))
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1)
console.log(`\n${passed}/${files.length} suites passed in ${secs}s`)

if (failures.length > 0) {
  console.log(`\nFailed: ${failures.map(f => f.name).join(', ')}`)
  process.exit(1)
}

function indent(s) {
  return s.split('\n').map(l => (l ? `      ${l}` : l)).join('\n')
}
