import { supabase } from './supabase'

/**
 * Supabase Auth needs an email, users only ever see a username.
 * The domain only has to pass Supabase's email validation; no mail is ever sent
 * ("Confirm email" is disabled). If Supabase rejects it, change it here.
 */
export const AUTH_EMAIL_DOMAIN = 'ondrejstuchlikk.github.io'

export const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/
/** Any characters allowed; only the length is checked. */
export const MIN_PASSWORD_LENGTH = 5

/**
 * Supabase rejects passwords shorter than 6 characters, so a fixed suffix is appended
 * before sending. Users never see it. When an admin sets a password in the Supabase
 * dashboard, they must append this suffix too.
 */
export const PASSWORD_SUFFIX = '#hry'

function toAuthPassword(password: string): string {
  return password + PASSWORD_SUFFIX
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`
}

/** Returns a Czech error message, or null when the username is valid. */
export function validateUsername(username: string): string | null {
  const u = normalizeUsername(username)
  if (u.length < 3 || u.length > 20) return 'Uživatelské jméno musí mít 3–20 znaků'
  if (!USERNAME_PATTERN.test(u)) return 'Povolená jsou jen písmena a–z, číslice, „_“ a „-“'
  return null
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code
}

/** Returns a Czech error message, or null on success. */
export async function signUp(username: string, password: string): Promise<string | null> {
  const usernameError = validateUsername(username)
  if (usernameError) return usernameError
  if (password.length < MIN_PASSWORD_LENGTH) return `Heslo musí mít aspoň ${MIN_PASSWORD_LENGTH} znaků`

  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password: toAuthPassword(password),
    options: { data: { username: normalizeUsername(username) } },
  })
  if (error) {
    switch (errorCode(error)) {
      case 'user_already_exists':
      case 'email_exists':
        return 'Uživatelské jméno je už obsazené'
      case 'weak_password':
        return `Heslo je příliš slabé – zkontroluj „Password requirements“ v nastavení Supabase`
      case 'email_address_invalid':
        return `Supabase odmítl e-mailovou doménu „${AUTH_EMAIL_DOMAIN}“ – změň AUTH_EMAIL_DOMAIN v src/lib/auth.ts`
      default:
        return `Registrace se nezdařila: ${error.message}`
    }
  }
  if (!data.session) {
    return 'Účet byl vytvořen, ale v Supabase je zapnuté „Confirm email“ – vypni ho a přihlas se'
  }
  return null
}

/** Returns a Czech error message, or null on success. */
export async function signIn(username: string, password: string): Promise<string | null> {
  const email = usernameToEmail(username)
  let { error } = await supabase.auth.signInWithPassword({ email, password: toAuthPassword(password) })
  // Accounts created before the suffix was introduced use the plain password.
  if (errorCode(error) === 'invalid_credentials' && password.length >= 6) {
    ;({ error } = await supabase.auth.signInWithPassword({ email, password }))
  }
  if (!error) return null
  if (errorCode(error) === 'invalid_credentials') return 'Špatné jméno nebo heslo'
  return `Přihlášení se nezdařilo: ${error.message}`
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
