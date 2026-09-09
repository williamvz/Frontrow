// The API client.
//
// Every URL is RELATIVE. That is the one rule that makes the same build work
// on http://pi.local:8199/ and inside Home Assistant at
// /api/hassio_ingress/<token>/ — the browser resolves 'api/day/today' against
// the document base, so the ingress prefix comes along for free. An absolute
// '/api/...' would escape the ingress path and 404.

const BASE = new URL('.', document.baseURI).href;

let profileId = 'default';
export const setProfile = (id) => { profileId = id || 'default'; };

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(new URL(path, BASE), {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      'X-Frontrow-Profile': profileId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const err = new Error(detail.message || `${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  bootstrap: () => request('api/bootstrap'),
  status: () => request('api/status'),

  day: (date = 'today') => request(`api/day/${date}`),
  matches: (params = {}) => request(`api/matches?${new URLSearchParams(params)}`),
  match: (id) => request(`api/matches/${id}`),

  standings: (competitionId, { live = false } = {}) =>
    request(`api/standings/${competitionId}${live ? '?live=1' : ''}`),
  scorers: (competitionId) => request(`api/scorers/${competitionId}`),

  teams: () => request('api/teams'),
  team: (id) => request(`api/teams/${id}`),

  patchProfile: (patch) => request('api/profile', { method: 'PATCH', body: patch }),
  follows: () => request('api/follows'),
  follow: (kind, id, alerts) => request('api/follows', { method: 'POST', body: { kind, id, alerts } }),
  unfollow: (kind, id) => request(`api/follows/${kind}/${id}`, { method: 'DELETE' }),

  notificationStatus: () => request('api/notifications/status'),
  subscribe: (subscription) => request('api/notifications/subscribe', { method: 'POST', body: { subscription } }),
  unsubscribe: (endpoint) => request('api/notifications/unsubscribe', { method: 'POST', body: { endpoint } }),
  testNotification: () => request('api/notifications/test', { method: 'POST' }),

  syncNow: () => request('api/admin/sync', { method: 'POST' }),
};

export const streamUrl = () => new URL('api/stream', BASE).href;
export { BASE };
