import { Suspense, lazy, useEffect } from 'react';
import { StoreProvider, useStore } from './store.jsx';
import { I18nProvider, useT } from './i18n/index.jsx';
import { useRoute, navigate } from './lib/router.js';
import { TabBar } from './components/Chrome.jsx';
import Announcer from './components/Announcer.jsx';
import { RowSkeleton } from './components/Skeleton.jsx';

import Today from './pages/Today.jsx';

// Everything past the home screen is loaded on demand: the first paint on a
// phone should be the scores and nothing else.
const Competitions = lazy(() => import('./pages/Competitions.jsx'));
const Mine = lazy(() => import('./pages/Mine.jsx'));
const More = lazy(() => import('./pages/More.jsx'));
const Match = lazy(() => import('./pages/Match.jsx'));
const Team = lazy(() => import('./pages/Team.jsx'));
const TV = lazy(() => import('./pages/TV.jsx'));

const TAB_FOR = {
  vandaag: 'vandaag',
  competities: 'competities',
  competitie: 'competities',
  mijn: 'mijn',
  meer: 'meer',
};

function Routes() {
  const { name, params } = useRoute();

  switch (name) {
    case 'competities': return <Competitions />;
    case 'competitie': return <Competitions competitionId={params[0]} />;
    case 'mijn': return <Mine />;
    case 'meer': return <More />;
    case 'match': return <Match id={params[0]} />;
    case 'club': return <Team id={params[0]} />;
    case 'tv': return <TV />;
    case 'vandaag':
    default: return <Today />;
  }
}

function Shell() {
  const { name } = useRoute();
  const { ready, error } = useStore();
  const { t } = useT();

  // Deep pages and the TV board own the whole screen.
  const chromeless = ['match', 'club', 'tv'].includes(name);

  if (error && !ready) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="label" style={{ fontSize: 12, color: 'var(--loss)' }}>{t('common.offline')}</span>
        <p style={{ color: 'var(--text-2)', fontSize: 15 }}>{error}</p>
        <button
          type="button"
          className="label"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, padding: '10px 20px', fontSize: 11,
            background: 'var(--accent)', color: 'var(--on-accent)',
          }}
        >
          {t('common.retry')}
        </button>
      </main>
    );
  }

  return (
    <>
      <Suspense fallback={<RowSkeleton count={8} />}>
        <Routes />
      </Suspense>
      <Announcer />
      {!chromeless && <TabBar route={TAB_FOR[name] || 'vandaag'} onNavigate={navigate} />}
    </>
  );
}

function Localised() {
  const { profile } = useStore();
  const { setLocale, locale } = useT();
  useEffect(() => {
    if (profile?.locale && profile.locale !== locale) setLocale(profile.locale);
  }, [profile?.locale, locale, setLocale]);
  return <Shell />;
}

export default function App() {
  return (
    <I18nProvider>
      <StoreProvider>
        <Localised />
      </StoreProvider>
    </I18nProvider>
  );
}
