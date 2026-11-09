import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider } from './auth/AuthProvider'
import { createQueryClient } from './queryClient'
import { AppRoutes } from './routes'

export function AppProviders({ queryClient, children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster
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
