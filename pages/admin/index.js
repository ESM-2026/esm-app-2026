import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { getSession } from '../../lib/auth'

export default function Admin() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState('comptes') // comptes | equipes | athletes
  const [accounts, setAccounts] = useState([])
  const [teams, setTeams] = useState([])
  const [athletes, setAthletes] = useState([])
  const [teamCoaches, setTeamCoaches] = useState([]) // [{team_id, coach_id}]
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // Forms
  const [newAccount, setNewAccount] = useState({ username: '', password: '', role: 'coach', email: '' })
  const [newTeam, setNewTeam] = useState({ name: '', region: '', school: '' })
  const [newAthlete, setNewAthlete] = useState({ first_name: '', last_name: '', team_id: '', pin: '' })
  const [assignment, setAssignment] = useState({ team_id: '', coach_id: '' })

  useEffect(() => {
    const u = getSession()
    if (!u || u.role !== 'admin') { router.push('/login'); return }
    setUser(u)
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: accs }, { data: tms }, { data: atls }, { data: tc }] = await Promise.all([
      supabase.from('accounts').select('id, username, role, email, region, school').order('username'),
      supabase.from('teams').select('id, name, region, school').order('name'),
      supabase.from('athletes').select('id, first_name, last_name, team_id').order('last_name'),
      supabase.from('team_coaches').select('team_id, coach_id'),
    ])
    setAccounts(accs || [])
    setTeams(tms || [])
    setAthletes(atls || [])
    setTeamCoaches(tc || [])
    setLoading(false)
  }

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

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
    flash('✅ Compte créé.')
    setNewAccount({ username: '', password: '', role: 'coach', email: '' })
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

  // ── ASSIGNMENTS ──────────────────────────────────────────
  async function assignCoach(e) {
    e.preventDefault()
    if (!assignment.team_id || !assignment.coach_id) return
    const { error } = await supabase.from('team_coaches').upsert([{
      team_id: parseInt(assignment.team_id),
      coach_id: parseInt(assignment.coach_id),
    }])
    if (error) { flash('❌ ' + error.message); return }
    flash('✅ Assignation enregistrée.')
    setAssignment({ team_id: '', coach_id: '' })
    loadAll()
  }

  async function removeAssignment(teamId, coachId) {
    await supabase.from('team_coaches').delete().eq('team_id', teamId).eq('coach_id', coachId)
    loadAll()
  }

  const coaches = accounts.filter(a => a.role === 'coach')
  const teamCoachMap = {}
  for (const tc of teamCoaches) {
    if (!teamCoachMap[tc.team_id]) teamCoachMap[tc.team_id] = []
    const coach = accounts.find(a => a.id === tc.coach_id)
    if (coach) teamCoachMap[tc.team_id].push(coach)
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
                <select value={newAccount.role} onChange={e => setNewAccount({ ...newAccount, role: e.target.value })}>
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
            </form>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Courriel</th><th>Actions</th></tr></thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.username}</strong></td>
                    <td><span style={{ fontSize: '0.82rem', textTransform: 'capitalize' }}>{a.role}</span></td>
                    <td style={{ fontSize: '0.85rem', color: '#666' }}>{a.email || '—'}</td>
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
              <thead><tr><th>Équipe</th><th>École</th><th>Région</th><th>Entraîneurs</th><th></th></tr></thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td style={{ fontSize: '0.85rem' }}>{t.school || '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{t.region || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {(teamCoachMap[t.id] || []).map(c => c.username).join(', ') || '—'}
                    </td>
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
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Assigner un entraîneur à une équipe</h3>
            <form onSubmit={assignCoach} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label>Équipe</label>
                <select value={assignment.team_id} onChange={e => setAssignment({ ...assignment, team_id: e.target.value })} required>
                  <option value="">— Choisir —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label>Entraîneur</label>
                <select value={assignment.coach_id} onChange={e => setAssignment({ ...assignment, coach_id: e.target.value })} required>
                  <option value="">— Choisir —</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-primary">Assigner</button>
            </form>
          </div>
          <div className="card" style={{ padding: 0 }}>
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
                        <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.8rem', color: '#dc2626' }} onClick={() => removeAssignment(tc.team_id, tc.coach_id)}>
                          Retirer
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  )
}
