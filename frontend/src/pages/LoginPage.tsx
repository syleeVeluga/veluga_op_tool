import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { login } from '../lib/api'
import type { AuthSession } from '../types/ui'

export function LoginPage() {
  const { setSession } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError(null)

    try {
      const result = await login({ email: email.trim(), password })
      const session: AuthSession = {
        token: result.token,
        user: result.user
      }
      setSession(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
            <h1 className="mb-6 text-center text-xl font-bold">User Log Dashboard</h1>
            {error && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
               <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
                <input
                    type="email"
                    required
                    className="w-full rounded-md border px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
               </label>
               <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
                <input
                    type="password"
                    required
                    className="w-full rounded-md border px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
               </label>
               <button
                 type="submit"
                 disabled={loading}
                 className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
               >
                {loading ? 'Logging in...' : 'Login'}
               </button>
            </form>
        </div>
    </div>
  )
}
