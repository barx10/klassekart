@AGENTS.md

# Klassekart

Verktøy for lærere: sett opp klasserommet, generer klassekart som unngår at de
samme elevene alltid sitter sammen, og juster plasseringen for hånd.

Norsk er språket i UI, kommentarer, commit-meldinger og PR-er.

## Kjøre og teste

```bash
npm run dev        # utvikling
npm run lint       # eslint — må være grønn før commit
npm run build      # next build — må være grønn før commit
```

Appen trenger ingen miljøvariabler og ingen database — all lagring skjer i
nettleseren.

### Visuell testing i denne containeren

Det finnes ingen testsuite. Endringer i klasserommet (draging, plassering,
geometri) verifiseres i en ekte nettleser før commit:

1. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install -D playwright`
2. Legg en midlertidig side i `src/app/preview-temp/page.tsx` som rendrer
   komponenten med fiktive elevdata
3. Kjør `npx next dev -p 4200` og driv siden med et Playwright-skript
   (`executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`,
   `args: ["--no-sandbox"]`)
4. **Rydd opp etterpå**: slett `preview-temp`, skriptet og `.next`, og
   `npm uninstall playwright` — ingenting av dette skal committes

Fallgruve: bruk **faste** pult-id-er i slike fikstursider. `newDeskId()` bygger
på `Date.now()`, så id-er generert på modulnivå blir ulike på server og klient.
Da havner `data-seat`-attributtene ut av synk med React-staten, og
drag-og-slipp ser ødelagt ut selv om koden er riktig.

## Arkitektur

```
src/
  app/
    layout.tsx                  App-skall: AppDataProvider + Sidebar
    page.tsx                    Sender videre til første klasse
    klasser/[classId]/page.tsx  Verktøylinje + klasserommet (tynn side)
    personvern/page.tsx         Personvernsiden læreren kan vise fram
  components/
    Sidebar.tsx                 Klasser, elever, tidligere kart, par-oversikt
    ClassroomCanvas.tsx         Klasserommet: pulter, draging, seter
    StudentManager.tsx          Legg til/rediger elever (kompakt, for menyen)
    PairHeatmap.tsx             Varmekart over hvem som har sittet sammen
    Modal.tsx                   Brukes til par-oversikten
  lib/
    app-data.tsx                All delt tilstand (se under)
    classroom.ts                Pult-geometri: bredde/høyde, rutenett, rydd opp
    seating.ts                  Fordelingsalgoritmen (simulert herding)
    api.ts                      Datalaget: klasser, elever, kart, par
    local-db.ts                 Lagring i nettleseren (IndexedDB) + sikkerhetskopi
    types.ts                    Delte typer
docs/personvern.md              Vurderingene bak, og veien videre om appen skal deles
```

### `AppDataProvider` er navet

`src/lib/app-data.tsx` eier både de globale dataene (klasser, elever) og
klassen som vises nå — utledet fra adressen med `usePathname()`. Både
venstremenyen og klasserommet leser derfra, så de aldri kommer ut av synk.

**Pultene har én kilde til sannhet.** `desks` utledes fra `activeClass.desks`
med `useMemo`; det finnes ingen speilet kopi. `applyDesks()` oppdaterer
klasseraden lokalt og lagrer til databasen med 300 ms forsinkelse — derfor
føles draging responsiv uten å spamme databasen.

ESLint-regelen `react-hooks/set-state-in-effect` er streng her: ikke kall
`setState` rett i en effekt-kropp. Legg det i `.then()`-kjeden, eller utled
verdien i stedet (slik `classLoading` og `lastResult` gjør).

### Klasserommet

Hvert klasserom er forskjellig, så pultene har frie x/y-koordinater læreren
drar dem til. En pult har 1–4 plasser; **fire plasser tegnes som 2×2**, ikke
fire på rekke, fordi bordgrupper står slik i virkeligheten (`seatGrid()`).

Topplinja på pulten har to jobber: den viser bordnavnet og er draghåndtaket.
Uten den ville elevkortene og pultflyttingen kjempet om det samme klikket,
siden setene dekker nesten hele pulten.

To ting som lett brekker igjen:

- **Verktøylinja for valgt pult må ligge _under_ pulten.** Over den blir den
  klippet bort av `overflow-x-auto` rundt lerretet og er umulig å klikke.
  `TOOLBAR_ROOM` reserverer plassen i `canvasSize()`.
- **En sluppet pult flyttes bakerst i lista** så den tegnes øverst. Ellers
  blir den liggende skjult under pulten den ble dratt oppå.

### Klassekart og historikk

`seating_charts.layout` er `{ pultId: [elevId | null, ...] }` — én plass per
sete, `null` for ledig, slik at en elev kan sitte på plass to selv om plass én
er tom.

`pair_history` teller hvor mange ganger hvert elevpar har sittet sammen, og
er det algoritmen bruker for å spre elevene. **Manuelle flyttinger justerer
den** (`adjustPairHistory`): par som forsvinner telles ned, nye telles opp.
Uten det ville varmekartet vist parene slik de var da kartet ble generert.

## Lagring

`src/lib/local-db.ts` lagrer **hele datasettet som ett objekt** under én nøkkel
i IndexedDB. Datamengden er små kilobyte, og til gjengjeld blir en
sikkerhetskopi en ren `JSON.stringify`, og en endring kan aldri skrive halve
sannheten til disk.

To ting å holde på:

- **Alle lesninger og skrivinger går gjennom køen** (`read`/`mutate`). Uten den
  kunne et pultflytt som lagres med 300 ms forsinkelse rekke å lese samme
  utgangspunkt som en elev-endring, og skrive over den.
- **`mutate` skriver ikke hvis callbacken kaster.** Derfor kan
  `generateAndSaveChart` gjøre alt sitt i én endring: kartet blir aldri lagret
  uten at parene det ga blir talt med.

Formatet har et `version`-felt, og `normalize()` fyller inn det som mangler.
Endrer du formatet, hev `BACKUP_VERSION` og la eldre sikkerhetskopier kunne
leses — brukeren kan ha en fil fra i fjor. Nye pult-egenskaper hører fortsatt
hjemme inne i `desks`; `normalizeDesks()` fyller inn standardverdier.

## Arbeidsflyt

Utvikling skjer på `claude/klassekartprogram-0709fs`. Branchen merges og
slettes ofte, så start fra `origin/main` på nytt arbeid:

```bash
git fetch origin main && git checkout -B claude/klassekartprogram-0709fs origin/main
```

Deploy går til Vercel (prosjekt `klassekart`) automatisk fra `main`. Det er
ingen miljøvariabler å sette; appen er ren frontend.

## Personvern

Appen lagrer elevnavn og kjønn, altså personopplysninger om barn. Derfor ligger
dataene i nettleseren og ikke i en database: ingenting forlater maskinen til
læreren, appen er ikke databehandler for noen, og det finnes ingen delt
database å sikre.

**Ikke foreslå å flytte lagringen til en server igjen** uten at det er
etterspurt. Det valget er tatt bevisst, og `docs/personvern.md` forklarer hva
det i så fall koster: innlogging, databehandleravtale med hver kommune, DPIA og
en leverandørrolle. Dokumentet har oppskriften den dagen appen skal ut til
andre skoler — hold det oppdatert når noe endres.
