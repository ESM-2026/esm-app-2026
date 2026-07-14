import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { getSession } from '../lib/auth'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const user = getSession()
    if (!user) {
      router.push('/login')
    } else if (user.role === 'admin') {
      router.push('/admin')
    } else if (user.role === 'coach') {
      router.push('/coach')
    } else if (user.role === 'specialist') {
      router.push('/specialist')
    }
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Chargement…</p>
    </div>
  )
}
