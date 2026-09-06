// Application state.
//
// One store, three jobs: hold what the server told us, apply live events the
// instant they arrive, and keep the theme in step with the chosen club.
//
// The important design decision is how a goal is handled. The SSE payload
// carries the new score, so the row updates on the same frame the event lands —
// no round trip, no spinner, no waiting for a poll. A debounced refetch follows
// to reconcile everything else (the minute, the table, the timeline). Instant
// where it matters, correct everywhere.

import {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback,
} from 'react';
import { api, setProfile } from './lib/api.js';
import { createLiveConnection } from './lib/live.js';
import { buildTheme, applyTheme } from './theme/theme.js';
import { localDate } from './lib/format.js';

const StoreContext = createContext(null);

const initial = {
  ready: false,
  error: null,
  profile: null,
  profiles: [],
  follows: [],
  competitions: [],
  teams: {},
  server: {},
  pushKey: null,

  date: localDate(),
  day: null,
  dayLoading: false,

  connection: 'connecting',
  lastEventAt: null,
  lastSyncAt: null,

  // Goal ids seen in this session, so a reconnect that replays the backlog
  // cannot flash the same goal twice.
  seenGoals: {},
  // Matches whose score changed in the last few seconds, for the flare.
  flaring: {},
};

function reducer(state, action) {
  switch (action.type) {
    case 'bootstrap':
      return {
        ...state,
        ready: true,
        error: null,
        profile: action.payload.profile,
        profiles: action.payload.profiles,
        follows: action.payload.follows,
        competitions: action.payload.competitions,
        teams: Object.fromEntries(action.payload.teams.map((t) => [t.id, t])),
        server: action.payload.server,
        pushKey: action.payload.push?.publicKey || null,
      };

    case 'error':
      return { ...state, error: action.error, ready: state.ready };

    case 'date':
      return { ...state, date: action.date, day: null, dayLoading: true };

    case 'day':
      return { ...state, day: action.day, dayLoading: false, lastSyncAt: new Date().toISOString() };

    case 'dayLoading':
      return { ...state, dayLoading: true };

    case 'connection':
      return { ...state, connection: action.state };

    case 'sync':
      return { ...state, lastSyncAt: action.at || new Date().toISOString() };

    case 'goal': {
      const g = action.goal;
      const key = `${g.matchId}:${g.minute}:${g.player || ''}:${g.homeScore}-${g.awayScore}`;
      if (state.seenGoals[key]) return state;
      return {
        ...state,
        lastEventAt: new Date().toISOString(),
        seenGoals: { ...state.seenGoals, [key]: true },
        flaring: { ...state.flaring, [g.matchId]: { at: Date.now(), goal: g } },
        day: patchDayScore(state.day, g),
      };
    }

    case 'unflare': {
      if (!state.flaring[action.matchId]) return state;
      const next = { ...state.flaring };
      delete next[action.matchId];
      return { ...state, flaring: next };
    }

    case 'statusChange':
      return {
        ...state,
        lastEventAt: new Date().toISOString(),
        day: patchDayStatus(state.day, action.change),
      };

    case 'profile':
      return { ...state, profile: { ...state.profile, ...action.patch } };

    case 'follows':
      return { ...state, follows: action.follows };

    default:
      return state;
  }
}

/** Write a live score straight into the day payload, without a refetch. */
function patchDayScore(day, goal) {
  if (!day) return day;
  return {
    ...day,
    groups: day.groups.map((g) => ({
      ...g,
      matches: g.matches.map((m) => (m.id === goal.matchId
        ? { ...m, score: { ...m.score, home: goal.homeScore, away: goal.awayScore } }
        : m)),
    })),
  };
}

