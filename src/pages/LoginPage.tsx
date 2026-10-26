import { useState, type FormEvent } from 'react'
import { Button, ErrorText } from '../components/ui'
import { MIN_PASSWORD_LENGTH, signIn, signUp } from '../lib/auth'

type Tab = 'login' | 'register'

export function LoginPage() {
  const [tab, setTab] = useState<Tab>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const message = tab === 'login' ? await signIn(username, password) : await signUp(username, password)
    setBusy(false)
    if (message) setError(message)
  }

  const inputClass =
    'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

  return (
    <div className="flex min-h-dvh items-start justify-center px-4 pt-[12vh]">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-5xl" aria-hidden>
            🎲
          </div>
          <h1 className="mt-2 text-2xl font-bold">Hry – skóre</h1>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1" role="tablist">
            {(
              [
                ['login', 'Přihlásit se'],
                ['register', 'Registrovat'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => {
                  setTab(value)
                  setError(null)
                }}
                className={`rounded-lg py-2 font-semibold ${tab === value ? 'bg-white shadow-sm' : 'text-stone-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-600">Uživatelské jméno</span>
              <input
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-600">Heslo</span>
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </label>
            {tab === 'register' && (
              <p className="text-sm text-stone-500">Jméno: 3–20 znaků (a–z, 0–9, „_“, „-“). Heslo: aspoň {MIN_PASSWORD_LENGTH} znaků, libovolné.</p>
            )}
            <ErrorText>{error}</ErrorText>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {tab === 'login' ? 'Přihlásit se' : 'Registrovat'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
