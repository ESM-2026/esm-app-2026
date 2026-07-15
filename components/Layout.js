import Head from 'next/head'
import { useRouter } from 'next/router'
import { clearSession } from '../lib/auth'

const ESM_DARK  = '#3C3C3C'
const ESM_LIME  = '#C5D400'

export default function Layout({ children, title = 'ESM CoachAPP', user }) {
  const router = useRouter()

  function logout() {
    clearSession()
    router.push('/login')
  }

  return (
    <>
      <Head>
        <title>{title} — Excellence Sportive Montérégie</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={styles.root}>
        <header style={styles.header}>
          {/* Logo */}
          <div style={styles.logoWrap}>
            <img
              src="/logo PNG.png"
              alt="Excellence Sportive Montérégie"
              style={styles.logoImg}
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'inline' }}
              onLoad={e => { e.target.nextSibling.style.display = 'none' }}
            />
            <span style={{ ...styles.logoFallback, display: 'none' }}>ESM CoachAPP</span>
          </div>

          {user && (
            <div style={styles.userBar}>
              <span style={styles.userInfo}>{user.username} · {user.role}</span>
              <button onClick={logout} style={styles.logoutBtn}>Déconnexion</button>
            </div>
          )}
        </header>

        {/* Bande accent lime sous le header */}
        <div style={{ height: 4, background: ESM_LIME }} />

        <main style={styles.main}>{children}</main>

        <footer style={styles.footer}>
          <img src="/logo PNG.png" alt="" style={{ height: 24, marginRight: 8, verticalAlign: 'middle', opacity: 0.7 }}
               onError={e => { e.target.style.display = 'none' }} />
          Excellence Sportive Montérégie © {new Date().getFullYear()}
        </footer>
      </div>
    </>
  )
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', background: '#f5f7fa' },
  header: {
    background: '#ffffff',
    color: '#3C3C3C',
    padding: '8px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  logoImg: { height: 48, objectFit: 'contain' },
  logoFallback: { fontSize: '1.1rem', fontWeight: 700, color: '#3C3C3C', letterSpacing: '0.02em' },
  userBar: { display: 'flex', alignItems: 'center', gap: 16 },
  userInfo: { fontSize: '0.85rem', color: '#6b7280' },
  logoutBtn: {
    background: '#3C3C3C',
    border: 'none',
    color: '#C5D400',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 700,
  },
  main: { flex: 1, padding: '24px', maxWidth: 1100, margin: '0 auto', width: '100%' },
  footer: { textAlign: 'center', padding: '14px', fontSize: '0.75rem', color: '#999', borderTop: '1px solid #e5e7eb' },
}
