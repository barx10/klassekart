"use client";

import { useMemo } from "react";
import { useAppData } from "@/lib/app-data";
import {
  addColumn,
  addDesk,
  addRow,
  ensureCapacity,
  removeColumn,
  removeRow,
  setDeskSeats,
  tidyDesks,
  totalSeats,
} from "@/lib/classroom";
import ConfigWarning from "@/components/ConfigWarning";
import ClassroomCanvas from "@/components/ClassroomCanvas";
import { isSupabaseConfigured } from "@/lib/supabase";

function StepperGroup({
  label,
  onAdd,
  onRemove,
  removeDisabled,
}: {
  label: string;
  onAdd: () => void;
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-border bg-surface-raised">
      <button
        onClick={onRemove}
        disabled={removeDisabled}
        aria-label={`Fjern ${label.toLowerCase()}`}
        className="px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground disabled:opacity-30"
      >
        −
      </button>
      <span className="px-1 text-sm font-medium">{label}</span>
      <button
        onClick={onAdd}
        aria-label={`Legg til ${label.toLowerCase()}`}
        className="px-2.5 py-1.5 text-muted hover:bg-background hover:text-foreground"
      >
        +
      </button>
    </div>
  );
}

export default function ClassDetailPage() {
  const {
    activeClass,
    activeStudents,
    desks,
    deskCols,
    applyDesks,
    assignments,
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

  if (!isSupabaseConfigured) return <ConfigWarning />;
  if (loading) return <p className="text-sm text-muted">Laster …</p>;
  if (!activeClass) return <p className="text-sm text-danger">Fant ikke klassen.</p>;

  const seats = totalSeats(desks);
  const tooFewSeats = seats < activeStudents.length;

  async function handleGenerate() {
    // Sørg for at det finnes nok plasser til alle elevene før vi genererer.
    if (tooFewSeats) applyDesks(ensureCapacity(desks, activeStudents.length, deskCols));
    await generate();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{activeClass.name}</h1>
        <span className="text-xs text-subtle">
          {desks.length} pulter · {seats} plasser · {activeStudents.length} elever
        </span>
      </div>

      {error && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Lukk" className="shrink-0">
            ✕
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StepperGroup
          label="Rad"
          onAdd={() => applyDesks(addRow(desks, deskCols))}
          onRemove={() => applyDesks(removeRow(desks, deskCols))}
          removeDisabled={desks.length === 0}
        />
        <StepperGroup
          label="Kolonne"
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

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        {[
          [1, "Enkeltpult"],
          [2, "Topult"],
          [3, "Tre"],
          [4, "Gruppe på 4"],
        ].map(([count, label]) => (
          <button
            key={count}
            onClick={() => applyDesks(addDesk(desks, count as number))}
            className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium hover:border-accent/50 hover:text-accent"
          >
            + {label}
          </button>
        ))}

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <button
          onClick={() => applyDesks(tidyDesks(desks, deskCols))}
          disabled={desks.length === 0}
          className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium hover:border-accent/50 hover:text-accent disabled:opacity-50"
        >
          Rydd opp
        </button>

        <button
          onClick={handleGenerate}
          disabled={generating || activeStudents.length === 0}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {generating ? "Genererer …" : "Generer klassekart"}
        </button>

        {lastResult && (
          <span className="text-xs text-muted">
            {lastResult.newPairs} av {lastResult.totalPairs} elevpar sitter sammen for første gang.
          </span>
        )}
      </div>

      {tooFewSeats && (
        <p className="mb-3 text-xs text-subtle">
          Det er {activeStudents.length} elever, men bare {seats} plasser — flere topulter legges til
          automatisk når du genererer.
        </p>
      )}

      <ClassroomCanvas
        desks={desks}
        assignments={assignments}
        studentsById={studentsById}
        onDesksChange={(next, persist) => applyDesks(next, undefined, persist)}
        onRemoveDesk={(deskId) => applyDesks(desks.filter((d) => d.id !== deskId))}
        onSeatsChange={(deskId, next) => applyDesks(setDeskSeats(desks, deskId, next))}
      />
    </div>
  );
}
