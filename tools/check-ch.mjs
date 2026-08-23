// node tools/check-ch.mjs <dir> — kontrola knižních otázek kapitoly: doslovnost citací + anti-tell
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const text = readFileSync(join(dir, 'text.md'), 'utf8').replace(/\s+/g, ' ');
const clean = s => s.replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
const textClean = clean(text);

let all = [];
for (const f of readdirSync(dir).filter(f => f.startsWith('q-') && f.endsWith('.json'))) {
  all = all.concat(JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

let citOk = 0; const citBad = [];
for (const q of all) {
  const m = q.deepDive && q.deepDive.match(/>\s*([^\n]+)/);
  if (!m) { citBad.push(q.id + ' (bez citace)'); continue; }
  const quote = clean(m[1]).slice(0, 80);
  if (textClean.includes(quote)) citOk++; else citBad.push(q.id);
}

let longest = 0, ratioBad = 0; const dist = [0, 0, 0, 0];
for (const q of all) {
  const l = q.options.map(o => o.length);
  if (l[q.correct] === Math.max(...l)) longest++;
  if (Math.max(...l) > Math.min(...l) * 1.25) ratioBad++;
  dist[q.correct]++;
}
console.log('otazek:', all.length, '| citace doslovne:', citOk + '/' + all.length, '| podezrele:', citBad.join(', ') || 'zadne');
console.log('anti-tell: nejdelsi', longest, '| ratio>1.25:', ratioBad, '| correct dist:', dist.join('/'));
