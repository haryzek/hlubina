// node tools/dump.mjs [obor|pack-id] — vypíše pool do čitelného markdownu (review, dedup podklad)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const filter = process.argv[2];
const manifest = JSON.parse(readFileSync(join(root, 'packs', 'manifest.json'), 'utf8'));

for (const p of manifest) {
  if (filter && p.obor !== filter && p.id !== filter) continue;
  const pack = JSON.parse(readFileSync(join(root, 'packs', p.file), 'utf8'));
  console.log(`\n# ${p.title} (${p.id}, obor ${p.obor}${p.parent ? ', kniha pod ' + p.parent : ''}) — ${pack.length} otázek\n`);
  for (const q of pack) {
    console.log(`- **${q.id}** [${q.type}/${q.seedElo}] ${q.text}`);
    console.log(`  → ${q.options[q.correct]}`);
  }
}
