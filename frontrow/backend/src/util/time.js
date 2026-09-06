// Everything inside Frontrow is stored in UTC and rendered in Europe/Amsterdam.
// Matches are grouped by *Dutch* calendar day, which is not the same as the UTC
// day — a 21:00 CEST kickoff is still "today" even though it is 19:00 UTC.

import config from '../config.js';

const ZONE = config.timezone;

export const nowIso = () => new Date().toISOString();

/** The Dutch calendar date ('2026-09-06') for an instant. */
export function localDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** 'YYYYMMDD' — the shape ESPN's scoreboard endpoint wants. */
export const compactDate = (input = new Date()) => localDate(input).replaceAll('-', '');

/** Shift a 'YYYY-MM-DD' string by whole days, staying on calendar dates. */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** An inclusive list of 'YYYY-MM-DD' between two dates. */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const minutesUntil = (iso) => (new Date(iso).getTime() - Date.now()) / 60000;
export const minutesSince = (iso) => -minutesUntil(iso);

/** Season label for a Dutch football season, which runs Aug → May. */
export function seasonLabelFor(date = new Date()) {
  const y = Number(localDate(date).slice(0, 4));
  const m = Number(localDate(date).slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  return { startYear: start, endYear: start + 1, label: `${start}/${String(start + 1).slice(2)}` };
}
