import { createContext, use } from 'react'

export const AuthContext = createContext(null)

/** The signed-in user and the sign-in/out actions. Provided by <AuthProvider>. */
export function useAuth() {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
