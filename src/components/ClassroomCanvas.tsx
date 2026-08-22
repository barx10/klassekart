"use client";

import { useRef, useState } from "react";
import {
  DESK_HEIGHT,
  DESK_WIDTH,
  PADDING,
  canvasSize,
} from "@/lib/classroom";
import { genderDotClass } from "@/lib/gender";
import type { Desk, DeskAssignments, Student } from "@/lib/types";

interface Props {
  desks: Desk[];
  assignments: DeskAssignments;
  studentsById: Map<string, Student>;
  /** Kalles mens en pult dras (lokal oppdatering) og når den slippes (lagring). */
  onDesksChange: (desks: Desk[], persist: boolean) => void;
  onRemoveDesk: (deskId: string) => void;
}

interface DragState {
  deskId: string;
  offsetX: number;
  offsetY: number;
}

function Seat({ student }: { student: Student | undefined }) {
  if (!student) {
    return (
      <div className="flex h-full flex-1 items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-subtle">
        Ledig
      </div>
    );
  }
  return (
    <div className="flex h-full flex-1 items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-surface px-2">
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
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  function handlePointerDown(e: React.PointerEvent, desk: Desk) {
    // Ikke start dragging fra slett-knappen.
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      deskId: desk.id,
      offsetX: e.clientX - rect.left - desk.x,
      offsetY: e.clientY - rect.top - desk.y,
    });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - drag.offsetX);
    const y = Math.max(0, e.clientY - rect.top - drag.offsetY);
    onDesksChange(
      desks.map((d) => (d.id === drag.deskId ? { ...d, x, y } : d)),
      false
    );
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
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
          Ingen pulter ennå. Bruk knappene over for å legge til rader og kolonner.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div
            ref={canvasRef}
            className="relative mx-auto"
            style={{ width, height, minWidth: width }}
          >
            {desks.map((desk) => {
              const seated = assignments[desk.id] ?? [];
              const isDragging = drag?.deskId === desk.id;
              return (
                <div
                  key={desk.id}
                  onPointerDown={(e) => handlePointerDown(e, desk)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`group absolute touch-none select-none rounded-xl border bg-surface-raised p-1.5 shadow-sm transition-shadow ${
                    isDragging
                      ? "z-20 cursor-grabbing border-accent shadow-lg"
                      : "z-10 cursor-grab border-border hover:border-accent/50"
                  }`}
                  style={{
                    left: desk.x,
                    top: desk.y,
                    width: DESK_WIDTH,
                    height: DESK_HEIGHT,
                  }}
                >
                  <div className="flex h-full gap-1.5">
                    <Seat student={seated[0] ? studentsById.get(seated[0]) : undefined} />
                    <Seat student={seated[1] ? studentsById.get(seated[1]) : undefined} />
                  </div>
                  <button
                    data-no-drag
                    onClick={() => onRemoveDesk(desk.id)}
                    aria-label="Fjern pult"
                    className="absolute -top-2 -right-2 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-raised text-xs text-subtle shadow-sm hover:text-danger group-hover:flex"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-subtle" style={{ paddingBottom: PADDING / 2 }}>
        Dra pultene dit de står i klasserommet ditt. &laquo;Rydd opp&raquo; stiller dem pent på rekke igjen.
      </p>
    </div>
  );
}
