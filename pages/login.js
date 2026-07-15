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
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', whiteSpace: 'nowrap' }} disabled={loading}>
                    {loading ? 'Connexion…' : 'Connexion →'}
                  </button>
                </div>
              </div>
              {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f5f7fa', display: 'flex', flexDirection: 'column' },
  header: { background: '#3C3C3C', padding: '32px 24px', textAlign: 'center', borderBottom: '4px solid #C5D400' },
  headerTitle: { color: '#C5D400', fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.05em' },
  headerSub: { color: 'rgba(255,255,255,0.7)', marginTop: 4, fontSize: '0.9rem' },
  body: { flex: 1, maxWidth: 640, margin: '0 auto', width: '100%', padding: '32px 16px' },
  athleteSection: { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 24 },
  sectionLabel: { fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 },
  athleteDesc: { color: '#555', marginBottom: 16, fontSize: '0.9rem' },
  athleteCards: { display: 'flex', gap: 14 },
  card: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 12px', borderRadius: 12, border: '2px solid #e5e7eb', textDecoration: 'none', color: '#1a1a1a', background: '#fff' },
  cardIcon: { fontSize: 32, marginBottom: 10 },
  cardTitle: { fontWeight: 700, textAlign: 'center', fontSize: '0.9rem', lineHeight: 1.3, color: '#3C3C3C' },
  cardSub: { fontSize: '0.75rem', color: '#9ca3af', marginTop: 8 },
  divider: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 },
  dividerText: { fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap', background: '#f5f7fa', padding: '0 8px' },
  staffSection: { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  form: { marginTop: 16 },
  formRow: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' },
}
