"use client";

import { useMemo, useState } from "react";
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

  /** Flytter den valgte eleven til en gruppe (−1 er «ikke plassert»). */
  function moveTo(groupIndex: number) {
    if (!picked || !draft) return;
    const groups = draft.groups.map((g) => g.filter((id) => id !== picked));
    if (groupIndex >= 0) groups[groupIndex] = [...groups[groupIndex], picked];
    setDraft({ ...draft, groups });
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
    const groups = draft.groups.map((g) => [...g]);
    const find = (id: string) => groups.findIndex((g) => g.includes(id));
    const from = find(picked);
    const to = find(studentId);

    if (from === -1 && to === -1) return;
    if (from === -1) {
      // Den valgte sto uplassert: den tar plassen, og den andre blir uplassert.
      groups[to] = groups[to].map((id) => (id === studentId ? picked : id));
    } else if (to === -1) {
      groups[from] = groups[from].map((id) => (id === picked ? studentId : id));
    } else {
      groups[from] = groups[from].map((id) => (id === picked ? studentId : id));
      groups[to] = groups[to].map((id) => (id === studentId ? picked : id));
    }
    setDraft({ ...draft, groups });
    setAnnouncement(
      `${byId.get(picked)?.name ?? "Eleven"} og ${
        byId.get(studentId)?.name ?? "eleven"
      } byttet gruppe.`
    );
    setPicked(null);
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
          {picked && (
            <p className="text-xs text-accent-text">
              {pickedStudent?.name} er valgt — velg en gruppe å flytte til, eller en annen elev å
              bytte med.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {draft.groups.map((group, i) => (
              <section
                key={i}
                className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2.5"
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
                            onClick={() => tapName(id)}
                            aria-pressed={isPicked}
                            className={`flex w-full items-center rounded-md border px-2 py-1.5 text-left text-sm ${
                              isPicked
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
            <section className="rounded-lg border border-dashed border-border bg-surface p-2.5">
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
                    onClick={() => moveTo(-1)}
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
                      onClick={() => tapName(student.id)}
                      aria-pressed={picked === student.id}
                      className={`flex items-center rounded-md border px-2 py-1.5 text-left text-sm ${
                        picked === student.id
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
