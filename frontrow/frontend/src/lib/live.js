// The live connection.
//
// EventSource already reconnects on its own, but it does so forever and
// without telling anyone, which on a phone that has been asleep produces a
// screen full of confidently stale scores. This wrapper adds the two things
// that are missing: a visible connection state, and a forced reconnect the
// moment the tab becomes visible again — because the browser will happily
// hold a socket that the mobile radio quietly dropped an hour ago.

import { streamUrl } from './api.js';

export function createLiveConnection({ onEvent, onStateChange }) {
  let source = null;
  let closed = false;
  let retries = 0;
  let retryTimer = null;
  let state = 'connecting';

  const setState = (next) => {
    if (state === next) return;
    state = next;
    onStateChange?.(next);
  };

  function connect() {
    if (closed) return;
    clearTimeout(retryTimer);
    source?.close();

    setState(retries === 0 ? 'connecting' : 'reconnecting');
    source = new EventSource(streamUrl());

    source.onopen = () => { retries = 0; setState('open'); };

    source.onerror = () => {
      if (closed) return;
      source?.close();
      setState('reconnecting');
      // Back off, but never further than 20s: a matchday is exactly when the
      // user is least willing to wait.
      const delay = Math.min(1000 * 2 ** retries, 20000);
      retries += 1;
      retryTimer = setTimeout(connect, delay);
    };

    for (const type of [
      'hello', 'sync', 'match:update', 'match:goal', 'match:status', 'match:detail', 'standings:update',
    ]) {
      source.addEventListener(type, (e) => {
        let data = null;
        try { data = JSON.parse(e.data); } catch { data = null; }
        onEvent?.({ type, data, id: e.lastEventId });
      });
    }
  }

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    // readyState 2 is CLOSED; 0 is CONNECTING and may be stuck.
    if (!source || source.readyState !== 1) { retries = 0; connect(); }
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);

  connect();

  return {
    close() {
      closed = true;
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      source?.close();
      setState('closed');
    },
    reconnect() { retries = 0; connect(); },
    get state() { return state; },
  };
}
