// Formatting. Everything is rendered in Europe/Amsterdam regardless of where
// the phone thinks it is — a Dutch fan on holiday in Portugal still wants
// "20:00", because that is the time the match is talked about.

export const ZONE = 'Europe/Amsterdam';

const cache = new Map();
function formatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale, { timeZone: ZONE, ...options }));
  return cache.get(key);
}

export const time = (iso, locale = 'nl') =>
  formatter(locale === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export const dayMonth = (iso, locale = 'nl') =>
  formatter(locale === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));

export const weekdayDayMonth = (iso, locale = 'nl') =>
  formatter(locale === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));

/** The Dutch calendar date ('2026-09-06') for an instant. */
export const localDate = (input = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(input instanceof Date ? input : new Date(input));

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

export const isToday = (dateStr) => dateStr === localDate();

/** Relative day label, or null when the date is far enough away to spell out. */
export function relativeDay(dateStr, t) {
  const today = localDate();
  if (dateStr === today) return t('common.today');
  if (dateStr === addDays(today, -1)) return t('common.yesterday');
  if (dateStr === addDays(today, 1)) return t('common.tomorrow');
  return null;
}

/** { days, hours, minutes, seconds, total } until an instant, or null if past. */
export function countdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return {
    total,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** "bijgewerkt 12s geleden" — honesty about how fresh the score really is. */
export function freshness(iso, t) {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return t('common.justNow');
  if (seconds < 90) return t('common.secondsAgo', { n: seconds });
  return t('common.minutesAgo', { n: Math.round(seconds / 60) });
}

/** Score digits, with a fixed-width box so 0->1 and 9->10 never reflow. */
export const scoreText = (value) => (value == null ? '–' : String(value));

export const initials = (name) =>
  String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
