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
    klasser/[classId]/samtaler/ Elev- og utviklingssamtaler i en arbeidsuke
    personvern/page.tsx         Personvernsiden læreren kan vise fram
  components/
    Sidebar.tsx                 Klasser, elever, tidligere kart, par-oversikt
    ApartPairs.tsx              Elevpar som ikke skal sitte ved samme bord
    ClassroomCanvas.tsx         Klasserommet: pulter, draging, seter
    ClassroomView.tsx           Klassekartet i fullskjerm, til projektoren
    StudentGroups.tsx           Grupper til prosjektarbeid
    MeetingPlanner.tsx          Samtaleuka: skjema, tider og hvem som får dem
    StudentManager.tsx          Legg til/rediger elever (kompakt, for menyen)
    PairHeatmap.tsx             Varmekart over hvem som har sittet sammen
    ContactTeachers.tsx         Kontaktlærerne, og elevene hver av dem har
    Modal.tsx                   Brukes til par-oversikten og kontaktlærerne
    HelpTip.tsx                 Spørsmålstegn som forklarer noe ved siden av seg
  lib/
    app-data.tsx                All delt tilstand (se under)
    classroom.ts                Pult-geometri, merking av flere pulter, låser
    seating.ts                  Fordelingsalgoritmen (simulert herding) + regler,
                                og gruppestørrelsene grupperingen bruker
    meetings.ts                 Samtaletider: klokkeslett, uka, fordelingen
    api.ts                      Datalaget: klasser, elever, kart, par
    local-db.ts                 Lagring i nettleseren (IndexedDB) + sikkerhetskopi
    backup-file.ts              Får sikkerhetskopien ned på maskinen
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

**Kjønn er fargen på setet** (`genderSeatClass`), ikke en prikk foran navnet.
Prikken var to piksler bred, og på et utskrevet kart på pulten forsvant den
helt; fyllet leses på avstand, og plassen prikken tok gikk til navnet. Fyllet er
lyst og ikke mettet: navnet skal stå i vanlig tekstfarge, og et ark med tjue
mettede flater bruker mye blekk. I listene ellers i appen er kjønn fortsatt en
prikk — der er det ingen flate å farge.

**Lerretet må stå stille mens en pult dras.** Både målene (`canvasSize`) og
«Tilpass»-zoomen fryses i `heldRoom` så lenge draget varer, og varselet om
overlappende pulter holdes tilbake av `dragging` i klassesida. Uten det måles
rommet på nytt for hver musebevegelse: `mx-auto` flytter klasserommet sidelengs
når bredden endrer seg, og varselet over lerretet dytter det opp og ned når to
pulter så vidt berører hverandre. Da glir pulten vekk fra markøren, overlappingen
opphører, varselet forsvinner — og det begynner på nytt. Det ser ut som at hele
klasserommet blinker.

Av samme grunn regnes **sluttstillingen ut fra der markøren slippes**, ikke fra
det siste bildet React rakk å tegne.

To ting som lett brekker igjen:

- **Verktøylinja for valgt pult må ligge _under_ pulten.** Over den blir den
  klippet bort av `overflow-x-auto` rundt lerretet og er umulig å klikke.
  `TOOLBAR_ROOM` reserverer plassen i `canvasSize()`.
- **En sluppet pult flyttes bakerst i lista** så den tegnes øverst. Ellers
  blir den liggende skjult under pulten den ble dratt oppå.

#### Utskrift

Klassekartet havner på papir, og der er det navnene som er hele poenget.

- **Utskriften har sin egen skalering.** Skjermens «Tilpass»-zoom er regnet ut
  fra vinduet læreren tilfeldigvis har åpent — arves den til papiret, blir
  kartet like lite som det var på skjermen, og et bredt rom renner ut over
  høyre marg. `printZoom()` måler i stedet rommet mot arket, og forstørrer et
  lite rom i stedet for å la det krype oppe i hjørnet.
- **Zoomen ligger som CSS-variabelen `--zoom` på lerretet**, ikke som en ferdig
  utregnet bredde, nettopp for at `@media print` skal kunne bytte den mot
  `--print-zoom`. Alternativet — å måle om alt i en `beforeprint`-lytter —
  krever at React rekker å tegne på nytt før nettleseren tar bildet av sida, og
  det kan vi ikke love.
- **Arket er A4 liggende.** Et klasserom er bredere enn det er dypt.
  `PRINT_WIDTH`/`PRINT_HEIGHT` er margene minus plassen overskrifta, tavla og
  bunnteksten tar; blir de satt for høyt, sklir kartet over på side to.
- **Overskrifta på papiret er en egen, midtstilt blokk.** Skjermversjonen står
  til venstre i en spalte som er bredere enn arket, og der forsvant klassenavnet
  ut over margen.
