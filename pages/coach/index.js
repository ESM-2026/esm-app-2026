import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { getSession } from '../../lib/auth'

// Questions non-confidentielles pour le tableau coach (écart par rapport à la moyenne)
const COACH_QUESTIONS = ['q_a','q_b','q_c','q_d','q_e','q_f','q_g','q_h','q_i','q_j','q_k','q_l','q_m','q_n','q_o','q_p']
const Q_LABELS = {
  q_a:'Motivation A',q_b:'Motivation B',q_c:'Motivation C',q_d:'Motivation D',
  q_e:'Sommeil',q_f:'Conciliation',q_g:'Anxiété',q_h:'Social',
  q_i:'Nutrition A',q_j:'Nutrition B',q_k:'Nutrition C',q_l:'Nutrition D',
  q_m:'Nutrition E',q_n:'Nutrition F',q_o:'Nutrition G',q_p:'Nutrition H',
}

// Couleur basée sur le score brut de q_general (1-5)
function generalColor(val) {
  if (val == null) return { bg: 'transparent', text: '#999' }
  if (val <= 2) return { bg: '#fee2e2', text: '#991b1b' }
  if (val === 3) return { bg: '#fef9c3', text: '#854d0e' }
  return { bg: '#dcfce7', text: '#166534' }
}
const GENERAL_LABELS = { 1: 'Très mal', 2: 'Mal', 3: 'Moyen', 4: 'Bien', 5: 'Très bien' }

function deviation(last, avg) {
  if (last == null || avg == null) return null
  return Math.round((last - avg) * 10) / 10
}

function devColor(d) {
  if (d == null) return 'grey'
  if (d >= -0.4) return 'green'
  if (d >= -1.0) return 'yellow'
  return 'red'
}

