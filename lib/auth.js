import { supabase } from './supabase'

// Login avec username/password (comparaison via pgcrypto côté DB)
export async function login(username, password) {
  const { data, error } = await supabase.rpc('login', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data // retourne { id, username, role, email }
}

// Sauvegarde la session dans localStorage
export function saveSession(user) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('esm_user', JSON.stringify(user))
  }
}

export function getSession() {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('esm_user')
  return raw ? JSON.parse(raw) : null
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('esm_user')
  }
}
