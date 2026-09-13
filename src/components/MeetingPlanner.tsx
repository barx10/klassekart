"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/lib/app-data";
import ConfirmDialog from "./ConfirmDialog";
import HelpTip from "./HelpTip";
import {
  MAX_GAP,
  MAX_MINUTES,
  MEETING_KINDS,
  MIN_MINUTES,
  WEEKDAYS,
  buildSlots,
  clashingSlots,
  dayLabel,
  defaultMinutes,
  fillSlots,
  kindLabel,
  mondayOf,
  newSlotId,
  refill,
  slotEnd,
  slotsForDay,
  toClock,
  toMinutes,
  unplacedStudents,
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
 * Samtaler: elevsamtaler og utviklingssamtaler satt opp i en arbeidsuke.
 *
 * Læreren setter et skjema — fra 08.30 til 17.00, tjue minutter om gangen —
 * lager tidene av det, og fordeler elevene på dem. Etterpå justeres enkelttider
 * for hånd, for det er slik en samtaleuke faktisk blir: de fleste tar tida de
 * får, og et par familier kan bare tirsdag klokka halv fem.
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

function SlotCount({ used, total }: { used: number; total: number }) {
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-subtle">
      {used}/{total}
    </span>
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

  /** Hvor hver elev står oppført. Brukes til å vise tida i nedtrekkslista. */
  const placedIn = useMemo(() => {
    const map = new Map<string, MeetingSlot>();
    for (const slot of plan?.slots ?? []) {
      if (slot.student_id) map.set(slot.student_id, slot);
    }
    return map;
  }, [plan]);

  const clashes = useMemo(() => clashingSlots(plan?.slots ?? []), [plan]);
  const unplaced = useMemo(
    () => unplacedStudents(plan?.slots ?? [], activeStudents),
    [plan, activeStudents]
  );

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
    update({ ...plan, slots: fillSlots(plan.slots, activeStudents.map((s) => s.id)) });
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

  /** Ny tid etter den siste den dagen, ellers først i arbeidsdagen. */
  function addSlot(day: number) {
    if (!plan) return;
    const inDay = slotsForDay(plan.slots, day);
    const last = inDay[inDay.length - 1];
    const start = last
      ? toClock(toMinutes(last.start) + last.minutes + plan.gap)
      : plan.day_start;
    update({
      ...plan,
      slots: [
        ...plan.slots,
        { id: newSlotId(), day, start, minutes: plan.minutes, student_id: null, note: "" },
      ],
    });
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

  const days = plan ? WEEKDAYS.filter((d) => plan.days.includes(d.day)) : [];
  const totalSlots = plan?.slots.length ?? 0;
  const usedSlots = plan?.slots.filter((s) => s.student_id).length ?? 0;

  if (activeStudents.length === 0) {
    return (
      <p className="text-sm text-muted">
        Legg inn elevene i klassen først — det er navnene deres som settes inn i tidene.
      </p>
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
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-3"
          >
            <div className="flex flex-wrap items-end gap-3">
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
                <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                  Uke
                  <HelpTip label="Hva gjør datoen?">
                    Velger du en dato, får dagene datoer på seg — «Mandag 14. sep.» — slik de skal
                    stå på arket foresatte får. Treffer du en annen ukedag, flyttes oppsettet til
                    mandagen i den uka. La feltet stå tomt om du bare vil ha ukedagene.
                  </HelpTip>
                </span>
                <input
                  type="date"
                  value={plan.week_start}
                  onChange={(e) => change({ week_start: mondayOf(e.target.value) })}
                  className={`${inputClass} w-40`}
                />
              </label>
            </div>

            <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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

            <div className="flex flex-wrap items-center gap-2">
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
              {plural(usedSlots, "elev", "elever")} satt opp av{" "}
              {plural(activeStudents.length, "elev", "elever")} · {plural(totalSlots, "tid", "tider")}{" "}
              i uka
            </span>
            <span className={saved ? "text-subtle" : "text-accent-text"}>
              {saved ? "Lagret" : "Lagrer …"}
            </span>
          </div>

          {clashes.size > 0 && (
            <p
              role="status"
              data-print-hide
              className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs text-danger"
            >
              To eller flere tider ligger oppå hverandre. De er merket med rødt under.
            </p>
          )}

          {/* --- Uka --- */}
          <div
            data-print-hide
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
          >
            {days.map(({ day, name }) => {
              const inDay = slotsForDay(plan.slots, day);
              return (
                <section
                  key={day}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-2.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="truncate text-sm font-semibold">
                      {dayLabel(plan.week_start, day)}
                    </h2>
                    <SlotCount
                      used={inDay.filter((s) => s.student_id).length}
                      total={inDay.length}
                    />
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
                                aria-label={`Starter, ${name}`}
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
                                aria-label={`Slutter, ${name}`}
                                className={`${inputClassSm} w-[6.5rem] tabular-nums`}
                              />
                              <button
                                type="button"
                                onClick={() => removeSlot(slot.id)}
                                aria-label={`Fjern tida ${slot.start} ${name.toLowerCase()}`}
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
                              aria-label={`Elev ${slot.start} ${name.toLowerCase()}`}
                              className={inputClassSm}
                            >
                              <option value="">— ledig —</option>
                              {unknown && (
                                // Eleven er slettet i en eldre utgave av lagringen.
                                // Vises som valg, ellers ville feltet stått tomt
                                // samtidig som tida var opptatt.
                                <option value={slot.student_id ?? ""}>{UNKNOWN}</option>
                              )}
                              {activeStudents.map((s) => {
                                const at = placedIn.get(s.id);
                                const elsewhere = at && at.id !== slot.id;
                                return (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                    {elsewhere
                                      ? ` · ${
                                          WEEKDAYS.find((d) => d.day === at.day)?.short ?? ""
                                        } ${at.start}`
                                      : ""}
                                  </option>
                                );
                              })}
                            </select>

                            {(showNotes || slot.note.trim()) && (
                              <input
                                value={slot.note}
                                onChange={(e) => changeSlot(slot.id, { note: e.target.value })}
                                placeholder="Merknad, f.eks. pause"
                                aria-label={`Merknad ${slot.start} ${name.toLowerCase()}`}
                                className={inputClassSm}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <button type="button" onClick={() => addSlot(day)} className={ghostButton("sm")}>
                    + Legg til tid
                  </button>
                </section>
              );
            })}
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
                  ? "Det er ingen ledige tider igjen. Lag flere tider, eller utvid arbeidsdagen."
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
                {plural(plan.minutes, "minutt", "minutter")} per samtale
              </p>
            </div>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, days.length)}, minmax(0, 1fr))` }}
            >
              {days.map(({ day }) => (
                <div key={day} className="break-inside-avoid">
                  <h2 className="mb-1 border-b border-border pb-0.5 text-[13px] font-semibold">
                    {dayLabel(plan.week_start, day)}
                  </h2>
                  <ul className="flex flex-col">
                    {slotsForDay(plan.slots, day).map((slot) => {
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
        </>
      )}

      {confirmRebuild && plan && (
        <ConfirmDialog
          title="Lage tidene på nytt?"
          body={
            <>
              Alle tidene i oppsettet settes opp på nytt fra skjemaet, og tider du har flyttet for
              hånd eller skrevet merknad på forsvinner. Elevene som står oppført beholder dagen
              sin, og settes inn igjen i tidene den dagen får.
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
