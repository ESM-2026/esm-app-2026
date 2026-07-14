import Head from 'next/head'
import { useRouter } from 'next/router'
import { clearSession } from '../lib/auth'

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
          <div style={styles.logo}>
            <span style={styles.logoText}>ESM CoachAPP</span>
          </div>
          {user && (
            <div style={styles.userBar}>
              <span style={styles.userInfo}>{user.username} · {user.role}</span>
              <button onClick={logout} style={styles.logoutBtn}>Déconnexion</button>
            </div>
          )}
        </header>
        <main style={styles.main}>{children}</main>
        <footer style={styles.footer}>
          Excellence Sportive Montérégie © {new Date().getFullYear()}
        </footer>
      </div>
    </>
  )
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', background: '#f5f7fa' },
  header: { background: '#1a3a5c', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: {},
  logoText: { fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.02em' },
  userBar: { display: 'flex', alignItems: 'center', gap: 16 },
  userInfo: { fontSize: '0.85rem', opacity: 0.85 },
  logoutBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' },
  main: { flex: 1, padding: '24px', maxWidth: 1100, margin: '0 auto', width: '100%' },
  footer: { textAlign: 'center', padding: '12px', fontSize: '0.75rem', color: '#999' },
}
