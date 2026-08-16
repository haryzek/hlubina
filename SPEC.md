# HLUBINA — nekonečný kvíz psychoterapeutického myšlení

Offline-first PWA. Solo trivia hra po vzoru Endless Quiz, obsah: psychoterapie
s důrazem na hlubinnou/psychoanalytickou tradici (+ IFS, KBT, schematerapie,
výzkum, etika, dějiny). Jeden hráč: Bob. Primární scénář: 15hodinový let bez
internetu. Cíl verze 1: **hratelná, obsahem naplněná věc bez ladění** —
postavená jedním tahem, ne projekt na týdny.

## Zásady

1. **Jednoduchost.** Jedna otázka, čtyři možnosti, Elo. Nic víc nemusí
   obhajovat svou existenci — prostě tam není.
2. **Offline-first.** Po první návštěvě 100 % bez sítě (service worker,
   cache-first).
3. **Žádný build step, žádné dependencies.** Vanilla JS, statické soubory.
   Otevře se z disku i z GitHub Pages.
4. **Obsah = data.** Otázky jsou JSON balíčky v `/packs/`, engine je kód.
5. **Data hráče jsou svatá.** Export/import zálohy jedním tlačítkem.

## Struktura

```
/index.html              markup + bootstrap
/styles.css              vizuál
/app.js                  celý engine v jednom souboru (ES modul)
/sw.js                   service worker
/manifest.webmanifest    PWA manifest
/icons/                  ikony PWA
/packs/
  manifest.json          [{id, file, title, count, version}]
  core-01.json …         balíčky otázek
/tools/validate.mjs      dev kontrola balíčků (node, mimo runtime)
/content/batches/        pracovní výstupy generace (nejde do runtime)
```

Vědomé zjednodušení proti původní vizi: žádné rozdělení na 8 modulů — jeden
`app.js` (~700 řádků) je pro tenhle rozsah čitelnější a rychlejší na stavbu.

## Datové schéma otázky

```json
{
  "id": "obr-001",
  "type": "V",
  "category": "obrany",
  "text": "…",
  "options": ["…", "…", "…", "…"],
  "correct": 2,
  "explanation": "2–4 věty: proč vítězí správná možnost, proč ne distraktory.",
  "deepDive": "volitelný mikročlánek (markdown), čte se na vyžádání",
  "source": "McWilliams, Psychoanalytická diagnóza, kap. 5",
  "seedElo": 1600
}
```

Typy: **V** mikrovigneta (~40 %), **I** intervenční volba (~15 %),
**K** kontrastní pár (~15 %), **F** faktická MCQ (~25 %), **X** jeden jev
očima více směrů a **E** najdi chybu (zbytek). Epistemika: klinické otázky
nikdy „správná odpověď", vždy „nejvhodnější **z hlediska explicitního
kritéria**" uvedeného v textu otázky.

`options` se při zobrazení míchají (mapuje se index), aby se nepamatovala
pozice.

## Elo

- Hráč startuje na 1500, otázky na `seedElo` (1300–1900), dál se ladí lokálně.
- `E = 1/(1+10^((Rq−Rp)/400))`; hráč `Rp' = Rp + K·(S−E)`, K = 32 do 200
  odpovědí, pak 24, po 1000 odpovědích 16.
- Otázka zrcadlově s K = 12. Otázky, které Bob kazí, stoupají → hra se
  personalizuje na slabiny. Záměr.

**Vypuštěno proti původní vizi: sázka na jistotu.** Zdvojovala interakci na
každé otázce; flow „tap na odpověď → feedback → další" je rychlejší a bližší
duchu Endless Quiz. Případně doplnit až podle reálného hraní.

## Scheduler

1. **Fronta oprav:** špatně zodpovězená otázka se vrátí po ~15 otázkách,
   při další chybě po ~50. Správnou odpovědí frontu opouští.
2. **Vzorkování:** náhodně z otázek v pásmu ±150 Elo kolem hráče (chudé
   pásmo se rozšiřuje po ±50), typ se losuje dle kvót V/I/K/F.
3. **Cooldowny:** správně zodpovězená se nevrací dřív než po 200 jiných;
   posledních 50 zobrazených se nevybírá nikdy.

Žádný timer, tempo určuje hráč.

## Persistence

**localStorage** (ne IndexedDB — datový objem je malý, synchronní API stačí
a je o třídu jednodušší). Klíče: `hlubina.player` (elo, počet odpovědí,
historie ela), `hlubina.qstate` (per otázka: elo, seen, wrong, due,
lastSeen, flagged), `hlubina.answers` (log posledních 2000 odpovědí).
Export = stažení `hlubina-backup-RRRR-MM-DD.json` s kompletním stavem;
import validuje a po potvrzení přepíše. Verze schématu ve stavu.

## Obrazovky

1. **Otázka** (default): hlavička s Elo + ikony statistik/nastavení, text
   otázky, 4 možnosti. Po tapu okamžitý feedback: obarvení voleb, změna Elo
   (+12/−18), inline `explanation` + `source`, tlačítko **„smrdí mi to"**
   (flag jedním tapem) a případný odkaz „více" (`deepDive`). Tlačítko
   **Další** → další otázka. Jednodušší než původní answer-sheet lišta —
   vysvětlení rovnou, žádké schovávání.
2. **Statistiky:** Elo + sparkline, počet odpovědí a úspěšnost, tabulka per
   kategorie a per typ, historie posledních 20 (tap = detail otázky).
3. **Nastavení:** export, import, reset (s potvrzením), info o balíčcích,
   verze.

## Service worker

Precache při instalaci (soubory appky + balíčky dle packs/manifest.json),
cache-first, verzovaná cache `hlubina-v{N}`. Nová verze → toast „Nová verze
— obnovit", žádné tiché reloady.

## Vizuál

„Noční voda": tmavý petrolejový základ, světlý text, jeden teplý akcent
(správná odpověď, Elo zisk). Systémová typografie (žádné webfonty — offline
i estetická střídmost), výraznější řez pro otázku. Jediný motion: plynulé
přelití Elo a decentní reveal vysvětlení; `prefers-reduced-motion`
respektovat. Mobile-first, touch targety ≥ 48 px.

## Co tu vědomě není

Backend, účty, leaderboard, streaky, denní cíle, timery, sázky, gold
standard fáze, taxonomický aparát. Viz PIPELINE.md pro výrobu obsahu.
