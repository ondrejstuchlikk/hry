import { Card, SectionTitle } from '../components/ui'
import { ACCENTS, setAccent, setThemeMode, useAppearance, type ThemeMode } from '../lib/theme'

const MODES: { id: ThemeMode; label: string; icon: string }[] = [
  { id: 'light', label: 'Světlý', icon: '☀️' },
  { id: 'dark', label: 'Tmavý', icon: '🌙' },
  { id: 'system', label: 'Podle systému', icon: '💻' },
]

export function SettingsPage() {
  const { mode, accent } = useAppearance()

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-extrabold">Nastavení</h1>

      <Card>
        <SectionTitle>Vzhled</SectionTitle>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Vzhled">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setThemeMode(m.id)}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-sm font-semibold ring-1 transition ${
                mode === m.id
                  ? 'bg-brand-50 text-accent ring-2 ring-brand-500'
                  : 'bg-surface text-stone-700 ring-stone-200 hover:bg-stone-50'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {m.icon}
              </span>
              {m.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Barva aplikace</SectionTitle>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Barva aplikace">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={accent === a.id}
              onClick={() => setAccent(a.id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-xs font-semibold ring-1 transition ${
                accent === a.id ? 'ring-2 ring-stone-800' : 'ring-stone-200 hover:bg-stone-50'
              }`}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm text-white"
                style={{ background: a.swatch }}
                aria-hidden
              >
                {accent === a.id ? '✓' : ''}
              </span>
              {a.label}
            </button>
          ))}
        </div>
      </Card>
      <p className="text-center text-xs text-stone-500">Nastavení se ukládá jen v tomto zařízení.</p>
    </div>
  )
}
