// node tools/blind.mjs — vyrobí zaslepené verze dávek pro verifikátory
// (bez correct, explanation, deepDive, source, seedElo)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'content', 'batches');
const out = join(root, 'content', 'blinded');
mkdirSync(out, { recursive: true });

for (const f of readdirSync(src).filter(f => f.startsWith('gen-') && f.endsWith('.json'))) {
  const pack = JSON.parse(readFileSync(join(src, f), 'utf8'));
  const blinded = pack.map(q => ({ id: q.id, type: q.type, text: q.text, options: q.options }));
  writeFileSync(join(out, f.replace('gen-', 'blind-')), JSON.stringify(blinded, null, 1), 'utf8');
  console.log(f, '->', blinded.length);
}
