import type { MeetingKind, MeetingPlan, MeetingSlot, Student } from "./types";

/**
 * Samtaler: elevsamtaler og utviklingssamtaler satt opp i en eller flere
 * arbeidsuker.
 *
 * Klokkeslett regnes i minutter etter midnatt internt, og vises som «08:30». Å
 * regne på strengene direkte gikk ikke: «09:50» pluss 20 minutter er ikke
 * «09:70».
 *
 * **Tidene henger på datoer.** De lå først som ukedagsnummer regnet fra
 * mandagen i oppsettet, og da flyttet en endring av uka hver eneste samtale
 * som alt var avtalt — eleven som skulle onsdag 16. september havnet onsdagen
 * etter. Med datoer står tidene i ro, uka er noe skjemaet bare *lager* tider
 * ut fra, og et oppsett kan strekke seg over flere uker.
 *
 * Skjemaet holder seg til mandag–fredag. Samtaler settes opp i skoletida, og
 * lørdag og søndag ville gitt to tomme spalter på arket læreren henger opp.
 */

/** Ukedagene skjemaet kan lage tider på. Tallet er `1 = mandag … 5 = fredag`. */
export const WEEKDAYS: { day: number; name: string; short: string }[] = [
  { day: 1, name: "Mandag", short: "Man" },
  { day: 2, name: "Tirsdag", short: "Tir" },
  { day: 3, name: "Onsdag", short: "Ons" },
  { day: 4, name: "Torsdag", short: "Tor" },
  { day: 5, name: "Fredag", short: "Fre" },
];

/**
 * De to samtalene skolen faktisk har, med lengden de vanligvis får. Lengden
 * er et utgangspunkt læreren kan endre — noen skoler setter av 45 minutter til
 * utviklingssamtalen, andre 20.
 */
export const MEETING_KINDS: {
  kind: MeetingKind;
  label: string;
  minutes: number;
  hint: string;
}[] = [
  {
    kind: "elevsamtale",
    label: "Elevsamtale",
    minutes: 20,
    hint: "Læreren og eleven. Varer ofte 20 minutter.",
  },
  {
    kind: "utviklingssamtale",
    label: "Utviklingssamtale",
    minutes: 30,
    hint: "Læreren, eleven og de foresatte. Varer ofte 30 minutter.",
  },
];

/** Standardskjemaet: en arbeidsdag fra 08.30 til 17.00. */
export const DEFAULT_DAY_START = "08:30";
export const DEFAULT_DAY_END = "17:00";

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 120;
export const MAX_GAP = 60;
export const MAX_WEEKS = 4;
/**
 * Taket på hvor mange tider én dag kan få. Med fem minutters samtaler og null
 * pause er et døgn under 300 tider, så grensa treffer aldri et ekte oppsett —
 * den er der for at en lengde som kommer inn ødelagt fra en gammel fil ikke
 * skal kunne bygge en uendelig liste.
 */
const MAX_SLOTS_PER_DAY = 300;

let slotCounter = 0;

export function newSlotId(): string {
  slotCounter += 1;
  return `t${Date.now().toString(36)}${slotCounter.toString(36)}`;
}

export function kindLabel(kind: MeetingKind): string {
  return MEETING_KINDS.find((k) => k.kind === kind)?.label ?? "Samtale";
}

export function defaultMinutes(kind: MeetingKind): number {
  return MEETING_KINDS.find((k) => k.kind === kind)?.minutes ?? 20;
}

// ---------------------------------------------------------------------------
// Klokkeslett
// ---------------------------------------------------------------------------

const DAY_MINUTES = 24 * 60;

/** «08:30» → 510. Tåler «8:30» og «0830», og gir 0 for noe som ikke er et klokkeslett. */
export function toMinutes(clock: string): number {
  const match = /^(\d{1,2})[.:]?(\d{2})$/.exec(clock.trim());
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return 0;
  return hours * 60 + minutes;
}

