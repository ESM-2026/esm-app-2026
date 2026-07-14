import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * PinGate — Gère l'accès par PIN pour un athlète.
 *
 * - Si l'athlète n'a pas de PIN → formulaire de création (première visite)
 * - Si l'athlète a déjà un PIN → formulaire de vérification
 * - onSuccess() est appelé quand l'accès est accordé
 */
export default function PinGate({ athlete, onSuccess, onBack }) {
  const hasPin = !!athlete?.pin
  const [mode] = useState(hasPin ? 'verify' : 'create')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    if (pin.length < 4) { setError('Le PIN doit contenir au moins 4 chiffres.'); return }
    if (pin !== pinConfirm) { setError('Les deux PIN ne correspondent pas.'); return }
    if (!/^\d+$/.test(pin)) { setError('Le PIN doit contenir uniquement des chiffres.'); return }
    setLoading(true)
    const { error: err } = await supabase
      .from('athletes')
      .update({ pin })
      .eq('id', athlete.id)
    setLoading(false)
    if (err) { setError('Erreur lors de l\'enregistrement. Réessaie.'); return }
    onSuccess()
  }

  function handleVerify(e) {
    e.preventDefault()
    setError('')
    if (pin.trim() === athlete.pin.trim()) {
      onSuccess()
    } else {
      setError('Code PIN incorrect.')
      setPin('')
    }
  }

  return (
    <div style={s.wrapper}>
      <div style={s.icon}>{mode === 'create' ? '🔐' : '🔑'}</div>

      {mode === 'create' ? (
        <>
          <h3 style={s.title}>Créer ton code PIN</h3>
          <p style={s.desc}>
            Bienvenue <strong>{athlete.first_name}</strong>! C'est ta première connexion.
            Choisis un code PIN à 4 chiffres pour sécuriser ton accès.
          </p>
          <form onSubmit={handleCreate} style={s.form}>
            <div className="form-group">
              <label>Nouveau PIN (4 chiffres minimum)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="····"
                style={s.pinInput}
                autoFocus
                required
              />
            </div>
            <div className="form-group">
              <label>Confirme ton PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="····"
                style={s.pinInput}
                required
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Enregistrement…' : 'Créer mon PIN'}
              </button>
              <button type="button" className="btn btn-outline" onClick={onBack}>
                Retour
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <h3 style={s.title}>Entrez votre PIN</h3>
          <p style={s.desc}>
            Bonjour <strong>{athlete.first_name}</strong>! Entrez votre code PIN pour continuer.
          </p>
          <form onSubmit={handleVerify} style={s.form}>
            <div className="form-group">
              <label>Code PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="····"
                style={s.pinInput}
                autoFocus
                required
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary">Continuer</button>
              <button type="button" className="btn btn-outline" onClick={onBack}>Retour</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}

const s = {
  wrapper: { padding: '28px 24px' },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: '1.1rem', fontWeight: 700, color: '#1a3a5c', marginBottom: 8 },
  desc: { fontSize: '0.9rem', color: '#555', marginBottom: 20, lineHeight: 1.5 },
  form: { maxWidth: 300 },
  pinInput: { maxWidth: 160, fontSize: '1.2rem', letterSpacing: '0.3em', textAlign: 'center' },
}
