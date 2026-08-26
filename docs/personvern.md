# Personvern og GDPR i Klassekart

Klassekart lagrer navn på barn. Da er det ikke nok at det virker – det må også
være lov. Dette dokumentet er planen: hva appen behandler i dag, hvem som er
ansvarlig for hva, hvilke veier vi kan gå, og hva som konkret må gjøres i
Supabase og i koden.

Kort oppsummert:

**Skalaen avgjør.** Klassekart er tenkt til deg og et par kolleger, ikke som
en tjeneste andre skoler skal kjøpe. Da er svaret et annet enn for et produkt:
dropp databasen, lagre alt i nettleseren, og hele leverandør-siden av GDPR
forsvinner – ingen databehandleravtale, ingen underleverandører, ingen
innlogging å vedlikeholde.

| Trinn | Hva | Status |
| --- | --- | --- |
| 0 | Ingen ekte elevnavn i sky-databasen | ✅ appen sier fra i «Om Klassekart» |
| 1 | Flytt lagringen til nettleseren, med eksport/import som sikkerhetskopi | ✅ bygget |
| 1b | Slett Supabase-prosjektet når du har hentet ut det du vil beholde | ⬜ du må gjøre dette selv |
| 2 | Dataminimering: kjønn valgfritt, par-historikk kan nullstilles | ✅ bygget |
| 3 | Personvernside i appen | ✅ `/personvern` |
| 4 | Si fra til rektor at du bruker verktøyet, på linje med et regneark | ⬜ |
| 5 | Innlogging, databehandleravtale, DPIA — *bare* hvis appen en dag skal ut til andre skoler | ikke nå |

Trinn 1–2 er kode. Trinn 3 er en samtale, ikke en avtalerunde. Merk at
**lokal lagring ikke gjør deg fri fra GDPR** – det er fortsatt kommunen som er
ansvarlig for elevopplysningene, og du behandler dem som ansatt. Men det
flytter appen fra «ny skytjeneste kommunen må vurdere» til «verktøy på
skole-PC-en», og det er en helt annen bakke å gå opp.

## 1. Hva appen behandler

| Data | Personopplysning? |
| --- | --- |
| Klassenavn | Indirekte – «7B Fjellheim skole» peker på en bestemt gruppe barn |
| Elevnavn | Ja, om barn |
| Kjønn | Ja |
| Kontaktlærer | Ja, om ansatt |
| Klassekart – hvem som satt hvor, når | Ja |
| Par-historikk | Ja – en liten sosial kartlegging av klassen over tid |

Alt dette ligger nå i nettleseren til den som skrev det inn (IndexedDB), og
sendes ingen steder.

**Slik var det ikke før.** Fram til denne endringen lå dataene i en
Supabase-database uten innlogging: anon-nøkkelen sendes ut i JavaScript-en til
alle som besøker siden, og RLS-policyene var `using (true) with check (true)`.
Alle som fant adressen til appen kunne lese, endre og slette alle klasser og
alle elever. Nøkkelen er ikke en hemmelighet — den er ment å være offentlig, og
det er RLS som skal gjøre jobben.

**Gjenstår derfor: slett Supabase-prosjektet.** Så lenge det står der, står
dataene i det også. Vil du ha dem med over i den lokale lagringen, kjør denne i
SQL Editor, lagre svaret som en `.json`-fil, og bruk *Hent inn fra fil* i menyen:

```sql
select jsonb_build_object(
  'version', 1,
  'classes',  (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from classes c),
  'students', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from students s),
  'charts',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from seating_charts x),
  'pairs',    (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from pair_history p)
);
```

Uansett gjelder fortsatt rådet fra **trinn 0**: legg ikke inn fulle elevnavn. Fornavn, forbokstav eller kallenavn gjør appen like brukbar til
klassekart, og gjør et eventuelt innbrudd langt mindre alvorlig.

## 2. Hvem er ansvarlig for hva

