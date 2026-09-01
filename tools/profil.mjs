// node tools/profil.mjs <backup.json> — kalibrační profil hráče per balíček/obor
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backup = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'packs', 'manifest.json'), 'utf8'));

const byId = new Map();
for (const p of manifest) {
  for (const q of JSON.parse(readFileSync(join(root, 'packs', p.file), 'utf8'))) {
    byId.set(q.id, { ...q, pack: p.id, packTitle: p.title, obor: p.obor });
  }
}

const answers = backup.answers || [];
console.log(`Odpovědí celkem: ${answers.length}`);
console.log(`Elo: ${JSON.stringify(backup.player.elos)}`);
console.log(`Odpovědí per obor: ${JSON.stringify(backup.player.answeredByObor)}\n`);

// per balíček: úspěšnost + úspěšnost v horní a dolní půlce žebříku
const packs = {};
for (const a of answers) {
  const q = byId.get(a.q);
  if (!q) continue;
  const g = (packs[q.pack] = packs[q.pack] || { title: q.packTitle, obor: q.obor, n: 0, ok: 0, lo: [0, 0], hi: [0, 0], wrong: [], eloSum: 0 });
  g.n++; g.eloSum += q.seedElo;
  if (a.ok) g.ok++; else g.wrong.push(`${q.id}@${q.seedElo}`);
  const half = q.seedElo >= 1600 ? g.hi : g.lo;
  half[1]++; if (a.ok) half[0]++;
}

const rows = Object.entries(packs).sort((a, b) => (a[1].obor + a[0]).localeCompare(b[1].obor + b[0]));
let curObor = '';
for (const [id, g] of rows) {
  if (g.obor !== curObor) { curObor = g.obor; console.log(`\n=== ${curObor.toUpperCase()} ===`); }
  const acc = Math.round(100 * g.ok / g.n);
  const loAcc = g.lo[1] ? Math.round(100 * g.lo[0] / g.lo[1]) : '—';
  const hiAcc = g.hi[1] ? Math.round(100 * g.hi[0] / g.hi[1]) : '—';
  console.log(`${g.title.padEnd(26)} n=${String(g.n).padStart(3)} ${String(acc).padStart(3)}%  dole(<1600) ${loAcc}% (${g.lo[1]})  nahoře(>=1600) ${hiAcc}% (${g.hi[1]})`);
  if (g.wrong.length) console.log(`   chyby: ${g.wrong.join(', ')}`);
}

// flagy
const flags = Object.entries(backup.qstate || {}).filter(([, s]) => s.flag).map(([id]) => {
  const q = byId.get(id);
  return q ? `${id} (${q.packTitle}, ${q.seedElo})` : id;
});
console.log(`\nFlagy: ${flags.length ? flags.join('; ') : 'žádné'}`);

// keep
const keeps = Object.entries(backup.qstate || {}).filter(([, s]) => s.keep).map(([id]) => id);
console.log(`Nechané (♻): ${keeps.length ? keeps.join(', ') : 'žádné'}`);
