import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import { saveSession } from '../lib/auth'

export default function Login() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: rpcErr } = await supabase.rpc('login', {
        p_username: username.trim(),
        p_password: password,
      })
      if (rpcErr) throw rpcErr
      if (!data || data.length === 0) {
        setError('Nom d\'utilisateur ou mot de passe incorrect.')
        setLoading(false)
        return
      }
      const user = data[0]
      saveSession(user)
      if (user.role === 'admin') router.push('/admin')
      else if (user.role === 'coach') router.push('/coach')
      else if (user.role === 'specialist') router.push('/specialist')
    } catch (err) {
      setError('Erreur: ' + (err?.message || JSON.stringify(err)))
    }
    setLoading(false)
  }

  return (
    <>
      <Head>
        <title>Connexion — ESM CoachAPP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.banner}>
            <h1 style={s.title}>ESM CoachAPP</h1>
            <p style={s.subtitle}>Excellence Sportive Montérégie</p>
          </div>
          <form onSubmit={handleSubmit} style={s.form}>
            <div className="form-group">
              <label>Nom d'utilisateur</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div className="form-group">
              <label>Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
            <div style={s.publicLinks}>
              <a href="/questionnaire" style={s.link}>Questionnaire athlète</a>
              <span style={{ color: '#d0d5dd' }}>·</span>
              <a href="/journal" style={s.link}>Journal de bord</a>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 16 },
  card: { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', overflow: 'hidden' },
  banner: { background: '#1a3a5c', color: '#fff', textAlign: 'center', padding: '32px 24px' },
  title: { fontSize: '1.5rem', fontWeight: 700 },
  subtitle: { marginTop: 6, opacity: 0.8, fontSize: '0.85rem' },
  form: { padding: '28px 24px' },
  publicLinks: { marginTop: 20, textAlign: 'center', fontSize: '0.85rem', display: 'flex', gap: 12, justifyContent: 'center' },
  link: { color: '#1a3a5c', textDecoration: 'none', fontWeight: 500 },
}
