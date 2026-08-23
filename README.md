# HLUBINA

Nekonečný kvíz pro jednoho hráče (Bob). Offline-first PWA — jedna otázka,
čtyři možnosti, Elo. Začalo psychoterapií, roste do dalších oborů
(filosofie, vědomí a mysl, přírodní vědy, general). Primární použití:
učení a retence přes retrieval practice; učení se děje v answer sheetu
(explanation + deepDive s citacemi), otázka je jen záminka.

**Živá verze:** https://haryzek.github.io/hlubina/ (GitHub Pages, repo
haryzek/hlubina). Lokálně: `npx http-server -p 8123 -c-1 .` nebo
launch config „hlubina".

> **Pro oslíka s amnézií:** tenhle soubor je kompletní provozní manuál.
> SPEC.md = jak funguje appka, PIPELINE.md = principy výroby otázek,
> tady je návod „jak se tu pracuje". Bob = vrchní osel, kokosovej
> spolukrál prdele; pracuje se protokolem **gou** (nejdřív shoda na
> pozorování, pak hypotéza, pak teprve implementace) a commituje se po
> malých krocích.

## Architektura v kostce

- Žádný build, žádné dependencies: `index.html` + `app.js` (celý engine)
  + `styles.css` + `sw.js` + `manifest.webmanifest`.
- Obsah = data: `/packs/*.json` + `packs/manifest.json`
  (`{id, file, title, count, version, obor, parent?}`).
- **Hierarchie: obor → balíček → kniha.** Balíček patří oboru (`obor`),
  kniha je balíček s `parent` = id balíčku, ke kterému patří (hraješ
  balíček ⇒ hrají se i jeho knihy; knihu lze hrát sólo). Obor může mít
  balíček „general".
- **Každý obor má vlastní Elo hráče** (`player.elos`), K-faktor per obor.
  Hamburger ☰ = guláš všeho / jeden obor; výběr balíčku/knihy je
  v Nastavení. V guláši se po odpovědi mění Elo oboru dané otázky.
- Stav hráče: localStorage (`hlubina.player/qstate/answers`), migrace ve
  `loadState()`. **Export/import = svaté**; záloha jde do Dropboxu.
- Scheduler: fronta oprav (chyba → návrat po 15/50), vzorkování ±150 Elo
  kolem hráčova Ela příslušného oboru, cooldown 200 po správné odpovědi,
  posledních 50 se neopakuje. Tlačítko „♻ nechat" drží otázku v oběhu
  (návrat po 40–80) i po správné odpovědi.
- Flag „🐟 smrdí mi to" ukládá `flag` do qstate — je v exportu a je to
  hlavní zpětná vazba kvality obsahu.

## Provozní rituály (každý deploy)

1. `node tools/validate.mjs` musí projít (schéma, duplicity, anti-tell).
2. Bump `CACHE` v `sw.js` (`hlubina-v{N}`) — jinak klienti neuvidí nová data!
3. Commit + push → GitHub Pages nasadí samo; ověřit `gh run list --limit 1`.
4. Bobův progres v localStorage update nikdy nemaže.

## Co jsme rozhodli a proč (log rozhodnutí)

- **Vypuštěno ze staré vize:** sázka na jistotu, IndexedDB, answer-sheet
  lišta, timery, velký taxonomický aparát, gold standard fáze.
- **Slepá verifikace stejným modelem je slabá brána** (v1: prošlo 330/330
  — generátor i verifikátor sdílejí slepá místa). Proto: generuje Sonnet,
  verifikuje Fable (křížem), a hlavní brány jsou mechanické + flag loop.
