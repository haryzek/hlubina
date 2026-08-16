# HLUBINA — pipeline výroby otázek

Cíl: prvních 1000 otázek a udržitelný systém pro další sady bez duplicit.
Pracuje se v Claude Code / Cowork nad stejným repem jako appka.

## Základní princip

Negeneruje se „N otázek", generuje se **pokrytí taxonomie**. Identita otázky
= `pojem × typ × úhel`. Taxonomie je zároveň plán výroby i registr proti
duplicitám. Bob je klinický editor: žádná otázka nevstoupí do balíčku bez
jeho schválení.

## Struktura v repu

```
/content/
  taxonomy.json          strom domén a pojmů s kvótami a stavem pokrytí
  gold/gold.json         zlatý standard: ručně vyladěné vzorové otázky
  antipatterns.md        živý seznam „takhle ne" (plní se z Bobových zamítnutí)
  styleguide.md          jazyk, tón, epistemická pravidla (výtah ze SPEC.md)
  batches/
    2026-08-b01-obrany-klein.json      pracovní dávky před review
  coverage/
    <pojem-id>.md        auto-udržovaný souhrn už pokrytých úhlů per pojem
/prompts/
  gen-V.md  gen-I.md  gen-K.md  gen-F.md  gen-X.md  gen-E.md
  redteam.md             kontrolní průchod před předáním k review
/tools/
  validate.mjs           (ze SPEC.md) + kontroly níže
  coverage-report.mjs    stav pokrytí taxonomie: co chybí, co přeteklo
```

## Fáze 0 — Zlatý standard (1 sezení, jednorázově)

Bob + Claude ručně vyladí **15–20 otázek** napříč typy (min. 4× V, 3× I,
3× K, 3× F, 2× X, 2× E) do stavu „přesně takhle". Ty se uloží do
`gold/gold.json` a stanou se few-shot příklady v každém generátorovém
promptu. Není to editorská práce, ale jednorázové ukázání terče — kvalita
vzorů určuje kvalitu tisíce. Aby nekazily překvapení, označí se
`"gold": true` a **vyřadí se z Bobova hracího poolu**. Bez této fáze se
nezačíná.

## Fáze 1 — Taxonomie (1–2 sezení)

Claude navrhne strom, Bob škrtá a doplňuje. Hrubý návrh domén:

- **Obrany** (~25 pojmů: vytěsnění, popření, štěpení, PI, izolace afektu…)
- **Přenos / protipřenos** (typy, enactment, projektivní identifikace
  v protipřenosu, práce s erotizovaným a negativním přenosem…)
- **Vývojové teorie** (Freud, Mahler, attachment, mentalizace…)
- **Školy a autoři** (Freud, Klein, Winnicott, Bion, Kohut, Kernberg,
  Ogden, Fonagy… — pojmy vázané na autory)
- **Struktura a diagnostika** (McWilliams, úrovně organizace osobnosti,
  charakterové styly, PDM-2)
- **Technika** (rámec, interpretace a její timing, odpor, sny,
  ukončování, chyby)
- **IFS** / **Schematerapie** / **KBT** (jádrové koncepty + mosty
  k psychodynamice → typ X)
- **Výzkum psychoterapie** (common factors, aliance, Wampold, efektivita)
- **Etika a rámec profese**
- **Dějiny hnutí** (odbočky, roztržky, kontroverze — zábavná F kategorie)

Každý pojem v `taxonomy.json`:

```json
{
  "id": "obrany.projektivni-identifikace",
  "domain": "obrany",
  "quota": {"V": 6, "I": 2, "K": 3, "F": 2, "X": 1},
  "difficulty": "1450-1850",
  "sources": ["Ogden 1982", "McWilliams kap. 5"],
  "done": {"V": 0, "I": 0, "K": 0, "F": 0, "X": 0}
}
```

Kvóty se sečtou na ~1000 s rezervou (plán ~1150, protože část Bob zamítne).
`coverage-report.mjs` kdykoli vypíše, co zbývá.

