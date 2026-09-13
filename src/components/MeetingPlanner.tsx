"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useAppData } from "@/lib/app-data";
import { teacherKey } from "@/lib/local-db";
import ConfirmDialog from "./ConfirmDialog";
import HelpTip from "./HelpTip";
import {
  MAX_GAP,
  MAX_MINUTES,
  MAX_WEEKS,
  MEETING_KINDS,
  MIN_MINUTES,
  WEEKDAYS,
  addDays,
  buildSlots,
  clashingSlots,
  datesOf,
  dayLabel,
  defaultMinutes,
  fillSlots,
  kindLabel,
  mondayOf,
  newSlotId,
  nextWeekday,
  rangeLabel,
  refill,
  slotEnd,
  slotsForDate,
  toClock,
  toDate,
  toMinutes,
  unplacedStudents,
  weekLabel,
  weeksOf,
  withStudentAt,
} from "@/lib/meetings";
import {
  ghostButton,
  inputClass,
  inputClassSm,
  plural,
  primaryButton,
  secondaryButton,
} from "@/lib/ui";
import type { MeetingKind, MeetingPlan, MeetingSlot } from "@/lib/types";

/**
 * Samtaler: elevsamtaler og utviklingssamtaler satt opp i en eller flere
 * arbeidsuker.
 *
 * Læreren setter et skjema — fra 08.30 til 17.00, tjue minutter om gangen —
 * lager tidene av det, og fordeler elevene på dem. Etterpå justeres enkelttider
 * for hånd, for det er slik en samtaleuke faktisk blir: de fleste tar tida de
 * får, og et par familier kan bare tirsdag klokka halv fem.
 *
 * **Uke-feltet sier hvor skjemaet lager tider, og flytter ingen som står der.**
 * Tidene henger på datoer (se `meetings.ts`). Før lå de som ukedagsnumre, og da
 * flyttet et klikk på uka eleven som var avtalt onsdag 16. september til
 * onsdagen etter. Skal hele runden skyves, er det en egen knapp som gjør det —
 * synlig, og ikke som en bieffekt av et datofelt.
 *
 * **Oppsettet gjelder én kontaktlærer om gangen.** En klasse har gjerne to som
 * tar hver sine samtaler, og det er egne elever læreren skal sette opp. Utvalget
 * følger `contact_teacher` på eleven, altså det som står i elevlista — settes det
 * ikke, gjelder oppsettet alle i klassen.
 *
 * **Eleven velges i en nedtrekksliste, ikke ved å dras.** Det er den samme
 * avveiningen som ellers i appen, men den faller motsatt vei her: en tid er en
 * rad i et skjema, ikke et sete i et rom, og en liste med 25 navn er raskere å
 * treffe enn et navn som skal dras tvers over uka. Lista virker likt med mus,
 * fingre og tastatur, og trenger ingen egen tastaturvei ved siden av.
 *
 * **Oppsettet lagres av seg selv**, med litt forsinkelse, som pultene i
 * klasserommet. En samtaleuke settes opp over flere økter og med telefonen i
 * hånda, og en «Lagre»-knapp læreren rekker å gå fra ville kostet hele uka.
 */

/** Hvor lenge det ventes fra siste tastetrykk til oppsettet skrives til disk. */
const SAVE_DELAY = 400;

/** Navnet på en elev som ikke finnes lenger — se `option`-lista under. */
const UNKNOWN = "Ukjent elev";

/** «15.9. 09:00» — hvor en elev står fra før, kort nok for en nedtrekksliste. */
function placedLabel(slot: MeetingSlot): string {
  const date = toDate(slot.date);
  if (!date) return slot.start;
  return `${date.getDate()}.${date.getMonth() + 1}. ${slot.start}`;
}

function SlotCount({ used, total }: { used: number; total: number }) {
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-subtle">
      {used}/{total}
    </span>
  );
}

/** Overskrifta over en bolk i skjemaet, så feltene ikke flyter i én lang rad. */
function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  );
}

