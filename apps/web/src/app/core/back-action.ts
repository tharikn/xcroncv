/** Where "back" goes on a root screen: nowhere (exit the app). Everything else steps back. */
export function backAction(path: string, historyLength: number): 'exit' | 'back' | 'home' {
  const p = (path.split('?')[0].split('#')[0].replace(/\/+$/, '')) || '/';
  if (p === '/' || p === '/dashboard' || p === '/login') return 'exit';
  return historyLength > 1 ? 'back' : 'home';
}
