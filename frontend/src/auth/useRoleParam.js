import { useLocation, useSearchParams } from 'react-router'

export const ROLES = ['grower', 'specialist']

/**
 * The role chosen on the sign-in and sign-up screens, kept in the URL
 * (?as=specialist) so links can preselect it and it survives moving between
 * the two screens. Defaults to grower.
 */
export function useRoleParam() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const role = searchParams.get('as') === 'specialist' ? 'specialist' : 'grower'

  const setRole = (next) =>
    setSearchParams(
      (params) => {
        params.set('as', next)
        return params
      },
      // Keep where the visitor was heading (state.from) when the role changes.
      { replace: true, state: location.state },
    )

  return [role, setRole]
}
