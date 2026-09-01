// node tools/dorovnat.mjs <packId> <genGlob-prefix> — dorovná balíček na 100 otázek
// Vezme stávající pack + nové dávky z content/vlna, zahodí kusy, které neprošly
// slepou verifikací nebo mechanickým anti-tellem, a vybere doplněk do rovných 100
// s rovnoměrným rozložením obtížnosti.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [packId, prefix] = process.argv.slice(2);
const vlna = join(root, 'content', 'vlna');
const packsDir = join(root, 'packs');
const TARGET = 100;

const existing = JSON.parse(readFileSync(join(packsDir, `${packId}.json`), 'utf8'));
const verdicts = new Map();
for (const f of readdirSync(vlna).filter(f => f.startsWith(`verdict-${prefix}`))) {
  for (const v of JSON.parse(readFileSync(join(vlna, f), 'utf8'))) verdicts.set(v.id, v);
}

let cand = [];
for (const f of readdirSync(vlna).filter(f => f.startsWith(`${prefix}-`) && f.endsWith('.json'))) {
  cand = cand.concat(JSON.parse(readFileSync(join(vlna, f), 'utf8')));
}

const dropped = { neshoda: 0, low: 0, bezVerdiktu: 0, delky: 0, duplicita: 0 };
const seenText = new Set(existing.map(q => q.text.toLowerCase().slice(0, 60)));

const pass = cand.filter(q => {
  const v = verdicts.get(q.id);
  if (!v) { dropped.bezVerdiktu++; return false; }
  if (v.confidence === 'low') { dropped.low++; return false; }
  if (v.answer !== q.correct) { dropped.neshoda++; return false; }
  const le = q.options.map(o => o.length);
  if (Math.max(...le) > Math.min(...le) * 1.3) { dropped.delky++; return false; }
  const key = q.text.toLowerCase().slice(0, 60);
  if (seenText.has(key)) { dropped.duplicita++; return false; }
  seenText.add(key);
  return true;
});

const need = TARGET - existing.length;
// výběr: rovnoměrně přes Elo pásma, aby nevznikl shluk
pass.sort((a, b) => a.seedElo - b.seedElo);
let chosen = pass;
if (pass.length > need) {
  chosen = [];
  const step = pass.length / need;
  for (let i = 0; i < need; i++) chosen.push(pass[Math.floor(i * step)]);
}

const final = existing.concat(chosen).sort((a, b) => a.seedElo - b.seedElo);
writeFileSync(join(packsDir, `${packId}.json`), JSON.stringify(final, null, 1), 'utf8');

const manifest = JSON.parse(readFileSync(join(packsDir, 'manifest.json'), 'utf8'));
const m = manifest.find(x => x.id === packId);
m.count = final.length;
m.version = (m.version || 1) + 1;
writeFileSync(join(packsDir, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');

const bands = {};
for (const q of final) { const b = Math.floor(q.seedElo / 100) * 100; bands[b] = (bands[b] || 0) + 1; }
console.log(`${packId}: ${existing.length} + ${chosen.length} = ${final.length} otázek (v${m.version})`);
console.log(`Kandidátů ${cand.length}, prošlo ${pass.length}, zahozeno:`, JSON.stringify(dropped));
console.log('Elo rozložení:', Object.entries(bands).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
