import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import { Header, TabBarSpacer } from '../components/Chrome.jsx';
import Crest from '../components/Crest.jsx';
import ClubName from '../components/ClubName.jsx';
import { enablePush, pushSupport } from '../lib/push.js';
import { freshness } from '../lib/format.js';

export default function More() {
  const { profile, teams, favourite, actions, server, lastSyncAt, pushKey } = useStore();
  const { t, locale, setLocale } = useT();
  const [picking, setPicking] = useState(false);
  const [pushState, setPushState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.notificationStatus().then(setPushState).catch(() => setPushState(null));
  }, []);

  const support = pushSupport();

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <Header title={t('settings.title')} />

      <Group label={t('settings.appearance')} />

      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        className="hair flex w-full items-center gap-3 px-4 text-left"
        style={{ height: 64, background: 'var(--surface-1)' }}
      >
        <span style={{ width: 3, height: 40, background: 'var(--accent)' }} aria-hidden />
        <Crest team={favourite} size={32} />
        <span className="min-w-0 flex-1">
          <span className="label block" style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {t('settings.favouriteTeam')}
          </span>
          <span className="block" style={{ fontSize: 15, color: 'var(--text-1)' }}>
            {favourite?.name || '—'}
          </span>
        </span>
        <span className="label" style={{ fontSize: 10, color: 'var(--accent)' }}>
          {picking ? t('common.close') : t('settings.changeClub')}
        </span>
      </button>

      {picking && <ClubGrid onPick={(id) => { actions.patchProfile({ favouriteTeamId: id }); setPicking(false); }} />}

      {!picking && (
        <p className="px-4 py-2" style={{ fontSize: 11, color: 'var(--text-4)' }}>
          {t('settings.favouriteTeamHint')}
        </p>
      )}

      <Segmented
        label={t('settings.theme')}
        value={profile?.theme || 'club'}
        options={[
          { id: 'club', label: t('settings.themeDark') },
          { id: 'light', label: t('settings.themeLight') },
        ]}
        onChange={(v) => actions.patchProfile({ theme: v })}
      />

      <Segmented
        label={t('settings.language')}
        value={profile?.locale || 'nl'}
        options={[{ id: 'nl', label: 'Nederlands' }, { id: 'en', label: 'English' }]}
        onChange={(v) => { actions.patchProfile({ locale: v }); setLocale(v); }}
      />

      <Toggle
        label={t('settings.spoilerFree')}
        hint={t('settings.spoilerFreeHint')}
        on={Boolean(profile?.spoilerFree)}
        onChange={(v) => actions.patchProfile({ spoilerFree: v })}
      />

      <Toggle
        label={t('settings.reduceMotion')}
        hint={t('settings.reduceMotionHint')}
        on={Boolean(profile?.reduceMotion)}
        onChange={(v) => actions.patchProfile({ reduceMotion: v })}
      />

      <Group label={t('settings.notifications')} />

      {!support.supported && (
        <Note>{support.reason === 'insecure' ? t('settings.notificationsInsecure') : t('settings.notificationsUnsupported')}</Note>
      )}

      {support.supported && (
        <>
          <Row
            label={t('settings.enableNotifications')}
            value={pushState ? t(pushState.devices === 1 ? 'settings.devices' : 'settings.devicesPlural', { n: pushState.devices }) : '—'}
            action={async () => {
              setBusy(true);
              try {
                await enablePush(pushKey);
                setPushState(await api.notificationStatus());
              } finally { setBusy(false); }
            }}
            actionLabel={busy ? '…' : t('settings.turnOn')}
          />
          <Row
            label={t('settings.testNotification')}
            action={() => api.testNotification()}
            actionLabel={t('settings.send')}
          />
        </>
      )}

      <Group label={t('settings.data')} />

      <Row label={t('settings.lastSync')} value={lastSyncAt ? freshness(lastSyncAt, t) : '—'} />
      <Row
        label={t('settings.syncNow')}
        action={async () => { await api.syncNow(); actions.refresh(); }}
        actionLabel={t('settings.update')}
      />
      <Row
        label={t('settings.tvMode')}
        value={t('settings.tvModeHint')}
        action={() => navigate('tv')}
        actionLabel={t('settings.open')}
      />

      <Group label={t('settings.about')} />
      <div className="px-4 py-4" style={{ background: 'var(--surface-1)' }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {t('app.name')} · {t('app.tagline')}
        </p>
        <p className="mt-2" style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.6 }}>
          {server.demo ? '🎬 Demo' : null}
          {server.homeAssistant ? ' · Home Assistant' : ''}
          {` · ${server.timezone || 'Europe/Amsterdam'}`}
        </p>
      </div>

      <TabBarSpacer />
    </main>
  );
}

