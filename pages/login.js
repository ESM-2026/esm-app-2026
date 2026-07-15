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
                  