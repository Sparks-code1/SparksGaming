/// <reference types="vite/client" />

// Without the reference above, `import.meta.env` is untyped and every read of
// it is a compile error — which is why `npm run build` (the only script that
// runs tsc) failed while `vite build` succeeded. Vite strips types, so it never
// noticed; tsc did.

/** The environment this app actually reads. Declared so a typo in a variable
 *  name is a compile error rather than `undefined` at runtime. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Baked in by vite.config.ts: `<version>+<commit>`. See src/lib/buildId.ts. */
declare const __BUILD_ID__: string
