import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider } from './auth/AuthProvider'
import { createQueryClient } from './queryClient'
import { AppRoutes } from './routes'

/** After a language switch, fetches again what the server writes in the interface language. */
function RefetchOnLanguageChange() {
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  useEffect(() => {
    const refetch = () => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
    i18n.on('languageChanged', refetch)
    return () => i18n.off('languageChanged', refetch)
  }, [i18n, queryClient])
  return null
}

export function AppProviders({ queryClient, children }) {
  const { i18n } = useTranslation()
  return (
    <QueryClientProvider client={queryClient}>
      <RefetchOnLanguageChange />
      <AuthProvider>{children}</AuthProvider>
      <Toaster
        dir={i18n.dir()}
        position="top-center"
        offset={{ top: 76 }} // just below the 64px header, so toasts never cover the navigation
        mobileOffset={{ top: 72 }}
        toastOptions={{
          classNames: {
            toast: 'font-sans! rounded-xl! border-line! text-ink! shadow-raised!',
            icon: 'text-forest-600!',
          },
        }}
      />
    </QueryClientProvider>
  )
}

export default function App() {
  const [queryClient] = useState(() => createQueryClient())
  return (
    <BrowserRouter>
      <AppProviders queryClient={queryClient}>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  )
}
