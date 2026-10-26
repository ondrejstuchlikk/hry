import type { Session as AuthSession } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { closeStaleSessions } from './api'
import { supabase } from './supabase'
import type { Player, Profile } from './types'

interface AuthState {
  loading: boolean
  authSession: AuthSession | null
  profile: Profile | null
  /** The signed-in user's own player. */
  player: Player | null
}

const AuthContext = createContext<AuthState>({
  loading: true,
  authSession: null,
  profile: null,
  player: null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authSession: null,
    profile: null,
    player: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load(authSession: AuthSession | null) {
      if (!authSession) {
        if (!cancelled) setState({ loading: false, authSession: null, profile: null, player: null })
        return
      }
      const userId = authSession.user.id
      const [{ data: profile }, { data: player }] = await Promise.all([
        supabase.from('profiles').select('id, username').eq('id', userId).maybeSingle(),
        supabase.from('players').select('*').eq('user_id', userId).maybeSingle(),
      ])
      if (!cancelled) {
        setState({ loading: false, authSession, profile: profile ?? null, player: player ?? null })
      }
      // Sessions idle for over an hour are closed on app load.
      closeStaleSessions().catch(() => {})
    }

    const { data } = supabase.auth.onAuthStateChange((event, authSession) => {
      // Token refreshes keep the same user; avoid reloading everything.
      if (event === 'TOKEN_REFRESHED') return
      // Supabase recommends not awaiting other Supabase calls inside this callback.
      setTimeout(() => load(authSession), 0)
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext)
}
