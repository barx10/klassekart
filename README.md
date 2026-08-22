# Klassekart

Enkelt verktøy for lærere til å generere klassekart (bordgrupper), holde
oversikt over hvilke elever som har sittet sammen og hvor ofte, og notere
hvem som er kontaktlærer for de ulike elevene.

## Funksjoner

- **Klasser** – opprett en eller flere klasser, med en valgfri
  standard-kontaktlærer.
- **Elever** – legg til flere elever samtidig (ett navn per linje), sett
  kjønn (jente/gutt/annet) og kontaktlærer per elev direkte i skjemaet der du
  legger dem inn (klassen kan ha flere kontaktlærere for ulike elever).
- **Generer klassekart** – fordeler elevene i bordgrupper. Algoritmen
  (`src/lib/seating.ts`) bruker simulert herding for å minimere hvor mange
  ganger de samme elevene havner sammen igjen, basert på lagret historikk –
  så den unngår å gjenta de samme gruppene gang på gang.
- **Oversikt over par** – en varmekart-matrise som viser hvor mange ganger
  hvert elevpar har sittet sammen.
- **Tidligere kart** – bla gjennom tidligere genererte klassekart.

## Teknologi

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Supabase](https://supabase.com) (Postgres) for lagring

## Kom i gang

### 1. Opprett en Supabase-database

1. Gå til [supabase.com](https://supabase.com) og opprett et gratis prosjekt
   (du kan også bruke [Neon](https://neon.tech) rå-Postgres – da kjører du
   `supabase/schema.sql` mot Neon-databasen din med `psql` og bytter ut
   `src/lib/supabase.ts`/`src/lib/api.ts` med et REST-lag mot Neon i stedet,
   siden Neon ikke har en ferdig klient-SDK slik Supabase har).
2. Åpne **SQL Editor** i Supabase-prosjektet og kjør innholdet i
   [`supabase/schema.sql`](./supabase/schema.sql). Dette oppretter tabellene
   `classes`, `students`, `seating_charts` og `pair_history`.
3. Gå til **Project Settings → API** og kopier **Project URL** og
   **anon public key**.

### 2. Sett opp miljøvariabler

```bash
cp .env.example .env.local
```

Fyll inn `NEXT_PUBLIC_SUPABASE_URL` og `NEXT_PUBLIC_SUPABASE_ANON_KEY` i
`.env.local` med verdiene fra steg 1.

### 3. Installer og kjør lokalt

```bash
npm install
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000).

### 4. Deploy

Appen er en vanlig Next.js-app og kan deployes f.eks. til
[Vercel](https://vercel.com): koble til repoet og legg inn de samme
miljøvariablene (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
under prosjektets **Environment Variables**.

## Om tilgang/sikkerhet

MVP-en har ingen innlogging – alle som har lenken til appen (og
Supabase-nøkkelen den er bygget med) kan lese og endre alle klasser. Dette
er greit for en enkelt lærer som bruker appen selv, men bør utvides med
ekte pålogging (f.eks. Supabase Auth) og radnivå-sikkerhet
(`auth.uid()`-baserte policyer i `supabase/schema.sql`) før den deles med
flere lærere eller gjøres offentlig tilgjengelig.

## Prosjektstruktur

```
src/
  app/
    page.tsx                  Klasseoversikt (dashboard)
    klasser/[classId]/page.tsx Klassedetalj: elever, generering, oversikt
  components/                 UI-komponenter (elevliste, klassekart, varmekart, ...)
  lib/
    seating.ts                 Algoritme for å generere klassekart
    api.ts                     Datalag mot Supabase
    supabase.ts                Supabase-klient
    types.ts                   Delte TypeScript-typer
supabase/
  schema.sql                   Database-skjema
```
