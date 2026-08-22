/**
 * `react-dom/server.browser`, which @types/react-dom does not declare.
 *
 * Only the test suite uses it, and only because the default `react-dom/server`
 * entry is CommonJS that reaches for `require('stream')` — which esbuild cannot
 * fold into the ESM bundle the test runner produces. The browser entry has no
 * node dependencies and returns the same string.
 *
 * Declared narrowly: just the one function actually called. A wider `any` would
 * let the rest of the module's surface through untyped for no benefit.
 */
declare module 'react-dom/server.browser' {
  import type { ReactElement } from 'react'
  export function renderToStaticMarkup(element: ReactElement): string
}
