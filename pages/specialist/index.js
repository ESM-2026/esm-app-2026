import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { getSession } from '../../lib/auth'

const CONFIDENTIAL_LABELS = {
  q_c1: 'Tristesse ou vide persistant',
  q_c2: 'Sentiment de dépassement ou d\'absence d\'espoir',
  q_c3: 'Sentiment de sécurité (sport)',
  q_c4: 'Pensées préoccupantes à partager',
}

const SCALE_C = {
  q_c1: ['Jamais','Parfois','Souvent','Presque toujours'],
  q_c2: ['Jamais','Parfois','Souvent','Presque toujours'],
  q_c3: ['Jamais','Rarement','Parfois','Souvent','Toujours'],
  q_c4: ['Jamais','Parfois','Souvent','Presque toujours'],
}

function flag(key, value) {
  if (value == null) return null
  // Q_C1, Q_C2, Q_C4: 3-4 = alerte; Q_C3: 1-2 = alerte
  if (key === 'q_c3') return value <= 2 ? 'red' : value === 3 ? 'yellow' : 'green'
  return value >= 4 ? 'red' : value === 3 ? 'yellow' : 'green'
}

export default function SpecialistView() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [athletes, setAthletes] = useState([])
  const [responses, setResponses] = useState([]) // all responses
  const [filter, setFilter] = useState('all') // all | alerts
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const u = getSession()
    if (!u || u.role !== 'specialist') { router.push('/login'); return }
    setUser(u)
    supabase.from('teams').select('id, name').order('name').then(({ data }) => setTeams(data || []))
  }, [])

  async function loadTeam(teamId) {
    setLoading(true)
    const { data: ath } = await supabase.from('athletes').select('id, first_name, last_name').eq('team_id', teamId).order('last_name')
    setAthletes(ath || [])
    if (!ath || ath.length === 0) { setLoading(false); return }

    const { data: recs } = await supabase
      .from('responses')
      .select('athlete_id, submitted_at, q_c1, q_c2, q_c3, q_c4, comment')
      .in('athlete_id', ath.map(a => a.id))
      .order('submitted_at', { ascending: false })

    setResponses(recs || [])
    setLoading(false)
  }

  function handleTeamChange(e) {
    setSelectedTeam(e.target.value)
    if (e.target.value) loadTeam(e.target.value)
  }

  // Latest response per athlete
  const latestMap = {}
  for (const r of responses) {
    if (!latestMap[r.athlete_id]) latestMap[r.athlete_id] = r
  }

  const rows = athletes.map(a => ({ athlete: a, response: latestMap[a.id] || null }))

  const displayRows = filter === 'alerts'
    ? rows.filter(({ response }) => {
        if (!response) return false
        return ['q_c1','q_c2','q_c3','q_c4'].some(k => flag(k, response[k]) !== 'green')
      })
    : rows

  return (
    <Layout title="Vue Spécialiste" user={user}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: '#7c3aed' }}>🔒 Vue Spécialiste — Questions confidentielles</h2>
        <div style={{ background: '#f3e8ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', color: '#6d28d9', maxWidth: 340 }}>
          Ces données sont strictement réservées aux professionnels désignés. Elles ne sont jamais partagées avec les entraîneurs.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontWeight: 600, marginRight: 8 }}>Équipe</label>
          <select value={selectedTeam} onChange={handleTeamChange} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d0d5dd' }}>
            <option value="">— Sélectionner —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {selectedTeam && (
          <div>
            <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} style={{ marginRight: 8 }} onClick={() => setFilter('all')}>Tous</button>
            <button className={`btn ${filter === 'alerts' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('alerts')}>Alertes seulement</button>
          </div>
        )}
      </div>

      {loading && <p style={{ color: '#888' }}>Chargement…</p>}

      {!loading && selectedTeam && displayRows.length === 0 && (
        <p style={{ color: '#888' }}>Aucun athlète ou aucune réponse pour cette sélection.</p>
      )}

      {!loading && displayRows.map(({ athlete, response }) => {
        if (!response) {
          return (
            <div key={athlete.id} className="card" style={{ padding: '14px 20px', color: '#888', fontStyle: 'italic' }}>
              {athlete.last_name}, {athlete.first_name} — Aucune réponse enregistrée
            </div>
          )
        }
        const hasAlert = ['q_c1','q_c2','q_c3','q_c4'].some(k => flag(k, response[k]) === 'red')
        const hasWarning = ['q_c1','q_c2','q_c3','q_c4'].some(k => flag(k, response[k]) === 'yellow')
        return (
          <div key={athlete.id} className="card" style={{ borderLeft: `4px solid ${hasAlert ? '#dc2626' : hasWarning ? '#ca8a04' : '#16a34a'}`, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <strong style={{ fontSize: '1rem' }}>{athlete.last_name}, {athlete.first_name}</strong>
              <span style={{ fontSize: '0.8rem', color: '#888' }}>
                Réponse du {new Date(response.submitted_at).toLocaleDateString('fr-CA')}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {Object.keys(CONFIDENTIAL_LABELS).map(key => {
                const val = response[key]
                const color = flag(key, val)
                const label = val != null ? SCALE_C[key]?.[val - 1] || val : '—'
                return (
                  <div key={key} style={{ background: color === 'red' ? '#fee2e2' : color === 'yellow' ? '#fef9c3' : '#f0fdf4', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>{CONFIDENTIAL_LABELS[key]}</div>
                    <div style={{ fontWeight: 700, color: color === 'red' ? '#991b1b' : color === 'yellow' ? '#854d0e' : '#166534' }}>
                      {val != null ? `${val} — ${label}` : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
            {response.comment && (
              <div style={{ marginTop: 14, background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: '0.88rem' }}>
                <div style={{ fontWeight: 600, color: '#555', marginBottom: 4 }}>Commentaire de l'athlète</div>
                <div>{response.comment}</div>
              </div>
            )}
          </div>
        )
      })}
    </Layout>
  )
}