- **Skallet legges om til `display: block` i utskrift** (`[data-print-full]`).
  Som flex-rad med menya borte fikk kartet en smalere spalte enn arket, og lå
  usentrert i den.

#### Flere merkede pulter

Læreren kan merke flere bord — shift-klikk på topplinja, eller en ramme dratt
over tomt lerret — og rette dem inn samlet med `alignDesks` og
`distributeDesks`. Det er til for rekker: å dra seks bord på linje for hånd er
et pirkearbeid ingen orker.

- **Verktøylinja for flere merkede ligger over lerretet**, ikke under utvalget.
  Sentrert under en rekke ute ved kanten ville den blitt klippet av
  rullefeltet, og der er det ingen `TOOLBAR_ROOM` å reservere.
- **Draget regnes fra der pultene sto da det startet** (`moveDesksFrom`), ikke
  fra forrige bilde. Ellers samler avrundingen seg opp og pultene sklir fra
  hverandre mens de dras.
- **Avstanden i `distributeDesks` måles mellom pultkantene**, ikke mellom
  midtpunktene. Klassene sitter i læringspar og treerbord om hverandre, og med
  midtpunkter ville en rekke med begge deler sett skjev ut.
- **`alignDesks` og `distributeDesks` jobber rad for rad**, ikke på utvalget
  under ett. `bands()` deler de merkede pultene etter hvor de står. Ga vi alle
  sammen samme y, ville et merket felt fått radene lagt rett oppå hverandre —
  og en fordeling langs én akse ville flettet radene til en trapp.
- **Linja legges på medianen av midtpunktene.** Ytterpunktet ville latt én
  skjev pult dra hele rekka med seg; med medianen blir de fleste stående. Det
  er midtpunktene og ikke kantene som rettes inn, så en firergruppe blant
  topulter står midt i rekka.

#### Låste plasser

Hengelåsen ved et elevnavn låser eleven til setet: `class.locked_seats` er
`{ elevId: { desk_id, index } }`. Låsen hører til klasserommet og ikke til
kartet — det er hele poenget, den skal overleve neste generering.

`generateSeatingChart` tar imot de låste som `pinned` og setter dem ved pulten
sin *før* herdingen, og holder dem utenfor byttene. En straff i kostfunksjonen
ville bare gjort det dyrt å flytte dem, ikke umulig.

Låsene peker på pulter og seter som kan forsvinne. `validLocks` kaster dem som
ikke lenger stemmer, og `applyDesks` skriver låser og pulter i **samme**
endring — ellers ville en lås til en fjernet pult blitt liggende usynlig og
holdt eleven utenfor fordelingen for godt.

#### Hvem som ikke skal sitte sammen

`apart_pairs` er elevpar læreren har bestemt at ikke skal settes ved samme bord.
**«Sammen» betyr samme bord**, slik resten av appen regner par — par-historikken
og varmekartet teller to elever som sammen når de sitter ved samme pult. En
finere naboskapsmodell (sidemann kontra diagonalt ved en firergruppe) ville ikke
stemt med noe annet i appen.

Regelen er en straff i kostfunksjonen på `APART_PENALTY = 1000` — tyngre enn all
par-historikk til sammen, uansett hvor lenge klassen har vært i gang. Den er
altså *myk*: er reglene umulige, får du et kart som bryter en av dem. Derfor
prøves fordelingen på nytt inntil `APART_ATTEMPTS` ganger, og det som står igjen
rapporteres som `brokenRules` og vises for læreren. Et kart som ser riktig ut
uten å være det, er verre enn ingen regel.

Manuelle flyttinger **advares om, ikke nektes**: bryter læreren en regel for
hånd, får bordet rød ramme og et merke. I øyeblikket er det læreren som vet
best.

### Klassekart og historikk

`seating_charts.layout` er `{ pultId: [elevId | null, ...] }` — én plass per
sete, `null` for ledig, slik at en elev kan sitte på plass to selv om plass én
er tom.

`pair_history` teller hvor mange ganger hvert elevpar har sittet sammen, og
er det algoritmen bruker for å spre elevene. **Manuelle flyttinger justerer
den** (`adjustPairHistory`): par som forsvinner telles ned, nye telles opp.
Uten det ville varmekartet vist parene slik de var da kartet ble generert.

### Grupper til prosjektarbeid

`groups` er lagrede gruppeinndelinger: `{ id, class_id, name, groups: string[][] }`.
De hører til klassen og ikke til klasserommet — en gruppe har ingen pult og
intet sete, og en inndeling flytter ingen elever i klassekartet.

