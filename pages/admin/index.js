import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { getSession } from '../../lib/auth'

export default function Admin() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('comptes')
  const [accounts, setAccounts] = useState([])
  const [teams, setTeams] = useState([])
  const [athletes, setAthletes] = useState([])
  const [teamCoaches, setTeamCoaches] = useState([])
  const [teamSpecialists, setTeamSpecialists] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [newAccount, setNewAccount] = useState({ username: '', password: '', role: 'coach', email: '', can_view_confidential: false })
  const [newTeam, setNewTeam] = useState({ name: '', region: '', school: '' })
  const [newAthlete, setNewAthlete] = useState({ first_name: '', last_name: '', team_id: '', pin: '' })
  const [assignCoachForm, setAssignCoachForm] = useState({ team_id: '', coach_id: '' })
  const [assignSpecForm, setAssignSpecForm] = useState({ team_id: '', specialist_id: '' })

  useEffect(() => {
    const u = getSession()
    if (!u || u.role !== 'admin') { router.push('/login'); return }
    setUser(u)
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)

    // Comptes — essayer avec can_view_confidential, sinon sans (colonne peut ne pas exister encore)
    let { data: accs, error: accErr } = await supabase
      .from('accounts').select('id, username, role, email, region, school, can_view_confidential').order('username')
    if (accErr) {
      const fallback = await supabase.from('accounts').select('id, username, role, email, region, school').order('username')
      accs = fallback.data
    }

    // Autres tables — chacune indépendante pour ne pas bloquer les autres
    const [{ data: tms }, { data: atls }, { data: tc }] = await Promise.all([
      supabase.from('teams').select('id, name, region, school').order('name'),
      supabase.from('athletes').select('id, first_name, last_name, team_id').order('last_name'),
      supabase.from('team_coaches').select('team_id, coach_id'),
    ])

    // team_specialists — peut ne pas exister si migration pas encore exécutée
    const { data: ts } = await supabase.from('team_specialists').select('team_id, specialist_id')

    setAccounts(accs || [])
    setTeams(tms || [])
    setAthletes(atls || [])
    setTeamCoaches(tc || [])
    setTeamSpecialists(ts || [])
    setLoading(false)
  }

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  // ── COMPTES ──────────────────────────────────────────────
  async function createAccount(e) {
    e.preventDefault()
    if (!newAccount.username || !newAccount.password) return
    const { error } = await supabase.rpc('create_account', {
      p_username: newAccount.username,
      p_password: newAccount.password,
      p_role: newAccount.role,
      p_email: newAccount.email || null,
    })
    if (error) { flash('❌ Erreur: ' + error.message); return }

    if (newAccount.role === 'specialist' && newAccount.can_view_confidential) {
      const { data: created } = await supabase.from('accounts').select('id').eq('username', newAccount.username).single()
      if (created) {
        await supabase.from('accounts').update({ can_view_confidential: true }).eq('id', created.id)
      }
    }

    flash('✅ Compte créé.')
    setNewAccount({ username: '', password: '', role: 'coach', email: '', can_view_confidential: false })
    loadAll()
  }

  async function deleteAccount(id) {
    if (!confirm('Supprimer ce compte?')) return
    await supabase.from('accounts').delete().eq('id', id)
    loadAll()
  }

  async function resetPassword(id) {
    const pwd = prompt('Nouveau mot de passe:')
    if (!pwd) return
    await supabase.rpc('reset_password', { p_account_id: id, p_password: pwd })
    flash('✅ Mot de passe réinitialisé.')
  }

  async function toggleConfidential(account) {
    const newVal = !account.can_view_confidential
    const { error } = await supabase.from('accounts').update({ can_view_confidential: newVal }).eq('id', account.id)
    if (error) { flash('❌ ' + error.message); return }
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, can_view_confidential: newVal } : a))
    flash(newVal
      ? `✅ ${account.username} peut maintenant accéder aux questions confidentielles.`
      : `✅ Accès aux questions confidentielles retiré pour ${account.username}.`
    )
  }

  // ── ÉQUIPES ──────────────────────────────────────────────
  async function createTeam(e) {
    e.preventDefault()
    if (!newTeam.name) return
    const { error } = await supabase.from('teams').insert([newTeam])
    if (error) { flash('❌ ' + error.message); return }
    flash('✅ Équipe créée.')
    setNewTeam({ name: '', region: '', school: '' })
    loadAll()
  }

  async function deleteTeam(id) {
    if (!confirm('Supprimer cette équipe?')) return
    await supabase.from('teams').delete().eq('id', id)
    loadAll()
  }

  // ── ATHLÈTES ─────────────────────────────────────────────
  async function createAthlete(e) {
    e.preventDefault()
    if (!newAthlete.first_name || !newAthlete.last_name) return
    const { error } = await supabase.from('athletes').insert([{
      first_name: newAthlete.first_name,
      last_name: newAthlete.last_name,
      team_id: newAthlete.team_id ? parseInt(newAthlete.team_id) : null,
      pin: newAthlete.pin || null,
    }])
    if (error) { flash('❌ ' + error.message); return }
    flash('✅ Athlète ajouté.')
    setNewAthlete({ first_name: '', last_name: '', team_id: '', pin: '' })
    loadAll()
  }

  async function deleteAthlete(id) {
    if (!confirm('Supprimer cet athlète et toutes ses données?')) return
    await supabase.from('athletes').delete().eq('id', id)
    loadAll()
  }

  // ── ASSIGNATIONS COACH ────────────────────────────────────
  async function assignCoach(e) {
    e.preventDefault()
    if (!assignCoachForm.team_id || !assignCoachForm.coach_id) return
    const { error } = await supabase.from('team_coaches').upsert([{
      team_id: parseInt(assignCoachForm.team_id),
      coach_id: parseInt(assignCoachForm.coach_id),
    }])
    if (error) { flash('❌ ' + error.message); return }
    flash('✅ Entraîneur assigné.')
    setAssignCoachForm({ team_id: '', coach_id: '' })
    loadAll()
  }

  async function removeCoachAssignment(teamId, coachId) {
    await supabase.from('team_coaches').delete().eq('team_id', teamId).eq('coach_id', coachId)
    loadAll()
  }

  // ── ASSIGNATIONS SPÉCIALISTE ──────────────────────────────
  async function assignSpecialist(e) {
    e.preventDefault()
    if (!assignSpecForm.team_id || !assignSpecForm.specialist_id) return
    const { error } = await supabase.from('team_specialists').upsert([{
      team_id: parseInt(assignSpecForm.team_id),
      specialist_id: parseInt(assignSpecForm.specialist_id),
    }])
    if (error) { flash('❌ ' + error.message); return }
    flash('✅ Spécialiste assigné.')
    setAssignSpecForm({ team_id: '', specialist_id: '' })
    loadAll()
  }

  async function removeSpecialistAssignment(teamId, specId) {
    await supabase.from('team_specialists').delete().eq('team_id', teamId).eq('specialist_id', specId)
    loadAll()
  }

  const coaches = accounts.filter(a => a.role === 'coach')
  const specialists = accounts.filter(a => a.role === 'specialist')

  const teamCoachMap = {}
  for (const tc of teamCoaches) {
    if (!teamCoachMap[tc.team_id]) teamCoachMap[tc.team_id] = []
    const coach = accounts.find(a => a.id === tc.coach_id)
    if (coach) teamCoachMap[tc.team_id].push(coach)
  }

  const teamSpecMap = {}
  for (const ts of teamSpecialists) {
    if (!teamSpecMap[ts.team_id]) teamSpecMap[ts.team_id] = []
    const spec = accounts.find(a => a.id === ts.specialist_id)
    if (spec) teamSpecMap[ts.team_id].push(spec)
  }

  return (
    <Layout title="Administration" user={user}>
      <h2 style={{ marginBottom: 20, color: '#1a3a5c' }}>Administration</h2>
      {msg && <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-error'}`}>{msg}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'comptes' ? 'active' : ''}`} onClick={() => setTab('comptes')}>👤 Comptes</button>
        <button className={`tab ${tab === 'equipes' ? 'active' : ''}`} onClick={() => setTab('equipes')}>🏆 Équipes</button>
        <button className={`tab ${tab === 'athletes' ? 'active' : ''}`} onClick={() => setTab('athletes')}>🏃 Athlètes</button>
        <button className={`tab ${tab === 'assign' ? 'active' : ''}`} onClick={() => setTab('assign')}>🔗 Assignations</button>
      </div>

      {/* ── COMPTES ── */}
      {tab === 'comptes' && (
        <div>
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Créer un compte</h3>
            <form onSubmit={createAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom d'utilisateur *</label>
                <input type="text" value={newAccount.username} onChange={e => setNewAccount({ ...newAccount, username: e.target.value })} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Mot de passe *</label>
                <input type="password" value={newAccount.password} onChange={e => setNewAccount({ ...newAccount, password: e.target.value })} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Rôle</label>
                <select value={newAccount.role} onChange={e => setNewAccount({ ...newAccount, role: e.target.value, can_view_confidential: false })}>
                  <option value="coach">Entraîneur</option>
                  <option value="specialist">Spécialiste</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Courriel</label>
                <input type="email" value={newAccount.email} onChange={e => setNewAccount({ ...newAccount, email: e.target.value })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Créer</button>
              </div>
              {newAccount.role === 'specialist' && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, background: '#f3e8ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: '10px 14px' }}>
                  <input
                    type="checkbox"
                    id="can_view_confidential"
                    checked={newAccount.can_view_confidential}
                    onChange={e => setNewAccount({ ...newAccount, can_view_confidential: e.target.checked })}
                    style={{ accentColor: '#7c3aed', width: 18, height: 18, flexShrink: 0 }}
                  />
                  <label htmlFor="can_view_confidential" style={{ cursor: 'pointer', fontSize: '0.88rem', color: '#6d28d9' }}>
                    <strong>🔒 Accès aux questions confidentielles</strong> — Ce spécialiste pourra voir les réponses de santé mentale confidentielles.
                  </label>
                </div>
              )}
            </form>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Courriel</th>
                  <th style={{ minWidth: 200 }}>Permissions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.username}</strong></td>
                    <td>
                      <span style={{
                        fontSize: '0.78rem', fontWeight: 600, textTransform: 'capitalize',
                        background: a.role === 'admin' ? '#fef9c3' : a.role === 'specialist' ? '#f3e8ff' : '#f0fdf4',
                        color: a.role === 'admin' ? '#854d0e' : a.role === 'specialist' ? '#6d28d9' : '#166534',
                        padding: '2px 8px', borderRadius: 20,
                      }}>
                        {a.role === 'coach' ? 'Entraîneur' : a.role === 'specialist' ? 'Spécialiste' : 'Admin'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#666' }}>{a.email || '—'}</td>
                    <td>
                      {a.role === 'specialist' && (
                        <button
                          onClick={() => toggleConfidential(a)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: a.can_view_confidential ? '#f3e8ff' : '#f9fafb',
                            border: `1px solid ${a.can_view_confidential ? '#c4b5fd' : '#e5e7eb'}`,
                            borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
                            fontSize: '0.78rem', fontWeight: 600,
                            color: a.can_view_confidential ? '#6d28d9' : '#6b7280',
                          }}
                        >
                          {a.can_view_confidential ? '🔒 Confidentiel : Oui' : '🔓 Confidentiel : Non'}
                        </button>
                      )}
                      {a.role !== 'specialist' && <span style={{ color: '#ccc', fontSize: '0.8rem' }}>—</span>}
                    </td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => resetPassword(a.id)}>Réinitialiser MDP</button>
                      {a.username !== 'admin' && (
                        <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => deleteAccount(a.id)}>Supprimer</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {specialists.length > 0 && (
            <div className="card" style={{ background: '#fafafe', border: '1px solid #e0e7ff' }}>
              <h4 style={{ color: '#4338ca', marginBottom: 12 }}>🔒 Accès aux données confidentielles</h4>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 12 }}>
                Seuls les spécialistes avec l'accès activé voient les questions de santé mentale confidentielles (q_c1–q_c4). Tous les spécialistes peuvent gérer la capacité physique des athlètes.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {specialists.map(s => (
                  <span key={s.id} style={{
                    background: s.can_view_confidential ? '#f3e8ff' : '#f9fafb',
                    border: `1px solid ${s.can_view_confidential ? '#c4b5fd' : '#e5e7eb'}`,
                    color: s.can_view_confidential ? '#6d28d9' : '#9ca3af',
                    borderRadius: 20, padding: '4px 12px', fontSize: '0.82rem', fontWeight: 600,
                  }}>
                    {s.can_view_confidential ? '🔒' : '🔓'} {s.username}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ÉQUIPES ── */}
      {tab === 'equipes' && (
        <div>
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Créer une équipe</h3>
            <form onSubmit={createTeam} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input type="text" value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>École / Club</label>
                <input type="text" value={newTeam.school} onChange={e => setNewTeam({ ...newTeam, school: e.target.value })} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Région</label>
                <input type="text" value={newTeam.region} onChange={e => setNewTeam({ ...newTeam, region: e.target.value })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Créer</button>
              </div>
            </form>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Équipe</th><th>École</th><th>Région</th><th>Entraîneurs</th><th>Spécialistes</th><th></th></tr></thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td style={{ fontSize: '0.85rem' }}>{t.school || '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{t.region || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>{(teamCoachMap[t.id] || []).map(c => c.username).join(', ') || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>{(teamSpecMap[t.id] || []).map(s => s.username).join(', ') || '—'}</td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => deleteTeam(t.id)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ATHLÈTES ── */}
      {tab === 'athletes' && (
        <div>
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Ajouter un athlète</h3>
            <form onSubmit={createAthlete} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom *</label>
                <input type="text" value={newAthlete.first_name} onChange={e => setNewAthlete({ ...newAthlete, first_name: e.target.value })} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom *</label>
                <input type="text" value={newAthlete.last_name} onChange={e => setNewAthlete({ ...newAthlete, last_name: e.target.value })} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Équipe</label>
                <select value={newAthlete.team_id} onChange={e => setNewAthlete({ ...newAthlete, team_id: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>PIN (optionnel)</label>
                <input type="text" maxLength={6} value={newAthlete.pin} onChange={e => setNewAthlete({ ...newAthlete, pin: e.target.value })} placeholder="Ex: 1234" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Ajouter</button>
              </div>
            </form>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Athlète</th><th>Équipe</th><th></th></tr></thead>
              <tbody>
                {athletes.map(a => {
                  const team = teams.find(t => t.id === a.team_id)
                  return (
                    <tr key={a.id}>
                      <td><strong>{a.last_name}, {a.first_name}</strong></td>
                      <td style={{ fontSize: '0.85rem' }}>{team?.name || '—'}</td>
                      <td>
                        <button className="btn btn-danger" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => deleteAthlete(a.id)}>Supprimer</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ASSIGNATIONS ── */}
      {tab === 'assign' && (
        <div>
          {/* Entraîneurs */}
          <div className="card">
            <h3 style={{ marginBottom: 4, color: '#1a3a5c' }}>🏋️ Assigner un entraîneur à une équipe</h3>
            <form onSubmit={assignCoach} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 16 }}>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label>Équipe</label>
                <select value={assignCoachForm.team_id} onChange={e => setAssignCoachForm({ ...assignCoachForm, team_id: e.target.value })} required>
                  <option value="">— Choisir —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label>Entraîneur</label>
                <select value={assignCoachForm.coach_id} onChange={e => setAssignCoachForm({ ...assignCoachForm, coach_id: e.target.value })} required>
                  <option value="">— Choisir —</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-primary">Assigner</button>
            </form>
          </div>
          <div className="card" style={{ padding: 0, marginBottom: 24 }}>
            <table>
              <thead><tr><th>Équipe</th><th>Entraîneur</th><th></th></tr></thead>
              <tbody>
                {teamCoaches.map((tc, i) => {
                  const team = teams.find(t => t.id === tc.team_id)
                  const coach = accounts.find(a => a.id === tc.coach_id)
                  return (
                    <tr key={i}>
                      <td>{team?.name || tc.team_id}</td>
                      <td>{coach?.username || tc.coach_id}</td>
                      <td>
                        <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.8rem', color: '#dc2626' }} onClick={() => removeCoachAssignment(tc.team_id, tc.coach_id)}>
                          Retirer
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {teamCoaches.length === 0 && <tr><td colSpan={3} style={{ color: '#888', textAlign: 'center' }}>Aucune assignation</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Spécialistes */}
          <div className="card">
            <h3 style={{ marginBottom: 4, color: '#7c3aed' }}>🏥 Assigner un spécialiste à une équipe</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 16 }}>
              Le spécialiste pourra gérer la capacité physique de tous les athlètes de l'équipe, même sans questionnaire complété.
            </p>
            <form onSubmit={assignSpecialist} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label>Équipe</label>
                <select value={assignSpecForm.team_id} onChange={e => setAssignSpecForm({ ...assignSpecForm, team_id: e.target.value })} required>
                  <option value="">— Choisir —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label>Spécialiste</label>
                <select value={assignSpecForm.specialist_id} onChange={e => setAssignSpecForm({ ...assignSpecForm, specialist_id: e.target.value })} required>
                  <option value="">— Choisir —</option>
                  {specialists.map(s => <option key={s.id} value={s.id}>{s.username}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>Assigner</button>
            </form>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Équipe</th><th>Spécialiste</th><th>Accès confidentiel</th><th></th></tr></thead>
              <tbody>
                {teamSpecialists.map((ts, i) => {
                  const team = teams.find(t => t.id === ts.team_id)
                  const spec = accounts.find(a => a.id === ts.specialist_id)
                  return (
                    <tr key={i}>
                      <td>{team?.name || ts.team_id}</td>
                      <td>{spec?.username || ts.specialist_id}</td>
                      <td>
                        {spec?.can_view_confidential
                          ? <span style={{ color: '#6d28d9', fontSize: '0.82rem', fontWeight: 600 }}>🔒 Oui</span>
                          : <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>🔓 Non</span>
                        }
                      </td>
                      <td>
                        <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.8rem', color: '#dc2626' }} onClick={() => removeSpecialistAssignment(ts.team_id, ts.specialist_id)}>
                          Retirer
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {teamSpecialists.length === 0 && <tr><td colSpan={4} style={{ color: '#888', textAlign: 'center' }}>Aucune assignation</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  )
}
