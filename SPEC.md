# HLUBINA — nekonečný kvíz psychoterapeutického myšlení

Offline-first PWA. Solo trivia hra po vzoru Endless Quiz, obsahově zaměřená na
psychoterapii s důrazem na hlubinnou/psychoanalytickou tradici (ale i IFS, KBT,
schematerapii, výzkum, etiku). Jeden hráč: Bob. Primární scénář použití:
15hodinový let bez internetu.

## Zásady

1. **Jednoduchost jako u Endless Quiz.** Jedna otázka, čtyři možnosti, Elo.
   Žádné životy, mince, streaky, notifikace. Každá přidaná mechanika musí
   obhájit svou existenci.
2. **Offline-first.** Po první návštěvě funguje 100 % bez sítě. Síť je potřeba
   jen na aktualizace.
3. **Žádný build step.** Vanilla JS (ES moduly), statické soubory, deploy na
   GitHub Pages. Žádné npm dependencies v runtime (max. vendorovaný soubor
   v `/vendor`, pokud bude nezbytný — default: žádný).
4. **Obsah oddělený od kódu.** Otázky jsou data (JSON balíčky), engine je kód.
   Nové otázky = nový balíček, beze změny enginu.
5. **Data hráče jsou svatá.** Export/import zálohy je feature první třídy.

## Struktura repozitáře

```
/index.html              jediná stránka
/manifest.webmanifest    PWA manifest (name, icons, standalone, theme)
/sw.js                   service worker (v rootu kvůli scope)
/app/
  main.js                bootstrap, routing mezi obrazovkami
  engine.js              herní smyčka: otázka → odpověď → vyhodnocení → další
  elo.js                 čistě funkční Elo matematika (bez side-effectů)
  scheduler.js           výběr další otázky (fronta oprav + vzorkování)
  store.js               persistence (IndexedDB), migrace, export/import
  stats.js               výpočty pro obrazovku statistik
  ui/
    question.js          obrazovka otázky + feedback
    stats.js             obrazovka statistik
    settings.js          nastavení
    components.js        sdílené drobnosti (toast, sparkline…)
  styles.css
/packs/
  manifest.json          seznam balíčků: [{id, file, version, count, title}]
  core-cs-001.json       první balíček otázek
/tools/
  validate.mjs           node skript: schema, duplicity, sanity checks
/icons/                  PWA ikony (192, 512, maskable)
SPEC.md                  tento soubor
```

## Datové schéma otázky

```json
{
  "id": "core-cs-001-0042",
  "type": "V",
  "category": "obrany",
  "tags": ["projektivni-identifikace", "klein"],
  "text": "Klientka mluví klidně o rozvodu, ale terapeut cítí…",
  "options": ["…", "…", "…", "…"],
  "correct": 2,
  "explanation": "2–4 řádky: proč správná odpověď, proč ne distraktory. Odkaz na autora/knihu.",
  "deepDive": "volitelný mikročlánek (markdown): souvislosti, historie pojmu, klinické nuance — čte se na vyžádání, délka neomezená; u knižních otázek obsahuje přímý úryvek z knihy (blockquote s uvedením strany)",
  "source": "Ogden (1982), Projective Identification…",
  "seedElo": 1600,
  "timed": false
}
```

**Typy otázek** (`type`):

| kód | typ | cílový podíl |
|-----|-----|--------------|
| V | mikrovigneta — rozpoznání vzorce (obrana, přenos, struktura) | 40 % |
| I | intervenční volba — „co teď?" / „která odpověď je nejméně vhodná z hlediska X" | 20 % |
| K | kontrastní pár — diferenciální rozlišení blízkých pojmů | 15 % |
| P | protipřenosová diagnostika | v rámci V/I kvót |
| F | faktické MCQ — pojmy, autoři, dějiny, diagnostika | 25 % |
| X | jeden jev očima více směrů (IFS/KBT/schema/psychodynamika) | v rámci F kvóty |
| E | najdi chybu (technickou, etickou, rámcovou) | v rámci I kvóty |

**Epistemická pravidla obsahu** (vynucuje validate.mjs aspoň formálně, jinak
review): u klinických otázek (V, I, P, E, X) formulace nikdy „správná odpověď",
vždy „nejpravděpodobnější / nejvhodnější / nejméně vhodná **z hlediska daného
kritéria**". Kritérium musí být v textu otázky explicitní. Distraktory
plauzibilní, ale jednoznačně horší dle kritéria. `explanation` je povinná a
neprázdná u všech otázek.

`options` se při zobrazení míchají (correct index se mapuje), aby se
nezapamatovávala pozice.

## Elo (elo.js)

- Hráč startuje na 1500. Otázky mají `seedElo` z balíčku (autor odhadne
  obtížnost: 1300 lehká … 1900 těžká), dál se ladí lokálně.
- Očekávané skóre: `E = 1 / (1 + 10^((Rq - Rp)/400))`.
- Update hráče: `Rp' = Rp + K * s * (S - E)`, kde `S ∈ {0,1}`,
  `s` = sázkový multiplikátor (viz níže).
- Update otázky zrcadlově s vlastním K (menší, např. 12), bez sázkového
  multiplikátoru. Otázky, které hráč opakovaně kazí, stoupají — hra se
  personalizuje na slabiny. To je záměr.
- K-faktor hráče klesá s počtem odehraných otázek: 32 do 200 otázek, pak 24,
  po 1000 otázkách 16.

## Sázka na jistotu

