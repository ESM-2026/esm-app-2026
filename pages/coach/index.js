import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { getSession } from '../../lib/auth'

// Questions non-confidentielles pour le tableau coach
const COACH_QUESTIONS = ['q_a','q_b','q_c','q_d','q_e','q_f','q_g','q_h','q_i','q_j','q_k','q_l','q_m','q_n','q_o','q_p']
const Q_LABELS = {
  q_a:'Motivation A',q_b:'Motivation B',q_c:'Motivation C',q_d:'Motivation D',
  q_e:'Sommeil',q_f:'Conciliation',q_g:'Anxiété',q_h:'Social',
  q_i:'Nutrition A',q_j:'Nutrition B',q_k:'Nutrition C',q_l:'Nutrition D',
  q_m:'Nutrition E',q_n:'Nutrition F',q_o:'Nutrition G',q_p:'Nutrition H',
}

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
    const { data: athletes } = await supabase.from('athletes').select('id, first_name, last_name').eq('team_id', teamId).order('last_name')
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
      const recs = responses.filter(r => r.athlete_id === athlete.id)
      const last = recs.length > 0 ? recs[recs.length - 1] : null
      const avgs = {}
      COACH_QUESTIONS.forEach(q => {
        const vals = recs.map(r => r[q]).filter(v => v != null)
        avgs[q] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      })
      const devs = {}
      COACH_QUESTIONS.forEach(q => {
        devs[q] = deviation(last?.[q], avgs[q])
      })
      const worstColor = COACH_QUESTIONS.reduce((worst, q) => {
        const c = devColor(devs[q])
        if (c === 'red') return 'red'
        if (c === 'yellow' && worst !== 'red') return 'yellow'
        return worst
      }, 'green')
      return { athlete, last, avgs, devs, worstColor, lastDate: last?.submitted_at }
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

      {/* ── TAB: SANTÉ MENTALE ── */}
      {tab === 'sante' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          {loading && <p style={{ padding: 20, color: '#888' }}>Chargement…</p>}
          {!loading && athleteData.length === 0 && selectedTeam && <p style={{ padding: 20 }}>Aucun athlète ou aucune réponse pour cette équipe.</p>}
          {!selectedTeam && teams.length > 1 && <p style={{ padding: 20, color: '#888' }}>Sélectionnez une équipe.</p>}
          {athleteData.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Athlète</th>
                  <th>État</th>
                  <th>Dernière réponse</th>
                  {COACH_QUESTIONS.map(q => <th key={q} style={{ minWidth: 70, fontSize: '0.75rem' }}>{Q_LABELS[q]}</th>)}
                </tr>
              </thead>
              <tbody>
                {athleteData
                  .sort((a, b) => {
                    const order = { red: 0, yellow: 1, green: 2, grey: 3 }
                    return (order[a.worstColor] || 3) - (order[b.worstColor] || 3)
                  })
                  .map(({ athlete, devs, worstColor, lastDate }) => (
                    <tr key={athlete.id} className={worstColor === 'red' ? 'row-red' : worstColor === 'yellow' ? 'row-yellow' : ''}>
                      <td style={{ fontWeight: 600 }}>{athlete.last_name}, {athlete.first_name}</td>
                      <td>
                        <span className={`badge-${worstColor}`}>
                          {worstColor === 'red' ? '🔴 Alerte' : worstColor === 'yellow' ? '🟡 Attention' : worstColor === 'green' ? '🟢 OK' : '—'}
                        </span>
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
          {filteredEntries.length === 0 && <p style={{ color: '#888' }}>Aucun journal trouvé.</p>}
          {filteredEntries.map(entry => (
            <JournalCard
              key={entry.id}
              entry={entry}
              replyText={replyText[entry.id] || ''}
              onReplyChange={t => setReplyText(prev => ({ ...prev, [entry.id]: t }))}
              onSendReply={() => sendReply(entry.id)}
            />
          ))}
        </div>
      )}

      {/* ── TAB: CONFIG QUESTIONS ── */}
      {tab === 'config' && (
        <div className="card">
          <h3 style={{ marginBottom: 16, color: '#1a3a5c' }}>Questions actives dans le journal de tes athlètes</h3>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 20 }}>
            Coche les questions à inclure. Les athlètes de tes équipes verront ces questions dans leur journal hebdomadaire.
          </p>
          {groupBySection(allQuestions).map(([section, qs]) => (
            <div key={section} style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: '#1a3a5c', marginBottom: 10, fontSize: '0.9rem' }}>{sectionLabel(section)}</div>
              {qs.map(q => (
                <label key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={coachConfig.includes(q.id)}
                    onChange={e => saveCoachConfig(q.id, e.target.checked)}
                    style={{ marginTop: 2, accentColor: '#1a3a5c' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.9rem' }}>{q.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 2 }}>{q.input_type}</div>
                  </div>
                </label>
              ))}
            </div>
          ))}
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
                  {r.value_text || r.value_number ?? (r.value_array || []).join(', ') || '—'}
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