/** 510 → «08:30». Holder seg innenfor døgnet, så en tid aldri viser «25:10». */
export function toClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function slotEnd(slot: MeetingSlot): string {
  return toClock(toMinutes(slot.start) + slot.minutes);
}

// ---------------------------------------------------------------------------
// Datoer
// ---------------------------------------------------------------------------

/**
 * «2026-09-16» → datoen. Ugyldig tekst gir `null`.
 *
 * Lokal dato, ikke UTC: `new Date("2026-09-14")` er midnatt i UTC, og i Norge
 * blir det kvelden før — da het mandagen plutselig søndag.
 */
export function toDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isDate(value: string): boolean {
  return toDate(value) !== null;
}

/** Datoen `days` dager senere. Tom streng ut om datoen ikke var en dato. */
export function addDays(value: string, days: number): string {
  const date = toDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

/** 1 = mandag … 7 = søndag. 0 om verdien ikke er en dato. */
export function weekdayOf(value: string): number {
  const date = toDate(value);
  return date ? ((date.getDay() + 6) % 7) + 1 : 0;
}

/**
 * Mandagen i uka datoen ligger i. Læreren tenker «uka etter høstferien» og
 * treffer like gjerne onsdagen i kalenderen; da skal uka likevel starte på
 * mandag.
 */
export function mondayOf(value: string): string {
  const weekday = weekdayOf(value);
  return weekday ? addDays(value, 1 - weekday) : "";
}

/** Mandagen som kommer — i dag om det er mandag. Datoen et nytt oppsett får. */
export function comingMonday(from: Date = new Date()): string {
  const today = toDateString(from);
  const weekday = weekdayOf(today);
  return weekday === 1 ? today : addDays(today, 8 - weekday);
}

/**
 * Ukenummeret etter ISO 8601, som i norske kalendere og på skolens timeplan.
 * Uke 1 er uka som inneholder årets første torsdag, så en dato i romjula kan
 * høre til uke 1 året etter.
 */
export function isoWeek(value: string): number {
  const date = toDate(value);
  if (!date) return 0;
  // Regnes i UTC for å slippe sommertid: et døgn er ikke alltid 24 timer.
  const at = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const torsdag = new Date(at);
  torsdag.setUTCDate(torsdag.getUTCDate() + 4 - (((torsdag.getUTCDay() + 6) % 7) + 1));
  const nyttår = Date.UTC(torsdag.getUTCFullYear(), 0, 1);
  return Math.ceil(((torsdag.getTime() - nyttår) / 86_400_000 + 1) / 7);
}

/** «Uke 38». */
export function weekLabel(value: string): string {
  const week = isoWeek(value);
  return week ? `Uke ${week}` : "";
}

/** «Mandag 15. sep.» — dagen slik den står over spalta og på arket. */
export function dayLabel(value: string): string {
  const date = toDate(value);
  if (!date) return "";
  const name = WEEKDAYS.find((d) => d.day === weekdayOf(value))?.name;
  const dato = date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  // Lørdag og søndag har intet navn i lista, men kan stå der om læreren har
  // lagt til dagen selv.
  return name ? `${name} ${dato}` : date.toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

/**
 * «15.–19. sep.» — spennet en uke dekker, til overskrifta over uka.
 *
 * Norsk datoformat har punktumet med i dagen («15.»), så det legges ikke på
 * her. Er det bare én dag i uka, står datoen alene: «5.–5. okt.» sa ingenting.
 */
export function rangeLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  const first = toDate(dates[0]);
  const last = toDate(dates[dates.length - 1]);
  if (!first || !last) return "";

  const day = (d: Date) => d.toLocaleDateString("nb-NO", { day: "numeric" });
  const full = (d: Date) => d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  if (dates[0] === dates[dates.length - 1]) return full(first);
  return first.getMonth() === last.getMonth()
    ? `${day(first)}–${full(last)}`
    : `${full(first)} – ${full(last)}`;
}

/** Neste hverdag etter datoen: fredag gir mandagen etter. */
export function nextWeekday(value: string): string {
  let next = addDays(value, 1);
  while (next && weekdayOf(next) > 5) next = addDays(next, 1);
  return next;
}

// ---------------------------------------------------------------------------
// Tidene i uka
// ---------------------------------------------------------------------------

export function sortSlots(slots: MeetingSlot[]): MeetingSlot[] {
  return [...slots].sort(
    (a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start)
  );
}

export function slotsForDate(slots: MeetingSlot[], date: string): MeetingSlot[] {
  return sortSlots(slots.filter((s) => s.date === date));
}

/** Datoene oppsettet har tider på, tidligst først. */
export function datesOf(slots: MeetingSlot[]): string[] {
  return [...new Set(slots.map((s) => s.date))].sort((a, b) => a.localeCompare(b));
}

/**
 * Datoene gruppert i uker, så spaltene kan stå under «Uke 38» og «Uke 39».
 * Uten grupperinga blir ti dagsspalter på rad umulige å lese: to onsdager ser
 * like ut, og det er nettopp den forskjellen læreren må se.
 */
export function weeksOf(dates: string[]): { monday: string; dates: string[] }[] {
  const weeks = new Map<string, string[]>();
  for (const date of dates) {
    const monday = mondayOf(date);
    const inWeek = weeks.get(monday) ?? [];
    inWeek.push(date);
    weeks.set(monday, inWeek);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monday, inWeek]) => ({ monday, dates: inWeek }));
}

