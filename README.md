# Klassekart

Enkelt verktøy for lærere til å generere klassekart (bordgrupper), holde
oversikt over hvilke elever som har sittet sammen og hvor ofte, og notere
hvem som er kontaktlærer for de ulike elevene.

## Funksjoner

- **Klasser** – opprett en eller flere klasser, med en valgfri
  standard-kontaktlærer.
- **Elever** – legg til flere elever samtidig (ett navn per linje), og sett
  kontaktlærer per elev direkte i skjemaet der du legger dem inn (klassen kan
  ha flere kontaktlærere for ulike elever). Kjønn er valgfritt: oppgir du det,
  får eleven en fargeprikk, men fordelingen bruker det ikke.
- **Generer klassekart** – fordeler elevene i bordgrupper. Algoritmen
  (`src/lib/seating.ts`) bruker simulert herding for å minimere hvor mange
  ganger de samme elevene havner sammen igjen, basert på lagret historikk –
  så den unngår å gjenta de samme gruppene gang på gang.
- **Oversikt over par** – en varmekart-matrise som viser hvor mange ganger
  hvert elevpar har sittet sammen. Historikken kan nullstilles ved
  skoleårsslutt, så neste kart fordeler elevene med blanke ark.
- **Tidligere kart** – bla gjennom tidligere genererte klassekart, og slett
  dem enkeltvis. Parene et slettet kart bidro med telles ned igjen, så
  oversikten over par stemmer med kartene som faktisk finnes.
- **Tilpass visningen** – hele klasserommet skaleres til skjermbredden, med
  egne zoom-knapper. Hver pult kan dras til sin egen størrelse i hjørnet nede
  til høyre.
- **Skriv ut** – klassekartet skrives ut uten meny og verktøylinjer, og i lyse
  farger også for de som bruker mørk modus.

Appen kan brukes med tastatur alene: Enter på et sete løfter eleven, Enter på
et annet sete bytter dem, piltastene flytter en valgt pult, og piltastene på
størrelseshåndtaket endrer bredde og høyde.

## Teknologi

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- IndexedDB i nettleseren for lagring – ingen database, ingen server

## Kom i gang

```bash
npm install
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000). Det er alt – appen
trenger ingen miljøvariabler og ingen database. Deploy er en vanlig
Next.js-deploy, for eksempel til [Vercel](https://vercel.com).

## Hvor lagres dataene?

Alt du legger inn – klasser, elever, klassekart og par-historikk – lagres i
**din egen nettleser** (IndexedDB), på maskinen du bruker. Ingenting sendes
til en server, og ingen andre kan se det.

Det har to konsekvenser:

- **Ta sikkerhetskopi.** Nederst i menyen ligger *Lagre kopi til fil*, som
  laster ned alt som én JSON-fil, og *Hent inn fra fil*, som leser den
  tilbake. Tømmer du nettleserdata eller bytter maskin uten en slik kopi, er
  klassene borte.
- **Ingen synk.** Skole-PC-en og hjemme-PC-en har hver sin lagring. Filen fra
  *Lagre kopi til fil* er måten å flytte dataene mellom dem.

Kopien inneholder elevnavnene i klartekst, så den hører hjemme der skolen
ellers lagrer elevopplysninger.

Appen har en egen personvernside på `/personvern` (lenket fra bunnteksten) som
sier det samme til læreren som bruker den.
[`docs/personvern.md`](./docs/personvern.md) er den lange versjonen: hvorfor
lagringen er lokal, og hva som må på plass hvis appen en dag skal brukes av
lærere ved andre skoler.

## Prosjektstruktur

```
src/
  app/
    layout.tsx                 Rot-layout: fonter, metadata, AppShell
    page.tsx                   Startside: oppretter første klasse
    klasser/[classId]/page.tsx Klassedetalj: klasserom, generering, utskrift
    globals.css                Fargevariabler, fokusstiler, utskriftsstiler
  components/
    AppShell.tsx               Meny + innhold + bunntekst (meny som skuff på mobil)
    Sidebar.tsx                Klasseliste og verktøy for aktiv klasse
    ClassroomCanvas.tsx        Pultene og elevene, med dra-og-slipp og tastatur
    StudentManager.tsx         Legg til / rediger elever
    PairHeatmap.tsx            Varmekart over elevpar
    Modal.tsx                  Dialog med fokusfelle
    ConfirmDialog.tsx          Bekreftelse før noe slettes
    AboutModal.tsx             «Om Klassekart»
    NewClassForm.tsx           Skjema for ny klasse (meny + startside)
    Footer.tsx                 Bunntekst
  lib/
    seating.ts                 Algoritme for å generere klassekart
    classroom.ts               Pultgeometri og oppstilling
    api.ts                     Datalaget appen bruker (klasser, elever, kart)
    local-db.ts                Lagring i nettleseren + eksport/import
    ui.ts                      Delte knappe- og feltstiler
    gender.ts                  Kjønnsetiketter og -farger
    types.ts                   Delte TypeScript-typer
docs/
  personvern.md                Personvern: hva som lagres, og hvorfor lokalt
```
