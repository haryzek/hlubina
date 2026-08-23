# HLUBINA — pipeline výroby otázek (štíhlá verze)

Cíl verze 1: **~300 kvalitních otázek jedním tahem**, ne aparát na tisícovku.
Původní vize (taxonomy.json, gold standard, coverage soubory, 40 dávek) byla
poctivá, ale těžká — tohle je její destilát, který jde spustit hned.

## Princip

Duplicitám brání **struktura, ne registr**: obsah je rozdělený do 7 domén,
každou generuje samostatný běh s čistým kontextem, explicitním seznamem
pojmů k pokrytí a mixem typů. Uvnitř dávky si generátor hlídá unikátnost
sám, mezi doménami se témata nepřekrývají už zadáním.

Kvalitu drží dvě brány:

1. **Slepá verifikace** (samostatný běh, čistý kontext): verifikátor dostane
   otázky **bez klíče**, musí sám odpovědět a zdůvodnit. Neshoda s klíčem
   nebo přiznaná nejistota → otázka letí. Tohle je jediná automatická brána,
   která reálně chytá AI-slop, proto je nevynechatelná.
2. **Flag loop ve hře:** Bob otázky před hrou nevidí (překvapení je
   feature). Po zodpovězení má tlačítko „smrdí mi to" — flagy jsou ve stavu
   i v exportu. Při další seanci v Claude Code se flagnuté kusy re-verifikují
   proti zdrojům a opraví/odstraní novou verzí balíčku (id se nerecykluje).

## Domény verze 1 (~330 vygenerováno → ~280+ po verifikaci)

| doména | ks | těžiště typů |
|---|---|---|
| obrany | 48 | V, K |
| přenos & technika | 50 | V, I, E |
| vývojové teorie & attachment | 45 | F, K |
| školy & autoři | 50 | F, K |
| struktura & diagnostika (McWilliams) | 45 | V, K |
| moderní směry & mosty (IFS/schema/KBT) | 45 | X, F |
| výzkum, etika, dějiny | 47 | F, E |

## Postup dávky (platí i pro budoucí sady)

1. **Generace:** jeden běh na doménu; prompt obsahuje schéma, mix typů,
   seznam pojmů, epistemická pravidla (explicitní kritérium u klinických
   typů, plauzibilní distraktory, povinná explanation, variace pozice
   správné odpovědi). Výstup do `content/batches/gen-<doména>.json`.
2. **Slepá verifikace:** druhý běh dostane otázky bez `correct`,
   vrátí svoje odpovědi + jistotu. Filtr: neshoda nebo nízká jistota → out.
3. **Validace:** `tools/validate.mjs` — schéma, 4 možnosti, correct 0–3,
   neprázdná explanation, unikátní id, duplicitní texty, rozsah seedElo,
   rozložení correct indexů.
4. **Zápis:** prošlé otázky → `/packs/`, aktualizace `packs/manifest.json`.

Metrika zdraví: míra zahazování ve verifikaci. Nad 40 % u dávky → revize
promptu, ne hrnutí dál.

## Budoucí sady

- Nová dávka = nový balíček (nová doména, nové úhly, vyšší obtížnost).
  Engine se nemění, jen přibude soubor v `/packs/` + řádek v manifestu.
- Export ze hry ukáže kategorie s nejnižší úspěšností a extrémní Elo →
  příští dávky cílí tam.
- Oprava chybné otázky = nová verze balíčku; id otázky se nikdy nerecykluje.

## Lekce z v1 a zesílení verifikace

Slepá verifikace v1 pustila 330/330 (0 low). To neznamená bezchybný obsah:
generátor i verifikátor jsou tentýž model a **sdílejí slepá místa** —
verifikátor „souhlasí" i s otázkou, jejíž chyba plyne z chybného sdíleného
přesvědčení. Od další vlny proto:

1. **Slepé řešení** (jako dosud) — chytá nejednoznačnost a překlepy klíče.
2. **Adversariální refutátor** (nový, samostatný běh): dostane otázku
   VČETNĚ klíče a má za úkol klíč **zbořit** — najít distraktor, který je
   dle kritéria stejně nebo lépe obhajitelný, nebo věcnou chybu v klíči.
   Úspěšná refutace → otázka letí. Chytá jiný typ chyb než slepé řešení.
3. **Flag loop** zůstává finálním arbitrem; flagnuté kusy se re-verifikují
   **proti zdroji** (ne proti znalostem modelu) a zamítnuté vzorce se
   zapisují do `content/antipatterns.md` jako zákazy pro příští generátory.

## Obory (od v1.1)

Appka má vrstvu **obor → balíček → kniha**: obor (psychoterapie, filosofie,
vědomí a mysl, přírodní vědy, general) má vlastní Elo hráče a balíčky;
kniha je balíček vázaný polem `parent` na balíček uvnitř oboru (kniha
o kvantovce → balíček kvantovka v přírodních vědách). Obor může mít
balíček „general". Hraje se guláš všeho, jeden obor, jeden balíček
(včetně jeho knih), nebo jedna kniha.

