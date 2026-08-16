// node tools/assemble.mjs — složí finální packy z dávek + verdiktů slepé verifikace
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const batches = join(root, 'content', 'batches');
const verdicts = join(root, 'content', 'verdicts');
const packs = join(root, 'packs');

const TITLES = {
  obrany: 'Obrany',
  prenos: 'Přenos a technika',
  vyvoj: 'Vývojové teorie',
  skoly: 'Školy a autoři',
  struktura: 'Struktura a diagnostika',
  smery: 'Směry a mosty',
  vyzkum: 'Výzkum, etika, dějiny',
};

const manifest = [];
let kept = 0, dropped = 0;
const rejected = [];

for (const f of readdirSync(batches).filter(f => f.startsWith('gen-'))) {
  const dom = f.replace(/^gen-/, '').replace(/\.json$/, '');
  const gen = JSON.parse(readFileSync(join(batches, f), 'utf8'));
  const ver = JSON.parse(readFileSync(join(verdicts, `verdict-${dom}.json`), 'utf8'));
  const vmap = new Map(ver.map(v => [v.id, v]));
  const pass = [];
  for (const q of gen) {
    const v = vmap.get(q.id);
    if (v && v.answer === q.correct && v.confidence !== 'low') pass.push(q);
    else { dropped++; rejected.push({ dom, id: q.id, why: !v ? 'bez verdiktu' : v.confidence === 'low' ? 'low: ' + (v.note || '') : `neshoda (klíč ${q.correct}, verifikátor ${v.answer})` }); }
  }
  kept += pass.length;
  const file = `${dom}.json`;
  writeFileSync(join(packs, file), JSON.stringify(pass, null, 1), 'utf8');
  manifest.push({ id: dom, file, title: TITLES[dom] || dom, count: pass.length, version: 1 });
  console.log(`${dom}: ${pass.length}/${gen.length} prošlo (${Math.round(100 * (gen.length - pass.length) / gen.length)} % zahozeno)`);
}

writeFileSync(join(packs, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');
writeFileSync(join(root, 'content', 'rejected.json'), JSON.stringify(rejected, null, 1), 'utf8');
console.log(`\nCelkem: ${kept} prošlo, ${dropped} zahozeno. Detaily v content/rejected.json`);
