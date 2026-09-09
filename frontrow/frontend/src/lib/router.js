// A hash router, in forty lines.
//
// Hash routing is not nostalgia: Home Assistant serves the add-on from
// /api/hassio_ingress/<token>/ and the same build has to work on a bare port.
// With the History API every deep link would need to know its prefix and the
// server would need a catch-all that guesses. The hash is invisible to both.

import { useSyncExternalStore, useCallback } from 'react';

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

window.addEventListener('hashchange', emit);

const read = () => window.location.hash.replace(/^#\/?/, '') || 'vandaag';

export function navigate(path, { replace = false } = {}) {
  const next = `#/${String(path).replace(/^#?\/?/, '')}`;
  if (window.location.hash === next) return;
  if (replace) window.history.replaceState(null, '', next);
  else window.location.hash = next;
  emit();
}

export function useRoute() {
  const path = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    read,
    () => 'vandaag',
  );
  const [name, ...params] = path.split('/');
  const go = useCallback((p) => navigate(p), []);
  return { path, name, params, go };
}