## Fáze 2 — Dávková výroba (opakovaně, ~40 dávek)

Jedna dávka = **20–25 otázek, jeden pojmový trs** (např. „primitivní obrany:
štěpení, PI, popření"), jedna zdrojová kotva.

Protokol dávky:

1. **Kotva.** Bob určí trs + zdroj („McWilliams kap. 5" / vlastní poznámky /
   vložené klíčové pasáže). Bez kotvy jen u dějin a lehkých F.
2. **Generace.** Claude čte: gold.json, styleguide.md, antipatterns.md,
   coverage/<pojmy>.md (už pokryté úhly — těm se vyhnout) a příslušný
   gen-*.md prompt. Vygeneruje dávku do `batches/`. Kde má pojem hloubku
   (historie, kontroverze, klinické nuance), přidat `deepDive` —
   mikročlánek na vyžádání; u knižních otázek je deepDive téměř vždy
   a obsahuje přímý úryvek z kotvené pasáže (viz Knižní režim).
3. **Red-team průchod** (prompts/redteam.md, samostatný běh): u každé otázky
   ověřit — je kritérium explicitní? obhájí se „nejvhodnější" odpověď proti
   všem distraktorům? jsou distraktory plauzibilní, ale jednoznačně horší?
   učí explanation něco, nebo jen opakuje otázku? je seedElo rozumné?
4. **Nezávislá verifikace** (samostatný běh s čistým kontextem): verifikátor
   dostane otázku **bez označení správné odpovědi**, musí ji sám zodpovědět
   a zdůvodnit. Neshoda s klíčem nebo nejistota → otázka se zahazuje.
   U typu I navíc: bez explicitního kritéria v textu → auto-reject.
   Bob otázky před hrou **nevidí** — hra má být překvapení; kvalitu drží
   automatika + flag loop (viz níže).
5. **Zápis.** Otázky prošlé verifikací → nový pack v `/packs/` (validate.mjs
   musí projít). Pokryté úhly → coverage/<pojem>.md. Čítače done
   v taxonomy.json += přijaté. Kalkulovat s výtěžností ~70 % (u typu I méně):
   plán generace ~1400 na cílových 1000.

## Flag loop — kvalitní brána za hrou

V appce má každá otázka po zodpovězení tlačítko **„smrdí mi to"** (jeden tap,
bez vysvětlování, hraje se dál). Flagy se ukládají do stavu a jsou součástí
exportu. Při další práci v Claude Code se flagnuté otázky re-verifikují proti
zdrojům; chybné se opraví nebo odstraní **novou verzí balíčku** (id otázky se
nerecykluje, oprava resetuje její herní historii). Bob tak dělá editora až po
hře a jen u podezřelých — překvapení zůstává zachováno.

Metrika zdraví pipeline: **míra zahazování ve verifikaci per dávka**. Nad
40 % → stop, revize promptů a antipatterns, ne hrnutí dál. Druhá metrika:
počet flagů ze hry na 100 zodpovězených otázek.

## Obrana proti duplicitám (tři vrstvy)

1. **Strukturální** (hlavní): kvóty pojem×typ v taxonomii. Přeplněný pojem
   nový otázky nedostane.
2. **Úhlová**: každá otázka má pole `"angle": "PI rozpoznaná skrz nudu
   v protipřenosu"` — krátký popis testovaného bodu. coverage/<pojem>.md
   drží seznam úhlů; generátor je dostává jako zakázané. validate.mjs
   kontroluje unikátnost angle per pojem.
3. **Textová**: validate.mjs — exact match po normalizaci + hrubá podobnost
   textů otázek (token overlap / Levenshtein na normalizovaných řetězcích).
   Bez embeddingů — vrstvy 1+2 dělají sémantickou práci strukturálně.

## Práce s knihami

