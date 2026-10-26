import { NavLink, Outlet } from 'react-router'
import { signOut } from '../lib/auth'
import { useAuth } from '../lib/AuthProvider'

// Links with an icon show only the icon on narrow screens (the label stays for screen readers).
const links = [
  { to: '/', label: 'Hry', end: true },
  { to: '/celkove', label: 'Celkové statistiky', end: false },
  { to: '/nastaveni', label: 'Nastavení', end: false, icon: '⚙️' },
]

export function Layout() {
  const { profile } = useAuth()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-2 sm:gap-2 sm:px-6">
          <span className="mr-1 hidden text-xl sm:inline" aria-hidden>
            🎲
          </span>
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold sm:px-3 sm:text-base ${
                    isActive ? 'bg-brand-50 text-accent' : 'text-stone-600 hover:bg-stone-100'
                  }`
                }
              >
                {l.icon ? (
                  <>
                    <span aria-hidden>{l.icon}</span>
                    <span className="sr-only sm:not-sr-only sm:ml-1.5">{l.label}</span>
                  </>
                ) : (
                  l.label
                )}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-32 truncate text-sm text-stone-500 sm:inline">{profile?.username}</span>
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-lg px-2.5 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100"
              title={profile?.username}
            >
              Odhlásit
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