export default function CoachDashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('sante') // sante | journal | config
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [athleteData, setAthleteData] = useState([]) // [{athlete, last, avgs, devs}]
  const [journalEntries, setJournalEntries] = useState([])
  const [journalFilter, setJournalFilter] = useState('all') // 'all' | 'unread'
  const [replyText, setReplyText] = useState({})
  const [allQuestions, setAllQuestions] = useState([])
  const [coachConfig, setCoachConfig] = useState([]) // active question_ids
  const [loading, setLoading] = useState(false)
  const [newQ, setNewQ] = useState({ label: '', section: 'entrainement', input_type: 'textarea', min_val: 1, max_val: 10, options: [''] })
  const [newQMsg, setNewQMsg] = useState('')
  const [newAthlete, setNewAthlete] = useState({ first_name: '', last_name: '' })
  const [newAthleteMsg, setNewAthleteMsg] = useState('')
  const [showAddAthlete, setShowAddAthlete] = useState(false)

  useEffect(() => {
    const u = getSession()
    if (!u || u.role !== 'coach') { router.push('/login'); return }
    setUser(u)
    loadTeams(u.id)
    loadAllQuestions()
    loadCoachConfig(u.id)
  }, [])

  async function loadTeams(coachId) {
    const { data: tc } = await supabase.from('team_coaches').select('team_id, teams(id, name)').eq('coach_id', coachId)
    const t = (tc || []).map(r => r.teams).filter(Boolean)
    setTeams(t)
    if (t.length === 1) { setSelectedTeam(String(t[0].id)); loadTeamData(t[0].id) }
  }

  async function loadTeamData(teamId) {
    setLoading(true)
    // Get athletes
    const { data: athletes } = await supabase.from('athletes').select('id, first_name, last_name, physical_status, physical_status_note').eq('team_id', teamId).order('last_name')
    if (!athletes || athletes.length === 0) { setAthleteData([]); setLoading(false); return }

    const ids = athletes.map(a => a.id)

    // Get all responses for these athletes
    const { data: responses } = await supabase
      .from('responses')
      .select('*')
      .in('athlete_id', ids)
      .order('submitted_at')

    // Compute last + avg per athlete
    const result = athletes.map(athlete => {
      const recs = (responses || []).filter(r => r.athlete_id === athlete.id)
      const hasResponses = recs.length > 0
      const last = hasResponses ? recs[recs.length - 1] : null
      const avgs = {}
      COACH_QUESTIONS.forEach(q => {
        const vals = recs.map(r => r[q]).filter(v => v != null)
        avgs[q] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      })
      const devs = {}
      COACH_QUESTIONS.forEach(q => {
        devs[q] = deviation(last?.[q], avgs[q])
      })
      // 'none' = jamais répondu — placé en bas de liste, pas de couleur
      const worstColor = !hasResponses ? 'none' : COACH_QUESTIONS.reduce((worst, q) => {
        const c = devColor(devs[q])
        if (c === 'red') return 'red'
        if (c === 'yellow' && worst !== 'red') return 'yellow'
        return worst
      }, 'green')
      return { athlete, last, avgs, devs, worstColor, hasResponses, lastDate: last?.submitted_at, physicalStatus: athlete.physical_status || null, physicalNote: athlete.physical_status_note || null }
    })

    setAthleteData(result)

    // Load journals
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('*, athletes(first_name, last_name), journal_responses(*, journal_questions(label, section))')
      .in('athlete_id', ids)
      .order('submitted_at', { ascending: false })
      .limit(100)
    setJournalEntries(entries || [])
    setLoading(false)
  }

  async function loadAllQuestions() {
    const { data } = await supabase.from('journal_questions').select('*').order('section').order('id')
    setAllQuestions(data || [])
  }

  async function loadCoachConfig(coachId) {
    const { data } = await supabase.from('coach_journal_config').select('question_id, is_active, display_order').eq('coach_id', coachId)
    setCoachConfig((data || []).filter(c => c.is_active).map(c => c.question_id))
  }

  async function createQuestion(e) {
    e.preventDefault()
    if (!newQ.label.trim()) return
    setNewQMsg('')
    const opts = ['radio','checkbox'].includes(newQ.input_type)
      ? newQ.options.filter(o => o.trim())
      : null
    const { data: q, error } = await supabase
      .from('journal_questions')
      .insert([{
        created_by: user.id,
        section: newQ.section,
        label: newQ.label.trim(),
        input_type: newQ.input_type,
        min_val: newQ.input_type === 'slider' ? parseInt(newQ.min_val) : null,
        max_val: newQ.input_type === 'slider' ? parseInt(newQ.max_val) : null,
        options: opts ? JSON.stringify(opts) : null,
        is_predefined: false,
      }])
      .select()
      .single()
    if (error) { setNewQMsg('❌ Erreur: ' + error.message); return }
    // Auto-activer pour ce coach
    await saveCoachConfig(q.id, true)
    await loadAllQuestions()
    setNewQ({ label: '', section: 'entrainement', input_type: 'textarea', min_val: 1, max_val: 10, options: [''] })
    setNewQMsg('✅ Question créée et activée.')
  }

  async function deleteQuestion(qId) {
    if (!confirm('Supprimer cette question?')) return
    await supabase.from('journal_questions').delete().eq('id', qId)
    setCoachConfig(prev => prev.filter(id => id !== qId))
    await loadAllQuestions()
  }

  async function saveCoachConfig(qId, active) {
    const coachId = user.id
    const existing = await supabase.from('coach_journal_config').select('id').eq('coach_id', coachId).eq('question_id', qId).single()
    if (existing.data) {
      await supabase.from('coach_journal_config').update({ is_active: active }).eq('id', existing.data.id)
    } else {
      await supabase.from('coach_journal_config').insert([{ coach_id: coachId, question_id: qId, is_active: active, display_order: 0 }])
    }
    setCoachConfig(prev => active ? [...prev, qId] : prev.filter(id => id !== qId))
  }

  async function sendReply(entryId) {
    const text = replyText[entryId]
    if (!text?.trim()) return
    await supabase.from('journal_entries').update({ coach_response: text, coach_responded_at: new Date().toISOString() }).eq('id', entryId)
    setJournalEntries(prev => prev.map(e => e.id === entryId ? { ...e, coach_response: text } : e))
    setReplyText(prev => ({ ...prev, [entryId]: '' }))
  }

  function handleTeamChange(e) {
    setSelectedTeam(e.target.value)
    if (e.target.value) loadTeamData(parseInt(e.target.value))
  }

  async function addAthlete(e) {
    e.preventDefault()
    if (!newAthlete.first_name.trim() || !newAthlete.last_name.trim()) return
    if (!selectedTeam) { setNewAthleteMsg('❌ Sélectionnez d\'abord une équipe.'); return }
    setNewAthleteMsg('')
    const { error } = await supabase.from('athletes').insert([{
      first_name: newAthlete.first_name.trim(),
      last_name: newAthlete.last_name.trim(),
      team_id: parseInt(selectedTeam),
    }])
    if (error) { setNewAthleteMsg('❌ Erreur: ' + error.message); return }
    setNewAthleteMsg('✅ Athlète ajouté.')
    setNewAthlete({ first_name: '', last_name: '' })
    setShowAddAthlete(false)
    setTimeout(() => setNewAthleteMsg(''), 3000)
    loadTeamData(parseInt(selectedTeam))
  }

  const filteredEntries = journalFilter === 'unread'
    ? journalEntries.filter(e => !e.coach_response)
    : journalEntries

  return (
    <Layout title="Dashboard Coach" user={user}>
      <h2 style={{ marginBottom: 20, color: '#1a3a5c' }}>Tableau de bord — Entraîneur</h2>

      {teams.length > 1 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <label style={{ fontWeight: 600 }}>Équipe </label>
          <select value={selectedTeam} onChange={handleTeamChange} style={{ marginLeft: 10, padding: '6px 10px' }}>
            <option value="">— Choisir —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'sante' ? 'active' : ''}`} onClick={() => setTab('sante')}>🧠 Santé mentale</button>
        <button className={`tab ${tab === 'journal' ? 'active' : ''}`} onClick={() => setTab('journal')}>📔 Journaux</button>
        <button className={`tab ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>⚙️ Questions journal</button>
      </div>

      {/* ── AJOUT ATHLÈTE (visible quand une équipe est sélectionnée) ── */}
      {selectedTeam && (
        <div style={{ marginBottom: 16 }}>
          {newAthleteMsg && (
            <div className={`alert ${newAthleteMsg.startsWith('✅') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 10 }}>
              {newAthleteMsg}
            </div>
          )}
          {!showAddAthlete ? (
            <button className="btn btn-outline" style={{ fontSize: '0.85rem' }} onClick={() => setShowAddAthlete(true)}>
              ➕ Ajouter un athlète à cette équipe
            </button>
          ) : (
            <div className="card" style={{ padding: '16px 20px' }}>
              <h4 style={{ marginBottom: 14, color: '#1a3a5c' }}>Ajouter un athlète</h4>
              <form onSubmit={addAthlete} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
                  <label>Prénom *</label>
                  <input
                    type="text"
                    value={newAthlete.first_name}
                    onChange={e => setNewAthlete(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="Prénom"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
                  <label>Nom *</label>
                  <input
                    type="text"
                    value={newAthlete.last_name}
                    onChange={e => setNewAthlete(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Nom de famille"
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary">Ajouter</button>
                  <button type="button" className="btn btn-outline" onClick={() => { setShowAddAthlete(false); setNewAthlete({ first_name: '', last_name: '' }) }}>Annuler</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: SANTÉ MENTALE ── */}
      {tab === 'sante' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          {loading && <p style={{ padding: 20, color: '#888' }}>Chargement…</p>}
          {!loading && athleteData.length === 0 && selectedTeam && <p style={{ padding: 20 }}>Aucun athlète dans cette équipe.</p>}
          {!selectedTeam && teams.length > 1 && <p style={{ padding: 20, color: '#888' }}>Sélectionnez une équipe.</p>}
          {athleteData.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Athlète</th>
                  <th>État</th>
                  <th style={{ minWidth: 120, fontSize: '0.75rem' }}>Capacité physique</th>
                  <th style={{ minWidth: 90, fontSize: '0.75rem' }}>Bien-être général</th>
                  <th>Dernière réponse</th>
                  {COACH_QUESTIONS.map(q => <th key={q} style={{ minWidth: 70, fontSize: '0.75rem' }}>{Q_LABELS[q]}</th>)}
                </tr>
              </thead>
              <tbody>
                {athleteData
                  .sort((a, b) => {
                    const order = { red: 0, yellow: 1, green: 2, grey: 3, none: 4 }
                    return (order[a.worstColor] ?? 4) - (order[b.worstColor] ?? 4)
                  })
                  .map(({ athlete, last, devs, worstColor, hasResponses, lastDate, physicalStatus, physicalNote }) => (
                    <tr key={athlete.id} className={worstColor === 'red' ? 'row-red' : worstColor === 'yellow' ? 'row-yellow' : ''}>
                      <td style={{ fontWeight: 600 }}>{athlete.last_name}, {athlete.first_name}</td>
                      <td>
                        {worstColor === 'none'
                          ? <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic' }}>Non complété</span>
                          : <span className={`badge-${worstColor}`}>
                              {worstColor === 'red' ? '🔴 Alerte' : worstColor === 'yellow' ? '🟡 Attention' : '🟢 OK'}
                            </span>
                        }
                      </td>
                      <td style={{ textAlign: 'center', minWidth: 140 }}>
                        {physicalStatus === 'red' && (
                          <div>
                            <span style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #dc2626', borderRadius: 20, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              🔴 Aucune pratique
                            </span>
                            {physicalNote && (
                              <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#991b1b', fontStyle: 'italic', maxWidth: 160, textAlign: 'left' }}>
                                {physicalNote}
                              </div>
                            )}
                          </div>
                        )}
                        {physicalStatus === 'yellow' && (
                          <div>
                            <span style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #ca8a04', borderRadius: 20, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              🟡 Avec restrictions
                            </span>
                            {physicalNote && (
                              <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#854d0e', fontStyle: 'italic', maxWidth: 160, textAlign: 'left' }}>
                                {physicalNote}
                              </div>
                            )}
                          </div>
                        )}
                        {physicalStatus === 'green' && (
                          <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #16a34a', borderRadius: 20, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            🟢 Sans restriction
                          </span>
                        )}
                        {!physicalStatus && <span style={{ color: '#999', fontSize: '0.8rem' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {(() => {
                          const val = last?.q_general
                          const c = generalColor(val)
                          return val != null
                            ? <span style={{ background: c.bg, color: c.text, padding: '3px 8px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700 }}>
                                {GENERAL_LABELS[val]}
                              </span>
                            : <span style={{ color: '#999' }}>—</span>
                        })()}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#888' }}>
                        {lastDate ? new Date(lastDate).toLocaleDateString('fr-CA') : '—'}
                      </td>
                      {COACH_QUESTIONS.map(q => {
                        const d = devs[q]
                        const color = devColor(d)
                        return (
                          <td key={q} style={{
                            textAlign: 'center',
                            background: color === 'red' ? '#fee2e2' : color === 'yellow' ? '#fef9c3' : color === 'green' ? '#dcfce7' : 'transparent',
                            fontWeight: 600,
                            color: color === 'red' ? '#991b1b' : color === 'yellow' ? '#854d0e' : color === 'green' ? '#166534' : '#999',
                            fontSize: '0.85rem',
                          }}>
                            {d != null ? (d > 0 ? `+${d}` : d) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                }
              </tbody>
            </table>
          )}
          <div style={{ padding: '10px 16px', fontSize: '0.78rem', color: '#888', borderTop: '1px solid #eee' }}>
            Écart = score récent − moyenne historique. 🟢 ≥ −0.4 · 🟡 −0.5 à −0.9 · 🔴 ≤ −1.0
          </div>
        </div>
      )}

      {/* ── TAB: JOURNAUX ── */}
      {tab === 'journal' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
            <button className={`btn ${journalFilter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setJournalFilter('all')}>Tous</button>
            <button className={`btn ${journalFilter === 'unread' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setJournalFilter('unread')}>Sans réponse</button>
          </div>

          {athleteData.length === 0 && <p style={{ color: '#888' }}>Aucun athlète dans cette équipe.</p>}

          {athleteData
            .slice()
            .sort((a, b) => a.athlete.last_name.localeCompare(b.athlete.last_name))
            .map(({ athlete }) => {
              // Entrées de cet athlète selon le filtre
              const allEntries = journalEntries.filter(e => e.athlete_id === athlete.id)
              const visibleEntries = journalFilter === 'unread'
                ? allEntries.filter(e => !e.coach_response)
                : allEntries
              const hasAny = allEntries.length > 0
              const hasVisible = visibleEntries.length > 0

              return (
                <div key={athlete.id} style={{ marginBottom: 12 }}>
                  {/* En-tête athlète */}
                  <div style={{
                    background: '#f0f4f8',
                    borderRadius: hasVisible ? '10px 10px 0 0' : 10,
                    padding: '10px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <strong style={{ color: '#1a3a5c' }}>{athlete.last_name}, {athlete.first_name}</strong>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      {!hasAny
                        ? <em>Non complété</em>
                        : journalFilter === 'unread' && !hasVisible
                          ? <em style={{ color: '#16a34a' }}>✓ Tous répondus</em>
                          : `${allEntries.length} entrée${allEntries.length > 1 ? 's' : ''}`
                      }
                    </span>
                  </div>

                  {/* Entrées visibles */}
                  {visibleEntries.map(entry => (
                    <JournalCard
                      key={entry.id}
                      entry={entry}
                      replyText={replyText[entry.id] || ''}
                      onReplyChange={t => setReplyText(prev => ({ ...prev, [entry.id]: t }))}
                      onSendReply={() => sendReply(entry.id)}
                      nested
                    />
                  ))}
                </div>
              )
            })
          }
        </div>
      )}

      {/* ── TAB: CONFIG QUESTIONS ── */}
      {tab === 'config' && (
        <div>
          {/* Créer une nouvelle question */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16, color: '#1a3a5c' }}>Créer une nouvelle question</h3>
            {newQMsg && <div className={`alert ${newQMsg.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>{newQMsg}</div>}
            <form onSubmit={createQuestion}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>Libellé de la question *</label>
                  <input type="text" value={newQ.label} onChange={e => setNewQ({ ...newQ, label: e.target.value })} placeholder="Ex: Combien d'heures as-tu dormi?" required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Section</label>
                  <select value={newQ.section} onChange={e => setNewQ({ ...newQ, section: e.target.value })}>
                    <option value="entrainement">🏋️ Entraînement</option>
                    <option value="recuperation">💤 Récupération</option>
                    <option value="objectifs">🎯 Objectifs</option>
                    <option value="reflexion">🪞 Réflexion</option>
                    <option value="coach">💬 Message entraîneur</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Type de réponse</label>
                  <select value={newQ.input_type} onChange={e => setNewQ({ ...newQ, input_type: e.target.value, options: [''] })}>
                    <option value="textarea">Texte libre</option>
                    <option value="radio">Choix de réponse (un seul)</option>
                    <option value="checkbox">Réponses multiples</option>
                    <option value="slider">Curseur (slider)</option>
                    <option value="number">Nombre</option>
                  </select>
                </div>
              </div>

              {/* Options pour radio/checkbox */}
              {['radio','checkbox'].includes(newQ.input_type) && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Options de réponse</label>
                  {newQ.options.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <input
                        type="text"
                        value={opt}
                        onChange={e => {
                          const opts = [...newQ.options]
                          opts[i] = e.target.value
                          setNewQ({ ...newQ, options: opts })
                        }}
                        placeholder={`Option ${i + 1}`}
                        style={{ flex: 1 }}
                      />
                      {newQ.options.length > 1 && (
                        <button type="button" className="btn btn-danger" style={{ padding: '6px 12px' }}
                          onClick={() => setNewQ({ ...newQ, options: newQ.options.filter((_, idx) => idx !== i) })}>
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline" style={{ marginTop: 4, fontSize: '0.85rem' }}
                    onClick={() => setNewQ({ ...newQ, options: [...newQ.options, ''] })}>
                    + Ajouter une option
                  </button>
                </div>
              )}

              {/* Min/max pour slider */}
              {newQ.input_type === 'slider' && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label>Minimum</label>
                    <input type="number" value={newQ.min_val} onChange={e => setNewQ({ ...newQ, min_val: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label>Maximum</label>
                    <input type="number" value={newQ.max_val} onChange={e => setNewQ({ ...newQ, max_val: e.target.value })} />
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary">Créer et activer la question</button>
            </form>
          </div>

          {/* Liste des questions existantes */}
          <div className="card">
            <h3 style={{ marginBottom: 8, color: '#1a3a5c' }}>Questions actives</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 20 }}>Coche les questions à inclure dans le journal de tes athlètes.</p>
            {groupBySection(allQuestions).map(([section, qs]) => (
              <div key={section} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: '#1a3a5c', marginBottom: 10, fontSize: '0.9rem' }}>{sectionLabel(section)}</div>
                {qs.map(q => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <input
                      type="checkbox"
                      checked={coachConfig.includes(q.id)}
                      onChange={e => saveCoachConfig(q.id, e.target.checked)}
                      style={{ marginTop: 4, accentColor: '#1a3a5c', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem' }}>{q.label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 2 }}>
                        {q.input_type === 'radio' ? 'Choix de réponse' : q.input_type === 'checkbox' ? 'Réponses multiples' : q.input_type === 'slider' ? 'Curseur' : q.input_type === 'number' ? 'Nombre' : 'Texte libre'}
                        {q.is_predefined ? ' · Prédéfinie' : ' · Personnalisée'}
                      </div>
                    </div>
                    {!q.is_predefined && (
                      <button className="btn btn-danger" style={{ padding: '3px 10px', fontSize: '0.75rem', flexShrink: 0 }}
                        onClick={() => deleteQuestion(q.id)}>
                        Supprimer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  )
}

function JournalCard({ entry, replyText, onReplyChange, onSendReply }) {
  const [open, setOpen] = useState(false)
  const athlete = entry.athletes || {}
  const responses = entry.journal_responses || []
  return (
    <div className="card" style={{ padding: 0, marginBottom: 12 }}>
      <div
        style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      >
        <div>
          <strong>{athlete.last_name}, {athlete.first_name}</strong>
          <span style={{ marginLeft: 12, fontSize: '0.82rem', color: '#888' }}>Semaine du {entry.week_start}</span>
          {entry.coach_response && <span style={{ marginLeft: 10, fontSize: '0.78rem', color: '#16a34a' }}>✓ Répondu</span>}
        </div>
        <span style={{ color: '#6b7280' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ marginTop: 14 }}>
            {responses.map(r => (
              <div key={r.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280' }}>{r.journal_questions?.section?.toUpperCase()} · {r.journal_questions?.label}</div>
                <div style={{ marginTop: 3, color: '#1a1a1a' }}>
                  {r.value_text || (r.value_number != null ? r.value_number : (r.value_array || []).join(', ')) || '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ fontWeight: 600, fontSize: '0.88rem' }}>Ta réponse à l'athlète</label>
            <textarea
              value={replyText}
              onChange={e => onReplyChange(e.target.value)}
              placeholder={entry.coach_response || 'Écris un message à l\'athlète…'}
              rows={3}
              style={{ marginTop: 6, marginBottom: 10 }}
            />
            <button className="btn btn-success" onClick={onSendReply} disabled={!replyText.trim()}>
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function groupBySection(questions) {
  const map = new Map()
  for (const q of questions) {
    if (!map.has(q.section)) map.set(q.section, [])
    map.get(q.section).push(q)
  }
  return [...map.entries()]
}

function sectionLabel(key) {
  const labels = { entrainement: '🏋️ Entraînement', recuperation: '💤 Récupération', objectifs: '🎯 Objectifs', reflexion: '🪞 Réflexion', coach: '💬 Message entraîneur' }
  return labels[key] || key
}
