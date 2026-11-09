import { QueryClient } from '@tanstack/react-query'
import { isRetryable } from './lib/apiErrors'

export function createQueryClient({ queries } = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 4xx will not change on retry; a dropped connection or 5xx might.
        retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        ...queries,
      },
      mutations: { retry: false },
    },
  })
}
