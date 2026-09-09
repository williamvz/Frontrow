import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import { Header, TabBarSpacer } from '../components/Chrome.jsx';
import LeagueTable from '../components/LeagueTable.jsx';
import MatchRow from '../components/MatchRow.jsx';
import Crest from '../components/Crest.jsx';
import { RowSkeleton } from '../components/Skeleton.jsx';

export default function Competitions({ competitionId }) {
  const { competitions } = useStore();
  const { t } = useT();

  if (!competitionId) {
    const withTables = competitions.filter((c) => c.hasTable);
    const cups = competitions.filter((c) => !c.hasTable);
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <Header title={t('nav.table')} />
        {[...withTables, ...cups].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`competitie/${c.id}`)}
            className="hair flex w-full items-center gap-3 px-4 text-left"
            style={{ height: 56, background: 'var(--surface-1)' }}
          >
            <span style={{ width: 3, height: 24, background: c.accent || 'var(--accent)' }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate" style={{ fontSize: 15, color: 'var(--text-1)' }}>{c.name}</span>
              <span className="label block" style={{ fontSize: 10, color: 'var(--text-4)' }}>{c.abbr}</span>
            </span>
            <Chevron />
          </button>
        ))}
        <TabBarSpacer />
      </main>
    );
  }

  return <Competition id={competitionId} />;
}

const TABS = ['table', 'fixtures', 'scorers'];

function Competition({ id }) {
  const { competitions, profile, flaring, follows } = useStore();
  const { t } = useT();
  const competition = competitions.find((c) => c.id === id);
  const [tab, setTab] = useState(competition?.hasTable ? 'table' : 'fixtures');
  const [table, setTable] = useState(null);
  const [fixtures, setFixtures] = useState(null);
  const [scorers, setScorers] = useState(null);
  const [liveTable, setLiveTable] = useState(false);

  useEffect(() => {
    if (tab !== 'table' || !competition?.hasTable) return;
    setTable(null);
    api.standings(id, { live: liveTable }).then(setTable).catch(() => setTable({ table: [] }));
  }, [id, tab, liveTable, competition?.hasTable]);

  useEffect(() => {
    if (tab !== 'fixtures') return;
    setFixtures(null);
    api.matches({ competition: id, limit: 120 }).then((d) => setFixtures(d.matches)).catch(() => setFixtures([]));
  }, [id, tab]);

  useEffect(() => {
    if (tab !== 'scorers') return;
    setScorers(null);
    api.scorers(id).then(setScorers).catch(() => setScorers({ scorers: [], assists: [] }));
  }, [id, tab]);

  const available = TABS.filter((x) => x !== 'table' || competition?.hasTable);
  const followedTeams = new Set(follows.filter((f) => f.kind === 'team').map((f) => f.id));

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <Header
        title={competition?.name || id}
        subtitle={table?.season?.label}
        onBack={() => navigate('competities')}
      />

      <nav
        className="sticky z-20 flex"
        style={{
          top: 'calc(var(--header-h) + var(--chrome-top))',
          background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        }}
      >
        {available.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className="label relative flex-1"
            style={{ height: 40, fontSize: 11, color: tab === x ? 'var(--text-1)' : 'var(--text-3)' }}
          >
            {t(x === 'table' ? 'table.title' : x === 'fixtures' ? 'team.fixtures' : 'scorers.title')}
            {tab === x && (
              <span
                style={{ position: 'absolute', left: 12, right: 12, bottom: -1, height: 3, background: 'var(--accent)' }}
                aria-hidden
              />
            )}
          </button>
        ))}
      </nav>

      {tab === 'table' && (
        <>
          <button
            type="button"
            onClick={() => setLiveTable((v) => !v)}
            className="hair flex w-full items-center justify-between px-4"
            style={{ height: 40, background: 'var(--surface-1)' }}
          >
            <span className="label" style={{ fontSize: 10, color: liveTable ? 'var(--accent)' : 'var(--text-3)' }}>
              {t('table.liveTable')}
            </span>
            <Switch on={liveTable} />
          </button>
          {table ? <LeagueTable rows={table.table} /> : <RowSkeleton count={10} />}
          {liveTable && (
            <p className="px-4 py-3" style={{ fontSize: 11, color: 'var(--text-4)' }}>
              {t('table.liveTableHint')}
            </p>
          )}
        </>
      )}

      {tab === 'fixtures' && (
        fixtures ? fixtures.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            followed={followedTeams.has(m.home.id) || followedTeams.has(m.away.id)}
            flaring={Boolean(flaring[m.id])}
            spoilerFree={Boolean(profile?.spoilerFree)}
            onOpen={(x) => navigate(`match/${x.id}`)}
          />
        )) : <RowSkeleton count={10} />
      )}

      {tab === 'scorers' && (scorers ? <Scorers data={scorers} /> : <RowSkeleton count={10} />)}

      <TabBarSpacer />
    </main>
  );
}

function Scorers({ data }) {
  const { t } = useT();
  if (!data.scorers.length) {
    return (
      <p className="px-8 py-16 text-center" style={{ fontSize: 14, color: 'var(--text-4)' }}>
        {t('match.noStats')}
      </p>
    );
  }
  return (
    <div>
      {data.scorers.map((s, i) => (
        <div
          key={`${s.player}-${s.team_id}`}
          className="hair flex items-center gap-3 px-4"
          style={{ height: 48, background: 'var(--surface-1)' }}
        >
          <span className="num-soft" style={{ fontSize: 12, color: 'var(--text-4)', width: 20 }}>{i + 1}</span>
          <Crest team={{ id: s.team_id, short: s.team_short, color: s.primary_color }} size={18} />
          <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14, color: 'var(--text-1)' }}>{s.player}</span>
          <span className="label" style={{ fontSize: 10, color: 'var(--text-4)' }}>{s.team_short}</span>
          <span className="num" style={{ fontSize: 17, minWidth: 22, textAlign: 'right' }}>{s.goals}</span>
        </div>
      ))}
    </div>
  );
}

const Switch = ({ on }) => (
  <span
    style={{
      width: 34, height: 18, background: on ? 'var(--accent)' : 'var(--surface-3)',
      position: 'relative', transition: 'background 160ms',
    }}
    aria-hidden
  >
    <span
      style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 14, height: 14,
        background: on ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 160ms var(--ease-press)',
      }}
    />
  </span>
);

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: 'var(--text-4)' }}>
    <path d="m9 4 8 8-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
  </svg>
);
