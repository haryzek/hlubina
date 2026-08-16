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

## Knižní režim (odloženo, princip zůstává)

Až na něj dojde: summary a otázky jsou **dva paralelní výstupy z textu
kapitoly, nikdy řetěz**; každá knižní otázka má kotvu na pasáž a verifikuje
se proti ní; `deepDive` obsahuje přímý úryvek s uvedením strany. Jen
informační knihy — transformační texty (pozdní Ogden, Bion) patří na
poličku „číst doopravdy".
