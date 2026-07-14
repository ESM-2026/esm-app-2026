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
  if (key === 'q_c3') return value <= 2 ? 'red' : value === 3 ? 'yellow' : 'green'
  return value >= 4 ? 'red' : value === 3 ? 'yellow' : 'green'
}

const PHYSICAL_STATUS_OPTIONS = [
  { value: 'red',    emoji: '🔴', label: 'Aucune pratique',            bg: '#fee2e2', border: '#dc2626', text: '#991b1b' },
  { value: 'yellow', emoji: '🟡', label: 'Pratique avec restrictions', bg: '#fef9c3', border: '#ca8a04', text: '#854d0e' },
  { value: 'green',  emoji: '🟢', label: 'Aucune restriction',         bg: '#dcfce7', border: '#16a34a', text: '#166534' },
]

function PhysicalStatusBadge({ status }) {
  const opt = PHYSICAL_STATUS_OPTIONS.find(o => o.value === status)
  if (!opt) return <span style={{ color: '#999', fontSize: '0.8rem' }}>Non défini</span>
  return (
    <span style={{ background: opt.bg, color: opt.text, border: `1px solid ${opt.border}`, borderRadius: 20, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
      {opt.emoji} {opt.label}
    </span>
  )
}

export default function SpecialistView() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [athletes, setAthletes] = useState([])
  const [responses, setResponses] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [physicalStatuses, setPhysicalStatuses] = useState({}) // {athleteId: status}
  const [physicalNotes, setPhysicalNotes] = useState({})       // {athleteId: note text}
  const [savingStatus, setSavingStatus] = useState({})         // {athleteId: bool}
  const [noteSaved, setNoteSaved] = useState({})               // {athleteId: 'saved'|'error'|false}
  const [statusMsg, setStatusMsg] = useState({})               // {athleteId: string} message d'erreur statut

  useEffect(() => {
    const u = getSession()
    if (!u || u.role !== 'specialist') { router.push('/login'); return }
    setUser(u)
    loadTeams(u.id, u.can_view_confidential)
  }, [])

  const canViewConfidential = user?.can_view_confidential === true

  async function loadTeams(specialistId, canViewConf) {
    const { data: ts } = await supabase
      .from('team_specialists')
      .select('team_id, teams(id, name)')
      .eq('specialist_id', specialistId)
    const assignedTeams = (ts || []).map(r => r.teams).filter(Boolean)
    setTeams(assignedTeams)
    // Si une seule équipe assignée, la charger automatiquement
    if (assignedTeams.length === 1) {
      setSelectedTeam(String(assignedTeams[0].id))
      loadTeamAthletes(assignedTeams[0].id, canViewConf)
    }
  }

  async function loadTeamAthletes(teamId, canViewConf) {
    setLoading(true)
    const { data: ath } = await supabase
      .from('athletes')
      .select('id, first_name, last_name, physical_status, physical_status_note')
      .eq('team_id', teamId)
      .order('last_name')
    setAthletes(ath || [])

    const statusMap = {}
    const noteMap = {}
    for (const a of (ath || [])) {
      statusMap[a.id] = a.physical_status || null
      noteMap[a.id] = a.physical_status_note || ''
    }
    setPhysicalStatuses(statusMap)
    setPhysicalNotes(noteMap)

    if (!ath || ath.length === 0) { setLoading(false); return }

    // Charger les réponses confidentielles seulement si autorisé
    const viewConf = canViewConf !== undefined ? canViewConf : user?.can_view_confidential
    if (viewConf) {
      const { data: recs } = await supabase
        .from('responses')
        .select('athlete_id, submitted_at, q_c1, q_c2, q_c3, q_c4, comment')
        .in('athlete_id', ath.map(a => a.id))
        .order('submitted_at', { ascending: false })
      setResponses(recs || [])
    }
    setLoading(false)
  }

  function handleTeamChange(e) {
    setSelectedTeam(e.target.value)
    if (e.target.value) loadTeamAthletes(e.target.value)
  }

  async function setPhysicalStatus(athleteId, status) {
    setSavingStatus(prev => ({ ...prev, [athleteId]: true }))
    setStatusMsg(prev => ({ ...prev, [athleteId]: '' }))
    // Cliquer sur le statut actif le désactive
    const newStatus = physicalStatuses[athleteId] === status ? null : status
    const clearNote = newStatus === 'green' || newStatus === null

    // Essayer d'abord avec physical_status_note, sinon sans
    let { error } = await supabase
      .from('athletes')
      .update({ physical_status: newStatus, ...(clearNote ? { physical_status_note: null } : {}) })
      .eq('id', athleteId)

    if (error) {
      // Réessayer sans physical_status_note (colonne peut ne pas exister)
      const retry = await supabase.from('athletes').update({ physical_status: newStatus }).eq('id', athleteId)
      error = retry.error
    }

    if (!error) {
      setPhysicalStatuses(prev => ({ ...prev, [athleteId]: newStatus }))
      if (clearNote) setPhysicalNotes(prev => ({ ...prev, [athleteId]: '' }))
    } else {
      setStatusMsg(prev => ({ ...prev, [athleteId]: '❌ Erreur: ' + error.message }))
    }
    setSavingStatus(prev => ({ ...prev, [athleteId]: false }))
  }

  async function saveNote(athleteId) {
    const note = physicalNotes[athleteId] || ''
    const { error } = await supabase
      .from('athletes')
      .update({ physical_status_note: note || null })
      .eq('id', athleteId)
    if (!error) {
      setNoteSaved(prev => ({ ...prev, [athleteId]: 'saved' }))
      setTimeout(() => setNoteSaved(prev => ({ ...prev, [athleteId]: false })), 2500)
    } else {
      setNoteSaved(prev => ({ ...prev, [athleteId]: 'error' }))
      setTimeout(() => setNoteSaved(prev => ({ ...prev, [athleteId]: false })), 3000)
    }
  }

  // Latest response per athlete
  const latestMap = {}
  for (const r of responses) {
    if (!latestMap[r.athlete_id]) latestMap[r.athlete_id] = r
  }

  const rows = athletes.map(a => ({ athlete: a, response: latestMap[a.id] || null }))

  const displayRows = (canViewConfidential && filter === 'alerts')
    ? rows.filter(({ response }) => {
        if (!response) return false
        return ['q_c1','q_c2','q_c3','q_c4'].some(k => flag(k, response[k]) !== 'green')
      })
    : rows

  return (
    <Layout title="Vue Spécialiste" user={user}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ color: '#7c3aed' }}>🏥 Vue Spécialiste</h2>
        {canViewConfidential ? (
          <div style={{ background: '#f3e8ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', color: '#6d28d9', maxWidth: 340 }}>
            🔒 Vous avez accès aux données confidentielles. Elles ne sont jamais partagées avec les entraîneurs.
          </div>
        ) : (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', color: '#6b7280', maxWidth: 340 }}>
            🔓 Accès limité — Capacité physique uniquement. Contactez l'administrateur pour accéder aux données confidentielles.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontWeight: 600, marginRight: 8 }}>Équipe</label>
          <select value={selectedTeam} onChange={handleTeamChange} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d0d5dd' }}>
            <option value="">— Sélectionner —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {selectedTeam && canViewConfidential && (
          <div>
            <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} style={{ marginRight: 8 }} onClick={() => setFilter('all')}>Tous</button>
            <button className={`btn ${filter === 'alerts' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('alerts')}>Alertes seulement</button>
          </div>
        )}
      </div>

      {!loading && teams.length === 0 && (
        <div className="card" style={{ padding: '24px', color: '#888', textAlign: 'center' }}>
          Aucune équipe ne vous est assignée. Contactez l'administrateur.
        </div>
      )}

      {loading && <p style={{ color: '#888' }}>Chargement…</p>}
      {!loading && selectedTeam && displayRows.length === 0 && (
        <p style={{ color: '#888' }}>Aucun athlète dans cette équipe.</p>
      )}

      {!loading && displayRows.map(({ athlete, response }) => {
        const currentStatus = physicalStatuses[athlete.id] || null
        const isSaving = savingStatus[athlete.id]
        const note = physicalNotes[athlete.id] ?? ''
        const showNoteField = currentStatus === 'red' || currentStatus === 'yellow'
        const errMsg = statusMsg[athlete.id]
        const hasAlert = canViewConfidential && ['q_c1','q_c2','q_c3','q_c4'].some(k => flag(k, response?.[k]) === 'red')
        const hasWarning = canViewConfidential && ['q_c1','q_c2','q_c3','q_c4'].some(k => flag(k, response?.[k]) === 'yellow')

        return (
          <div key={athlete.id} className="card" style={{ borderLeft: `4px solid ${hasAlert ? '#dc2626' : hasWarning ? '#ca8a04' : '#16a34a'}`, marginBottom: 14 }}>

            {/* En-tête athlète */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong style={{ fontSize: '1rem' }}>{athlete.last_name}, {athlete.first_name}</strong>
                {response && (
                  <span style={{ marginLeft: 12, fontSize: '0.8rem', color: '#888' }}>
                    Réponse du {new Date(response.submitted_at).toLocaleDateString('fr-CA')}
                  </span>
                )}
                {!response && (
                  <span style={{ marginLeft: 12, fontSize: '0.8rem', color: '#bbb', fontStyle: 'italic' }}>Aucune réponse enregistrée</span>
                )}
              </div>

              {/* Boutons statut */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>Capacité physique :</span>
                {isSaving ? (
                  <span style={{ fontSize: '0.8rem', color: '#888' }}>Enregistrement…</span>
                ) : (
                  PHYSICAL_STATUS_OPTIONS.map(opt => {
                    const isActive = currentStatus === opt.value
                    return (
                      <button
                        key={opt.value}
                        title={opt.label}
                        onClick={() => setPhysicalStatus(athlete.id, opt.value)}
                        style={{
                          background: isActive ? opt.bg : '#f9fafb',
                          border: `2px solid ${isActive ? opt.border : '#e5e7eb'}`,
                          borderRadius: 20,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: isActive ? 700 : 400,
                          color: isActive ? opt.text : '#6b7280',
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt.emoji} {opt.label}
                      </button>
                    )
                  })
                )}
                {errMsg && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{errMsg}</span>}
              </div>
            </div>

            {/* Zone de texte pour la raison — visible seulement si rouge ou jaune */}
            {showNoteField && (
              <div style={{
                background: currentStatus === 'red' ? '#fff8f8' : '#fffef0',
                border: `1px solid ${currentStatus === 'red' ? '#fca5a5' : '#fde68a'}`,
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 14,
              }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: currentStatus === 'red' ? '#991b1b' : '#854d0e', display: 'block', marginBottom: 6 }}>
                  {currentStatus === 'red' ? '🔴 Raison — Aucune pratique' : '🟡 Raison — Pratique avec restrictions'}
                </label>
                <textarea
                  value={note}
                  onChange={e => setPhysicalNotes(prev => ({ ...prev, [athlete.id]: e.target.value }))}
                  onBlur={() => saveNote(athlete.id)}
                  placeholder="Décrivez la raison ou les restrictions spécifiques (ex. : entorse cheville, protocole commotion, surcharge de travail…)"
                  rows={2}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    borderColor: currentStatus === 'red' ? '#fca5a5' : '#fde68a',
                    fontSize: '0.88rem',
                    marginBottom: 6,
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    className="btn btn-outline"
                    style={{ padding: '4px 14px', fontSize: '0.8rem' }}
                    onClick={() => saveNote(athlete.id)}
                  >
                    Enregistrer
                  </button>
                  {noteSaved[athlete.id] === 'saved' && (
                    <span style={{ fontSize: '0.8rem', color: '#16a34a' }}>✓ Enregistré</span>
                  )}
                  {noteSaved[athlete.id] === 'error' && (
                    <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>❌ Erreur — exécutez add_physical_status_note.sql dans Supabase</span>
                  )}
                </div>
              </div>
            )}

            {/* Questions confidentielles — seulement si autorisé */}
            {canViewConfidential && response && (
              <>
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
              </>
            )}
          </div>
        )
      })}
    </Layout>
  )
}