Fordelingen er den samme algoritmen som kartet (`suggestGroups` kaller
`generateSeatingChart` med gruppestørrelser i stedet for pultplasser), så
elever som ofte har sittet sammen havner i hver sin gruppe, og reglene om hvem
som ikke skal sitte sammen gjelder også her.

- **Gruppene telles ikke i par-historikken.** Historikken svarer på «hvem har
  sittet sammen ved bordet», og et prosjekt er ikke et sete. Talte vi begge
  deler i samme tall, ville varmekartet sagt noe annet enn det det påstår.
  `suggestGroups` leser derfor historikken gjennom `read()` og skriver ingenting.
- **`groupSizes` gjør gruppene jevne**, ikke like store med en rest til slutt:
  30 elever i firergrupper blir seks firere og to treere. En elev som blir
  alene igjen har ingen å samarbeide med, og det var nettopp poenget.
- **Elever som kom til etterpå står som «ikke plassert»**, ikke skjult. En
  lagret inndeling kan være eldre enn den nyeste eleven i klassen.
- **Elever flyttes på to måter, og begge må bli stående.** Navnet kan dras til
  en annen gruppe — slippes det på en elev, bytter de to — slik elevkortene
  dras i klasserommet. Klikkveien (velg navn, velg gruppe) er tastaturveien:
  et drag kan ingen gjøre med tastaturet, så fjernes den, blir gruppene umulige
  å endre uten mus.
- **Flagget som skiller drag fra klikk nullstilles ved `pointerdown`**, ikke i
  klikket. Slippes navnet utenfor knappen det ble tatt fra, kommer det aldri
  noe klikk — og det neste ekte klikket ville blitt spist.

### Samtaler

`meetings` er samtaleoppsett: én runde med elevsamtaler eller utviklingssamtaler,
med skjemaet tidene lages av og tidene selv. Oppsettet hører til klassen og ikke
til klasserommet — en samtale har ingen pult og intet sete.

Læreren setter et skjema (fra 08.30 til 17.00, mandag til fredag, tjue eller
tretti minutter om gangen), lager tidene av det, og fordeler elevene på dem.
Etterpå justeres enkelttider for hånd, for det er slik en samtaleuke blir: de
fleste tar tida de får, og et par familier kan bare tirsdag klokka halv fem.

- **Oppsettet gjelder én kontaktlærer om gangen** (`plan.teacher`). En klasse har
  gjerne to som tar hver sine samtaler, og da er det egne elever læreren skal
  sette opp. Utvalget følger navnet i `contact_teacher` på eleven, sammenlignet
  med `teacherKey()` som ellers i appen, og tom streng er «alle i klassen». Et
  nytt oppsett arver klassens standard kontaktlærer — men bare når noen elever
  faktisk har hen, ellers ville uka blitt tom.
- **Nedtrekkslista tilbyr bare lærere som har elever i klassen.** Hele lista over
  kontaktlærere i programmet ville latt læreren velge et utvalg uten elever.
- **Et bytte av kontaktlærer sletter ingen tider.** Elever fra det forrige
  utvalget blir stående — de kan være avtalt — men telles ikke med, og det står
  en linje om hvorfor navn utenfor lista opptar tider.
- **Tidene lagres som egne rader**, ikke regnes ut av skjemaet hver gang. En tid
  læreren har flyttet for hånd er avtalt med noen, og ville ellers blitt
  overskrevet neste gang lengden ble endret.
- **Fordelingen går på rundgang mellom dagene** (`fillSlots`). Et skjema fra
  08.30 til 17.00 har plass til sytten samtaler på én dag; fylte vi dagen før vi
  gikk videre, fikk læreren sytten samtaler på rad på mandag og tre på tirsdag.
  Ingen holder ut en slik dag.
- **`refill` lar hver elev beholde dagen sin** når tidene lages på nytt. Dagen er
  det første de foresatte skriver ned, og en endring fra 20 til 30 minutter skal
  flytte klokkeslettene, ikke halve klassen til en annen ukedag.
- **En merknad på en tid setter den av**: fordelingen hopper over tider med
  merknad, og det er slik en pause eller et annet møte blokkeres i skjemaet.
- **Eleven velges i en nedtrekksliste, ikke ved å dras.** Samme avveining som i
  gruppene, men den faller motsatt vei her: en tid er en rad i et skjema, ikke et
  sete i et rom. Lista virker likt med mus, fingre og tastatur, og trenger ingen
  egen tastaturvei ved siden av.
- **Oppsettet lagres av seg selv**, med 400 ms forsinkelse, som pultene. En
  samtaleuke settes opp over flere økter, og en «Lagre»-knapp læreren rekker å gå
  fra ville kostet hele uka.
- **Oppsettet som vises er utledet**, ikke satt i en effekt: det læreren har
  åpnet, ellers det nyeste. Hører utkastet til en annen klasse, er vi kommet hit
  fra menya, og klassens egne oppsett gjelder.
