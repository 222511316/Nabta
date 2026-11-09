import { useQuery } from '@tanstack/react-query'
import { getAiStatus } from '../../api/ai'
import { queryKeys } from '../../api/queryKeys'

/** { enabled, model } once known; AI features stay hidden until then, or if the check fails. */
export function useAiStatus() {
  const status = useQuery({ queryKey: queryKeys.aiStatus, queryFn: getAiStatus, staleTime: Infinity })
  return { enabled: status.data?.enabled === true, model: status.data?.model ?? null }
}