export default function MeetingPlanner() {
  const {
    activeClass,
    activeStudents,
    meetingPlans,
    createMeetingPlan,
    saveMeetingPlan,
    deleteMeetingPlan,
    setError,
  } = useAppData();

  const [draft, setDraft] = useState<MeetingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MeetingPlan | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  // Feltene som har en hjelpetekst ved siden av seg må peke på feltet med
  // `htmlFor`. En <label> som omslutter både spørsmålstegnet og feltet gir
  // navnet sitt til knappen — den kommer først — og feltet blir stående uten.
  const teacherId = useId();
  const weekId = useId();

  /**
   * Oppsettet som vises: det læreren har åpnet, ellers det nyeste. Utledet og
   * ikke satt i en effekt, så det nyeste oppsettet ligger framme med én gang
   * uten at noe må settes i to omganger.
   *
   * Hører utkastet til en annen klasse, er vi kommet hit fra en annen klasse i
   * menya, og det er klassens egne oppsett som gjelder.
   */
  const plan = draft && draft.class_id === activeClass?.id ? draft : (meetingPlans[0] ?? null);

  const byId = useMemo(() => new Map(activeStudents.map((s) => [s.id, s])), [activeStudents]);

  /**
   * Kontaktlærerne som faktisk har elever i klassen. Lista over alle lærerne i
   * programmet ville tilbudt et utvalg som ga en tom uke.
   */
  const teachers = useMemo(() => {
    const funnet = new Map<string, string>();
    for (const student of activeStudents) {
      const navn = student.contact_teacher?.trim();
      if (navn) funnet.set(teacherKey(navn), navn);
    }
    return [...funnet.values()].sort((a, b) => a.localeCompare(b, "no"));
  }, [activeStudents]);

  /** Elevene oppsettet gjelder: kontaktlærerens egne, ellers hele klassen. */
  const students = useMemo(() => {
    const valgt = plan?.teacher.trim();
    if (!valgt) return activeStudents;
    return activeStudents.filter(
      (s) => s.contact_teacher && teacherKey(s.contact_teacher) === teacherKey(valgt)
    );
  }, [activeStudents, plan]);

  /** Hvor hver elev står oppført. Brukes til å vise tida i nedtrekkslista. */
  const placedIn = useMemo(() => {
    const map = new Map<string, MeetingSlot>();
    for (const slot of plan?.slots ?? []) {
      if (slot.student_id) map.set(slot.student_id, slot);
    }
    return map;
  }, [plan]);

  /**
   * Dagene oppsettet har tider på, gruppert i uker. Utledet av tidene og ikke
   * av skjemaet: en dag læreren har lagt til selv i uka etter skal ha sin egen
   * spalte, selv om skjemaet bare lager tider i én uke.
   */
  const weeks = useMemo(() => weeksOf(datesOf(plan?.slots ?? [])), [plan]);
  const lastDate = useMemo(() => {
    const dates = datesOf(plan?.slots ?? []);
    return dates[dates.length - 1] ?? plan?.week_start ?? "";
  }, [plan]);

  const clashes = useMemo(() => clashingSlots(plan?.slots ?? []), [plan]);
  const unplaced = useMemo(
    () => unplacedStudents(plan?.slots ?? [], students),
    [plan, students]
  );

  /**
   * Tider som er satt av til elever utenfor utvalget. Skifter læreren
   * kontaktlærer på et oppsett som alt er fordelt, blir de stående — de kan
   * være avtalt med noen — men da skal det stå tydelig hvorfor tider er
   * opptatt av navn som ikke er i lista under.
   */
  const foreign = useMemo(() => {
    if (!plan?.teacher.trim()) return 0;
    const mine = new Set(students.map((s) => s.id));
    return plan.slots.filter((s) => s.student_id && !mine.has(s.student_id)).length;
  }, [plan, students]);

  // Lagrer av seg selv når det har vært stille en liten stund. Timeren
  // nullstilles for hvert tastetrykk, så et navn som skrives inn blir ett
  // skriv og ikke ett per bokstav.
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      saveMeetingPlan(draft)
        .then(() => setSaved(true))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [draft, saveMeetingPlan, setError]);

  function update(next: MeetingPlan) {
    setSaved(false);
    setDraft(next);
  }

  /** Endrer skjemaet. Tidene lages ikke på nytt før læreren ber om det. */
  function change(fields: Partial<MeetingPlan>) {
    if (!plan) return;
    update({ ...plan, ...fields });
  }

  function changeSlot(id: string, fields: Partial<MeetingSlot>) {
    if (!plan) return;
    update({ ...plan, slots: plan.slots.map((s) => (s.id === id ? { ...s, ...fields } : s)) });
  }

  async function newPlan(kind: MeetingKind) {
    setBusy(true);
    try {
      setDraft(await createMeetingPlan(kind));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Lager tidene på nytt fra skjemaet. Elevene som alt står oppført settes inn
   * igjen på dagen sin — endrer læreren lengden fra 20 til 30 minutter, er det
   * klokkeslettene som skal flytte seg, ikke hvilken dag familien skal møte.
   */
  function rebuild() {
    if (!plan) return;
    setConfirmRebuild(false);
    update({ ...plan, slots: refill(buildSlots(plan), plan.slots) });
  }

  function distribute() {
    if (!plan) return;
    update({ ...plan, slots: fillSlots(plan.slots, students.map((s) => s.id)) });
  }

  function clearStudents() {
    if (!plan) return;
    update({ ...plan, slots: plan.slots.map((s) => ({ ...s, student_id: null })) });
  }

  /** Rydder bort tidene ingen skal ha, så arket blir kort nok til å henge opp. */
  function dropFree() {
    if (!plan) return;
    update({
      ...plan,
      slots: plan.slots.filter((s) => s.student_id || s.note.trim()),
    });
  }

  /**
   * Skyver hele runden en uke fram eller tilbake — datoene og skjemaet sammen.
   * Dette er handlingen læreren egentlig var ute etter da hen endret uka og
   * fikk se at ingenting flyttet seg: en runde som må utsettes, utsettes i sin
   * helhet.
   */
  function shiftWeeks(delta: number) {
    if (!plan) return;
    update({
      ...plan,
      week_start: addDays(plan.week_start, delta * 7) || plan.week_start,
      slots: plan.slots.map((s) => ({ ...s, date: addDays(s.date, delta * 7) || s.date })),
    });
  }

  /** Ny tid etter den siste den dagen, ellers først i arbeidsdagen. */
  function addSlot(date: string) {
    if (!plan) return;
    const inDay = slotsForDate(plan.slots, date);
    const last = inDay[inDay.length - 1];
    const start = last
      ? toClock(toMinutes(last.start) + last.minutes + plan.gap)
      : plan.day_start;
    update({
      ...plan,
      slots: [
        ...plan.slots,
        { id: newSlotId(), date, start, minutes: plan.minutes, student_id: null, note: "" },
      ],
    });
  }

  /**
   * Én dag til, etter den siste dagen som har tider. Det er slik en runde som
   * ikke fikk plass utvides: en familie som bare kan mandagen etter, trenger
   * ikke et helt nytt oppsett.
   */
  function addDay() {
    const date = nextWeekday(lastDate);
    if (date) addSlot(date);
  }

  function removeSlot(id: string) {
    if (!plan) return;
    update({ ...plan, slots: plan.slots.filter((s) => s.id !== id) });
  }

  function setStudent(slotId: string, studentId: string | null) {
    if (!plan) return;
    update({ ...plan, slots: withStudentAt(plan.slots, slotId, studentId) });
  }

  /** Slutten settes som klokkeslett; lengden er det som faktisk lagres. */
  function setEnd(slot: MeetingSlot, end: string) {
    const minutes = toMinutes(end) - toMinutes(slot.start);
    if (minutes < MIN_MINUTES) return;
    changeSlot(slot.id, { minutes: Math.min(MAX_MINUTES, minutes) });
  }

  function toggleDay(day: number) {
    if (!plan) return;
    const days = plan.days.includes(day)
      ? plan.days.filter((d) => d !== day)
      : [...plan.days, day].sort((a, b) => a - b);
    // Tidene på en dag som slås av blir stående til tidene lages på nytt.
    // Slettet vi dem her, ville et feilklikk tatt med seg en hel dag med
    // avtalte samtaler.
    change({ days });
  }

  async function doDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteMeetingPlan(id);
      if (draft?.id === id) setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const totalSlots = plan?.slots.length ?? 0;
  const usedSlots = plan?.slots.filter((s) => s.student_id).length ?? 0;

  if (activeStudents.length === 0) {
    return (
      <p className="text-sm text-muted">
        Legg inn elevene i klassen først — det er navnene deres som settes inn i tidene.
      </p>
    );
  }

  /**
   * Én dagsspalte med tidene sine.
   *
   * En vanlig funksjon som gir JSX, ikke en komponent inni komponenten: en
   * nestet komponent er en ny type for hver tegning, og React river da spalta
   * ned og bygger den opp igjen — midt i et klokkeslett læreren skriver.
   */
  function dayColumn(date: string) {
    if (!plan) return null;
    const inDay = slotsForDate(plan.slots, date);
    const label = dayLabel(date);

    return (
      <section
        key={date}
        className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{label}</h3>
          <SlotCount used={inDay.filter((s) => s.student_id).length} total={inDay.length} />
        </div>

        {inDay.length === 0 ? (
          <p className="text-xs text-subtle">Ingen tider denne dagen.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {inDay.map((slot) => {
              const student = slot.student_id ? byId.get(slot.student_id) : undefined;
              const unknown = Boolean(slot.student_id) && !student;
              return (
                <li
                  key={slot.id}
                  className={`flex flex-col gap-1 rounded-lg border px-2 py-1.5 ${
                    clashes.has(slot.id)
                      ? "border-danger bg-danger-soft"
                      : slot.student_id
                        ? "border-border bg-surface-raised"
                        : "border-dashed border-border bg-surface-raised"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="time"
                      step={300}
                      value={slot.start}
                      onChange={(e) => changeSlot(slot.id, { start: e.target.value })}
                      aria-label={`Starter, ${label}`}
                      className={`${inputClassSm} w-[6.5rem] tabular-nums`}
                    />
                    <span className="text-xs text-subtle" aria-hidden>
                      –
                    </span>
                    <input
                      type="time"
                      step={300}
                      value={slotEnd(slot)}
                      onChange={(e) => setEnd(slot, e.target.value)}
                      aria-label={`Slutter, ${label}`}
                      className={`${inputClassSm} w-[6.5rem] tabular-nums`}
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.id)}
                      aria-label={`Fjern tida ${slot.start} ${label}`}
                      title="Fjern tida"
                      className="ml-auto rounded p-1 text-subtle hover:bg-danger-soft hover:text-danger"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden
                      >
                        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>

                  <select
                    value={slot.student_id ?? ""}
                    onChange={(e) => setStudent(slot.id, e.target.value || null)}
                    aria-label={`Elev ${slot.start} ${label}`}
                    className={inputClassSm}
                  >
                    <option value="">— ledig —</option>
                    {unknown && (
                      // Eleven er slettet i en eldre utgave av lagringen. Vises
                      // som valg, ellers ville feltet stått tomt samtidig som
                      // tida var opptatt.
                      <option value={slot.student_id ?? ""}>{UNKNOWN}</option>
                    )}
                    {/* Eleven som står i tida er alltid med, også når hen hører
                        til en annen kontaktlærer enn den oppsettet gjelder —
                        ellers ville feltet stått tomt for en opptatt tid. */}
                    {(student && !students.includes(student)
                      ? [student, ...students]
                      : students
                    ).map((s) => {
                      const at = placedIn.get(s.id);
                      const elsewhere = at && at.id !== slot.id;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {elsewhere ? ` · ${placedLabel(at)}` : ""}
                        </option>
                      );
                    })}
                  </select>

                  {(showNotes || slot.note.trim()) && (
                    <input
                      value={slot.note}
                      onChange={(e) => changeSlot(slot.id, { note: e.target.value })}
                      placeholder="Merknad, f.eks. pause"
                      aria-label={`Merknad ${slot.start} ${label}`}
                      className={inputClassSm}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" onClick={() => addSlot(date)} className={ghostButton("sm")}>
          + Legg til tid
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* --- Oppsettene klassen har --- */}
      <div
        data-print-hide
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-3 py-2.5"
      >
        {meetingPlans.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {meetingPlans.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setDraft(m);
                  setSaved(true);
                }}
                aria-pressed={m.id === plan?.id}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  m.id === plan?.id
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-border bg-surface-raised hover:border-border-strong"
                }`}
              >
                {m.name || kindLabel(m.kind)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {MEETING_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => newPlan(k.kind)}
              disabled={busy}
              title={k.hint}
              className={ghostButton("sm")}
            >
              + {k.label}r
            </button>
          ))}
        </div>

        <HelpTip label="Hva er et samtaleoppsett?">
          Et oppsett er én runde med samtaler — for eksempel utviklingssamtalene i høst. Du setter
          en arbeidsuke med tider, fordeler elevene på dem, og skriver ut oversikten. Oppsettet blir
          liggende, så du finner det igjen når noen spør hvilken tid de fikk.
        </HelpTip>
      </div>

      {!plan ? (
        <p className="text-sm text-muted">
          Ingen samtaler satt opp ennå. Velg «+ Elevsamtaler» eller «+ Utviklingssamtaler» over, så
          får du en arbeidsuke med tider du kan fordele elevene på.
        </p>
      ) : (
        <>
          {/* --- Skjemaet tidene lages av --- */}
          <div
            data-print-hide
            className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-3 py-3"
          >
            <FieldGroup title="Samtalen">
              {/* Navnet trenger en bunn å stå på: med `min-w-0` alene ble feltet
                  presset ned til tre bokstaver ved siden av «Type» på en telefon. */}
              <label className="min-w-[12rem] flex-1">
                <span className="mb-1 block text-xs text-muted">Navn på oppsettet</span>
                <input
                  value={plan.name}
                  onChange={(e) => change({ name: e.target.value })}
                  placeholder="Utviklingssamtaler høst"
                  className={inputClass}
                />
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Type</span>
                <select
                  value={plan.kind}
                  onChange={(e) => {
                    const kind = e.target.value as MeetingKind;
                    // Typen bærer lengden: velger læreren utviklingssamtale,
                    // er det halvtimene hen er ute etter.
                    change({ kind, minutes: defaultMinutes(kind) });
                  }}
                  className={inputClass}
                >
                  {MEETING_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                  <label htmlFor={teacherId}>Kontaktlærer</label>
                  <HelpTip label="Hva gjør valget av kontaktlærer?">
                    Velger du en kontaktlærer, er det bare elevene som har hen som kontaktlærer som
                    settes opp og fordeles. Det bestemmes av feltet «Kontaktlærer» på eleven, under
                    <strong className="text-foreground"> Elever</strong> i menyen. Har ingen elever
                    fått en kontaktlærer ennå, er «Alle i klassen» det eneste valget.
                  </HelpTip>
                </span>
                <select
                  id={teacherId}
                  value={plan.teacher}
                  onChange={(e) => change({ teacher: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Alle i klassen</option>
                  {teachers.map((navn) => (
                    <option key={navn} value={navn}>
                      {navn}
                    </option>
                  ))}
                  {/* Læreren kan ha mistet elevene sine siden oppsettet ble
                      laget. Valget må likevel stå, ellers ville lista hoppet
                      tilbake til «alle i klassen» uten at noen ba om det. */}
                  {plan.teacher.trim() &&
                    !teachers.some((n) => teacherKey(n) === teacherKey(plan.teacher)) && (
                      <option value={plan.teacher}>{plan.teacher} (ingen elever)</option>
                    )}
                </select>
              </div>
            </FieldGroup>

            <FieldGroup title="Skjemaet «Lag tidene» fyller">
              <div>
                <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                  <label htmlFor={weekId}>Starter uke</label>
                  <HelpTip label="Hva gjør uke-feltet?">
                    Uka sier hvor <strong className="text-foreground">nye</strong> tider lages, og
                    flytter ingen tid som alt står i oversikten — de har sin egen dato, og kan være
                    avtalt med noen. Skal hele runden utsettes, bruker du «Flytt tidene» under.
                    Treffer du en annen ukedag i kalenderen, starter oppsettet på mandagen i den uka.
                  </HelpTip>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => change({ week_start: addDays(plan.week_start, -7) })}
                    aria-label="Uka før"
                    title="Uka før"
                    className="rounded-md border border-border bg-surface-raised px-2 py-2 text-muted hover:bg-background hover:text-foreground"
                  >
                    ‹
                  </button>
                  <input
                    id={weekId}
                    type="date"
                    value={plan.week_start}
                    onChange={(e) => {
                      // Et tomt felt er ingen uke å lage tider i. Da beholder vi
                      // den forrige i stedet for å stå igjen uten skjema.
                      const monday = mondayOf(e.target.value);
                      if (monday) change({ week_start: monday });
                    }}
                    className={`${inputClass} w-40`}
                  />
                  <button
                    type="button"
                    onClick={() => change({ week_start: addDays(plan.week_start, 7) })}
                    aria-label="Uka etter"
                    title="Uka etter"
                    className="rounded-md border border-border bg-surface-raised px-2 py-2 text-muted hover:bg-background hover:text-foreground"
                  >
                    ›
                  </button>
                  <span className="ml-1 whitespace-nowrap text-xs font-medium text-accent-text">
                    {weekLabel(plan.week_start)}
                  </span>
                </div>
              </div>

              <label>
                <span className="mb-1 block text-xs text-muted">Antall uker</span>
                <select
                  value={plan.weeks}
                  onChange={(e) => change({ weeks: Number(e.target.value) || 1 })}
                  className={`${inputClass} w-28`}
                >
                  {Array.from({ length: MAX_WEEKS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {plural(n, "uke", "uker")}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Fra</span>
                <input
                  type="time"
                  step={300}
                  value={plan.day_start}
                  onChange={(e) => change({ day_start: e.target.value })}
                  className={`${inputClass} w-28`}
                />
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Til</span>
                <input
                  type="time"
                  step={300}
                  value={plan.day_end}
                  onChange={(e) => change({ day_end: e.target.value })}
                  className={`${inputClass} w-28`}
                />
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Lengde</span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={MIN_MINUTES}
                    max={MAX_MINUTES}
                    step={5}
                    value={plan.minutes}
                    onChange={(e) =>
                      change({
                        minutes: Math.min(
                          MAX_MINUTES,
                          Math.max(MIN_MINUTES, Number(e.target.value) || MIN_MINUTES)
                        ),
                      })
                    }
                    className={`${inputClass} w-20`}
                  />
                  <span className="text-xs text-subtle">min</span>
                </span>
              </label>

              <label>
                <span className="mb-1 block text-xs text-muted">Pause mellom</span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={MAX_GAP}
                    step={5}
                    value={plan.gap}
                    onChange={(e) =>
                      change({
                        gap: Math.min(MAX_GAP, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                    className={`${inputClass} w-20`}
                  />
                  <span className="text-xs text-subtle">min</span>
                </span>
              </label>

              <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-1.5">
                <legend className="sr-only">Ukedager</legend>
                <span className="text-xs text-muted">Dager</span>
                {WEEKDAYS.map((d) => (
                  <label key={d.day} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={plan.days.includes(d.day)}
                      onChange={() => toggleDay(d.day)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    {d.name}
                  </label>
                ))}
              </fieldset>
            </FieldGroup>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => (totalSlots > 0 ? setConfirmRebuild(true) : rebuild())}
                className={primaryButton("sm")}
              >
                Lag tidene
              </button>
              <button
                type="button"
                onClick={distribute}
                disabled={unplaced.length === 0}
                title={
                  unplaced.length === 0
                    ? "Alle elevene har fått en tid"
                    : "Sett elevene inn i de ledige tidene"
                }
                className={secondaryButton("sm")}
              >
                Fordel elevene
              </button>
              <button
                type="button"
                onClick={dropFree}
                disabled={totalSlots === usedSlots}
                title="Fjern tidene ingen skal ha, så oversikten blir kort nok til å henge opp"
                className={secondaryButton("sm")}
              >
                Fjern ledige tider
              </button>

              {/* Å skyve hele runden er en egen handling, ikke en bieffekt av
                  uke-feltet: her er det datoene som faktisk flytter seg. */}
              <span className="flex items-center gap-1 text-xs text-muted">
                Flytt tidene
                <button
                  type="button"
                  onClick={() => shiftWeeks(-1)}
                  disabled={totalSlots === 0}
                  title="Flytt alle tidene en uke tilbake"
                  className={secondaryButton("sm")}
                >
                  − 1 uke
                </button>
                <button
                  type="button"
                  onClick={() => shiftWeeks(1)}
                  disabled={totalSlots === 0}
                  title="Flytt alle tidene en uke fram"
                  className={secondaryButton("sm")}
                >
                  + 1 uke
                </button>
              </span>

              <button
                type="button"
                onClick={clearStudents}
                disabled={usedSlots === 0}
                className={`${ghostButton("sm")} hover:text-danger`}
              >
                Tøm fordelingen
              </button>

              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={showNotes}
                  onChange={(e) => setShowNotes(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                Vis merknader
              </label>
              <button
                type="button"
                onClick={() => setPendingDelete(plan)}
                className={`${ghostButton("sm")} hover:text-danger`}
              >
                Slett oppsettet
              </button>
            </div>
          </div>

          {/* --- Status --- */}
          <div data-print-hide className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-subtle" role="status">
              {students.length - unplaced.length} av {plural(students.length, "elev", "elever")} satt
              opp
              {plan.teacher.trim() ? ` hos ${plan.teacher}` : " i klassen"} ·{" "}
              {plural(totalSlots, "tid", "tider")} fordelt på {plural(weeks.length, "uke", "uker")}
            </span>
            <span className={saved ? "text-subtle" : "text-accent-text"}>
              {saved ? "Lagret" : "Lagrer …"}
            </span>
          </div>

          {foreign > 0 && (
            <p
              role="status"
              data-print-hide
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted"
            >
              {plural(foreign, "tid er", "tider er")} satt av til elever som har en annen
              kontaktlærer. De blir stående — de kan være avtalt — men telles ikke med over.
            </p>
          )}

          {clashes.size > 0 && (
            <p
              role="status"
              data-print-hide
              className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs text-danger"
            >
              To eller flere tider ligger oppå hverandre. De er merket med rødt under.
            </p>
          )}

          {/* --- Ukene --- */}
          <div data-print-hide className="flex flex-col gap-4">
            {weeks.length === 0 && (
              <p className="text-sm text-muted">
                Ingen tider ennå. Trykk «Lag tidene» for å fylle uka fra skjemaet over.
              </p>
            )}

            {weeks.map(({ monday, dates }) => (
              <section key={monday} className="flex flex-col gap-2">
                <h2 className="flex flex-wrap items-baseline gap-2 border-b border-border pb-1">
                  <span className="text-sm font-semibold">{weekLabel(monday)}</span>
                  <span className="text-xs text-subtle">{rangeLabel(dates)}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                  {dates.map((date) => dayColumn(date))}
                </div>
              </section>
            ))}

            {totalSlots > 0 && (
              <div>
                <button type="button" onClick={addDay} className={secondaryButton("sm")}>
                  + Legg til dagen etter
                </button>
                {/* Dagsnavnet ender alt på punktum («tirsdag 6. okt.»), så
                    setninga får ikke ett til. */}
                <span className="ml-2 text-xs text-subtle">
                  Får ikke alle plass? Legg på {dayLabel(nextWeekday(lastDate)).toLowerCase()}
                </span>
              </div>
            )}
          </div>

          {unplaced.length > 0 && (
            <section
              data-print-hide
              className="rounded-xl border border-dashed border-border bg-surface p-3"
            >
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                Ikke satt opp
                <span className="ml-1.5 font-normal normal-case tabular-nums">
                  ({unplaced.length})
                </span>
              </h2>
              <p className="mb-2 text-xs text-subtle">
                {totalSlots - usedSlots === 0
                  ? "Det er ingen ledige tider igjen. Legg til en dag under, eller flere uker i skjemaet."
                  : "Trykk «Fordel elevene», eller velg dem i en ledig tid."}
              </p>
              <ul className="flex flex-wrap gap-1">
                {unplaced.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-md border border-border bg-surface-raised px-2 py-1 text-sm"
                  >
                    {s.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* --- Arket. Egen blokk, ikke redigeringen med feltene skrudd av:
              på papiret er det tida og navnet som er hele poenget, og en side
              full av nedtrekkslister og «fjern»-kryss er ikke til å lese. --- */}
          <div data-print-area className="hidden print:block">
            <div className="mb-4 text-center">
              <p className="text-xl font-bold">
                {plan.name || kindLabel(plan.kind)} – {activeClass?.name}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {plan.teacher.trim() ? `${plan.teacher} · ` : ""}
                {plural(plan.minutes, "minutt", "minutter")} per samtale
              </p>
            </div>

            {weeks.map(({ monday, dates }) => (
              <div key={monday} className="mb-4">
                {/* Ukenummeret står på arket også: to onsdager ser like ut, og
                    det er den forskjellen foresatte må kunne lese. */}
                <p className="mb-1 text-[13px] font-semibold">
                  {weekLabel(monday)} <span className="font-normal">· {rangeLabel(dates)}</span>
                </p>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, dates.length)}, minmax(0, 1fr))`,
                  }}
                >
                  {dates.map((date) => (
                    <div key={date} className="break-inside-avoid">
                      <h2 className="mb-1 border-b border-border pb-0.5 text-[13px] font-semibold">
                        {dayLabel(date)}
                      </h2>
                      <ul className="flex flex-col">
                        {slotsForDate(plan.slots, date).map((slot) => {
                          const student = slot.student_id ? byId.get(slot.student_id) : undefined;
                          return (
                            <li
                              key={slot.id}
                              className="flex gap-2 border-b border-border py-1 text-[12px]"
                            >
                              <span className="shrink-0 tabular-nums">{slot.start}</span>
                              <span className="min-w-0 flex-1 truncate">
                                {student?.name ?? (slot.student_id ? UNKNOWN : slot.note)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {confirmRebuild && plan && (
        <ConfirmDialog
          title="Lage tidene på nytt?"
          body={
            <>
              Alle tidene i oppsettet settes opp på nytt fra skjemaet — {weekLabel(plan.week_start)}{" "}
              og {plural(plan.weeks, "uke", "uker")} fram — og tider du har flyttet for hånd eller
              skrevet merknad på forsvinner. Elevene som står oppført beholder dagen sin, og settes
              inn igjen i tidene den dagen får.
            </>
          }
          confirmLabel="Lag tidene"
          onConfirm={rebuild}
          onCancel={() => setConfirmRebuild(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Slette ${pendingDelete.name || kindLabel(pendingDelete.kind)}?`}
          body={
            <>
              Hele oppsettet med tidene slettes. Elevene, klassekartene og de andre oppsettene
              beholdes.
            </>
          }
          confirmLabel="Slett oppsettet"
          onConfirm={doDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
