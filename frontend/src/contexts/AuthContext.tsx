import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthSession } from '../types/ui'
import { loadAuthSession, saveAuthSession } from '../lib/storage'

interface AuthContextType {
  authToken: string
  authUser: AuthSession['user'] | null
  setSession: (session: AuthSession) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialSession = loadAuthSession()
  const [authToken, setAuthToken] = useState<string>(initialSession?.token ?? '')
  const [authUser, setAuthUser] = useState<AuthSession['user'] | null>(initialSession?.user ?? null)

  const setSession = (session: AuthSession) => {
    setAuthToken(session.token)
    setAuthUser(session.user)
    saveAuthSession(session)
  }

  const logout = () => {
    setAuthToken('')
    setAuthUser(null)
    saveAuthSession(null)
  }

  return (
    <AuthContext.Provider value={{ authToken, authUser, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
