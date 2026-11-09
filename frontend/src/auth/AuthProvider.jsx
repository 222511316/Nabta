import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as authApi from '../api/auth'
import { onUnauthorized } from '../api/client'
import { queryKeys } from '../api/queryKeys'
import { AuthContext } from './useAuth'

/**
 * Owns "who is signed in". The signed-in user lives in the query cache under
 * queryKeys.me (null = signed out). `endReason` records why a session ended,
 * so the sign-in page can explain it.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [endReason, setEndReason] = useState(null)
  const me = useQuery({ queryKey: queryKeys.me, queryFn: authApi.fetchCurrentUser, staleTime: Infinity })

  const setUser = useCallback((user) => queryClient.setQueryData(queryKeys.me, user), [queryClient])

  // Drops every cached record except the session itself.
  const forgetPrivateData = useCallback(
    () => queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' }),
    [queryClient],
  )

  const endSession = useCallback(
    (reason) => {
      setEndReason(reason)
      setUser(null)
      forgetPrivateData()
    },
    [forgetPrivateData, setUser],
  )

  useEffect(() => onUnauthorized(() => endSession('expired')), [endSession])

  const startSession = useCallback(
    (user) => {
      forgetPrivateData()
      setEndReason(null)
      setUser(user)
      return user
    },
    [forgetPrivateData, setUser],
  )

  const value = useMemo(
    () => ({
      user: me.data ?? null,
      isLoading: me.isPending,
      loadError: me.isError ? me.error : null,
      reload: () => me.refetch(),
      endReason,
      setUser,
      /** The account is gone (US22): forget everything, and leave the signed-in pages. */
      accountDeleted: () => endSession('account_deleted'),
      signIn: async (credentials) => startSession(await authApi.signIn(credentials)),
      register: async (details) => startSession(await authApi.register(details)),
      signOut: async () => {
        try {
          await authApi.signOut()
        } finally {
          endSession('signed_out')
        }
      },
    }),
    [me, endReason, setUser, startSession, endSession],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
