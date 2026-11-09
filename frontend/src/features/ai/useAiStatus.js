import { useQuery } from '@tanstack/react-query'
import { getAiStatus } from '../../api/ai'
import { queryKeys } from '../../api/queryKeys'

/**
 * { enabled, model, known }. AI features stay hidden until the server says they're on, and when the
 * check fails. `known` is true once the server has answered (or failed to). The assessed release runs
 * without an OpenAI key, so `enabled` is false there (supervisor review OBS-06).
 */
export function useAiStatus() {
  const status = useQuery({ queryKey: queryKeys.aiStatus, queryFn: getAiStatus, staleTime: Infinity })
  return {
    enabled: status.data?.enabled === true,
    model: status.data?.model ?? null,
    known: status.isSuccess || status.isError,
  }
}
