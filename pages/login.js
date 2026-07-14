import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import { saveSession } from '../lib/auth'

export default function Home() {
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
        <title>ESM CoachAPP — Excellence Sportive Montérégie</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={s.page}>

        {/* En-tête */}
        <div style={s.header}>
          <h1 style={s.headerTitle}>ESM CoachAPP</h1>
          <p style={s.headerSub}>Excellence Sportive Montérégie</p>
        </div>

        <div style={s.body}>

          {/* ── SECTION ATHLÈTES ── */}
          <div style={s.athleteSection}>
            <div style={s.sectionLabel}>👤 Athlètes</div>
            <p style={s.athleteDesc}>
              Sélectionne ce que tu veux compléter cette semaine :
            </p>
            <div style={s.athleteCards}>
              <a href="/questionnaire" style={s.card}>
                <div style={s.cardIcon}>🧠</div>
                <div style={s.cardTitle}>Questionnaire<br/>Santé Mentale</div>
                <div style={s.cardSub}>Hebdomadaire · ~5 min</div>
              </a>
              <a href="/journal" style={s.card}>
                <div style={s.cardIcon}>📔</div>
                <div style={s.cardTitle}>Journal<br/>de bord</div>
                <div style={s.cardSub}>Hebdomadaire · ~5 min</div>
              </a>
            </div>
          </div>

          {/* ── SÉPARATEUR ── */}
          <div style={s.divider}>
            <span style={s.dividerText}>Accès intervenants</span>
          </div>

          {/* ── LOGIN STAFF ── */}
          <div style={s.staffSection}>
            <div style={s.sectionLabel}>🔐 Entraîneurs · Spécialistes · Admins</div>
            <form onSubmit={handleSubmit} style={s.form}>
              <div style={s.formRow}>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label>Nom d'utilisateur</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label>Mot de passe</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ whiteSpace: 'nowrap' }}>
                    {loading ? 'Connexion…' : 'Se connecter'}
                  </button>
                </div>
              </div>
              {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
            </form>
          </div>

        </div>

        <div style={s.footer}>Excellence Sportive Montérégie © {new Date().getFullYear()}</div>
      </div>
    </>
  )
}

const s = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif', background: '#f0f4f8',
  },
  header: {
    background: '#1a3a5c', color: '#fff', textAlign: 'center', padding: '32px 24px',
  },
  headerTitle: { fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.02em' },
  headerSub: { marginTop: 8, opacity: 0.75, fontSize: '0.95rem' },
  body: { flex: 1, maxWidth: 800, margin: '0 auto', width: '100%', padding: '32px 20px' },

  sectionLabel: {
    fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: '#6b7280', marginBottom: 12,
  },

  athleteSection: { marginBottom: 32 },
  athleteDesc: { color: '#374151', fontSize: '1rem', marginBottom: 20 },
  athleteCards: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  card: {
    flex: '1 1 200px', background: '#fff', borderRadius: 16, padding: '28px 24px',
    textAlign: 'center', textDecoration: 'none', color: 'inherit',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '2px solid transparent',
    transition: 'all 0.2s', cursor: 'pointer', display: 'block',
  },
  cardIcon: { fontSize: 44, marginBottom: 12 },
  cardTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#1a3a5c', lineHeight: 1.3 },
  cardSub: { marginTop: 8, fontSize: '0.8rem', color: '#9ca3af' },

  divider: {
    display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 28px',
  },
  dividerText: {
    fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap',
    background: '#f0f4f8', padding: '0 8px',
  },

  staffSection: {
    background: '#fff', borderRadius: 12, padding: '24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  form: { marginTop: 12 },
  formRow: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' },

  footer: { textAlign: 'center', padding: '16px', fontSize: '0.75rem', color: '#9ca3af' },
}
