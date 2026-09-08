"use client";

import { useMemo, useRef, useState } from "react";
import { useAppData } from "@/lib/app-data";
import { genderDotClass } from "@/lib/gender";
import { ghostButton, inputClass, plural, primaryButton, secondaryButton } from "@/lib/ui";
import type { GroupSet, Student } from "@/lib/types";

/**
 * Grupper til prosjektarbeid: klassen delt i grupper som ikke har noe med
 * pultene å gjøre.
 *
 * Fordelingen bruker den samme algoritmen som klassekartet, så elever som ofte
 * har sittet sammen ikke havner i gruppe sammen igjen, og reglene om hvem som
 * ikke skal sitte sammen gjelder også her. Men forslaget **telles ikke** i
 * par-historikken: den handler om hvem som har sittet sammen ved bordet, og en
 * prosjektgruppe er ikke et sete. Ville vi talt begge deler i samme tall, ville
 * varmekartet sagt noe annet enn det det sier at det sier.
 *
 * Læreren flytter elever mellom gruppene etterpå ved å velge et navn og så en
 * gruppe. Det er samme framgangsmåte som å bytte plass med tastatur i
 * klasserommet, og det virker likt med mus og med tastatur — en dra-og-slipp
 * ville trengt en egen tastaturvei ved siden av.
 */

const MIN_SIZE = 2;
const MAX_SIZE = 6;

/**
 * Hvor langt markøren må flyttes før det teller som et drag og ikke et klikk.
 * Samme terskel som i klasserommet: uten den ville en skjelven hånd på klikket
 * gjort at navnet ble dratt i stedet for valgt.
 */
const DRAG_THRESHOLD = 3;

/** Gruppa «ikke plassert». Den er ingen gruppe, men et sted å slippe elever. */
const UNPLACED = -1;

/** Flytter en elev til en gruppe. `UNPLACED` tar hen ut av alle gruppene. */
function withMoved(groups: string[][], studentId: string, groupIndex: number): string[][] {
  const next = groups.map((g) => g.filter((id) => id !== studentId));
  if (groupIndex >= 0 && next[groupIndex]) next[groupIndex] = [...next[groupIndex], studentId];
  return next;
}

/**
 * Bytter to elever med hverandre. Sto den ene utenfor gruppene, tar hen
 * plassen til den andre, og den andre blir stående uplassert.
 */
function withSwapped(groups: string[][], a: string, b: string): string[][] {
  const next = groups.map((g) => [...g]);
  const find = (id: string) => next.findIndex((g) => g.includes(id));
  const from = find(a);
  const to = find(b);
  if (from === -1 && to === -1) return groups;
  if (from !== -1) next[from] = next[from].map((id) => (id === a ? b : id));
  if (to !== -1) next[to] = next[to].map((id) => (id === b ? a : id));
  return next;
}

/** Eleven og gruppa under markøren. Draget slippes på det som ligger der. */
function targetAtPoint(x: number, y: number): { student: string | null; group: number | null } {
  const el = document.elementFromPoint(x, y);
  const nameEl = el?.closest<HTMLElement>("[data-student]");
  const groupEl = el?.closest<HTMLElement>("[data-group]");
  return {
    student: nameEl?.dataset.student ?? null,
    group: groupEl ? Number(groupEl.dataset.group) : null,
  };
}

/** Navnet som dras med musa eller fingeren. */
interface NameDrag {
  studentId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Terskelen er passert — dette er et drag, ikke et klikk. */
  moved: boolean;
  overStudent: string | null;
  overGroup: number | null;
}

interface Draft {
  /** Settet som skrives over ved lagring. Mangler den, blir det et nytt sett. */
  id?: string;
  name: string;
  groups: string[][];
}

