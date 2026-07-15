import { useState, useEffect } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import PinGate from '../components/PinGate'

// ── Définition des questions ────────────────────────────────
const SECTIONS = [
  {
    title: 'Bien-être général',
    questions: [
      { key: 'q_general', label: 'Comment te sens-tu en général cette semaine?', type: 'scale', min: 1, max: 5, labels: ['Très mal', 'Mal', 'Moyen', 'Bien', 'Très bien'] },
    ],
  },
  {
    title: 'Motivation',
    questions: [
      { key: 'q_a', label: "Mon niveau de motivation à l'entraînement", type: 'scale', min: 1, max: 7, labels: ['1', '2', '3', '4', '5', '6', '7'] },
      { key: 'q_b', label: 'Je me sens capable d\'atteindre mes objectifs', type: 'scale', min: 1, max: 7, labels: ['1', '2', '3', '4', '5', '6', '7'] },
      { key: 'q_c', label: "L'entraînement me donne de l'énergie", type: 'scale', min: 1, max: 7, labels: ['1', '2', '3', '4', '5', '6', '7'] },
      { key: 'q_d', label: "J'ai envie de performer", type: 'scale', min: 1, max: 7, labels: ['1', '2', '3', '4', '5', '6', '7'] },
    ],
  },
  {
    title: 'Sommeil',
    questions: [
      { key: 'q_e', label: 'Qualité de mon sommeil cette semaine', type: 'scale', min: 1, max: 4, labels: ['Très mauvais', 'Mauvais', 'Bon', 'Excellent'] },
    ],
  },
  {
    title: 'Conciliation sport-études',
    questions: [
      { key: 'q_f', label: "J'arrive à concilier sport et études sans trop de stress", type: 'scale', min: 1, max: 5, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
    ],
  },
  {
    title: 'Anxiété',
    questions: [
      { key: 'q_g', label: "Mon niveau d'anxiété liée au sport cette semaine", type: 'scale', min: 1, max: 4, labels: ['Aucune', 'Légère', 'Modérée', 'Élevée'] },
    ],
  },
  {
    title: 'Social',
    questions: [
      { key: 'q_h', label: "Je me sens bien intégré(e) dans mon équipe", type: 'scale', min: 1, max: 5, labels: ['Pas du tout', 'Un peu', 'Moyennement', 'Beaucoup', 'Totalement'] },
    ],
  },
  {
    title: 'Nutrition',
    questions: [
      { key: 'q_i', label: 'Petit-déjeuner: je mange suffisamment avant l\'entraînement', type: 'scale', min: 0, max: 4, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
      { key: 'q_j', label: 'Je m\'hydrate bien pendant l\'entraînement', type: 'scale', min: 0, max: 4, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
      { key: 'q_k', label: 'Je consomme des fruits/légumes chaque jour', type: 'scale', min: 0, max: 4, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
      { key: 'q_l', label: 'Je récupère bien après l\'effort (collation, repas)', type: 'scale', min: 0, max: 4, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
      { key: 'q_m', label: 'Je mange à des heures régulières', type: 'scale', min: 0, max: 4, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
      { key: 'q_n', label: 'Ma qualité nutritionnelle globale', type: 'scale', min: 0, max: 4, labels: ['Très mauvaise', 'Mauvaise', 'Acceptable', 'Bonne', 'Excellente'] },
      { key: 'q_o', label: 'Je ressens de la fatigue liée à une mauvaise alimentation', type: 'scale', min: 0, max: 4, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
      { key: 'q_p', label: 'Je mange selon mes besoins sportifs', type: 'scale', min: 0, max: 4, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
    ],
  },
  {
    title: '🔒 Questions confidentielles',
    subtitle: 'Ces réponses sont UNIQUEMENT visibles par les professionnels de la santé désignés. Elles ne sont pas accessibles à ton entraîneur.',
    confidential: true,
    questions: [
      { key: 'q_c1', label: "Je ressens de la tristesse ou du vide de façon persistante", type: 'scale', min: 1, max: 4, labels: ['Jamais', 'Parfois', 'Souvent', 'Presque toujours'] },
      { key: 'q_c2', label: "Je me sens dépassé(e) ou sans espoir", type: 'scale', min: 1, max: 4, labels: ['Jamais', 'Parfois', 'Souvent', 'Presque toujours'] },
      { key: 'q_c3', label: "Je me sens en sécurité dans mon environnement sportif", type: 'scale', min: 1, max: 5, labels: ['Jamais', 'Rarement', 'Parfois', 'Souvent', 'Toujours'] },
      { key: 'q_c4', label: "J'ai des pensées qui m'inquiètent et dont je voudrais parler à quelqu'un", type: 'scale', min: 1, max: 4, labels: ['Jamais', 'Parfois', 'Souvent', 'Presque toujours'] },
    ],
  },
]

function getMonday(d = new Date()) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  date.setDate(date.getDate() + diff)
  return date.toISOString().split('T')[0]
}

const NON_CONFIDENTIAL_KEYS = ['q_general','q_a','q_b','q_c','q_d','q_e','q_f','q_g','q_h','q_i','q_j','q_k','q_l','q_m','q_n','q_o','q_p']

export default function Questionnaire() {
  const [step, setStep] = useState('select') // 'select' | 'pin' | 'check' | 'already' | 'form' | 'history' | 'done'
  const [teams, setTeams] = useState([])
  const [athletes, setAthletes] = useState([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedAthlete, setSelectedAthlete] = useState('')
  const [pendingAthlete, setPendingAthlete] = useState(null)
  const [history, setHistory] = useState([])
  const [answers, setAnswers] = useState({})
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const weekStart = getMonday()

  async function loadTeams() {
    const { data } = await supabase.from('teams').select('id, name').order('name')
    setTeams(data || [])
  }

  async function loadAthletes(teamId) {
    const { data } = await supabase
      .from('athletes')
      .select('id, first_name, last_name, pin')
      .eq('team_id', teamId)
      .order('last_name')
    setAthletes(data || [])
  }

  async function loadHistory(athleteId) {
    const { data } = await supabase
      .from('responses')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('submitted_at', { ascending: false })
      .limit(10)
    return data || []
  }

  async function onPinSuccess() {
    setLoading(true)
    const hist = await loadHistory(parseInt(selectedAthlete))
    setHistory(hist)
    setLoading(false)
    const thisWeek = hist.find(r => r.submitted_at?.startsWith(weekStart) || (r.submitted_at && new Date(r.submitted_at) >= new Date(weekStart)))
    if (thisWeek) {
      setStep('already')
    } else {
      setStep('form')
    }
  }

  useEffect(() => { loadTeams() }, [])

  function handleTeamChange(e) {
    const id = e.target.value
    setSelectedTeam(id)
    setSelectedAthlete('')
    if (id) loadAthletes(id)
  }

  function handleAthleteSelect(e) {
    const id = e.target.value
    setSelectedAthlete(id)
    setError('')
    if (id) {
      const athlete = athletes.find(a => String(a.id) === String(id))
      setPendingAthlete(athlete || null)
    }
  }

  function handleAnswer(key, value) {
    setAnswers(prev => ({ ...prev, [key]: parseInt(value) }))
  }

  function allAnswered() {
    const allKeys = SECTIONS.flatMap(s => s.questions.map(q => q.key))
    return allKeys.every(k => answers[k] !== undefined)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!selectedAthlete) { setError('Veuillez sélectionner ton nom.'); return }
    if (!allAnswered()) { setError('Veuillez répondre à toutes les questions.'); return }
    setLoading(true)
    const { error: err } = await supabase.from('responses').insert([{
      athlete_id: parseInt(selectedAthlete),
      ...answers,
      comment: comment || null,
    }])
    setLoading(false)
    if (err) { setError('Erreur lors de la soumission. Réessaie.'); return }
    setStep('done')
  }

  if (step === 'done') {
    return (
      <PageWrapper>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 60 }}>✅</div>
            <h2 style={{ marginTop: 16, color: '#166534' }}>Merci!</h2>
            <p style={{ marginTop: 8, color: '#555' }}>Ton questionnaire a été enregistré.</p>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => { setStep('select'); setAnswers({}); setComment(''); setSelectedAthlete(''); }}>
              Nouveau questionnaire
            </button>
          </div>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <div style={styles.card}>
        <div style={styles.headerBand}>
          <h1 style={styles.title}>Questionnaire Santé Mentale</h1>
          <p style={styles.subtitle}>Excellence Sportive Montérégie · Hebdomadaire</p>
        </div>

        {/* Sélection athlète */}
        {step === 'select' && (
          <div style={styles.section}>
            <div className="form-group">
              <label>Ton équipe</label>
              <select value={selectedTeam} onChange={handleTeamChange}>
                <option value="">— Sélectionne ton équipe —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {selectedTeam && (
              <div className="form-group">
                <label>Ton nom</label>
                <select value={selectedAthlete} onChange={handleAthleteSelect}>
                  <option value="">— Sélectionne ton nom —</option>
                  {athletes.map(a => <option key={a.id} value={a.id}>{a.last_name}, {a.first_name}</option>)}
                </select>
              </div>
            )}
            {pendingAthlete && (
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setStep('pin')}>
                Continuer →
              </button>
            )}
          </div>
        )}

        {/* PIN — création ou vérification */}
        {step === 'pin' && pendingAthlete && (
          <PinGate
            athlete={pendingAthlete}
            onSuccess={onPinSuccess}
            onBack={() => { setStep('select'); setPendingAthlete(null); setSelectedAthlete('') }}
          />
        )}

        {/* Déjà soumis cette semaine */}
        {step === 'already' && (
          <div style={{ padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h3 style={{ color: '#3C3C3C', marginBottom: 8 }}>Tu as déjà rempli ton questionnaire cette semaine!</h3>
            <p style={{ color: '#6b7280', marginBottom: 24, fontSize: '0.9rem' }}>
              Semaine du {weekStart}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => setStep('history')}>
                Voir mon historique
              </button>
              <button className="btn btn-outline" onClick={() => { setStep('select'); setSelectedAthlete(''); setPendingAthlete(null) }}>
                Retour
              </button>
            </div>
          </div>
        )}

        {/* Historique questionnaire */}
        {step === 'history' && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#3C3C3C' }}>Mon historique — {pendingAthlete?.first_name}</h3>
              <button className="btn btn-outline" onClick={() => setStep('already')}>Retour</button>
            </div>
            {history.map(r => (
              <QuestionnaireHistoryCard key={r.id} response={r} />
            ))}
          </div>
        )}

        {/* Questions */}
        {step === 'form' && (
          <form onSubmit={handleSubmit}>
            {SECTIONS.map((section, si) => (
              <div key={si} style={{ ...styles.section, ...(section.confidential ? styles.confidentialSection : {}) }}>
                <h3 style={styles.sectionTitle}>{section.title}</h3>
   