/**
 * Bygger tidene på nytt fra skjemaet: for hver valgte ukedag i hver uke, fra
 * `day_start`, én samtale om gangen med `gap` mellom, til det ikke er plass til
 * én til før `day_end`.
 *
 * Tidene kommer tomme. Hvem som skal ha dem, legges på etterpå med `refill`
 * eller `fillSlots` — da kan den som allerede står oppført få en tid tilbake
 * selv om lengden er endret under føttene på oss.
 */
export function buildSlots(plan: MeetingPlan): MeetingSlot[] {
  const minutes = Math.max(MIN_MINUTES, Math.round(plan.minutes));
  const gap = Math.max(0, Math.round(plan.gap));
  const from = toMinutes(plan.day_start);
  const to = toMinutes(plan.day_end);
  const monday = mondayOf(plan.week_start);
  if (!monday) return [];

  const weeks = Math.min(MAX_WEEKS, Math.max(1, Math.round(plan.weeks) || 1));
  const days = [...plan.days].sort((a, b) => a - b);

  const built: MeetingSlot[] = [];
  for (let week = 0; week < weeks; week++) {
    for (const day of days) {
      const date = addDays(monday, week * 7 + (day - 1));
      let at = from;
      let count = 0;
      while (at + minutes <= to && count < MAX_SLOTS_PER_DAY) {
        built.push({
          id: newSlotId(),
          date,
          start: toClock(at),
          minutes,
          student_id: null,
          note: "",
        });
        at += minutes + gap;
        count += 1;
      }
    }
  }
  return built;
}

/**
 * Setter elevene inn i de ledige tidene — én dag om gangen på rundgang, ikke
 * hele mandagen først.
 *
 * Et skjema fra 08.30 til 17.00 har plass til sytten samtaler på én dag, og en
 * fordeling som fylte dagen før den gikk videre ga læreren sytten samtaler på
 * rad på mandag og tre på tirsdag. Ingen holder ut en slik dag. På rundgang
 * blir tjue elever til fire om dagen, tidlig på dagen, og resten av uka står
 * åpen for dem som må bytte.
 *
 * To slags tider hoppes over. Tider som alt har en elev, fordi de kan være
 * avtalt med noen. Og tider læreren har skrevet en merknad på: det er slik en
 * pause eller et annet møte settes av i skjemaet, og en fordeling som fylte
 * dem med elever ville tatt fra læreren lunsjen.
 */
