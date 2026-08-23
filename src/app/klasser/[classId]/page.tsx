"use client";

import { useMemo } from "react";
import { useAppData } from "@/lib/app-data";
import {
  addColumn,
  addDesk,
  addRow,
  desksOverlap,
  removeColumn,
  removeRow,
  rowCount,
  setDeskName,
  setDeskSeats,
  tidyDesks,
  totalSeats,
} from "@/lib/classroom";
import ConfigWarning from "@/components/ConfigWarning";
import ClassroomCanvas from "@/components/ClassroomCanvas";
import { isSupabaseConfigured } from "@/lib/supabase";
import { plural, primaryButton, secondaryButton } from "@/lib/ui";

/** −/+ rundt en verdi. Verdien vises, så du ser hva du justerer. */
function Stepper({
  label,
  value,
  onAdd,
  onRemove,
  removeDisabled,
}: {
  label: string;
  value: number;
  onAdd: () => void;
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center overflow-hidden rounded-md border border-border bg-surface-raised">
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          aria-label={`Færre ${label.toLowerCase()}`}
          className="px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground disabled:opacity-30"
        >
          −
        </button>
        <span
          aria-live="polite"
          className="min-w-[1.75rem] px-1 text-center text-sm font-medium tabular-nums"
        >
          <span aria-hidden>{value}</span>
          <span className="sr-only">
            {value} {label.toLowerCase()}
          </span>
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Flere ${label.toLowerCase()}`}
          className="px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
        >
          +
        </button>
      </div>
    </div>
  );
}

const DESK_PRESETS: { seats: number; label: string }[] = [
  { seats: 1, label: "1 plass" },
  { seats: 2, label: "2 plasser" },
  { seats: 3, label: "3 plasser" },
  { seats: 4, label: "4 plasser" },
];

export default function ClassDetailPage() {
  const {
    activeClass,
    activeStudents,
    desks,
    deskCols,
    applyDesks,
    assignments,
    charts,
    activeChartId,
    moveStudent,
    generate,
    generating,
    lastResult,
    loading,
    error,
    setError,
  } = useAppData();

  const studentsById = useMemo(
    () => new Map(activeStudents.map((s) => [s.id, s])),
    [activeStudents]
  );

  const activeChart = charts.find((c) => c.id === activeChartId);

  if (!isSupabaseConfigured) return <ConfigWarning />;
  if (loading)
    return (
      <p className="text-sm text-muted" role="status">
        Laster …
      </p>
    );
  if (!activeClass) return <p className="text-sm text-danger">Fant ikke klassen.</p>;

  const seats = totalSeats(desks);
  const tooFewSeats = seats < activeStudents.length;
  const rows = rowCount(desks.length, deskCols);
  const overlapping = desksOverlap(desks);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{activeClass.name}</h1>
          <p className="mt-0.5 text-xs text-subtle print:hidden">
            {plural(desks.length, "pult", "pulter")} · {plural(seats, "plass", "plasser")} ·{" "}
            {plural(activeStudents.length, "elev", "elever")}
            {activeChart && (
              <>
                {" · kart fra "}
                {new Date(activeChart.created_at).toLocaleString("nb-NO", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            )}
          </p>
        </div>

        <div data-print-hide className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!activeChart}
            title={activeChart ? "Skriv ut klassekartet" : "Generer et klassekart først"}
            className={secondaryButton()}
          >
            Skriv ut
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={generating || activeStudents.length === 0}
            title={
              activeStudents.length === 0 ? "Legg til elever i klassen først" : undefined
            }
            className={primaryButton()}
          >
            {generating ? "Genererer …" : "Generer klassekart"}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-danger/40 bg-danger-soft px-4 py-2.5 text-sm text-danger"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Lukk feilmelding"
            className="shrink-0 rounded px-1"
          >
            ✕
          </button>
        </div>
      )}

      {lastResult && (
        <p
          role="status"
          className="mb-3 inline-flex rounded-lg border border-good/30 bg-good-soft px-3 py-1.5 text-xs text-good"
        >
          {lastResult.newPairs} av {lastResult.totalPairs} elevpar sitter sammen for første gang.
        </p>
      )}

      {/* Verktøy for å bygge klasserommet. Lå tidligere på én lang linje sammen
          med hovedhandlingen; nå er de samlet for seg, gruppert etter hva de gjør. */}
      <div
        data-print-hide
        className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border bg-surface px-3 py-2.5"
      >
        <Stepper
          label="Rader"
          value={desks.length === 0 ? 0 : rows}
          onAdd={() => applyDesks(addRow(desks, deskCols))}
          onRemove={() => applyDesks(removeRow(desks, deskCols))}
          removeDisabled={desks.length === 0}
        />
        <Stepper
          label="Kolonner"
          value={deskCols}
          onAdd={() => {
            const next = addColumn(desks, deskCols);
            applyDesks(next.desks, next.cols);
          }}
          onRemove={() => {
            const next = removeColumn(desks, deskCols);
            applyDesks(next.desks, next.cols);
          }}
          removeDisabled={deskCols <= 1}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Legg til pult</span>
          {DESK_PRESETS.map(({ seats: count, label }) => (
            <button
              key={count}
              type="button"
              onClick={() => applyDesks(addDesk(desks, count))}
              className="rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium hover:border-border-strong hover:bg-background"
            >
              + {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => applyDesks(tidyDesks(desks, deskCols))}
          disabled={desks.length === 0}
          title="Still pultene opp i jevne rader"
          className={secondaryButton("sm")}
        >
          Rydd opp
        </button>
      </div>

      {overlapping && (
        <div
          data-print-hide
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted"
        >
          <span>Noen pulter ligger oppå hverandre.</span>
          <button
            type="button"
            onClick={() => applyDesks(tidyDesks(desks, deskCols))}
            className={secondaryButton("sm")}
          >
            Rydd opp
          </button>
        </div>
      )}

      {tooFewSeats && (
        <p className="mb-3 text-xs text-subtle">
          Det er {plural(activeStudents.length, "elev", "elever")}, men bare{" "}
          {plural(seats, "plass", "plasser")} — flere topulter legges til automatisk når du
          genererer.
        </p>
      )}

      {/* Datolinje som bare kommer med på papiret — på skjermen står den
          allerede i meta-linja under klassenavnet. */}
      {activeChart && (
        <p className="mb-3 hidden text-xs print:block">
          Klassekart {new Date(activeChart.created_at).toLocaleDateString("nb-NO")}
        </p>
      )}

      <ClassroomCanvas
        desks={desks}
        assignments={assignments}
        studentsById={studentsById}
        onDesksChange={(next, persist) => applyDesks(next, undefined, persist)}
        onRemoveDesk={(deskId) => applyDesks(desks.filter((d) => d.id !== deskId))}
        onSeatsChange={(deskId, next) => applyDesks(setDeskSeats(desks, deskId, next))}
        onRenameDesk={(deskId, name) => applyDesks(setDeskName(desks, deskId, name))}
        onMoveStudent={moveStudent}
      />
    </div>
  );
}
