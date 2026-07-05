import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Shell from './Shell'

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-svh flex items-center justify-center text-gray-500">Loading…</div>
  }

  return user ? <Shell /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
