import { useState, useEffect } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import PinGate from '../components/PinGate'

// ── Définition des questions ────────────────────────────────
const SCALE_MOTIVATION = [
  '1 — Ne correspond pas du tout',
  '2 — Correspond très peu',
  '3 — Correspond un peu',
  '4 — Correspond moyennement',
  '5 — Correspond assez',
  '6 — Correspond fortement',
  '7 — Correspond très fortement',
]

const SCALE_FREQUENCE_4 = ['1 — Jamais', '2 — Plusieurs jours', '3 — Plus de la moitié des jours', '4 — Presque tous les jours']
const SCALE_ACCORD_5    = ["1 — Fortement en désaccord", "2 — Plutôt en désaccord", "3 — Pas sûr / Neutre", "4 — Plutôt en accord", "5 — Tout à fait d'accord"]
const SCALE_NUTRITION   = ['0 — Aucune fois', '1 — Entre 1 et 2 fois', '2 — Entre 3 et 4 fois', '3 — Entre 5 et 6 fois', '4 — À tous les jours']

const SECTIONS = [
  {
    title: 'Bien-être général',
    questions: [
      {
        key: 'q_general',
        label: 'En général, comment évaluerais-tu ta santé mentale?',
        type: 'scale', min: 1, max: 5,
        labels: ['1 — Excellente', '2 — Très bonne', '3 — Bonne', '4 — Passable', '5 — Mauvaise'],
      },
    ],
  },
  {
    title: 'Motivation',
    preamble: 'En général, pourquoi pratiques-tu ce sport? Indique dans quelle mesure chacun des énoncés suivants correspond à ta situation.',
    questions: [
      { key: 'q_a', label: "Je ne le sais pas; j'ai l'impression que c'est inutile de continuer à faire du sport.", type: 'scale', min: 1, max: 7, labels: SCALE_MOTIVATION },
      { key: 'q_b', label: "Je n'arrive pas à voir pourquoi je fais du sport; plus j'y pense, plus j'ai le goût de lâcher le milieu sportif.", type: 'scale', min: 1, max: 7, labels: SCALE_MOTIVATION },
      { key: 'q_c', label: "Je ne le sais pas clairement; de plus, je ne crois pas être vraiment à ma place dans le sport.", type: 'scale', min: 1, max: 7, labels: SCALE_MOTIVATION },
      { key: 'q_d', label: "Je me le demande bien; je n'arrive pas à atteindre les objectifs que je me fixe.", type: 'scale', min: 1, max: 7, labels: SCALE_MOTIVATION },
    ],
  },
  {
    title: 'Sommeil',
    preamble: 'Au cours de la dernière semaine, à quelle fréquence as-tu été dérangé(e) par les éléments suivants?',
    questions: [
      { key: 'q_e', label: "Difficulté à t'endormir, ou à rester endormi(e), ou trop dormir.", type: 'scale', min: 1, max: 4, labels: SCALE_FREQUENCE_4 },
    ],
  },
  {
    title: 'Conciliation sport-études-social',
    preamble: 'Dans quelle mesure es-tu en accord ou en désaccord avec les énoncés suivants?',
    questions: [
      { key: 'q_f', label: "Après le travail, je n'ai pas le temps et/ou l'énergie pour faire mes travaux scolaires et étudier.", type: 'scale', min: 1, max: 5, labels: SCALE_ACCORD_5 },
    ],
  },
  {
    title: 'Anxiété',
    questions: [
      { key: 'q_g', label: "Je m'inquiète ou je suis stressé(e) lorsque je suis à l'école ou à la maison.", type: 'scale', min: 1, max: 4, labels: ['1 — Jamais', '2 — Parfois', '3 — Souvent', '4 — Toujours'] },
    ],
  },
  {
    title: 'Social',
    preamble: 'Dans quelle mesure es-tu en accord ou en désaccord avec les énoncés suivants?',
    questions: [
      { key: 'q_h', label: "Les membres de notre équipe ne restent pas ensemble en dehors des entraînements et compétitions.", type: 'scale', min: 1, max: 5, labels: SCALE_ACCORD_5 },
    ],
  },
  {
    title: 'Nutrition',
    questions: [
      { key: 'q_i', label: "Au courant des 7 derniers jours, as-tu volontairement limité la quantité de nourriture que tu manges pour influencer ta taille ou ton poids? (peu importe si tu as réussi ou non)", type: 'scale', min: 0, max: 4, labels: SCALE_NUTRITION },
      { key: 'q_j', label: "Au courant des 7 derniers jours, as-tu tenté d'exclure certains aliments de ton alimentation dans le but d'influencer ta taille ou ton poids? (peu importe si tu as réussi ou non)", type: 'scale', min: 0, max: 4, labels: SCALE_NUTRITION },
      { key: 'q_k', label: "Au courant des 7 derniers jours, à combien de reprises as-tu été insatisfait.e de ton poids?", type: 'scale', min: 0, max: 4, labels: SCALE_NUTRITION },
      { key: 'q_l', label: "Au courant des 7 derniers jours, à combien de reprises as-tu eu des épisodes d'hyperphagie (c.-à-d. manger de très grandes quantités de nourriture et ressentir une perte de contrôle pendant)?", type: 'scale', min: 0, max: 4, labels: SCALE_NUTRITION },
      { key: 'q_m', label: "Au courant des 7 derniers jours, à combien de reprises t'es-tu fait vomir dans un but de contrôler ton poids ou la forme de ton corps (ta shape)?", type: 'scale', min: 0, max: 4, labels: SCALE_NUTRITION },
      { key: 'q_n', label: "Au courant des 7 derniers jours, à combien de reprises as-tu fait de l'exercice de façon « compulsive » ou « excessive » dans un but de contrôler ton poids, la forme de ton corps (ta shape), ton pourcentage de gras ou pour brûler des calories?", type: 'scale', min: 0, max: 4, labels: SCALE_NUTRITION },
      { key: 'q_o', label: "Au courant des 7 derniers jours, à combien de reprises as-tu eu recours à une application mobile pour comptabiliser tes calories ou tes nutriments?", type: 'scale', min: 0, max: 4, labels: SCALE_NUTRITION },
      { key: 'q_p', label: "Au courant des 7 derniers jours, à combien de reprises as-tu eu recours à des suppléments dans le but d'influencer ta taille ou ton poids?", type: 'scale', min: 0, max: 4, labels: SCALE_NUTRITION },
    ],
  },
  {
    title: '🔒 Questions confidentielles',
    subtitle: "Ces réponses concernent tes relations avec tes entraîneurs et coéquipiers. Elles sont UNIQUEMENT visibles par les professionnels de la santé désignés par l'ESM. Ton entraîneur n'y a pas accès.",
    confidential: true,
    questions: [
      { key: 'q_c1', label: "Au cours de la dernière semaine, à quelle fréquence as-tu vécu un conflit avec ton/tes entraîneurs?", type: 'scale', min: 1, max: 4, labels: SCALE_FREQUENCE_4 },
      { key: 'q_c2', label: "Au cours de la dernière semaine, à quelle fréquence as-tu vécu un conflit avec un/des coéquipiers/partenaires d'entraînement?", type: 'scale', min: 1, max: 4, labels: SCALE_FREQUENCE_4 },
      { key: 'q_c3', label: "Mes idées et mes opinions sont valorisés par mon/mes entraîneurs.", type: 'scale', min: 1, max: 5, labels: SCALE_ACCORD_5 },
      { key: 'q_c4', label: "Mes idées et mes opinions sont valorisés par mes coéquipiers/partenaires d'entraînement.", type: 'scale', min: 1, max: 5, labels: SCALE_ACCORD_5 },
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

                {/* Texte d'introduction de la section */}
                {section.preamble && (
                  <p style={{ fontSize: '0.88rem', color: '#4b5563', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontStyle: 'italic' }}>
                    {section.preamble}
                  </p>
                )}

                {/* Bandeau confidentialité */}
                {section.subtitle && (
                  <p style={{ fontSize: '0.82rem', color: '#6d28d9', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                    🔒 {section.subtitle}
                  </p>
                )}

                {section.questions.map(q => (
                  <div key={q.key} className="form-group">
                    <label style={{ lineHeight: 1.5, marginBottom: 10, display: 'block' }}>{q.label}</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      {q.labels.map((lbl, idx) => {
                        const val = q.min + idx
                        const selected = answers[q.key] === val
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleAnswer(q.key, val)}
                            style={{
                              padding: '8px 14px',
                              borderRadius: 8,
                              border: selected ? '2px solid #C5D400' : '1px solid #d0d5dd',
                              background: selected ? '#3C3C3C' : '#fff',
                              color: selected ? '#C5D400' : '#333',
                              fontWeight: selected ? 700 : 400,
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              transition: 'all 0.15s',
                              textAlign: 'left',
                            }}
                          >
                            {lbl}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div style={styles.section}>
              <div className="form-group">
                <label>Commentaire (facultatif)</label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Ajoute un commentaire si tu le souhaites…"
                  rows={3}
                />
              </div>
            </div>

            {error && <div className="alert alert-error" style={{ margin: '0 24px 16px' }}>{error}</div>}

            <div style={{ padding: '16px 24px 32px' }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px' }} disabled={loading || !allAnswered()}>
                {loading ? 'Envoi en cours…' : '✅ Soumettre mon questionnaire'}
              </button>
              {!allAnswered() && (
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
                  Réponds à toutes les questions pour soumettre.
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </PageWrapper>
  )
}

function QuestionnaireHistoryCard({ response: r }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <div
        style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: open ? '#f0f7ff' : '#fff' }}
        onClick={() => setOpen(!open)}
      >
        <strong style={{ fontSize: '0.9rem' }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('fr-CA') : '—'}</strong>
        <span style={{ color: '#6b7280' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: 16, borderTop: '1px solid #e5e7eb', fontSize: '0.85rem' }}>
          {SECTIONS.map((section, si) => (
            <div key={si} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: '#3C3C3C', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {section.title}
              </div>
              {section.questions.map(q => {
                const val = r[q.key]
                if (val == null) return null
                const lbl = q.labels[val - q.min]
                return (
                  <div key={q.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ color: '#555', fontSize: '0.82rem', maxWidth: '70%' }}>{q.label}</span>
                    <strong style={{ color: '#3C3C3C', whiteSpace: 'nowrap', marginLeft: 8 }}>{lbl}</strong>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PageWrapper({ children }) {
  return (
    <>
      <Head>
        <title>Questionnaire Santé Mentale — ESM</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
        <div style={{ background: '#3C3C3C', borderBottom: '4px solid #C5D400', padding: '10px 20px', textAlign: 'center' }}>
          <span style={{ color: '#C5D400', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.04em' }}>ESM — Excellence Sportive Montérégie</span>
        </div>
        <div style={{ maxWidth: 680, margin: '32px auto', padding: '0 16px' }}>
          {children}
        </div>
      </div>
    </>
  )
}

const styles = {
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.09)', overflow: 'hidden', marginBottom: 24 },
  headerBand: { background: '#3C3C3C', padding: '24px', borderBottom: '3px solid #C5D400' },
  title: { color: '#C5D400', fontSize: '1.4rem', fontWeight: 700 },
  subtitle: { color: 'rgba(255,255,255,0.7)', marginTop: 4, fontSize: '0.85rem' },
  section: { padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  confidentialSection: { background: '#faf5ff', borderLeft: '3px solid #7c3aed' },
  sectionTitle: { color: '#3C3C3C', fontWeight: 700, marginBottom: 16, fontSize: '1rem' },
}
