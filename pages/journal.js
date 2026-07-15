import { useState, useEffect } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import PinGate from '../components/PinGate'

function getMonday(d = new Date()) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  date.setDate(date.getDate() + diff)
  return date.toISOString().split('T')[0]
}

export default function Journal() {
  const [step, setStep] = useState('select') // select | pin | form | history | done
  const [teams, setTeams] = useState([])
  const [athletes, setAthletes] = useState([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedAthlete, setSelectedAthlete] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [pendingAthlete, setPendingAthlete] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const weekStart = getMonday()

  useEffect(() => {
    supabase.from('teams').select('id, name').order('name').then(({ data }) => setTeams(data || []))
  }, [])

  async function loadAthletes(teamId) {
    const { data } = await supabase
      .from('athletes')
      .select('id, first_name, last_name, pin')
      .eq('team_id', teamId)
      .order('last_name')
    setAthletes(data || [])
  }


  async function loadQuestionsForAthlete(athleteId) {
    // Get coach(es) for this athlete's team, then load their config
    const athlete = athletes.find(a => a.id === athleteId)
    if (!athlete) return []

    // Get team's coaches
    const { data: tc } = await supabase
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', parseInt(selectedTeam))

    if (!tc || tc.length === 0) {
      // No coach config — load all predefined questions
      const { data: qs } = await supabase
        .from('journal_questions')
        .select('*')
        .eq('is_predefined', true)
        .order('section')
        .order('id')
      return qs || []
    }

    const coachId = tc[0].coach_id
    const { data: config } = await supabase
      .from('coach_journal_config')
      .select('question_id, display_order, journal_questions(*)')
      .eq('coach_id', coachId)
      .eq('is_active', true)
      .order('display_order')

    if (!config || config.length === 0) {
      const { data: qs } = await supabase
        .from('journal_questions')
        .select('*')
        .eq('is_predefined', true)
        .order('section')
        .order('id')
      return qs || []
    }

    return config.map(c => c.journal_questions)
  }

  async function loadHistory(athleteId) {
    const { data } = await supabase
      .from('journal_entries')
      .select('*, journal_responses(*, journal_questions(label, section))')
      .eq('athlete_id', athleteId)
      .order('week_start', { ascending: false })
      .limit(10)
    return data || []
  }

  async function handleAthleteSelect(athlete) {
    setSelectedAthlete(athlete)
    setLoading(true)
    const [qs, hist] = await Promise.all([
      loadQuestionsForAthlete(athlete.id),
      loadHistory(athlete.id),
    ])
    setQuestions(qs)
    setHistory(hist)
    setLoading(false)

    // Check if already submitted this week
    const already = hist.find(e => e.week_start === weekStart)
    if (already) {
      alert('Tu as déjà soumis ton journal cette semaine. Tu peux consulter ton historique ci-dessous.')
      setStep('history')
    } else {
      setStep('form')
    }
  }

  function handleAnswer(questionId, field, value) {
    setAnswers(prev => ({ ...prev, [questionId]: { ...(prev[questionId] || {}), [field]: value } }))
  }

  function getAnswerValue(qid, field) {
    return answers[qid]?.[field] ?? ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Create entry
    const { data: entry, error: entryErr } = await supabase
      .from('journal_entries')
      .insert([{ athlete_id: selectedAthlete.id, week_start: weekStart }])
      .select()
      .single()

    if (entryErr) { setError('Erreur lors de l\'envoi. Réessaie.'); setLoading(false); return }

    // Insert responses
    const responseRows = []
    for (const q of questions) {
      const ans = answers[q.id] || {}
      if (Object.keys(ans).length > 0) {
        responseRows.push({
          entry_id: entry.id,
          question_id: q.id,
          value_number: ans.number !== undefined ? ans.number : null,
          value_text: ans.text || null,
          value_array: ans.array || null,
        })
      }
    }

    if (responseRows.length > 0) {
      await supabase.from('journal_responses').insert(responseRows)
    }

    setLoading(false)
    setStep('done')
  }

  // ── RENDER ───────────────────────────────────────────────

  if (step === 'done') {
    return (
      <PageWrapper>
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 56 }}>📔</div>
            <h2 style={{ marginTop: 16, color: '#166534' }}>Journal enregistré!</h2>
            <p style={{ marginTop: 8, color: '#555' }}>Semaine du {weekStart}</p>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => { setStep('select'); setSelectedAthlete(null); setAnswers({}); setSelectedTeam(''); }}>
              Retour à l'accueil
            </button>
          </div>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <div style={s.card}>
        <div style={s.headerBand}>
          <h1 style={s.title}>Journal de bord</h1>
          <p style={s.subtitle}>Excellence Sportive Montérégie · Semaine du {weekStart}</p>
        </div>

        {/* Step 1 — Sélection */}
        {step === 'select' && (
          <div style={{ padding: 24 }}>
            <div className="form-group">
              <label>Ton équipe</label>
              <select value={selectedTeam} onChange={e => { setSelectedTeam(e.target.value); setAthletes([]); setSelectedAthlete(null); setPendingAthlete(null); setError(''); if (e.target.value) loadAthletes(e.target.value) }}>
                <option value="">— Sélectionne ton équipe —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {athletes.length > 0 && (
              <div>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 10 }}>Ton nom</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {athletes.map(a => (
                    <button key={a.id} className="btn btn-outline" onClick={() => {
                      setError('')
                      setPendingAthlete(a)
                      setStep('pin')
                    }} disabled={loading}>
                      {a.last_name}, {a.first_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {loading && <p style={{ color: '#888', marginTop: 12 }}>Chargement…</p>}
          </div>
        )}

        {/* Step PIN — création ou vérification */}
        {step === 'pin' && pendingAthlete && (
          <PinGate
            athlete={pendingAthlete}
            onSuccess={() => handleAthleteSelect(pendingAthlete)}
            onBack={() => { setStep('select'); setPendingAthlete(null) }}
          />
        )}

        {/* Step 2 — Formulaire */}
        {step === 'form' && selectedAthlete && (
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '16px 24px', background: '#f0f7ff', borderBottom: '1px solid #e5e7eb' }}>
              <strong>{selectedAthlete.first_name} {selectedAthlete.last_name}</strong>
              <button type="button" onClick={() => { setStep('select'); setSelectedAthlete(null) }} style={{ float: 'right', fontSize: '0.8rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>
                Changer
              </button>
            </div>

            {groupBySection(questions).map(([section, qs]) => (
              <div key={section} style={s.section}>
                <h3 style={s.sectionTitle}>{sectionLabel(section)}</h3>
                {qs.map(q => (
                  <div key={q.id} className="form-group">
                    <label>{q.label}</label>
                    <QuestionInput q={q} value={answers[q.id] || {}} onChange={(field, val) => handleAnswer(q.id, field, val)} />
                  </div>
                ))}
              </div>
            ))}

            {error && <div className="alert alert-error" style={{ margin: '0 24px 16px' }}>{error}</div>}

            <div style={{ padding: '16px 24px 24px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Envoi…' : 'Soumettre mon journal'}
              </button>
              {history.length > 0 && (
                <button type="button" className="btn btn-outline" onClick={() => setStep('history')}>
                  Voir mon historique
                </button>
              )}
            </div>
          </form>
        )}

        {/* Step 3 — Historique */}
        {step === 'history' && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#3C3C3C' }}>Historique — {selectedAthlete?.first_name}</h3>
              <button className="btn btn-outline" onClick={() => setStep('select')}>Retour</button>
            </div>
            {history.map(entry => (
              <HistoryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  )
}

function QuestionInput({ q, value, onChange }) {
  const ans = value || {}
  switch (q.input_type) {
    case 'number':
      return <input type="number" min={q.min_val ?? 0} max={q.max_val ?? 100} value={ans.number ?? ''} onChange={e => onChange('number', e.target.value === '' ? undefined : parseFloat(e.target.value))} />
    case 'slider':
      return (
        <div>
          <input type="range" min={q.min_val} max={q.max_val} value={ans.number ?? q.min_val} onChange={e => onChange('number', parseFloat(e.target.value))} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888' }}>
            <span>{q.min_val}</span><span style={{ fontWeight: 700, color: '#3C3C3C' }}>{ans.number ?? q.min_val}</span><span>{q.max_val}</span>
          </div>
        </div>
      )
    case 'radio': {
      const opts = q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : []
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {opts.map((opt, i) => {
            const val = typeof opt === 'object' ? opt.value : opt
            const lbl = typeof opt === 'object' ? opt.label : opt
            return (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
                <input type="radio" name={`q_${q.id}`} value={val} checked={ans.text === String(val)} onChange={() => onChange('text', String(val))} />
                {lbl}
              </label>
            )
          })}
        </div>
      )
    }
    case 'checkbox': {
      const opts = q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : []
      const selected = ans.array || []
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {opts.map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={e => {
                  const next = e.target.checked ? [...selected, opt] : selected.filter(x => x !== opt)
                  onChange('array', next)
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      )
    }
    case 'toggle':
      return (
        <div style={{ display: 'flex', gap: 12 }}>
          {['Oui', 'Non'].map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 400 }}>
              <input type="radio" name={`q_${q.id}`} value={opt} checked={ans.text === opt} onChange={() => onChange('text', opt)} />
              {opt}
            </label>
          ))}
        </div>
      )
    case 'textarea':
    default:
      return <textarea value={ans.text || ''} onChange={e => onChange('text', e.target.value)} rows={3} />
  }
}

function HistoryCard({ entry }) {
  const [open, setOpen] = useState(false)
  const [responses, setResponses] = useState(entry.journal_responses || [])
  const [loadingResp, setLoadingResp] = useState(false)

  async function handleOpen() {
    const next = !open
    setOpen(next)
    // Recharge les réponses depuis la DB à chaque ouverture pour éviter les données périmées
    if (next && entry.id) {
      setLoadingResp(true)
      const { data } = await supabase
        .from('journal_responses')
        .select('*, journal_questions(label, section)')
        .eq('entry_id', entry.id)
        .order('id')
      setResponses(data || [])
      setLoadingResp(false)
    }
  }

  function displayValue(r) {
    if (r.value_text) return r.value_text
    if (r.value_number != null) return String(r.value_number)
    if (r.value_array && r.value_array.length > 0) return r.value_array.join(', ')
    return '—'
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
      <div
        style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: open ? '#f0f7ff' : '#fff' }}
        onClick={handleOpen}
      >
        <div>
          <strong>Semaine du {entry.week_start}</strong>
          {entry.coach_response && <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#16a34a' }}>💬 Réponse de l'entraîneur</span>}
        </div>
        <span style={{ color: '#6b7280' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', fontSize: '0.88rem' }}>
          {loadingResp && <p style={{ color: '#888', marginBottom: 10 }}>Chargement…</p>}

          {/* Réponses de l'athlète */}
          {responses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Tes réponses
              </div>
              {responses.map(r => (
                <div key={r.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}>
                    {r.journal_questions?.label || 'Question'}
                  </div>
                  <div style={{ color: '#1a1a