// node tools/assemble-sondaz2.mjs — složí sondážní balíčky nových oborů
// + mechanicky vyváží pozice správných odpovědí (deterministické přeházení options)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'content', 'sondaz2');
const packsDir = join(root, 'packs');

const PACKS = [
  { id: 'kvantovka', title: 'Kvantovka', obor: 'prirodni-vedy' },
  { id: 'evoluce', title: 'Evoluce a biologie', obor: 'prirodni-vedy' },
  { id: 'kosmologie', title: 'Kosmologie a fyzika', obor: 'prirodni-vedy' },
  { id: 'zivocichove', title: 'Živočichové', obor: 'prirodni-vedy' },
  { id: 'dejiny-filosofie', title: 'Dějiny filosofie', obor: 'filosofie' },
  { id: 'epistemologie', title: 'Epistemologie', obor: 'filosofie' },
  { id: 'etika', title: 'Etika', obor: 'filosofie' },
  { id: 'logika', title: 'Logika a paradoxy', obor: 'filosofie' },
  { id: 'filosofie-mysli', title: 'Filosofie mysli', obor: 'vedomi' },
  { id: 'theory-of-mind', title: 'Theory of mind', obor: 'vedomi' },
  { id: 'neuroveda-vedomi', title: 'Neurověda vědomí', obor: 'vedomi' },
  { id: 'technologie', title: 'Technologie', obor: 'general' },
  { id: 'ai', title: 'AI', obor: 'general' },
  { id: 'crazy-fakta', title: 'Crazy fakta', obor: 'general' },
];

// deterministický pseudonáhodný generátor (mulberry32) — reprodukovatelné přeházení
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const manifest = JSON.parse(readFileSync(join(packsDir, 'manifest.json'), 'utf8'));
let total = 0;
const dist = [0, 0, 0, 0];

for (const p of PACKS) {
  const qs = JSON.parse(readFileSync(join(src, `gen-${p.id}.json`), 'utf8'));
  const rand = rng([...p.id].reduce((s, c) => s + c.charCodeAt(0), 0));
  for (const q of qs) {
    // vyvážení pozic: náhodná permutace options + přemapování correct
    const perm = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    q.options = perm.map(i => q.options[i]);
    q.correct = perm.indexOf(q.correct);
    dist[q.correct]++;
  }
  writeFileSync(join(packsDir, `${p.id}.json`), JSON.stringify(qs, null, 1), 'utf8');
  if (!manifest.some(m => m.id === p.id)) {
    manifest.push({ id: p.id, file: `${p.id}.json`, title: p.title, count: qs.length, version: 1, obor: p.obor });
  }
  total += qs.length;
  console.log(`${p.id} (${p.obor}): ${qs.length}`);
}

writeFileSync(join(packsDir, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');
console.log(`\nCelkem ${total} otázek, correct dist po přeházení: ${dist.join('/')}`);
