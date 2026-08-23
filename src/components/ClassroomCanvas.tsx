"use client";

import { useRef, useState } from "react";
import {
  MAX_SEATS,
  MIN_SEATS,
  SEAT_GAP,
  canvasSize,
  clampSeats,
  deskHeight,
  deskWidth,
  seatGrid,
} from "@/lib/classroom";
import { genderDotClass } from "@/lib/gender";
import type { Desk, DeskAssignments, Student } from "@/lib/types";

interface Props {
  desks: Desk[];
  assignments: DeskAssignments;
  studentsById: Map<string, Student>;
  /** Kalles mens en pult dras (persist=false) og når den slippes (persist=true). */
  onDesksChange: (desks: Desk[], persist: boolean) => void;
  onRemoveDesk: (deskId: string) => void;
  onSeatsChange: (deskId: string, seats: number) => void;
}

interface DragState {
  deskId: string;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

function Seat({ student }: { student: Student | undefined }) {
  if (!student) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-subtle">
        Ledig
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-surface px-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(student.gender)}`} aria-hidden />
      <span className="truncate text-[13px] font-medium">{student.name}</span>
    </div>
  );
}

export default function ClassroomCanvas({
  desks,
  assignments,
  studentsById,
  onDesksChange,
  onRemoveDesk,
  onSeatsChange,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handlePointerDown(e: React.PointerEvent, desk: Desk) {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      deskId: desk.id,
      offsetX: e.clientX - rect.left - desk.x,
      offsetY: e.clientY - rect.top - desk.y,
      moved: false,
    });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - drag.offsetX);
    const y = Math.max(0, e.clientY - rect.top - drag.offsetY);
    if (!drag.moved) setDrag({ ...drag, moved: true });
    onDesksChange(
      desks.map((d) => (d.id === drag.deskId ? { ...d, x, y } : d)),
      false
    );
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // Et klikk uten bevegelse velger pulten i stedet for å flytte den.
    if (!drag.moved) {
      setSelectedId((prev) => (prev === drag.deskId ? null : drag.deskId));
      setDrag(null);
      return;
    }
    // Flytt pulten bakerst i lista slik at den tegnes øverst — ellers kan en
    // pult bli liggende skjult under en den er dratt oppå.
    const moved = desks.find((d) => d.id === drag.deskId);
    const reordered = moved ? [...desks.filter((d) => d.id !== drag.deskId), moved] : desks;
    setDrag(null);
    onDesksChange(reordered, true);
  }

  const { width, height } = canvasSize(desks);

  return (
    <div className="rounded-2xl border border-border bg-background p-4 sm:p-6">
      <div className="mx-auto mb-6 w-full max-w-sm rounded-full border border-border bg-surface-raised py-2 text-center text-sm font-medium text-muted shadow-sm">
        Tavle
      </div>

      {desks.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Ingen pulter ennå. Bruk knappene over for å legge til rader, kolonner eller enkeltpulter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div ref={canvasRef} className="relative mx-auto" style={{ width, height, minWidth: width }}>
            {desks.map((desk) => {
              const seated = assignments[desk.id] ?? [];
              const seats = clampSeats(desk.seats);
              const isDragging = drag?.deskId === desk.id;
              const isSelected = selectedId === desk.id;
              return (
                <div
                  key={desk.id}
                  onPointerDown={(e) => handlePointerDown(e, desk)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`group absolute touch-none select-none rounded-xl border bg-surface-raised p-1.5 shadow-sm ${
                    isDragging
                      ? "z-30 cursor-grabbing border-accent shadow-lg"
                      : isSelected
                        ? "z-20 cursor-grab border-accent"
                        : "z-10 cursor-grab border-border hover:border-accent/50"
                  }`}
                  style={{
                    left: desk.x,
                    top: desk.y,
                    width: deskWidth(seats),
                    height: deskHeight(seats),
                  }}
                >
                  <div
                    className="grid h-full"
                    style={{
                      gridTemplateColumns: `repeat(${seatGrid(seats).cols}, minmax(0, 1fr))`,
                      gridAutoRows: "minmax(0, 1fr)",
                      gap: SEAT_GAP,
                    }}
                  >
                    {Array.from({ length: seats }, (_, i) => (
                      <Seat key={i} student={seated[i] ? studentsById.get(seated[i]) : undefined} />
                    ))}
                  </div>

                  {isSelected && (
                    // Verktøylinja ligger under pulten: over pulten ville den blitt
                    // klippet bort av rullefeltet rundt lerretet.
                    <div
                      data-no-drag
                      className="absolute top-full left-1/2 z-40 mt-1.5 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-surface-raised px-1 py-0.5 shadow-md"
                    >
                      <button
                        onClick={() => onSeatsChange(desk.id, seats - 1)}
                        disabled={seats <= MIN_SEATS}
                        aria-label="Færre plasser"
                        className="px-1.5 py-0.5 text-sm text-muted hover:text-foreground disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="min-w-[3.5rem] text-center text-[11px] text-muted">
                        {seats} {seats === 1 ? "plass" : "plasser"}
                      </span>
                      <button
                        onClick={() => onSeatsChange(desk.id, seats + 1)}
                        disabled={seats >= MAX_SEATS}
                        aria-label="Flere plasser"
                        className="px-1.5 py-0.5 text-sm text-muted hover:text-foreground disabled:opacity-30"
                      >
                        +
                      </button>
                      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                      <button
                        onClick={() => {
                          setSelectedId(null);
                          onRemoveDesk(desk.id);
                        }}
                        aria-label="Fjern pult"
                        className="px-1.5 py-0.5 text-sm text-subtle hover:text-danger"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-subtle">
        Dra pultene dit de står i klasserommet ditt. Klikk en pult for å endre antall plasser eller fjerne
        den. &laquo;Rydd opp&raquo; stiller dem pent på rekke igjen.
      </p>
    </div>
  );
}