- **Behandlingsansvarlig: skolen / kommunen (skoleeier).** Bruken skjer i
  opplæringen, så det er kommunen som må ha behandlingsgrunnlag og som svarer
  overfor Datatilsynet.
- **Behandlingsgrunnlag: GDPR art. 6 nr. 1 bokstav e** – nødvendig for å utøve
  offentlig myndighet, med opplæringslova som supplerende rettsgrunnlag.
  **Ikke samtykke**: et samtykke fra foresatte til et verktøy læreren bruker i
  klasserommet er ikke reelt frivillig, og faller fort sammen.
- **Databehandler: du / Lærerliv**, som leverer tjenesten.
- **Underdatabehandlere: Supabase** (database) og **Vercel** (hosting).

Dette gjelder også når du bare bruker appen på dine egne elever. Du er ansatt i
kommunen, og kommunen er ansvarlig for verktøyene som brukes på elevdata.
Datatilsynets brevkontroll med skolesektoren pekte nettopp på verktøy tatt i
bruk uten at skoleeier har vurdert dem («skygge-IT») som et hovedfunn. Snakk
med rektor og kommunens personvernombud før ekte navn legges inn.

## 3. Tre veier videre

### A. Alt lokalt i nettleseren *(dette er bygget)*
Data lagres i IndexedDB på lærerens maskin, med eksport/import av en JSON-fil
som sikkerhetskopi og som måte å flytte mellom enheter.

- ✅ Ingen elevnavn forlater maskinen. Du blir ikke databehandler, og trinn 3
  krymper til «samme regler som et regneark på skole-PC-en».
- ✅ Ingen databaseregning, ingen underleverandører å dokumentere.
- ❌ Ingen synk mellom skole-PC og hjemme-PC. Tømmer læreren nettleserdata,
  er alt borte.
- 🔨 Arbeid: middels. `src/lib/api.ts` er allerede eneste stedet som snakker
  med databasen, så det er den ene modulen som må få en lokal variant.

### B. Pseudonymer i skyen
Databasen lagrer bare «Elev 1», «AB» eller et kallenavn. Koblingen mellom
pseudonym og ekte navn ligger lokalt hos læreren.

- ✅ Et innbrudd gir lite. Vesentlig lavere risiko i en ROS.
- ❌ Juridisk fortsatt personopplysninger (indirekte identifiserbare), så
  papirarbeidet forsvinner ikke helt.
- ❌ Mest kompleks av de tre: to lagringssteder som må holdes i synk.

### C. Sky med innlogging
Supabase Auth, `owner_id` på klassene og RLS som gjør at hver lærer bare ser
sine egne data.

- ✅ Den vanlige, forventede løsningen. Synk mellom enheter, deling med
  kollegaer senere, og det som må til for at flere enn deg kan bruke appen.
- ❌ Krever hele trinn 3: databehandleravtale med hver kommune, DPIA, og en
  leverandør (deg) som må svare på innsyn, sletting og avvik.

**Anbefaling for denne bruken: A.** Med deg og et par kolleger gir skyen deg
lite du faktisk trenger, og til gjengjeld alt som er tungt: en åpen database å
sikre, en innlogging å vedlikeholde, en avtale å signere med hver kommune, og
en leverandørrolle der du må svare på innsyn, sletting og avvik. Ingen av
delene løser et problem dere har. Kollegene deler ikke klasser med hverandre
uansett – de har sine egne.

C er riktig svar den dagen appen skal ut til skoler du ikke jobber på. Da er
seksjon 4 og 5 oppskriften. Fram til da er de en plan for framtida, ikke en
arbeidsliste.

**Men «lokalt» er ikke det samme som «trygt».** Det som faktisk må håndteres
med A — punkt én er løst med *Lagre kopi til fil* nederst i menyen, resten er
rutine hos deg:

