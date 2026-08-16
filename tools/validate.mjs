// node tools/validate.mjs — kontrola balíčků v /packs/ (dev only)
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = join(root, 'packs');

const TYPES = new Set(['V', 'I', 'K', 'F', 'X', 'E']);
const errors = [];
const warnings = [];

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const manifest = JSON.parse(readFileSync(join(packsDir, 'manifest.json'), 'utf8'));
const ids = new Set();
const texts = new Map();
let total = 0;
const correctDist = [0, 0, 0, 0];

for (const p of manifest) {
  const pack = JSON.parse(readFileSync(join(packsDir, p.file), 'utf8'));
  if (pack.length !== p.count) warnings.push(`${p.file}: manifest count ${p.count} != skutečných ${pack.length}`);
  for (const q of pack) {
    const at = `${p.file}/${q.id}`;
    for (const f of ['id', 'type', 'category', 'text', 'options', 'correct', 'explanation', 'seedElo']) {
      if (q[f] === undefined || q[f] === null || q[f] === '') errors.push(`${at}: chybí pole ${f}`);
    }
    if (ids.has(q.id)) errors.push(`${at}: duplicitní id`);
    ids.add(q.id);
    if (!TYPES.has(q.type)) errors.push(`${at}: neznámý type ${q.type}`);
    if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`${at}: options musí mít přesně 4 položky`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) errors.push(`${at}: correct mimo 0–3`);
    else correctDist[q.correct]++;
    if (typeof q.seedElo !== 'number' || q.seedElo < 1200 || q.seedElo > 2000) errors.push(`${at}: seedElo mimo rozsah`);
    if (q.explanation && q.explanation.length < 40) warnings.push(`${at}: podezřele krátká explanation`);
    const n = norm(q.text || '');
    if (texts.has(n)) errors.push(`${at}: duplicitní text s ${texts.get(n)}`);
    texts.set(n, at);
    if (Array.isArray(q.options)) {
      const optNorm = new Set(q.options.map(norm));
      if (optNorm.size !== 4) errors.push(`${at}: duplicitní options`);
    }
    total++;
  }
}

console.log(`Otázek celkem: ${total}`);
console.log(`Rozložení correct indexů: ${correctDist.join(' / ')}`);
const maxShare = Math.max(...correctDist) / (total || 1);
if (maxShare > 0.35) warnings.push(`nevyvážené correct indexy (max ${Math.round(maxShare * 100)} %)`);

for (const w of warnings) console.log('WARN:', w);
for (const e of errors) console.error('CHYBA:', e);
if (errors.length) { console.error(`\n${errors.length} chyb.`); process.exit(1); }
console.log('OK.');