function Name({ student }: { student: Student }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {student.gender && (
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(student.gender)}`}
          aria-hidden
        />
      )}
      <span className="truncate">{student.name}</span>
    </span>
  );
}

/** «23. aug.» — nok til å skille to sett fra hverandre i lista. */
function setLabel(set: GroupSet): string {
  return new Date(set.created_at).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
  });
}

export default function StudentGroups({
  onRequestDelete,
}: {
  /** Sletting bekreftes utenfor vinduet, ellers slåss to dialoger om fokuset. */
  onRequestDelete: (set: { id: string; name: string }) => void;
}) {
  const { activeStudents, groupSets, suggestGroups, saveGroupSet, setError } = useAppData();

  const [size, setSize] = useState(3);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<NameDrag | null>(null);
  /** Et fullført drag skal ikke også telle som et klikk på navnet. */
  const dragged = useRef(false);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const byId = useMemo(() => new Map(activeStudents.map((s) => [s.id, s])), [activeStudents]);

  /**
   * Elever som ikke står i noen gruppe. En lagret inndeling kan være laget før
   * de nyeste elevene kom inn i klassen, og de skal ikke bli borte i det stille
   * — de står i en egen bolk til læreren plasserer dem.
   */
  const unplaced = useMemo(() => {
    if (!draft) return [];
    const placed = new Set(draft.groups.flat());
    return activeStudents.filter((s) => !placed.has(s.id));
  }, [draft, activeStudents]);

  const pickedStudent = picked ? byId.get(picked) : undefined;

  async function fordel() {
    setBusy(true);
    try {
      const groups = await suggestGroups(size);
      setDraft((prev) => ({
        id: prev?.id,
        name: prev?.name ?? "",
        groups,
      }));
      setPicked(null);
      setAnnouncement(`${plural(groups.length, "gruppe", "grupper")} foreslått.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Flytter den valgte eleven til en gruppe (`UNPLACED` er «ikke plassert»). */
  function moveTo(groupIndex: number) {
    if (!picked || !draft) return;
    setDraft({ ...draft, groups: withMoved(draft.groups, picked, groupIndex) });
    setAnnouncement(
      `${pickedStudent?.name ?? "Eleven"} flyttet til ${
        groupIndex >= 0 ? `gruppe ${groupIndex + 1}` : "ikke plassert"
      }.`
    );
    setPicked(null);
  }

  /** Klikk på et navn: løft det, legg det fra deg, eller bytt to elever. */
  function tapName(studentId: string) {
    if (!draft) return;
    if (!picked) {
      setPicked(studentId);
      setAnnouncement(`${byId.get(studentId)?.name ?? "Eleven"} er valgt. Velg en gruppe.`);
      return;
    }
    if (picked === studentId) {
      setPicked(null);
      setAnnouncement("Avbrutt.");
      return;
    }
    // To navn etter hverandre bytter elevene med hverandre.
    setDraft({ ...draft, groups: withSwapped(draft.groups, picked, studentId) });
    setAnnouncement(
      `${byId.get(picked)?.name ?? "Eleven"} og ${
        byId.get(studentId)?.name ?? "eleven"
      } byttet gruppe.`
    );
    setPicked(null);
  }

  // --- Dra-og-slipp -------------------------------------------------------
  // Samme framgangsmåte som elevkortene i klasserommet: dra navnet dit det
  // skal. Klikkveien over blir stående ved siden av — den er tastaturveien, og
  // et drag kan ingen gjøre med tastaturet.

  function startDrag(e: React.PointerEvent, studentId: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Nullstilles her og ikke i klikket: slippes navnet utenfor knappen det ble
    // tatt fra, kommer det aldri noe klikk å nullstille flagget i, og det neste
    // ekte klikket ville blitt spist.
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      studentId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      overStudent: null,
      overGroup: null,
    });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const moved =
      drag.moved ||
      Math.abs(e.clientX - drag.startX) > DRAG_THRESHOLD ||
      Math.abs(e.clientY - drag.startY) > DRAG_THRESHOLD;
    if (!moved) return;

    const over = targetAtPoint(e.clientX, e.clientY);
    setDrag({
      ...drag,
      x: e.clientX,
      y: e.clientY,
      moved: true,
      overStudent: over.student,
      overGroup: over.group,
    });
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
    if (!drag.moved || !draft) return;

    // Klikket som kommer etter et drag skal ikke også løfte navnet.
    dragged.current = true;

    const { student, group } = targetAtPoint(e.clientX, e.clientY);
    const name = byId.get(drag.studentId)?.name ?? "Eleven";

    if (student && student !== drag.studentId) {
      setDraft({ ...draft, groups: withSwapped(draft.groups, drag.studentId, student) });
      setAnnouncement(`${name} og ${byId.get(student)?.name ?? "eleven"} byttet gruppe.`);
      setPicked(null);
      return;
    }
    if (group !== null && !draft.groups[group]?.includes(drag.studentId)) {
      setDraft({ ...draft, groups: withMoved(draft.groups, drag.studentId, group) });
      setAnnouncement(
        `${name} flyttet til ${group >= 0 ? `gruppe ${group + 1}` : "ikke plassert"}.`
      );
      setPicked(null);
    }
  }

  /** Klikk på navnet — men ikke det klikket som avslutter et drag. */
  function clickName(studentId: string) {
    if (dragged.current) return;
    tapName(studentId);
  }

  async function lagre() {
    if (!draft) return;
    setBusy(true);
    try {
      const saved = await saveGroupSet(draft.name, draft.groups, draft.id);
      setDraft({ id: saved.id, name: saved.name, groups: saved.groups });
      setAnnouncement(`${saved.name} er lagret.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function open(set: GroupSet) {
    // Elever som er slettet siden inndelingen ble lagret faller ut her.
    setDraft({
      id: set.id,
      name: set.name,
      groups: set.groups.map((g) => g.filter((id) => byId.has(id))),
    });
    setPicked(null);
  }

  if (activeStudents.length < 2) {
    return (
      <p className="text-sm text-muted">
        Klassen trenger minst to elever før du kan lage grupper.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* --- Lag en ny inndeling --- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">Elever per gruppe</span>
          <div className="flex items-center overflow-hidden rounded-md border border-border bg-surface-raised">
            <button
              type="button"
              onClick={() => setSize((v) => Math.max(MIN_SIZE, v - 1))}
              disabled={size <= MIN_SIZE}
              aria-label="Færre elever per gruppe"
              className="px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground disabled:opacity-30"
            >
              −
            </button>
            <span
              aria-live="polite"
              className="min-w-[1.75rem] px-1 text-center text-sm font-medium tabular-nums"
            >
              {size}
            </span>
            <button
              type="button"
              onClick={() => setSize((v) => Math.min(MAX_SIZE, v + 1))}
              disabled={size >= MAX_SIZE}
              aria-label="Flere elever per gruppe"
              className="px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
            >
              +
            </button>
          </div>
        </div>

        <button type="button" onClick={fordel} disabled={busy} className={primaryButton("sm")}>
          {draft ? "Fordel på nytt" : "Fordel elevene"}
        </button>

        <p className="text-xs text-subtle">
          Elever som ofte har sittet sammen havner i hver sin gruppe. Fordelingen telles ikke
          i oversikten over par.
        </p>
      </div>

      {/* --- Inndelingen læreren jobber med --- */}
      {draft && (
        <div className="flex flex-col gap-3">
          {picked ? (
            <p className="text-xs text-accent-text">
              {pickedStudent?.name} er valgt — velg en gruppe å flytte til, eller en annen elev å
              bytte med.
            </p>
          ) : (
            <p className="text-xs text-subtle">
              Dra et navn til en annen gruppe, eller slipp det på en elev for å bytte de to. Med
              tastatur: Enter på navnet, og så Enter på eleven det skal byttes med.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {draft.groups.map((group, i) => (
              <section
                key={i}
                data-group={i}
                className={`flex flex-col gap-1.5 rounded-lg border bg-surface p-2.5 ${
                  drag?.moved && drag.overGroup === i && !group.includes(drag.studentId)
                    ? "border-accent ring-1 ring-accent"
                    : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                    Gruppe {i + 1}
                    <span className="ml-1.5 font-normal normal-case tabular-nums">
                      ({group.length})
                    </span>
                  </h3>
                  {picked && !group.includes(picked) ? (
                    <button
                      type="button"
                      onClick={() => moveTo(i)}
                      className="rounded px-1.5 py-0.5 text-[11px] font-medium text-accent-text hover:bg-accent-soft"
                    >
                      Flytt hit
                    </button>
                  ) : (
                    group.length === 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            groups: draft.groups.filter((_, j) => j !== i),
                          })
                        }
                        className="rounded px-1.5 py-0.5 text-[11px] text-subtle hover:text-danger"
                      >
                        Fjern
                      </button>
                    )
                  )}
                </div>

                {group.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-subtle">Tom gruppe.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {group.map((id) => {
                      const student = byId.get(id);
                      if (!student) return null;
                      const isPicked = picked === id;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            data-student={id}
                            onPointerDown={(e) => startDrag(e, id)}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onClick={() => clickName(id)}
                            aria-pressed={isPicked}
                            title={`${student.name} — dra, eller trykk Enter, for å flytte`}
                            className={`flex w-full cursor-grab touch-none items-center rounded-md border px-2 py-1.5 text-left text-sm select-none ${
                              drag?.moved && drag.studentId === id
                                ? "border-dashed border-accent/60 opacity-50"
                                : isPicked || (drag?.moved && drag.overStudent === id)
                                  ? "border-accent bg-accent-soft text-accent-text"
                                  : "border-border bg-surface-raised hover:border-border-strong"
                            }`}
                          >
                            <Name student={student} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {unplaced.length > 0 && (
            <section
              data-group={UNPLACED}
              className={`rounded-lg border border-dashed bg-surface p-2.5 ${
                drag?.moved && drag.overGroup === UNPLACED ? "border-accent ring-1 ring-accent" : "border-border"
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                  Ikke plassert
                  <span className="ml-1.5 font-normal normal-case tabular-nums">
                    ({unplaced.length})
                  </span>
                </h3>
                {picked && draft.groups.some((g) => g.includes(picked)) && (
                  <button
                    type="button"
                    onClick={() => moveTo(UNPLACED)}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-accent-text hover:bg-accent-soft"
                  >
                    Flytt hit
                  </button>
                )}
              </div>
              <ul className="flex flex-wrap gap-1">
                {unplaced.map((student) => (
                  <li key={student.id}>
                    <button
                      type="button"
                      data-student={student.id}
                      onPointerDown={(e) => startDrag(e, student.id)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onClick={() => clickName(student.id)}
                      aria-pressed={picked === student.id}
                      title={`${student.name} — dra, eller trykk Enter, for å flytte`}
                      className={`flex cursor-grab touch-none items-center rounded-md border px-2 py-1.5 text-left text-sm select-none ${
                        drag?.moved && drag.studentId === student.id
                          ? "border-dashed border-accent/60 opacity-50"
                          : picked === student.id || (drag?.moved && drag.overStudent === student.id)
                            ? "border-accent bg-accent-soft text-accent-text"
                            : "border-border bg-surface-raised hover:border-border-strong"
                      }`}
                    >
                      <Name student={student} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, groups: [...draft.groups, []] })}
              className={ghostButton("sm")}
            >
              + Tom gruppe
            </button>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs text-muted">Navn på inndelingen</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Fotosynteseprosjektet"
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={lagre}
              disabled={busy || !draft.name.trim()}
              title={draft.name.trim() ? undefined : "Gi inndelingen et navn først"}
              className={primaryButton()}
            >
              {draft.id ? "Lagre endringene" : "Lagre gruppene"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setPicked(null);
              }}
              className={secondaryButton()}
            >
              Lukk inndelingen
            </button>
          </div>
        </div>
      )}

      {/* Navnet som følger markøren under draget, som elevkortet i klasserommet. */}
      {drag?.moved && byId.get(drag.studentId) && (
        <div
          className="pointer-events-none fixed z-[60] rounded-md border border-accent bg-surface-raised px-2 py-1.5 text-sm font-medium shadow-lg"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {byId.get(drag.studentId)!.name}
        </div>
      )}

      {/* --- Lagrede inndelinger --- */}
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
          Lagrede inndelinger
        </h3>
        {groupSets.length === 0 ? (
          <p className="text-xs text-subtle">
            Ingen lagret ennå. Fordel elevene, gi inndelingen et navn, og lagre den — så finner
            du de samme gruppene igjen neste time.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {groupSets.map((set) => (
              <li
                key={set.id}
                className={`flex items-center gap-1 rounded-md border px-2 py-1.5 ${
                  draft?.id === set.id
                    ? "border-accent bg-accent-soft"
                    : "border-border hover:bg-background"
                }`}
              >
                <button
                  type="button"
                  onClick={() => open(set)}
                  className="min-w-0 flex-1 text-left text-sm"
                >
                  <span className="font-medium">{set.name}</span>
                  <span className="ml-2 text-xs text-subtle">
                    {plural(set.groups.length, "gruppe", "grupper")} · {setLabel(set)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRequestDelete({ id: set.id, name: set.name })}
                  aria-label={`Slett ${set.name}`}
                  title={`Slett ${set.name}`}
                  className="rounded p-1 text-subtle hover:bg-danger-soft hover:text-danger"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden
                  >
                    <path
                      d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