**Pravidlo: každý balíček dostane sondáž před výrobou otázek** — žebřík
~10 otázek per téma napříč obtížností (1500–2150), Bob ho odehraje,
z exportu se přečte jeho strop a teprve podle něj se cílí hlavní generace.

Poučení ze sondáže psychoterapie (2026-08-23): **form-guesser nefunguje**
— model nedokáže „nevědět" obsah, trefil 77/77 a jeho „formální signály"
jsou racionalizace znalostí. Anti-tell se hlídá jedině mechanicky:
poměr délek options ≤ 1,25, správná nejdelší max ~35 % (validate.mjs),
plus délkový korektor jako opravný průchod. Staré balíčky v1 mají tell
94 % — při nejbližší vlně projít korektorem.

## Dlouhodobý provoz: výrobní večery

Rytmus: **1 výrobní večer = 1 vlna = 150–350 otázek**, celé v Cowork /
Claude Code, Claude orchestruje 15–30 agentů. Bob má přesně tři role:
**(a)** vybere téma/knihu a dodá zdroje, **(b)** 5 minut škrtá v navržené
mapě pokrytí, **(c)** při hraní flaguje. Nic víc — žádné ruční review dávek.

Protokol vlny (tematické sady):

1. Bob: téma + hloubka (např. „sny a technika práce s nimi, 1600+").
2. Claude: návrh mapy pokrytí (pojmy × typy × úhly) → Bob škrtne/doplní.
3. **Dedup proti existujícímu poolu**: agent zestručnní každou existující
   otázku dotčených kategorií na jednořádkový „angle"; seznam jde
   generátorům jako zakázaný. (Nahrazuje starý taxonomický aparát, škáluje
   s velikostí poolu.)
4. Paralelní generace po pojmových trsech → slepé řešení + refutátor →
   assemble + validate → nový pack, bump SW cache, push.
5. Elo-cílení: před každou vlnou se z exportu hry přečtou kategorie
   s nejnižší úspěšností a extrémními Ely → vlna dosycuje slabiny.

## Knižní program: 5 knih „skrz naskrz"

Cíl: zodpovědět správně všechny otázky knihy ≈ znát z ní vše podstatné.
To je závazek **úplnosti pokrytí**, ne jen kvality jednotlivých otázek —
proto má knižní pipeline navíc bránu úplnosti (krok 4).

Vhodné knihy: informační (McWilliams, Gabbard, Wampold, Fonagy, přehledy).
Transformační texty (pozdní Ogden, Bion, memoáry) sem nepatří — polička
„číst doopravdy". Odhad: hutná odborná kniha = 15–25 otázek na kapitolu,
tj. **250–400 otázek na knihu**; jedna kniha = 2–3 výrobní večery.

Protokol knihy:

1. **Ingest** (večer 1): PDF/EPUB → text po kapitolách do
   `content/books/<id>/`. Bob jen dodá soubor.
2. **Mapa vědění**: agent per kapitola vytěží úplný seznam: klíčová
   tvrzení, pojmy, distinkce, klinické implikace, příklady, autorovy
   ne-mainstreamové pozice — každá položka s kotvou (strana/oddíl).
   Mapa = plán pokrytí i pozdější měřítko úplnosti.
3. **Dva paralelní výstupy z textu kapitoly, nikdy řetěz** (večer 2):
   - `summary.md` — 10–15 min čtení pro Boba, vlastními slovy;
   - otázky s povinnou kotvou `"anchor": "s. 87 — pasáž o …"`; formulace
     nikdy nepřebírají text doslova, ale `deepDive` naopak **cituje
     kotvenou pasáž** (blockquote + strana) — v answer sheetu mluví autor.
4. **Brána úplnosti**: kritik porovná mapu vědění × vygenerované otázky.
   Každá podstatná položka mapy musí být zasažena ≥1 otázkou; díry →
   druhé kolo generace. Bez tohoto kroku je „skrz naskrz" jen pocit.
5. **Dvojitá verifikace**: (a) kotvová — verifikátor dostane otázku +
   kotvenou pasáž a potvrdí, že pasáž klíč jednoznačně podpírá (tady
   sdílená slepá místa nevadí — rozhoduje text, ne znalosti modelu);
   (b) slepé řešení bez klíče. Obě musí projít.
6. **Zápis** (večer 3): pack `book-<id>.json`, validate, deploy. Otázky
   s přesahem do obecných kategorií se počítají i tam.

Užití (testing effect): Bob přečte summary kapitoly, otázky pak ve hře
fungují jako retrieval practice v následujících týdnech. Otázky potkané
bez summary učí přes explanation — pomalejší, ale legitimní cesta.

Drobné úpravy appky pro knižní éru (1 krátká seance): přepínač balíčků
on/off v nastavení (kniha se zapne, až Bob dočte summary), případně
`tools/flags-report.mjs` pro pohodlný výpis flagnutých otázek z exportu.

## Kapacitní výhled

5 knih ≈ 1300–1700 otázek + průběžné tematické vlny ≈ pool 2500+ během
podzimu při tempu ~1 večer týdně. Engine to unese beze změn (localStorage
i scheduler škálují v pohodě na nízké tisíce otázek).
