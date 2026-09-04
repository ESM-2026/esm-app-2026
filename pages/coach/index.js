import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import RPEGauge from '../../components/RPEGauge'
import { supabase } from '../../lib/supabase'
import { getSession } from '../../lib/auth'

// ── Utilitaires semaine ──────────────────────────────────────
function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0] // YYYY-MM-DD
}

function formatWeekLabel(isoDate) {
  const d = new Date(isoDate + 'T12:00:00')
  const end = new Date(d)
  end.setDate(d.getDate() + 6)
  const opts = { day: 'numeric', month: 'long' }
  return `${d.toLocaleDateString('fr-CA', opts)} – ${end.toLocaleDateString('fr-CA', opts)}`
}

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
  const [tab, setTab] = useState('sante') // sante | rpe | journal | config
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

  // ── Messages capacité physique ──────────────────────────────
  const [physMsgs, setPhysMsgs] = useState({})      // {athleteId: [{id,sender_role,message,sent_at,read_at}]}
  const [physMsgText, setPhysMsgText] = useState({}) // {athleteId: texte en cours}
  const [physMsgOpen, setPhysMsgOpen] = useState({}) // {athleteId: bool}
  const [physMsgSending, setPhysMsgSending] = useState({})

  // ── RPE state ───────────────────────────────────────────────
  const [rpeData, setRpeData] = useState([])        // [{athleteId, name, rpe}]
  const [prevWeekAvg, setPrevWeekAvg] = useState(null)
  const [rpeLoading, setRpeLoading] = useState(false)
  const [rpeWeekStart, setRpeWeekStart] = useState(() => getMondayOf(new Date()))

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
    // Get athletes — fallback si colonnes physical_status manquantes
    let { data: athletes, error: athErr } = await supabase
      .from('athletes').select('id, first_name, last_name, physical_status, physical_status_note')
      .eq('team_id', teamId).order('last_name')
    if (athErr || !athletes) {
      const fallback = await supabase.from('athletes').select('id, first_name, last_name').eq('team_id', teamId).order('last_name')
      athletes = fallback.data || []
    }
    if (athletes.length === 0) { setAthleteData([]); setLoading(false); return }

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

    // Load RPE et messages capacité physique
    loadRPEData(athletes, getMondayOf(new Date()))
    loadPhysicalMessages(ids)

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

  async function loadPhysicalMessages(ids) {
    if (!ids || ids.length === 0) return
    const { data } = await supabase
      .from('physical_capacity_messages')
      .select('id, athlete_id, sender_role, message, sent_at, read_at')
      .in('athlete_id', ids)
      .order('sent_at', { ascending: true })
    const map = {}
    for (const msg of (data || [])) {
      if (!map[msg.athlete_id]) map[msg.athlete_id] = []
      map[msg.athlete_id].push(msg)
    }
    setPhysMsgs(map)

    // Marquer les messages spécialiste comme lus
    const unread = (data || []).filter(m => m.sender_role === 'specialist' && !m.read_at).map(m => m.id)
    if (unread.length > 0) {
      await supabase.from('physical_capacity_messages').update({ read_at: new Date().toISOString() }).in('id', unread)
    }
  }

  async function sendPhysicalMessage(athleteId) {
    const text = physMsgText[athleteId]?.trim()
    if (!text || !user) return
    setPhysMsgSending(prev => ({ ...prev, [athleteId]: true }))
    await supabase.from('physical_capacity_messages').insert([{
      athlete_id: athleteId,
      sender_id: user.id,
      sender_role: 'coach',
      message: text,
    }])
    setPhysMsgText(prev => ({ ...prev, [athleteId]: '' }))
    // Recharger les messages pour cet athlète
    const { data } = await supabase
      .from('physical_capacity_messages')
      .select('id, athlete_id, sender_role, message, sent_at, read_at')
      .eq('athlete_id', athleteId)
      .order('sent_at', { ascending: true })
    setPhysMsgs(prev => ({ ...prev, [athleteId]: data || [] }))
    setPhysMsgSending(prev => ({ ...prev, [athleteId]: false }))
  }

  async function loadRPEData(athletesList, weekStart) {
    if (!athletesList || athletesList.length === 0) return
    setRpeLoading(true)
    const ids = athletesList.map(a => a.id)

    // Trouver la question RPE (slider, section entrainement, label contient RPE)
    const { data: rpeQuestion } = await supabase
      .from('journal_questions')
      .select('id')
      .eq('input_type', 'slider')
      .eq('section', 'entrainement')
      .ilike('label', '%RPE%')
      .limit(1)
      .single()

    if (!rpeQuestion) { setRpeLoading(false); return }
    const qId = rpeQuestion.id

    // Entrées de la semaine courante
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('id, athlete_id')
      .in('athlete_id', ids)
      .eq('week_start', weekStart)

    const entryIds = (entries || []).map(e => e.id)
    let currentData = []

    if (entryIds.length > 0) {
      const { data: responses } = await supabase
        .from('journal_responses')
        .select('entry_id, value_number')
        .in('entry_id', entryIds)
        .eq('question_id', qId)

      currentData = (responses || []).map(r => {
        const entry = entries.find(e => e.id === r.entry_id)
        const athlete = athletesList.find(a => a.id === entry?.athlete_id)
        return {
          athleteId: athlete?.id,
          name: athlete ? `${athlete.last_name}, ${athlete.first_name}` : '—',
          rpe: r.value_number,
        }
      }).filter(d => d.rpe != null)
    }

    setRpeData(currentData)

    // Semaine précédente pour la tendance
    const prevDate = new Date(weekStart + 'T12:00:00')
    prevDate.setDate(prevDate.getDate() - 7)
    const prevWeekStart = prevDate.toISOString().split('T')[0]

    const { data: prevEntries } = await supabase
      .from('journal_entries')
      .select('id')
      .in('athlete_id', ids)
      .eq('week_start', prevWeekStart)

    const prevEntryIds = (prevEntries || []).map(e => e.id)
    if (prevEntryIds.length > 0) {
      const { data: prevResponses } = await supabase
        .from('journal_responses')
        .select('value_number')
        .in('entry_id', prevEntryIds)
        .eq('question_id', qId)

      const vals = (prevResponses || []).map(r => r.value_number).filter(v => v != null)
      if (vals.length > 0) {
        setPrevWeekAvg(vals.reduce((s, v) => s + v, 0) / vals.length)
      } else {
        setPrevWeekAvg(null)
      }
    } else {
      setPrevWeekAvg(null)
    }

    setRpeLoading(false)
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
      <h2 style={{ marginBottom: 20, color: '#3C3C3C' }}>Tableau de bord — Entraîneur</h2>

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
        <button className={`tab ${tab === 'physique' ? 'active' : ''}`} onClick={() => setTab('physique')}>🏃 Capacité physique</button>
        <button className={`tab ${tab === 'rpe' ? 'active' : ''}`} onClick={() => setTab('rpe')}>📊 RPE semaine</button>
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
              <h4 style={{ marginBottom: 14, color: '#3C3C3C' }}>Ajouter un athlète</h4>
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

      {/* ── TAB: CAPACITÉ PHYSIQUE ── */}
      {tab === 'physique' && (
        <div className="card">
          {loading && <p style={{ color: '#888' }}>Chargement…</p>}
          {!loading && athleteData.length === 0 && selectedTeam && <p>Aucun athlète dans cette équipe.</p>}
          {!selectedTeam && teams.length > 1 && <p style={{ color: '#888' }}>Sélectionnez une équipe.</p>}
          {!loading && athleteData.length > 0 && (
            <>
              {/* Résumé rapide */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                  { status: 'red',   label: 'Aucune pratique',   bg: '#fee2e2', text: '#991b1b', border: '#dc2626' },
                  { status: 'yellow',label: 'Avec restrictions', bg: '#fef9c3', text: '#854d0e', border: '#ca8a04' },
                  { status: 'green', label: 'Sans restriction',  bg: '#dcfce7', text: '#166534', border: '#16a34a' },
                  { status: null,    label: 'Non renseigné',     bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
                ].map(({ status, label, bg, text, border }) => {
                  const count = athleteData.filter(ad => ad.physicalStatus === status).length
                  return (
                    <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 18px', textAlign: 'center', minWidth: 110 }}>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: text }}>{count}</div>
                      <div style={{ fontSize: '0.72rem', color: text, fontWeight: 600 }}>{label}</div>
                    </div>
                  )
                })}
              </div>

              {/* Liste par athlète */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {athleteData
                  .slice()
                  .sort((a, b) => {
                    const order = { red: 0, yellow: 1, green: 2 }
                    return (order[a.physicalStatus] ?? 3) - (order[b.physicalStatus] ?? 3)
                  })
                  .map(({ athlete, physicalStatus, physicalNote }) => {
                    const cfg = physicalStatus === 'red'
                      ? { emoji: '🔴', label: 'Aucune pratique',   bg: '#fee2e2', text: '#991b1b', border: '#dc2626' }
                      : physicalStatus === 'yellow'
                      ? { emoji: '🟡', label: 'Avec restrictions', bg: '#fef9c3', text: '#854d0e', border: '#ca8a04' }
                      : physicalStatus === 'green'
                      ? { emoji: '🟢', label: 'Sans restriction',  bg: '#dcfce7', text: '#166534', border: '#16a34a' }
                      : { emoji: '⚪', label: 'Non renseigné',     bg: '#f9fafb', text: '#9ca3af', border: '#e5e7eb' }
                    return (
                      <div key={athlete.id} style={{
                        background: cfg.bg, border: `1px solid ${cfg.border}`,
                        borderRadius: 10, padding: '12px 16px',
                      }}>
                        {/* En-tête : nom + badge */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#1A1B18', fontSize: '0.95rem' }}>
                              {athlete.last_name}, {athlete.first_name}
                            </div>
                            {physicalNote && (
                              <div style={{ marginTop: 4, fontSize: '0.82rem', color: cfg.text, fontStyle: 'italic' }}>
                                {physicalNote}
                              </div>
                            )}
                          </div>
                          <span style={{
                            background: 'white', border: `1px solid ${cfg.border}`,
                            borderRadius: 20, padding: '3px 12px',
                            fontSize: '0.78rem', fontWeight: 700, color: cfg.text,
                            whiteSpace: 'nowrap', flexShrink: 0,
                          }}>
                            {cfg.emoji} {cfg.label}
                          </span>
                        </div>

                        {/* Fil de messages */}
                      {(() => {
                        const msgs = physMsgs[athlete.id] || []
                        const unread = msgs.filter(m => m.sender_role === 'specialist' && !m.read_at).length
                        const isOpen = physMsgOpen[athlete.id]
                        return (
                          <div style={{ marginTop: 10, borderTop: `1px solid ${cfg.border}`, paddingTop: 10 }}>
                            <button
                              onClick={() => setPhysMsgOpen(prev => ({ ...prev, [athlete.id]: !prev[athlete.id] }))}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '0.82rem', fontWeight: 600, color: '#6B7069',
                                display: 'flex', alignItems: 'center', gap: 6, padding: 0,
                              }}
                            >
                              💬 Message au spécialiste
                              {unread > 0 && (
                                <span style={{ background: '#C5D400', color: '#1A1B18', borderRadius: 10, padding: '1px 7px', fontSize: '0.72rem', fontWeight: 800 }}>
                                  {unread} nouveau{unread > 1 ? 'x' : ''}
                                </span>
                              )}
                              {msgs.length > 0 && unread === 0 && (
                                <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({msgs.length})</span>
                              )}
                              <span style={{ color: '#9ca3af' }}>{isOpen ? '▲' : '▼'}</span>
                            </button>

                            {isOpen && (
                              <div style={{ marginTop: 10 }}>
                                {/* Historique */}
                                {msgs.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                                    {msgs.map(m => (
                                      <div key={m.id} style={{
                                        display: 'flex',
                                        justifyContent: m.sender_role === 'coach' ? 'flex-end' : 'flex-start',
                                      }}>
                                        <div style={{
                                          maxWidth: '80%',
                                          background: m.sender_role === 'coach' ? '#f0f7e6' : '#f0f4ff',
                                          border: m.sender_role === 'coach' ? '1px solid #C5D400' : '1px solid #a5b4fc',
                                          borderRadius: 10,
                                          padding: '7px 12px',
                                          fontSize: '0.82rem',
                                        }}>
                                          <div style={{ fontWeight: 600, fontSize: '0.7rem', color: m.sender_role === 'coach' ? '#3C3C3C' : '#4338ca', marginBottom: 2 }}>
                                            {m.sender_role === 'coach' ? 'Vous' : '🏥 Spécialiste'}
                                          </div>
                                          <div style={{ color: '#1A1B18' }}>{m.message}</div>
                                          <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 3, textAlign: 'right' }}>
                                            {new Date(m.sent_at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}
                                            {' '}
                                            {new Date(m.sent_at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {msgs.length === 0 && (
                                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', marginBottom: 8 }}>
                                    Aucun message pour cet athlète.
                                  </p>
                                )}

                                {/* Saisie */}
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <textarea
                                    value={physMsgText[athlete.id] || ''}
                                    onChange={e => setPhysMsgText(prev => ({ ...prev, [athlete.id]: e.target.value }))}
                                    placeholder="Votre question au spécialiste…"
                                    rows={2}
                                    style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #d0d5dd', fontSize: '0.82rem', resize: 'vertical' }}
                                  />
                                  <button
                                    className="btn btn-primary"
                                    style={{ alignSelf: 'flex-end', padding: '7px 14px', fontSize: '0.82rem' }}
                                    disabled={!physMsgText[athlete.id]?.trim() || physMsgSending[athlete.id]}
                                    onClick={() => sendPhysicalMessage(athlete.id)}
                                  >
                                    {physMsgSending[athlete.id] ? '…' : 'Envoyer'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })
                }
              </div>
              <div style={{ marginTop: 14, fontSize: '0.75rem', color: '#9ca3af' }}>
                Statut mis à jour par le thérapeute sportif (accès spécialiste).
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: RPE SEMAINE ── */}
      {tab === 'rpe' && (
        <div className="card">
          {!selectedTeam && teams.length > 1 && (
            <p style={{ color: '#888' }}>Sélectionnez une équipe pour voir le RPE.</p>
          )}
          {(selectedTeam || teams.length === 1) && (
            <>
              {/* Sélecteur de semaine */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button
                  className="btn btn-outline"
                  style={{ padding: '5px 12px', fontSize: '0.82rem' }}
                  onClick={() => {
                    const d = new Date(rpeWeekStart + 'T12:00:00')
                    d.setDate(d.getDate() - 7)
                    const prev = d.toISOString().split('T')[0]
                    setRpeWeekStart(prev)
                    const athletes = athleteData.map(ad => ad.athlete)
                    loadRPEData(athletes, prev)
                  }}
                >
                  ← Sem. préc.
                </button>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#3C3C3C' }}>
                  {formatWeekLabel(rpeWeekStart)}
                </span>
                <button
                  className="btn btn-outline"
                  style={{ padding: '5px 12px', fontSize: '0.82rem' }}
                  disabled={rpeWeekStart >= getMondayOf(new Date())}
                  onClick={() => {
                    const d = new Date(rpeWeekStart + 'T12:00:00')
                    d.setDate(d.getDate() + 7)
                    const next = d.toISOString().split('T')[0]
                    setRpeWeekStart(next)
                    const athletes = athleteData.map(ad => ad.athlete)
                    loadRPEData(athletes, next)
                  }}
                >
                  Sem. suiv. →
                </button>
              </div>

              <RPEGauge
                rpeData={rpeData}
                totalAthletes={athleteData.length}
                prevWeekAvg={prevWeekAvg}
                weekLabel={formatWeekLabel(rpeWeekStart)}
                loading={rpeLoading}
              />
            </>
          )}
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
              const allEntries = journalEntries.filter(e => e.athlete_id === athlete.id)
              const visibleEntries = journalFilter === 'unread'
                ? allEntries.filter(e => !e.coach_response)
                : allEntries
              const hasAny = allEntries.length > 0
              const hasVisible = visibleEntries.length > 0

              return (
                <div key={athlete.id} style={{ marginBottom: 12 }}>
                  <div style={{
                    background: '#f0f4f8',
                    borderRadius: hasVisible ? '10px 10px 0 0' : 10,
                    padding: '10px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <strong style={{ color: '#3C3C3C' }}>{athlete.last_name}, {athlete.first_name}</strong>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      {!hasAny
                        ? <em>Non complété</em>
                        : journalFilter === 'unread' && !hasVisible
                          ? <em style={{ color: '#16a34a' }}>✓ Tous répondus</em>
                          : `${allEntries.length} entrée${allEntries.length > 1 ? 's' : ''}`
                      }
                    </span>
                  </div>
                  {visibleEntries.map(entry => (
                    <JournalCard
                      key={entry.id}
                      entry={entry}
                      replyText={replyText[entry.id] || ''}
                      onReplyChange={t => setReplyText(prev => ({ ...prev, [entry.id]: t }))}
                      onSendReply={() => sendReply(entry.id)}
                    />
                  ))}
                </div>
              )
            })
          }
        </div>
      )}

      {/* ── TAB: CONFIGURATION JOURNAL ── */}
      {tab === 'config' && (
        <div>
          <div className="card">
            <h3 style={{ marginBottom: 16, color: '#3C3C3C' }}>Questions actives dans le journal</h3>
            {allQuestions.length === 0 && <p style={{ color: '#888' }}>Aucune question disponible.</p>}
            {allQuestions.map(q => (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <input
                  type="checkbox"
                  checked={coachConfig.includes(q.id)}
                  onChange={e => saveCoachConfig(q.id, e.target.checked)}
                  style={{ accentColor: '#C5D400', width: 18, height: 18, flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.9rem' }}>{q.label}</span>
                  <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#9ca3af' }}>[{q.section}]</span>
                </div>
                {!q.is_predefined && (
                  <button className="btn btn-danger" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => deleteQuestion(q.id)}>
                    Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 16, color: '#3C3C3C' }}>Créer une nouvelle question</h3>
            <form onSubmit={createQuestion}>
              <div className="form-group">
                <label>Libellé de la question *</label>
                <input type="text" value={newQ.label} onChange={e => setNewQ({ ...newQ, label: e.target.value })} placeholder="Ex: Comment te sens-tu physiquement?" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Section</label>
                  <select value={newQ.section} onChange={e => setNewQ({ ...newQ, section: e.target.value })}>
                    <option value="entrainement">Entraînement</option>
                    <option value="nutrition">Nutrition</option>
                    <option value="sante">Santé & bien-être</option>
                    <option value="objectifs">Objectifs</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Type de réponse</label>
                  <select value={newQ.input_type} onChange={e => setNewQ({ ...newQ, input_type: e.target.value })}>
                    <option value="textarea">Texte libre</option>
                    <option value="slider">Curseur (1-10)</option>
                    <option value="number">Nombre</option>
                    <option value="radio">Choix unique</option>
                    <option value="checkbox">Choix multiples</option>
                    <option value="toggle">Oui / Non</option>
                  </select>
                </div>
              </div>
              {newQ.input_type === 'slider' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Min</label>
                    <input type="number" value={newQ.min_val} onChange={e => setNewQ({ ...newQ, min_val: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Max</label>
                    <input type="number" value={newQ.max_val} onChange={e => setNewQ({ ...newQ, max_val: e.target.value })} />
                  </div>
                </div>
              )}
              {['radio', 'checkbox'].includes(newQ.input_type) && (
                <div className="form-group">
                  <label>Options (une par champ)</label>
                  {newQ.options.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <input type="text" value={opt} onChange={e => { const o = [...newQ.options]; o[i] = e.target.value; setNewQ({ ...newQ, options: o }) }} placeholder={`Option ${i + 1}`} />
                      {newQ.options.length > 1 && (
                        <button type="button" className="btn btn-danger" style={{ padding: '4px 10px' }} onClick={() => { const o = newQ.options.filter((_, j) => j !== i); setNewQ({ ...newQ, options: o }) }}>✕</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline" style={{ marginTop: 4, fontSize: '0.85rem' }} onClick={() => setNewQ({ ...newQ, options: [...newQ.options, ''] })}>+ Ajouter une option</button>
                </div>
              )}
              {newQMsg && <div className={`alert ${newQMsg.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>{newQMsg}</div>}
              <button type="submit" className="btn btn-primary">Créer la question</button>
            </form>
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

  function displayValue(r) {
    if (r.value_text) return r.value_text
    if (r.value_number != null) return String(r.value_number)
    if (r.value_array && r.value_array.length > 0) return r.value_array.join(', ')
    return '—'
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: open ? '0 0 10px 10px' : 10, marginTop: 0, overflow: 'hidden', borderTop: 'none' }}>
      <div
        style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: open ? '#f0f7ff' : '#fafafa' }}
        onClick={() => setOpen(!open)}
      >
        <div>
          <span style={{ fontSize: '0.82rem', color: '#555' }}>Semaine du {entry.week_start}</span>
          {entry.coach_response && <span style={{ marginLeft: 10, fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>✓ Répondu</span>}
          {!entry.coach_response && <span style={{ marginLeft: 10, fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>● En attente</span>}
        </div>
        <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: 16, borderTop: '1px solid #e5e7eb', fontSize: '0.88rem' }}>
          {responses.map(r => (
            <div key={r.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}>{r.journal_questions?.label || 'Question'}</div>
              <div style={{ color: '#1a1a1a', marginTop: 3 }}>{displayValue(r)}</div>
            </div>
          ))}
          {entry.coach_response && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: 4 }}>Ta réponse</div>
              <p style={{ color: '#166534', fontSize: '0.88rem', margin: 0 }}>{entry.coach_response}</p>
            </div>
          )}
          {!entry.coach_response && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={replyText}
                onChange={e => onReplyChange(e.target.value)}
                placeholder="Écrire une réponse à cet athlète…"
                rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d0d5dd', fontSize: '0.88rem', resize: 'vertical' }}
              />
              <button className="btn btn-primary" style={{ marginTop: 6, padding: '6px 16px', fontSize: '0.85rem' }} onClick={onSendReply} disabled={!replyText?.trim()}>
                Envoyer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