- Knihy = kotvy dávek a rozhodčí při review, ne korpus ke skenování.
- Nejvyšší hodnota: (a) klinické příklady jako **inspirace** vignet — situace
  se přepíše, nikdy nekopíruje; (b) jemné pojmové distinkce pro typ K;
  (c) pole `source` — každá klinická otázka odkazuje na dohledatelné místo.
- Do promptu se vkládají jen krátké klíčové pasáže nebo Bobovy poznámky.
  Do otázek se nikdy nepřebírají formulace z knih doslova.

## Knižní režim — převod knih na summary + otázky

Cíl: knihy, na které není čas, převést do (a) čitelného summary a (b) otázek
ve hře. Platí jen pro **informační** knihy (příručky, systematické texty,
přehledy výzkumu, dějiny). Transformační texty (pozdní Ogden, Bion, klinické
memoáry) do pipeline nepatří — ty jdou na poličku „číst doopravdy".

Zásada: **summary a otázky jsou dva paralelní výstupy z textu kapitoly,
nikdy řetěz** (kniha → summary → otázky by násobilo ztrátovou kompresi).

```
/content/books/<book-id>/
  meta.json              autor, titul, vydání, stav kapitol
  ch01/summary.md        strukturované summary kapitoly (pro Boba ke čtení)
  ch01/questions.json    pracovní otázky s kotvami, před review
```

Protokol kapitoly:

1. **Ingest**: text kapitoly (PDF/EPUB/scan → text) do Cowork session.
2. **Summary** (`summary.md`): klíčové koncepty, argumentační linka, klinické
   implikace, pojmové distinkce, co si autor myslí jinak než mainstream.
   Cíl: 10–15 min čtení. Vlastními slovy, žádné dlouhé citace.
3. **Otázky**: generují se **přímo z textu kapitoly**, každá s povinnou
   kotvou `"anchor": "s. 87, odst. 2 — pasáž o …"`. Formulace otázek nikdy
   nepřebírají text knihy doslova. **V odpovědi** (answer sheet) je to
   naopak žádoucí: `deepDive` knižní otázky obsahuje **přímý úryvek
   z kotvené pasáže** (citace s uvedením strany, graficky odlišená) +
   komentář vlastními slovy — hráč čte přímo autora, ne jen parafrázi.
4. **Verifikace proti kotvám**: samostatný běh ověřuje každou otázku
   **proti kotvené pasáži** (ne proti obecným znalostem). Klíč, který
   pasáž jednoznačně nepodpírá → otázka se zahazuje. Bob otázky před hrou
   nevidí; podezřelé kusy chytá flag loop.
5. **Zápis**: prošlé otázky → book pack `/packs/book-<id>.json`
   (tag `book:<id>`), úhly → coverage, případné průniky s taxonomií se
   započtou do kvót pojmů.

Doporučené pořadí užití (testing effect): Bob si přečte summary kapitoly,
otázky pak v následujících týdnech fungují ve hře jako retrieval practice.
Otázky potkané bez summary učí přes `explanation` — pomalejší, ale legitimní.

## Budoucí sady (po první tisícovce)

- Nová sada = rozšíření taxonomie (nové pojmy / domény) **nebo** nové úhly
  a vyšší obtížnost u existujících pojmů (kvóty se navýší, coverage hlídá).
- Herní data zpět do výroby: export z appky ukáže otázky s extrémním Elo
  a kategorie s nejnižší úspěšností → příští dávky cílí tam. Okruh se uzavře:
  hra měří slabiny, pipeline je dosycuje.
- Verzování balíčků v packs/manifest.json; oprava chybné otázky = nová verze
  balíčku, id otázky se nikdy nerecykluje.

## Realistické tempo

Dávka = ~1 h Claude práce + 20–40 min Bobova review. Při 3–4 dávkách týdně
je 1000 otázek za ~10–12 týdnů. Rychlé naplnění poolu: začít dávkami F + K
(jdou snadno, hra je brzo hratelná), vignety rozjet po vyladění zlatého
standardu a prvních antipatterns.