- **Form-guesser je mrtvý** (trefil 77/77 — model neumí „nevědět" obsah).
  Anti-tell se hlídá JEN mechanicky: poměr délek options ≤ 1,25; správná
  nejdelší max ~35 % dávky (validate.mjs). Sonnet anti-tell pravidla
  v promptu z velké části ignoruje → **korektorský průchod délek je
  u Sonneta povinná stanice** (nebo levněji: nevyhovující otázky rovnou
  zahodit, pokud nejde o úplnost).
- **Balíčky v1 (330 ot.) mají tell 94 %** (správná bývá nejdelší) —
  při nejbližší vlně prohnat korektorem délek.
- **Sondáž před každým novým balíčkem/oborem**: žebřík ~10–11 otázek
  per téma (1500–2150), Bob odehraje, z exportu se čte strop → teprve
  pak se kalibruje hlavní generace. Sondážní balíček zůstává v oběhu
  (otázky jsou plnohodnotné).
- **Id otázky se nikdy nerecykluje**; oprava = nová verze balíčku.
- **Dělba modelů:** Sonnet = hromadné čtení a generace (‚model' parametr
  agenta), Fable = zadání, brány, sporné kusy. Úspora ~75 %.
- **Plné texty knih NIKDY do repa** (copyright) — .gitignore kryje
  `content/books/src/`, `*/epub/`, `*/text.md`. Do repa smí otázky
  s krátkými citacemi s uvedením zdroje.

## Bobův profil (k 2026-08-23, ať víš, pro koho vyrábíš)

- Elo psychoterapie **≈ 2140 a roste**; sondáž: 80 % úspěšnost na
  otázkách 1850–2150 (na příčce 2050 7/7!). Strop ≈ 2200+.
- **Tvrdá vlna se kalibruje na 2000–2300** ve stylu horních příček
  sondáže (jemné distinkce, pozdní koncepty, dvě blízké možnosti
  rozhodované přesným čtením kritéria). Pásmo 1300–1800 je pro něj
  rozcvička — slouží retenci, ne výzvě.
- Relativně nejslabší (malý vzorek): struktura-diagnostika. Fakta
  (letopočty, čísla studií) ztrácí body spíš než klinické uvažování.
- Bob je vychcaný metagamer — anti-tell brát smrtelně vážně.
- Feedback na sondáž: „obtížnost tak akorát, krásný, hloubavý, musím
  přemýšlet" → styl držet.

## Výroba: tematická sada (cíl ~1000 otázek na obor bez duplicit)

Princip: **duplicitám brání struktura, ne registr.** Postup:

1. **Mini-taxonomie oboru** (1 souhlas Boba): rozpad na 6–10 balíčků
   (témat), každé téma seznam ~20–40 pojmů s kvótami typů (V/I/K/F/X/E)
   a pásmy obtížnosti. Uložit do `content/<obor>/taxonomie.md` — je to
   plán výroby i mapa pokrytí. Kvóty × pojmy ≈ cílový počet + 20 %
   rezerva na zahazování.
2. **Sondáž** balíčku → kalibrace obtížnosti (viz výše).
3. **Angle-registr proti duplicitám:** `node tools/dump.mjs <obor>`
   vypíše všechny existující otázky oboru (id, text, kategorie) do
   jednoho md — generátoři ho dostávají jako „zakázané úhly". Při stovkách
   otázek dávat generátorům jen jejich kategorii, ne celý dump.
4. **Generace po trsech** (1 Sonnet agent = 1 trs = 15–25 otázek, čistý
   kontext, prompt: schéma + kvóty + pojmy + anti-tell + epistemika
   „nejvhodnější z hlediska explicitního kritéria").
5. **Brány:** mechanika (validate.mjs) → délkový korektor (nebo drop)
   → slepé řešení Fablem; u expertních (2000+) navíc refutátor („zboř
   klíč — najdi stejně obhajitelný distraktor"). Míra zahazování > 40 %
   ⇒ stop a revize promptu, ne hrnutí dál.
6. **Zápis:** nový pack + manifest + SW bump + deploy. Flagy ze hry
   → re-verifikace proti zdrojům při další seanci → oprava novou verzí.

## Výroba: knihy

Dva režimy — **výchozí je LITE** (Bob 2026-08-23: katedrála je moc drahá).

**LITE (~1/10 nákladu, „korektní best-of knihy", ~55–70 ot.):**
1. EPUB (preferovaně; PDF jde taky) → rozbalit, kapitoly → čistý text
   (viz `content/books/kernberg-2018/` jako vzor; extrakce = node skript,
   strip HTML).
2. Knihu rozdělit na 3–4 porce; na každou 1 Sonnet: „vyber ~20
   nejdůležitějších myšlenek, z každé otázka s kotvou (oddíl + začátek
   pasáže) a POVINNOU doslovnou citací v deepDive + anti-tell pravidla".
3. Brány levně: `node tools/check-ch.mjs <dir>` ověří doslovnost citací
   mechanicky (vymyšlený klíč ~ vymyšlená citace — silná levná brána);
   co neprojde (citace/délky), se ZAHAZUJE, neopravuje. Pozor na falešné
   poplachy checkeru: apostrofy ’ a čísla poznámek pod čarou v textu.
4. Volitelně 1 stránka summary od téhož agenta (skoro zadarmo).
5. Pack `kniha-id.json` s `parent` na mateřský balíček, deploy.

**KATEDRÁLA (jen pro knihu, která si to zaslouží; ~10× dražší,
„skrz naskrz"):** po kapitolách — mapa vědění (úplný seznam položek
s kotvami) → summary + otázky paralelně → **brána úplnosti** (Fable:
každá podstatná položka mapy zasažena ≥1 otázkou, díry → dogenerovat)
→ kotvová verifikace Fablem → korektor citací a délek. Vzor: kap. 2
Kernberg 2018 (`content/books/kernberg-2018/ch02/`), 36 otázek.

Rozpracováno: Kernberg 2018 (kap. 2 hotová katedrálou; kap. 3–13 čekají
na LITE), fronta: Kernberg 1975 Borderline Conditions, Yeomans/Clarkin/
Kernberg 2014 TFP Guide (soubory: `content/books/src/`, gitignored —
Bob je dodává z `D:\-=( BOOKS\...\Otto Kernberg`; pozor, k té cestě
Claude přímý přístup nemá, Bob kopíruje do repa ručně).

## Dosypávání sad, když už je otázek hodně

- Kompletní databáze otázek = `/packs/*.json` v gitu; k ručnímu
  nakouknutí/reviewi `node tools/dump.mjs` (celý pool do čitelného md).
- Nová sada = nový pack (nikdy nepřepisovat starý kromě oprav flagů),
  manifest += řádek, SW bump. Engine se nemění.
- Dedup nové sady: generátorům dát dump jejich kategorie jako zakázané
  úhly + kvóty v taxonomii drží strukturální zábranu.
- Elo-cílení: z Bobova exportu číst per-doména úspěšnost a extrémní Ela
  otázek → další vlna dosycuje slabiny a mění nudné (podstřelené) kusy.

## Nápadník (Bobova přání, zatím nepostavená)

- **Studijní scroll („učebnice")**: prolistovat všechny otázky balíčku
  jako opáčko — spíš scroll ODPOVĚĎMI (otázka + správná odpověď +
  explanation + deepDive pod sebou) než kvízem. Bob 2026-08-23.
- Přepínač „kniha se zapne, až dočtu summary" (zatím řešeno ručně
  výběrem balíčku).
- Re-kalibrace seedElo starých balíčků podle reálných dat ze hry.
- Korektor délek přes balíčky v1 (tell 94 %).

## Nástroje

| skript | účel |
|---|---|
| `tools/validate.mjs` | schéma, duplicity, correct rozložení, anti-tell |
| `tools/check-ch.mjs <dir>` | knižní kapitola: doslovnost citací, anti-tell |
| `tools/blind.mjs` | zaslepené dávky pro verifikátory |
| `tools/assemble.mjs` | složení packů z dávek + verdiktů |
| `tools/dump.mjs [obor]` | celý pool do čitelného md (dedup, review) |