function patchDayStatus(day, change) {
  if (!day) return day;
  return {
    ...day,
    groups: day.groups.map((g) => ({
      ...g,
      matches: g.matches.map((m) => (m.id === change.matchId
        ? { ...m, status: change.to, minute: change.to === 'finished' ? null : m.minute }
        : m)),
    })),
  };
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const refetchTimer = useRef(null);
  const dateRef = useRef(state.date);
  dateRef.current = state.date;

  const loadDay = useCallback(async (date) => {
    try {
      const day = await api.day(date);
      // A slow response for a day the user has already navigated away from
      // must not overwrite the day they are looking at now.
      if (dateRef.current === date) dispatch({ type: 'day', day });
    } catch (err) {
      dispatch({ type: 'error', error: err.message });
    }
  }, []);

  /** Coalesce the flurry of events a busy minute produces into one refetch. */
  const scheduleReconcile = useCallback((delay = 1500) => {
    clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => loadDay(dateRef.current), delay);
  }, [loadDay]);

  // ---------------------------------------------------------------- boot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.bootstrap();
        if (cancelled) return;
        setProfile(data.profile.id);
        dispatch({ type: 'bootstrap', payload: data });
      } catch (err) {
        if (!cancelled) dispatch({ type: 'error', error: err.message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ------------------------------------------------------------ the day
  useEffect(() => {
    if (!state.ready) return;
    dispatch({ type: 'dayLoading' });
    loadDay(state.date);
  }, [state.ready, state.date, loadDay]);

  // ----------------------------------------------------------- the wire
  useEffect(() => {
    if (!state.ready) return undefined;
    const conn = createLiveConnection({
      onStateChange: (s) => dispatch({ type: 'connection', state: s }),
      onEvent: ({ type, data }) => {
        if (type === 'match:goal') { dispatch({ type: 'goal', goal: data }); scheduleReconcile(2500); }
        else if (type === 'match:status') { dispatch({ type: 'statusChange', change: data }); scheduleReconcile(1200); }
        else if (type === 'match:update') scheduleReconcile();
        else if (type === 'sync') dispatch({ type: 'sync', at: data?.at });
        else if (type === 'standings:update') scheduleReconcile(3000);
      },
    });
    return () => { conn.close(); clearTimeout(refetchTimer.current); };
  }, [state.ready, scheduleReconcile]);

  // ------------------------------------------------------------- theme
  const favourite = state.profile?.favouriteTeamId
    ? state.teams[state.profile.favouriteTeamId] : null;
  const themeMode = state.profile?.theme === 'light' ? 'light' : 'dark';

  useEffect(() => {
    const tokens = buildTheme({
      primary: favourite?.color, secondary: favourite?.color2, mode: themeMode,
    });
    applyTheme(tokens);
    // Persisted so the next cold start paints the right colours before React
    // has even parsed — see the inline script in index.html.
    try { localStorage.setItem('frontrow.theme', JSON.stringify(tokens)); } catch { /* private mode */ }
  }, [favourite?.color, favourite?.color2, themeMode]);

  useEffect(() => {
    document.documentElement.dataset.motion = state.profile?.reduceMotion ? 'off' : 'on';
  }, [state.profile?.reduceMotion]);

  // Home Assistant renders the app in a same-origin iframe and speaks a small
  // postMessage protocol to it. Subscribing gets us the host's real safe-area
  // insets (so the app can draw full-bleed instead of inside HA's padding) and
  // tells us when the layout goes narrow. On the bare port the reply never
  // arrives and everything below simply no-ops.
  useEffect(() => {
    const embedded = window.self !== window.top;
    document.documentElement.dataset.embedded = embedded ? '1' : '0';
    if (!embedded) return undefined;

    const onMessage = (event) => {
      if (event.source !== window.parent) return;
      const msg = event.data;
      if (msg?.type !== 'home-assistant/properties') return;
      const insets = msg.safeAreaInsets || {};
      const root = document.documentElement;
      root.style.setProperty('--chrome-top', `${insets.top || 0}px`);
      root.dataset.narrow = msg.narrow ? '1' : '0';
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage(
      { type: 'home-assistant/subscribe-properties', handleSafeArea: true },
      window.location.origin,
    );

    return () => {
      window.removeEventListener('message', onMessage);
      window.parent.postMessage({ type: 'home-assistant/unsubscribe-properties' }, window.location.origin);
    };
  }, []);

  // The flare is a 900ms animation; clear it so a re-render cannot restart it.
  useEffect(() => {
    const ids = Object.keys(state.flaring);
    if (!ids.length) return undefined;
    const timers = ids.map((id) => setTimeout(() => dispatch({ type: 'unflare', matchId: id }), 1400));
    return () => timers.forEach(clearTimeout);
  }, [state.flaring]);

  const actions = useMemo(() => ({
    setDate: (date) => dispatch({ type: 'date', date }),
    refresh: () => loadDay(dateRef.current),

    async patchProfile(patch) {
      dispatch({ type: 'profile', patch });
      try {
        await api.patchProfile(patch);
        if (patch.favouriteTeamId) {
          const { follows } = await api.follows();
          dispatch({ type: 'follows', follows });
        }
      } catch { /* the optimistic value stands; the next boot reconciles */ }
    },

    async toggleFollow(kind, id, alerts) {
      const has = state.follows.some((f) => f.kind === kind && f.id === id);
      const next = has
        ? state.follows.filter((f) => !(f.kind === kind && f.id === id))
        : [...state.follows, { kind, id, alerts: alerts || {} }];
      dispatch({ type: 'follows', follows: next });
      try {
        if (has) await api.unfollow(kind, id); else await api.follow(kind, id, alerts);
      } catch {
        dispatch({ type: 'follows', follows: state.follows });
      }
    },

    async setAlerts(kind, id, alerts) {
      dispatch({
        type: 'follows',
        follows: state.follows.map((f) => (f.kind === kind && f.id === id ? { ...f, alerts } : f)),
      });
      try { await api.follow(kind, id, alerts); } catch { /* retried on next change */ }
    },
  }), [state.follows, loadDay]);

  const value = useMemo(() => ({ ...state, favourite, actions }), [state, favourite, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
};

/** Is this match one of the followed club's? Drives the club-colour tab. */
export function useIsFollowed(match) {
  const { follows } = useStore();
  if (!match) return false;
  return follows.some((f) => f.kind === 'team' && (f.id === match.home.id || f.id === match.away.id));
}
