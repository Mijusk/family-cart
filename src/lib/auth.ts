import { supabase } from './supabase'

/** Where the links in Supabase's emails send people back to. Must be in the project's Redirect URLs. */
const appUrl = (path = '/') => `${window.location.origin}${path}`

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

/**
 * Creates the account; the database creates its person with this name.
 * Returns false when the project asks to confirm the email first (no session yet).
 */
export async function signUp(displayName: string, email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: appUrl() },
  })
  if (error) throw error
  // With "Confirm email" on, an address that already has an account gets a fake user with no identities.
  if (data.user && data.user.identities?.length === 0) throw new Error('User already registered')
  return !!data.session
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('/nueva-contrasena') })
  if (error) throw error
}

export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