export function fillSlots(slots: MeetingSlot[], studentIds: string[]): MeetingSlot[] {
  const taken = new Set(slots.map((s) => s.student_id).filter(Boolean));
  const queue = studentIds.filter((id) => !taken.has(id));
  if (queue.length === 0) return slots;

  // Ledige tider, dag for dag, tidligst først.
  const free = new Map<string, MeetingSlot[]>();
  for (const slot of sortSlots(slots)) {
    if (slot.student_id || slot.note.trim()) continue;
    const inDay = free.get(slot.date) ?? [];
    inDay.push(slot);
    free.set(slot.date, inDay);
  }
  const dates = [...free.keys()].sort((a, b) => a.localeCompare(b));

  const placed = new Map<string, string>();
  let index = 0;
  while (queue.length > 0) {
    let any = false;
    for (const date of dates) {
      const slot = free.get(date)?.[index];
      if (!slot) continue;
      const next = queue.shift();
      if (!next) break;
      placed.set(slot.id, next);
      any = true;
    }
    // Ingen av dagene hadde en tid nummer `index`: da er uka full.
    if (!any) break;
    index += 1;
  }
  return slots.map((s) => (placed.has(s.id) ? { ...s, student_id: placed.get(s.id)! } : s));
}

/**
 * Setter elevene inn i nye tider, og lar hver av dem beholde dagen sin.
 *
 * Brukes når tidene lages på nytt etter at lengden eller arbeidsdagen er
 * endret. Uten dagen som feste ville en endring fra 20 til 30 minutter flyttet
 * halve klassen til en annen dag — og dagen er det første de foresatte har
 * skrevet ned. Finnes ikke dagen lenger, eller er det færre tider på den enn
 * det sto elever der, faller de siste ned i den vanlige fordelingen.
 */
export function refill(fresh: MeetingSlot[], previous: MeetingSlot[]): MeetingSlot[] {
  const placed = new Map<string, string>();
  const spill: string[] = [];

  for (const date of datesOf(previous)) {
    const students = slotsForDate(previous, date)
      .map((s) => s.student_id)
      .filter((id): id is string => Boolean(id));
    if (students.length === 0) continue;

    const open = slotsForDate(fresh, date).filter((s) => !s.student_id && !s.note.trim());
    students.forEach((id, i) => {
      const slot = open[i];
      if (slot) placed.set(slot.id, id);
      else spill.push(id);
    });
  }

  const filled = fresh.map((s) =>
    placed.has(s.id) ? { ...s, student_id: placed.get(s.id)! } : s
  );
  return spill.length > 0 ? fillSlots(filled, spill) : filled;
}

/** Elevene som ikke har fått en tid ennå. */
export function unplacedStudents(slots: MeetingSlot[], students: Student[]): Student[] {
  const placed = new Set(slots.map((s) => s.student_id).filter(Boolean));
  return students.filter((s) => !placed.has(s.id));
}

/**
 * Flytter en elev til en tid. Er tida opptatt, bytter de to — samme regel som
 * når et elevkort dras til et opptatt sete i klasserommet.
 */
export function withStudentAt(
  slots: MeetingSlot[],
  slotId: string,
  studentId: string | null
): MeetingSlot[] {
  const target = slots.find((s) => s.id === slotId);
  if (!target) return slots;
  const displaced = target.student_id;
  const previous = studentId ? slots.find((s) => s.student_id === studentId) : undefined;

  return slots.map((slot) => {
    if (slot.id === slotId) return { ...slot, student_id: studentId };
    // Sto eleven et annet sted fra før, blir den tida ledig — eller får den
    // eleven som nettopp ble dyttet vekk.
    if (previous && slot.id === previous.id) return { ...slot, student_id: displaced };
    return slot;
  });
}

/**
 * Tider som ligger oppå hverandre samme dag. Skjemaet lager dem aldri selv,
 * men en tid læreren har flyttet for hånd kan havne midt i den neste — og to
 * samtaler klokka 15.00 er noe læreren må få vite om før arket henges opp.
 */
export function clashingSlots(slots: MeetingSlot[]): Set<string> {
  const clashes = new Set<string>();
  for (const date of datesOf(slots)) {
    const inDay = slotsForDate(slots, date);
    for (let i = 1; i < inDay.length; i++) {
      const before = inDay[i - 1];
      const now = inDay[i];
      if (toMinutes(now.start) < toMinutes(before.start) + before.minutes) {
        clashes.add(before.id);
        clashes.add(now.id);
      }
    }
  }
  return clashes;
}

