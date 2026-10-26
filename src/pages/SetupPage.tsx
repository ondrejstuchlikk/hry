/** Shown when the Supabase env variables are missing. */
export function SetupPage() {
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-3 text-2xl font-bold">Aplikace není nastavená</h1>
      <p className="mb-3 text-stone-700">
        Chybí připojení k Supabase. Vytvoř soubor <code className="rounded bg-stone-200 px-1">.env.local</code> podle{' '}
        <code className="rounded bg-stone-200 px-1">.env.example</code> a vyplň:
      </p>
      <pre className="overflow-x-auto rounded-xl bg-neutral-900 p-4 text-sm text-neutral-100">
        VITE_SUPABASE_URL=…{'\n'}VITE_SUPABASE_ANON_KEY=…
      </pre>
      <p className="mt-3 text-stone-700">
        Pro nasazení na GitHub Pages je přidej jako repository secrets. Podrobnosti jsou v README.
      </p>
    </div>
  )
}