- **Ingen sikkerhetskopi.** Tømmer nettleseren data — eller får du ny PC —
  er alt borte. Lagre en kopi jevnlig, og legg fila der skolen allerede lagrer
  elevopplysninger (OneDrive/Teams-området deres), som er godkjent fra før.
- **Delt maskin.** Data ligger i nettleserprofilen. Låner noen den innloggede
  Windows-brukeren din, ser de også klasselistene. Egen brukerkonto på PC-en,
  som ellers.
- **Eksportfila er personopplysninger.** Skal en kollega ha oppsettet ditt,
  ikke send fila på privat e-post — den inneholder de samme navnene.
- **Nettleserdata kan ryddes automatisk.** Enkelte skole-PC-er er satt opp til
  å slette nettleserdata ved utlogging. Sjekk det før du legger inn et helt
  skoleår med historikk.

## 4. Innlogging – slik ser det ut

> Denne seksjonen og den neste gjelder vei **C**, altså hvis appen en dag skal
> brukes av lærere utenfor din egen skole. Slik appen står i dag, er dette en
> plan for framtida — hopp til seksjon 6.
>
> Det gamle databaseskjemaet ligger i git-historikken:
> `git show e0df26a:supabase/schema.sql`.

### Hvilken innloggingsmetode?

| | Passer når | Kostnad i arbeid |
| --- | --- | --- |
| **Supabase Auth, magisk lenke på e-post** | Nå. Ingen passord å oppbevare eller lekke. | Lav – innebygd |
| **Microsoft Entra ID** (skolens Office-konto) | Når en skole vil ha «logg inn med jobbkontoen» | Middels – OAuth-provider i Supabase, men hver kommune må registrere appen hos seg |
| **Feide** | Riktig identitet og skoletilhørighet, og standarden i skole-Norge | Høy – tjenesteavtale med Sikt, og hver kommune må åpne for tjenesten. Realistisk først når noen faktisk skal ta appen i bruk i drift |

Start med magisk lenke. Feide er målet den dagen en kommune sier ja.

### Datamodell

Bare `classes` trenger en eier. Alt annet henger på `class_id` og arver
tilgangen gjennom den – det holder RLS-policyene enkle og gjør at ingenting
kan «lekke» ved at en rad glemmer eieren sin.

```sql
alter table classes add column if not exists owner_id uuid references auth.users(id) on delete cascade;
create index if not exists classes_owner_id_idx on classes(owner_id);

-- Bytt ut alle "Allow all"-policyene med eier-sjekk:
drop policy if exists "Allow all on classes" on classes;
create policy "Egne klasser" on classes for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Allow all on students" on students;
create policy "Elever i egne klasser" on students for all
  using (exists (select 1 from classes c where c.id = students.class_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from classes c where c.id = students.class_id and c.owner_id = auth.uid()));
-- tilsvarende for seating_charts og pair_history

-- anon-rollen skal ikke lenger nå tabellene i det hele tatt:
revoke select, insert, update, delete on all tables in schema public from anon;
```

**Denne migreringen er ikke bakoverkompatibel.** Eksisterende rader har ingen
`owner_id` og blir usynlige for alle. Enten slettes de (de er testdata), eller
så settes `owner_id` manuelt til din egen bruker-id etter at du har logget inn
første gang. Filen må kjøres i Supabase SQL Editor – det skjer ikke
automatisk ved deploy.

### I koden

- En `/logg-inn`-side som ber om e-post og kaller
  `supabase.auth.signInWithOtp()`.
- `AppDataProvider` venter på `supabase.auth.getSession()` før den henter data,
  og lytter på `onAuthStateChange`. Uten session vises innloggingssiden i
  stedet for klasserommet.
- `createClass()` i `api.ts` setter `owner_id` fra sesjonen.
- Logg ut-knapp i menyen.

### Mange brukere – hva skjer da?

- **Hver lærer ser bare sine egne klasser.** Det er RLS som håndhever det, ikke
  koden i nettleseren, så en feil i frontend-en kan ikke gi tilgang til andres
  data.
