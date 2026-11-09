/** Where each role lands after signing in. */
export function homePathFor(user) {
  return user.role === 'specialist' ? '/specialist' : '/dashboard'
}
