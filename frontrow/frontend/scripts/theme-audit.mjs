#!/usr/bin/env node
// Renders every club's theme, in both modes, as a static page — a contact
// sheet. The unit tests assert the contrast floors; this is for the eye, which
// catches things a ratio cannot: two clubs that look identical, an accent that
// is technically legible and visually horrible, a monochrome theme that has
// quietly acquired a hue.
//
//   npm run theme:audit  →  dist-audit/themes.html

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTheme } from '../src/theme/theme.js';
import { contrast } from '../src/theme/color.js';
import TEAMS from '../../backend/src/db/seed/teams.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'dist-audit');
fs.mkdirSync(out, { recursive: true });

const TEXT_TOKENS = ['--text-1', '--text-2', '--text-3', '--accent', '--accent-2', '--live', '--win', '--loss'];

function card(club, mode) {
  const t = buildTheme({ primary: club.primary_color, secondary: club.secondary_color, mode });
  const vars = Object.entries(t).map(([k, v]) => `${k}:${v}`).join(';');
  const ratios = TEXT_TOKENS
    .map((k) => ({ k, r: contrast(t[k], t['--bg']) }))
    .map(({ k, r }) => `<span class="chip${r < 4.5 ? ' bad' : ''}">${k.replace('--', '')} ${r.toFixed(1)}</span>`)
    .join('');

  return `<figure class="card" style="${vars};background:var(--bg);color:var(--text-1)">
  <div class="row" style="background:var(--surface-1);border-bottom:1px solid var(--border)">
    <span class="tab" style="background:var(--accent)"></span>
    <span class="when">20:00</span>
    <span class="teams">
      <span class="team"><i style="background:var(--club-primary)"></i>${club.short_name}</span>
      <span class="team dim"><i style="background:var(--surface-3)"></i>Tegenstander</span>
    </span>
    <span class="live">67'</span>
    <span class="score"><b>2</b><b class="dim">1</b></span>
  </div>
  <div class="table" style="background:var(--surface-1)">
    <span style="background:var(--accent-veil)">1 ${club.short_name} <b>34</b></span>
    <span>2 Andere club <b>31</b></span>
  </div>
  <figcaption>
    <strong>${club.name}</strong> <span class="mono">${club.primary_color} / ${club.secondary_color}</span>
    <div class="chips">${ratios}</div>
  </figcaption>
</figure>`;
}

const sections = ['dark', 'light'].map((mode) => `
<h2>${mode}</h2>
<div class="grid">${TEAMS.map((c) => card(c, mode)).join('')}</div>`).join('');

const html = `<!doctype html>
<meta charset="utf-8">
<title>Frontrow — themacontrole</title>
<style>
  body { margin:0; padding:24px; background:#141416; color:#eee;
         font:14px/1.4 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.12em; color:#888;
       margin:32px 0 12px; }
  p.lede { color:#999; margin:0 0 8px; max-width:60ch; }
  .grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
  .card { margin:0; border:1px solid #2a2a2e; overflow:hidden; }
  .row { display:grid; grid-template-columns:3px 44px 1fr auto auto; align-items:center;
         height:64px; gap:8px; padding-right:10px; }
  .tab { height:100%; }
  .when { font-size:12px; color:var(--text-3); text-align:center; }
  .teams { display:flex; flex-direction:column; gap:4px; min-width:0; }
  .team { display:flex; align-items:center; gap:6px; font-size:13px; }
  .team i { width:12px; height:12px; display:block; }
  .team.dim { color:var(--text-2); }
  .live { background:var(--text-1); color:var(--bg); font-size:11px; padding:2px 5px;
          font-variant-numeric:tabular-nums; }
  .score { display:flex; flex-direction:column; align-items:end; font-variant-numeric:tabular-nums; }
  .score b { font-size:18px; line-height:1.15; }
  .score .dim { color:var(--text-2); }
  .table { display:flex; flex-direction:column; font-size:12px; }
  .table span { padding:6px 10px; display:flex; justify-content:space-between;
                border-top:1px solid var(--border); }
  figcaption { padding:8px 10px 10px; background:#161618; color:#ddd; font-size:12px; }
  .mono { font-family:ui-monospace, monospace; color:#888; font-size:11px; }
  .chips { display:flex; flex-wrap:wrap; gap:3px; margin-top:6px; }
  .chip { font-size:9px; padding:1px 4px; background:#222; color:#9a9; border-radius:2px;
          font-family:ui-monospace, monospace; }
  .chip.bad { background:#5a1414; color:#ffb4b4; }
</style>
<h1>Frontrow — themacontrole</h1>
<p class="lede">Elke club, in beide modi, als echte rij en tabelregel. De cijfers zijn
gemeten WCAG-contrastverhoudingen tegen de achtergrond; alles onder 4,5 is rood.
${TEAMS.length} clubs × 2 modi.</p>
${sections}`;

fs.writeFileSync(path.join(out, 'themes.html'), html);
console.log(`themacontrole geschreven: ${path.join(out, 'themes.html')} (${TEAMS.length * 2} thema's)`);