Před potvrzením odpovědi hráč volí: **jistý** (×1,5) / **spíš jo** (×1,0) /
**tipuju** (×0,6). Default „spíš jo", volba jedním tapem, nesmí zdržovat.
Ukládá se ke každé odpovědi → kalibrační statistika: skutečná úspěšnost per
úroveň sázky („když říkáš jistý, máš pravdu v 92 %").

## Scheduler (scheduler.js)

Priorita výběru další otázky:

1. **Fronta oprav** (spaced repetition light): chybně zodpovězená otázka se
   zařadí znovu po ~15 otázkách; při druhé chybě po ~50; po správné odpovědi
   interval roste (1 den → 4 dny → 2 týdny, měřeno počtem otázek i časem —
   co nastane dřív při aktivním hraní).
2. **Vzorkování**: náhodný výběr z otázek v pásmu ±150 Elo kolem hráče,
   vážený kvótami typů (viz tabulka). Pokud je pásmo chudé, rozšiřuje se
   po ±50.
3. **Cooldowny**: otázka zodpovězená správně se nevrací dřív než po 200 jiných
   otázkách (nebo dokud se nevyčerpá pool). Posledních 50 zobrazených se
   nevybírá nikdy.

Timer: hra zatím nejede na čas — žádný odpočet u žádného typu. Pole
`timed` v schématu zůstává jako rezerva pro budoucí volitelný režim
rychlých faktů; engine ho v prototypu ignoruje.

## Persistence (store.js)

- IndexedDB, jedna databáze, stores: `answers` (log každé odpovědi:
  questionId, correct, stake, playerEloBefore/After, timestamp, `flagged`
  — nastaví tlačítko „smrdí mi to" v answer sheetu),
  `questionState` (per otázka: elo, timesSeen, timesWrong, lastSeenIndex,
  dueIndex), `player` (elo, gamesPlayed, settings).
- **Export**: jedno tlačítko → stáhne `hlubina-backup-YYYY-MM-DD.json`
  (kompletní stav). **Import**: nahraje soubor, validuje, přepíše stav po
  potvrzení. (Poučení z recenzí Endless Quiz: lidi ztrácejí roky pokroku při
  výměně telefonu.)
- Verze schématu ve stavu + migrační funkce.

## Obrazovky

1. **Otázka** (default): text, 4 možnosti, volba sázky. Po odpovědi krátký
   inline flash — zvýraznění správné/špatné volby, změna Elo (+12 / −18) —
   a plynule další otázka (žádný timer, tempo určuje hráč). Pod hlavičkou
   lišta s předchozí otázkou: tap otevře **answer sheet** — správná odpověď,
   `explanation`, volitelný `deepDive` (scrollovatelný mikročlánek),
   `source` a tlačítko **„smrdí mi to"** (flag, jeden tap). Zavřením sheetu
   se pokračuje, rozehraná otázka čeká. V hlavičce aktuální Elo.
2. **Statistiky**: sparkline vývoje Elo, úspěšnost per kategorie a per typ
   otázky, kalibrační tabulka sázek, počet zodpovězených, nejtěžší poražené
   otázky, **historie posledních odpovědí** (jako v Endless Quiz) — tap na
   položku otevře její answer sheet.
3. **Nastavení**: mix typů (přednastavené kvóty, možnost upravit), timer u
   faktů on/off, export/import, výběr aktivních balíčků, verze appky.

## Service worker (sw.js)

- Precache při instalaci: všechny soubory appky + všechny balíčky dle
  `packs/manifest.json`.
- Strategie cache-first pro všechno.
- Verzovaná cache (`hlubina-v{N}`); při nové verzi SW smaže staré cache a UI
  ukáže toast „Nová verze — obnovit". Žádné tiché reloady uprostřed hry.

## Vizuální směr

Tmavé, klidné, soustředěné — duch Endless Quiz (tlumený modrozelený gradient),
ale vlastní identita: hlubinná tématika → paleta „noční voda" (tmavý
petrolejový základ, světlý text, jeden teplý akcent na správnou odpověď a Elo
zisk). Typografie: výrazný display font jen pro otázku, systémový grotesk pro
UI. Žádné konfety, žádné animační cirkusy; jediný povolený motion: plynulé
přelití Elo čísla a decentní reveal vysvětlení. `prefers-reduced-motion`
respektovat. Mobile-first (primárně telefon v letadle), touch targety ≥ 48 px.

## validate.mjs

Node skript (jen dev, není v runtime): projde `/packs/*.json` a zkontroluje
schema (povinná pole, correct ∈ 0–3, právě 4 options, neprázdná explanation),
duplicitní id a duplicitní/skoro-duplicitní texty otázek (normalizovaný
Levenshtein nebo aspoň exact match po normalizaci), rozsah seedElo, validní
type/category. Exit code ≠ 0 při chybě → použitelné v CI.

## Co v prototypu NENÍ (vědomě)

- Žádný backend, účty, leaderboard, multiplayer.
- Žádná distribuce ratingu „proti ostatním hráčům" — místo ní vlastní historie.
- Žádné streaky a denní cíle (zvážit až podle reálného používání).
- Generování obsahu (pipeline na otázky) — samostatná fáze, engine je na ni
  připravený přes balíčky.

## Fáze pro Claude Code

1. Skeleton: index.html, SW, manifest, prázdný engine, 5 testovacích otázek.
   Ověřit offline chod (airplane mode test).
2. Elo + scheduler + store, s jednotkovými testy čisté logiky (elo.js,
   scheduler.js jsou pure funkce nad předaným stavem → testovatelné bez DOM).
3. UI otázky + feedback + sázka.
4. Statistiky, nastavení, export/import.
5. validate.mjs + první reálný balíček otázek (~60 ks, mix dle kvót).
6. Ladění vizuálu, ikony, GitHub Pages deploy.