// ---------------------------------------------------------------------------
// Oppsettet
// ---------------------------------------------------------------------------

/** Et tomt oppsett med standardskjemaet, klart til å lage tider av. */
export function defaultPlan(kind: MeetingKind): Pick<
  MeetingPlan,
  | "kind"
  | "minutes"
  | "gap"
  | "day_start"
  | "day_end"
  | "days"
  | "weeks"
  | "week_start"
  | "teacher"
> {
  return {
    kind,
    minutes: defaultMinutes(kind),
    gap: 0,
    day_start: DEFAULT_DAY_START,
    day_end: DEFAULT_DAY_END,
    days: [1, 2, 3, 4, 5],
    weeks: 1,
    week_start: comingMonday(),
    teacher: "",
  };
}

/**
 * Leser et oppsett fra lagringen. Feltene kan mangle eller være ødelagte i en
 * gammel sikkerhetskopi, og et oppsett uten dager eller med lengde 0 ville
 * ellers ha veltet sida i stedet for å vise et tomt skjema.
 *
 * Her ligger også overgangen fra ukedagsnumre til datoer: en tid lagret som
 * «dag 3» får datoen mandagen i oppsettet pluss to. Mangler oppsettet en uke
 * — feltet var valgfritt før — brukes uka det ble laget i, som er den eneste
 * pekepinnen vi har på når samtalene skulle være.
 */
export function normalizePlan(raw: unknown): MeetingPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.class_id !== "string") return null;

  const kind: MeetingKind = value.kind === "utviklingssamtale" ? "utviklingssamtale" : "elevsamtale";
  const minutes = Number(value.minutes);
  const gap = Number(value.gap);
  const weeks = Number(value.weeks);
  const days = Array.isArray(value.days)
    ? [...new Set(value.days.map(Number).filter((d) => d >= 1 && d <= 5))].sort((a, b) => a - b)
    : [1, 2, 3, 4, 5];

  const created_at =
    typeof value.created_at === "string" ? value.created_at : new Date().toISOString();
  const weekStart =
    mondayOf(typeof value.week_start === "string" ? value.week_start : "") ||
    mondayOf(created_at.slice(0, 10)) ||
    comingMonday();

  return {
    id: value.id,
    class_id: value.class_id,
    name: typeof value.name === "string" ? value.name : "",
    kind,
    minutes: Number.isFinite(minutes)
      ? Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)))
      : defaultMinutes(kind),
    gap: Number.isFinite(gap) ? Math.min(MAX_GAP, Math.max(0, Math.round(gap))) : 0,
    day_start: typeof value.day_start === "string" ? value.day_start : DEFAULT_DAY_START,
    day_end: typeof value.day_end === "string" ? value.day_end : DEFAULT_DAY_END,
    days,
    weeks: Number.isFinite(weeks) ? Math.min(MAX_WEEKS, Math.max(1, Math.round(weeks))) : 1,
    week_start: weekStart,
    teacher: typeof value.teacher === "string" ? value.teacher : "",
    slots: Array.isArray(value.slots)
      ? value.slots
          .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
          .map((s) => {
            const slotMinutes = Number(s.minutes);
            const day = Math.round(Number(s.day));
            const date =
              typeof s.date === "string" && isDate(s.date)
                ? s.date
                : addDays(weekStart, (day >= 1 && day <= 7 ? day : 1) - 1);
            return {
              id: typeof s.id === "string" ? s.id : newSlotId(),
              date,
              start: typeof s.start === "string" ? s.start : DEFAULT_DAY_START,
              minutes: Number.isFinite(slotMinutes)
                ? Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(slotMinutes)))
                : defaultMinutes(kind),
              student_id: typeof s.student_id === "string" ? s.student_id : null,
              note: typeof s.note === "string" ? s.note : "",
            };
          })
      : [],
    created_at,
  };
}