- **Arket er en egen blokk**, ikke redigeringen med feltene skrudd av. På papiret
  er det tida og navnet som er hele poenget, og en side full av nedtrekkslister
  og «fjern»-kryss er ikke til å lese. Dagene ligger side om side, og A4 liggende
  fra utskriftsreglene passer fem spalter.
- **Egen side og ikke et vindu.** Skjemaet er en uke bredt, og læreren blir
  sittende i det en stund av gangen.
- **Feltene med hjelpetekst peker på feltet med `htmlFor`.** En `<label>` som
  omslutter både spørsmålstegnet og feltet gir navnet sitt til knappen, som
  kommer først, og feltet blir stående uten navn for skjermlesere.

Tider som ligger oppå hverandre (`clashingSlots`) får rød ramme og et varsel.
Skjemaet lager dem aldri selv, men en tid som er flyttet for hånd kan havne midt
i den neste — og to samtaler klokka 15.00 må læreren få vite om før arket henges
opp.

### Fullskjermvisningen

«Vis klassekart» legger kartet over hele skjermen til projektoren, og er en
**egen komponent** (`ClassroomView`) og ikke lerretet med verktøyene skrudd av.
`ClassroomCanvas` er en editor: setene er knapper som kan dras, pultene har
håndtak, og zoomen er tilpasset spalta ved siden av menya. På storskjermen skal
kartet fylle både bredden og høyden, og ingenting skal kunne endres ved et uhell
mens klassen ser på. Å bygge begge deler inn i samme komponent ville betydd en
`readOnly`-flagg gjennom tusen linjer.

Visningen ber om ekte fullskjerm (`requestFullscreen`), for det er fanelinja og
adressefeltet som stjeler plassen på en projektor. Sier nettleseren nei — Safari
på iPad gjør det — ligger overlegget uansett over hele vinduet. Lukker brukeren
fullskjermen med F11, følger visningen etter, ellers ville den blitt liggende
igjen i et vanlig vindu.

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

Versjon 2 la til `contact_teachers`. En kopi fra versjon 1 har ikke feltet, og
da bygges lista av navnene som står på elevene og klassene — det er alt vi vet
om hvem lærerne er.

Versjon 3 la til `locked_seats` på klassene. Eldre kopier mangler feltet, og
leses som «ingen låser».

Versjon 4 la til `apart_pairs`. Eldre kopier mangler lista, og leses som «ingen
regler».

Versjon 5 la til `groups` — lagrede gruppeinndelinger. Eldre kopier mangler
lista, og leses som «ingen grupper».

Versjon 6 la til `meetings` — samtaleoppsett. Eldre kopier mangler lista, og
leses som «ingen samtaler». `normalizePlan()` fyller inn felter som mangler i et
enkelt oppsett, og kaster oppsett som ikke er til å lese — et skjema uten dager
eller med lengde 0 ville ellers veltet samtalesida.

`replaceAll()` må skrive **alle** listene. Reglene, gruppene og samtalene hører
til de samme klassene som resten; ble de ikke erstattet, ble de liggende igjen
fra datasettet kopien nettopp tok over for, og pekte på elever som ikke finnes.

**Sikkerhetskopien er hele datasettet, ikke én klasse.** Derfor står det ikke
noe klassenavn i filnavnet, og derfor erstatter `replaceAll()` alt ved import.
Skal én klasse kunne tas ut for seg, holder det ikke å filtrere ved lagring —
importen må da kunne slå sammen i stedet for å erstatte, og håndtere
id-kollisjoner og par-historikk.

`saveTextToFile()` i `backup-file.ts` prøver «Lagre som»-vinduet
(`showSaveFilePicker`) først, så læreren ser hvor fila havner. Safari og
Firefox har det ikke, og da faller den tilbake til vanlig nedlasting. At
brukeren lukker vinduet uten å velge noe er ikke en feil — det kommer som
`SaveCancelled`, og skal ikke gi noen feilmelding.

### Kontaktlærere

`contact_teachers` er en flat liste med navn, felles for alle klasser. Elevens
`contact_teacher` peker på **navnet**, ikke på en id. Det gjør at navn som alt
sto på elevene virker uten migrering; til gjengjeld må `renameContactTeacher`
skrive om elevene i samme endring, ellers blir de hengende igjen hos en lærer
som ikke finnes.

Navn sammenlignes alltid gjennom `teacherKey()` (trimmet, små bokstaver). Uten
den ville «Kari Nordmann» og «kari nordmann» vært to lærere, og oversikten over
hvem som har hvilke elever sprukket. Derfor er feltet i elevvisningen også en
nedtrekksliste og ikke fritekst.

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
