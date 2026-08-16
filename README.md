# HLUBINA

Nekonečný kvíz psychoterapeutického myšlení. Offline-first PWA — jedna
otázka, čtyři možnosti, Elo. Postaveno pro jednoho hráče a 15hodinový let
bez internetu.

## Spuštění

Statické soubory, žádný build. Lokálně:

```
npx http-server -p 8123 -c-1 .
```

a otevřít http://localhost:8123. Po prvním načtení funguje offline
(service worker precachne appku i všechny balíčky). Nasazení = nakopírovat
repo na jakýkoli statický hosting (GitHub Pages ready).

## Obsah

330 otázek v 7 balíčcích (`/packs/`): obrany, přenos a technika, vývojové
teorie, školy a autoři, struktura a diagnostika, směry a mosty (IFS/schema/
KBT), výzkum-etika-dějiny. Každá otázka prošla slepou verifikací (nezávislý
běh odpovídal bez klíče). Ve hře je u každé otázky tlačítko „smrdí mi to" —
flagy jsou ve stavu i v exportu a slouží k pozdější re-verifikaci
(viz PIPELINE.md).

## Dev nástroje

- `node tools/validate.mjs` — kontrola balíčků (schéma, duplicity, rozložení
  správných odpovědí)
- `node tools/blind.mjs` + `tools/assemble.mjs` — výroba zaslepených dávek
  pro verifikátory a skládání finálních balíčků
- `content/batches/` — surové dávky, `content/verdicts/` — verdikty
  verifikace, `content/rejected.json` — zahozené kusy

Detaily: SPEC.md (appka), PIPELINE.md (výroba otázek).
