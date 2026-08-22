-- Klassekart database schema
-- Kjør denne filen i Supabase SQL Editor (eller via `psql` mot en Neon-database)
-- for å sette opp alle tabeller appen trenger.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- classes: en skoleklasse.
-- desks er klasserommets pultoppsett: en liste med pulter som hver har en
-- id og en fri x/y-posisjon (piksler), slik at læreren kan dra pultene dit
-- de faktisk står i klasserommet:
--   [{"id": "d1", "x": 16, "y": 16}, {"id": "d2", "x": 232, "y": 16}, ...]
-- desk_cols husker hvor bred "Rydd opp"-rutenettet skal være.
-- ---------------------------------------------------------------------------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_contact_teacher text,
  desks jsonb not null default '[]'::jsonb,
  desk_cols int not null default 3,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- students: elever i en klasse. contact_teacher er kontaktlæreren til denne
-- eleven (klasser kan ha flere kontaktlærere for ulike elever).
-- ---------------------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  gender text not null default 'annet' check (gender in ('jente', 'gutt', 'annet')),
  contact_teacher text,
  created_at timestamptz not null default now()
);

create index if not exists students_class_id_idx on students(class_id);

-- ---------------------------------------------------------------------------
-- Migrering fra tidligere skjemaversjon (trygt å kjøre på nytt / mot en
-- database som allerede har den gamle strukturen med
-- contact_teacher_name/email/phone/note på classes).
-- ---------------------------------------------------------------------------
alter table classes add column if not exists default_contact_teacher text;
alter table classes drop column if exists contact_teacher_name;
alter table classes drop column if exists contact_teacher_email;
alter table classes drop column if exists contact_teacher_phone;
alter table classes drop column if exists contact_teacher_note;
alter table classes add column if not exists desks jsonb not null default '[]'::jsonb;
alter table classes add column if not exists desk_cols int not null default 3;
alter table students add column if not exists contact_teacher text;

-- ---------------------------------------------------------------------------
-- seating_charts: genererte klassekart (historikk over alle kart som er laget)
-- layout kobler pult-id (fra classes.desks) til elevene som sitter der:
--   {"d1": ["elev-id-1", "elev-id-2"], "d2": ["elev-id-3"], ...}
-- ---------------------------------------------------------------------------
create table if not exists seating_charts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  layout jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists seating_charts_class_id_idx on seating_charts(class_id);

-- Eldre kart lagret pultene som en liste og hadde egne rows/cols-kolonner.
-- Kartformatet endret seg, så gamle rader ryddes bort her.
delete from seating_charts where jsonb_typeof(layout) = 'array';
alter table seating_charts drop column if exists rows;
alter table seating_charts drop column if exists cols;
alter table seating_charts drop column if exists group_size;

-- ---------------------------------------------------------------------------
-- pair_history: hvor mange ganger (og sist) to elever har sittet i samme
-- bordgruppe. student_a_id < student_b_id håndheves for en kanonisk rekkefølge
-- slik at hvert par kun har én rad.
-- ---------------------------------------------------------------------------
create table if not exists pair_history (
  class_id uuid not null references classes(id) on delete cascade,
  student_a_id uuid not null references students(id) on delete cascade,
  student_b_id uuid not null references students(id) on delete cascade,
  times_together int not null default 0,
  last_seated_at timestamptz,
  primary key (class_id, student_a_id, student_b_id),
  constraint pair_order check (student_a_id < student_b_id)
);

create index if not exists pair_history_class_id_idx on pair_history(class_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- MVP-appen har ingen innlogging (én delt "lærer-tilgang" via anon-nøkkelen),
-- så vi åpner opp full tilgang for alle. Vil du begrense til innloggede
-- lærere senere, bytt disse policyene ut med f.eks. `using (auth.uid() = owner_id)`.
-- ---------------------------------------------------------------------------
alter table classes enable row level security;
alter table students enable row level security;
alter table seating_charts enable row level security;
alter table pair_history enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'classes' and policyname = 'Allow all on classes') then
    create policy "Allow all on classes" on classes for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'students' and policyname = 'Allow all on students') then
    create policy "Allow all on students" on students for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'seating_charts' and policyname = 'Allow all on seating_charts') then
    create policy "Allow all on seating_charts" on seating_charts for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pair_history' and policyname = 'Allow all on pair_history') then
    create policy "Allow all on pair_history" on pair_history for all using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: RLS-policyene over avgjør *hvilke* rader som er synlige, men
-- Postgres krever i tillegg grunnleggende table-rettigheter for at
-- anon/authenticated-rollene skal få lov til å spørre tabellene i det hele
-- tatt. Noen nyere Supabase-prosjekter mangler disse som standard.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
