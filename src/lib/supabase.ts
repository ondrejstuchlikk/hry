import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are provided. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// A placeholder client keeps imports working; the app shows a setup screen instead of using it.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key')