/** The club grid: 39 crests, four across. Picking one re-themes the whole app. */
function ClubGrid({ onPick }) {
  const { teams, profile } = useStore();
  const list = Object.values(teams).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  return (
    <div
      className="grid gap-px"
      style={{ gridTemplateColumns: 'repeat(4, 1fr)', background: 'var(--border)' }}
    >
      {list.map((team) => {
        const active = team.id === profile?.favouriteTeamId;
        return (
          <button
            key={team.id}
            type="button"
            onClick={() => onPick(team.id)}
            className="flex flex-col items-center justify-center gap-1.5 py-3"
            style={{ background: active ? 'var(--accent-soft)' : 'var(--surface-1)' }}
          >
            <Crest team={team} size={30} />
            <span
              className="w-full truncate px-1 text-center"
              style={{
                fontSize: 9, color: active ? 'var(--accent)' : 'var(--text-3)',
                fontVariationSettings: "'wght' 600, 'wdth' 80",
              }}
            >
              {team.short}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const Group = ({ label }) => (
  <div className="label px-4 pb-2 pt-6" style={{ fontSize: 10, color: 'var(--text-4)' }}>{label}</div>
);

const Note = ({ children }) => (
  <p className="px-4 py-3" style={{ fontSize: 12, color: 'var(--warn)', background: 'var(--surface-1)' }}>{children}</p>
);

function Row({ label, value, action, actionLabel }) {
  return (
    <div className="hair flex items-center gap-3 px-4" style={{ minHeight: 52, background: 'var(--surface-1)' }}>
      <span className="min-w-0 flex-1">
        <span className="block" style={{ fontSize: 14, color: 'var(--text-1)' }}>{label}</span>
        {value && <span className="block" style={{ fontSize: 11, color: 'var(--text-4)' }}>{value}</span>}
      </span>
      {action && (
        <button
          type="button"
          onClick={action}
          className="label px-3"
          style={{ height: 30, fontSize: 10, background: 'var(--surface-3)', color: 'var(--text-1)' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function Toggle({ label, hint, on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="hair flex w-full items-center gap-3 px-4 text-left"
      style={{ minHeight: 56, background: 'var(--surface-1)' }}
      aria-pressed={on}
    >
      <span className="min-w-0 flex-1 py-3">
        <span className="block" style={{ fontSize: 14, color: 'var(--text-1)' }}>{label}</span>
        {hint && <span className="block" style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.4 }}>{hint}</span>}
      </span>
      <span
        style={{ width: 34, height: 18, background: on ? 'var(--accent)' : 'var(--surface-3)', position: 'relative' }}
        aria-hidden
      >
        <span
          style={{
            position: 'absolute', top: 2, left: on ? 18 : 2, width: 14, height: 14,
            background: on ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 160ms var(--ease-press)',
          }}
        />
      </span>
    </button>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="hair px-4 py-3" style={{ background: 'var(--surface-1)' }}>
      <div className="label mb-2" style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</div>
      <div className="flex gap-px" style={{ background: 'var(--border)' }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="label flex-1"
            style={{
              height: 34, fontSize: 10,
              background: value === o.id ? 'var(--accent)' : 'var(--surface-2)',
              color: value === o.id ? 'var(--on-accent)' : 'var(--text-2)',
            }}
            aria-pressed={value === o.id}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
