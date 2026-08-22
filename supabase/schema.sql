-- Klassekart database schema
-- Kjør denne filen i Supabase SQL Editor (eller via `psql` mot en Neon-database)
-- for å sette opp alle tabeller appen trenger.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- classes: en skoleklasse, inkl. kontaktlærer-info
-- ---------------------------------------------------------------------------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_teacher_name text,
  contact_teacher_email text,
  contact_teacher_phone text,
  contact_teacher_note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- students: elever i en klasse
-- ---------------------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  gender text not null default 'annet' check (gender in ('jente', 'gutt', 'annet')),
  created_at timestamptz not null default now()
);

create index if not exists students_class_id_idx on students(class_id);

-- ---------------------------------------------------------------------------
-- seating_charts: genererte klassekart (historikk over alle kart som er laget)
-- layout er en liste av bordgrupper, hver gruppe er en liste av student-id-er:
--   [["id1","id2","id3"], ["id4","id5","id6"], ...]
-- ---------------------------------------------------------------------------
create table if not exists seating_charts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  group_size int not null,
  layout jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists seating_charts_class_id_idx on seating_charts(class_id);

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

create policy "Allow all on classes" on classes for all using (true) with check (true);
create policy "Allow all on students" on students for all using (true) with check (true);
create policy "Allow all on seating_charts" on seating_charts for all using (true) with check (true);
create policy "Allow all on pair_history" on pair_history for all using (true) with check (true);