- **Skal flere kontaktlærere dele en klasse**, legges det til en
  `class_members`-tabell (`class_id`, `user_id`, `rolle`), og policyene
  sjekker medlemskap i stedet for eierskap. Ikke bygg dette før noen ber om
  det – det dobler kompleksiteten i policyene.
- **Åpen registrering betyr at du blir databehandler for ukjente skoler.**
  Hold pilotfasen på invitasjon: en `allowed_emails`-tabell, eller manuell
  opprettelse av brukere i Supabase-konsollen.
- **E-post:** Supabase sin innebygde e-postutsending er rate-begrenset og ment
  for testing. Magiske lenker i reell bruk krever egen SMTP (Resend, Postmark
  eller lignende).
- **Kostnad:** et gratisprosjekt pauses ved inaktivitet og har begrenset
  backup. Ekte bruk hører hjemme på et betalt prosjekt – også fordi
  sikkerhetskopi og loggkontroll er en del av kravene i art. 32.

## 5. Lagring i Supabase – konkrete grep

- **EU-region.** Regionen velges når prosjektet opprettes og kan ikke endres
  etterpå. Står dagens prosjekt i USA, må det opprettes et nytt i Frankfurt
  eller Stockholm og dataene migreres. Sjekk dette *før* trinn 1, så
  migreringen bare gjøres én gang.
- **Amerikansk leverandør.** Supabase er et amerikansk selskap, og EU-hosting
  fjerner ikke diskusjonen om amerikansk lovgivning (CLOUD Act). Det må stå i
  risikovurderingen, og noen kommuner sier nei på dette grunnlaget alene. Blir
  det en blokker, er en EU-eid Postgres-leverandør alternativet – appen
  snakker vanlig Postgres, så byttet er overkommelig.
- **Signer databehandleravtalen** med Supabase (`supabase.com/legal/dpa`) og
  med Vercel, og ta vare på underleverandørlistene deres. Du trenger dem for å
  kunne liste opp underdatabehandlere i din egen avtale med kommunen.
