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
                            <span style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #dc2626', borderRadius: 20, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'n