- **`service_role`-nøkkelen skal aldri inn i klientkoden.** Bare
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` hører hjemme i nettleseren.
- **Logger og sikkerhetskopier er også personopplysninger.** Supabase-loggene
  inneholder IP-adresser. Skru av det som ikke trengs, og skriv ned hvor lenge
  sikkerhetskopiene beholdes.
- **Sletting.** `on delete cascade` er allerede på plass, så en slettet klasse
  tar med seg elever, kart og par-historikk. Det som mangler er en rutine:
  slett klassen når skoleåret er over, eventuelt automatisk etter X måneder
  uten aktivitet.

## 6. Dataminimering – det billigste tiltaket

Det du ikke lagrer, trenger du ikke sikre, dokumentere eller slette.

- **Kjønn er valgfritt** *(bygget)*. Algoritmen i `src/lib/seating.ts` ser
  ikke på feltet i det hele tatt – det er bare en farget prikk. Nå står det
  tomt som standard, og en elev uten oppgitt kjønn får ingen prikk. Da lagres
  opplysningen heller ikke.
- **Fornavn holder.** Eventuelt fornavn + forbokstav der to elever heter det
  samme. Et klassekart trenger ikke fullt navn.
- **Kontaktlærer** kan være initialer. Navnene står nå i en egen liste
  (`contact_teachers`) og ikke bare på hver elev, så de er også med i
  sikkerhetskopien — men de er navn på voksne kolleger, ikke på barn, og
  ligger som alt annet bare i denne nettleseren.
- **Par-historikk** nullstilles fra *Oversikt over par → Nullstill
  historikken* *(bygget)*. Gjør det ved skoleårets slutt – tellingene er bare
  interessante for inneværende klasse.

## 7. Papirene som må på plass før ekte bruk

**Med lokal lagring (vei A) faller det meste av dette bort.** Du er ikke
databehandler for noen, det er ingen underleverandører å liste opp, og det er
ingenting å signere. Det som står igjen er å si fra til rektor at du bruker
verktøyet — samme plikt som for et regneark med klasselista i — og å slette
dataene når skoleåret er over.

Lista under gjelder vei C, altså hvis appen skal ut til andre skoler. Det er
kommunens ansvar, men det er du som må levere underlaget:

- [ ] **Databehandleravtale** mellom kommunen og deg/Lærerliv. Bruk KS SkoleSec
      sin standardavtale – kommunene kjenner den igjen, og det korter ned
      runden betraktelig.
- [ ] **DPIA / risikovurdering.** Elevdata er data om barn, altså en sårbar
      gruppe. Regn med at kommunen krever en DPIA; KS SkoleSec har maler.
- [ ] **Oversikt over underdatabehandlere** (Supabase, Vercel, SMTP-leverandør)
      med land og formål.
- [ ] **Informasjon til elever og foresatte** om hva som lagres og hvor lenge.
- [ ] **Personvernerklæring i appen**, med kontaktadresse.
- [ ] **Rutine for avvik** – melding til behandlingsansvarlig uten ugrunnet
      opphold, kommunen har 72 timer på seg til Datatilsynet.
- [ ] **Rutine for innsyn, retting og sletting**, og hvor lenge data beholdes.
- [ ] **Godkjenning fra rektor / personvernombud / skoleeier** før første ekte
      elevnavn legges inn.

## 8. Rekkefølge

1. ✅ Skriv i appen at den ikke er klar for fulle navn ennå *(se «Om
   Klassekart»)*.
2. ✅ Bytt lagringen til nettleseren, med eksport og import av en JSON-fil.
   `src/lib/local-db.ts` er lagringen, `src/lib/api.ts` er laget over —
   resten av appen merket ingen forskjell.
3. ⬜ Hent ut det du vil beholde fra Supabase (SQL-en i seksjon 1), og slett
   så prosjektet. Fjern `NEXT_PUBLIC_SUPABASE_*` fra Vercel. Appen kan
   fortsatt ligge på Vercel; den er bare en side uten database bak.
4. ✅ Dataminimering: kjønn valgfritt og tomt som standard, og par-historikken
   kan nullstilles ved skoleårsslutt.
5. ✅ Personvernside i appen (`/personvern`, lenket fra bunnteksten og fra «Om
   Klassekart»): hva som lagres, hvor det ligger, hvem som kan se det, og
   hvordan man sletter det.
6. ⬜ Si fra til rektor at du og et par kolleger bruker verktøyet.

Skal appen senere ut til andre skoler, starter du på seksjon 4 —
men da er det en helt annen samtale, og den tas før koden skrives.

## Kilder

- [Datatilsynet: Når må man gjennomføre en vurdering av personvernkonsekvenser (DPIA)](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/vurdering-av-personvernkonsekvenser/nar-ma-man-gjennomfore-en-vurdering-av-personvernkonsekvenser/)
- [Datatilsynet: Funn fra skoletilsynet (samlerapport)](https://www.datatilsynet.no/contentassets/fd94f1b2bd8b4a03a4a627d70b7c3142/rapport_skoletilsyn.pdf)
- [Datatilsynet: Bruk av skytjenester i skolen](https://www.datatilsynet.no/personvern-pa-ulike-omrader/skole-barn-unge/bruk-av-google-chromebook-og-g-suite-for-education-og-andre-skytjenester-i-grunnskolen/vurdering-av-personvernkonsekvenser/)
- [KS SkoleSec: Råd for en trygg innramming av digitale skolemiljø](https://www.ks.no/fagomrader/digitalisering/skolesec/rad-for-en-trygg-innramming-av-digitale-skolemiljo/)
- [Supabase: Data Processing Addendum](https://supabase.com/legal/dpa)
