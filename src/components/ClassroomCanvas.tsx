"use client";

import { useRef, useState } from "react";
import {
  DESK_HEADER_HEIGHT,
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

interface SeatRef {
  deskId: string;
  index: number;
}

interface Props {
  desks: Desk[];
  assignments: DeskAssignments;
  studentsById: Map<string, Student>;
  /** Kalles mens en pult dras (persist=false) og når den slippes (persist=true). */
  onDesksChange: (desks: Desk[], persist: boolean) => void;
  onRemoveDesk: (deskId: string) => void;
  onSeatsChange: (deskId: string, seats: number) => void;
  onRenameDesk: (deskId: string, name: string) => void;
  onMoveStudent: (from: SeatRef, to: SeatRef) => void;
}

interface DeskDrag {
  deskId: string;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

interface StudentDrag {
  from: SeatRef;
  studentId: string;
  x: number;
  y: number;
  over: SeatRef | null;
}

function seatKey(seat: SeatRef): string {
  return `${seat.deskId}:${seat.index}`;
}

/** Finner setet under markøren. Ghost-elementet har pointer-events: none. */
function seatAtPoint(x: number, y: number): SeatRef | null {
  const el = document.elementFromPoint(x, y);
  const seatEl = el?.closest<HTMLElement>("[data-seat]");
  if (!seatEl?.dataset.seat) return null;
  const [deskId, index] = seatEl.dataset.seat.split(":");
  return { deskId, index: Number(index) };
}

export default function ClassroomCanvas({
  desks,
  assignments,
  studentsById,
  onDesksChange,
  onRemoveDesk,
  onSeatsChange,
  onRenameDesk,
  onMoveStudent,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [deskDrag, setDeskDrag] = useState<DeskDrag | null>(null);
  const [studentDrag, setStudentDrag] = useState<StudentDrag | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // --- Flytting av pulter (draghåndtaket er topplinja) ---------------------

  function handleHeaderPointerDown(e: React.PointerEvent, desk: Desk) {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDeskDrag({
      deskId: desk.id,
      offsetX: e.clientX - rect.left - desk.x,
      offsetY: e.clientY - rect.top - desk.y,
      moved: false,
    });
  }

  function handleHeaderPointerMove(e: React.PointerEvent) {
    if (!deskDrag) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, e.clientX - rect.left - deskDrag.offsetX);
    const y = Math.max(0, e.clientY - rect.top - deskDrag.offsetY);
    if (!deskDrag.moved) setDeskDrag({ ...deskDrag, moved: true });
    onDesksChange(
      desks.map((d) => (d.id === deskDrag.deskId ? { ...d, x, y } : d)),
      false
    );
  }

  function handleHeaderPointerUp(e: React.PointerEvent) {
    if (!deskDrag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // Et klikk uten bevegelse velger pulten i stedet for å flytte den.
    if (!deskDrag.moved) {
      setSelectedId((prev) => (prev === deskDrag.deskId ? null : deskDrag.deskId));
      setDeskDrag(null);
      return;
    }
    // Flytt pulten bakerst i lista slik at den tegnes øverst — ellers kan en
    // pult bli liggende skjult under en den er dratt oppå.
    const moved = desks.find((d) => d.id === deskDrag.deskId);
    const reordered = moved ? [...desks.filter((d) => d.id !== deskDrag.deskId), moved] : desks;
    setDeskDrag(null);
    onDesksChange(reordered, true);
  }

  // --- Flytting av elever mellom seter ------------------------------------

  function handleSeatPointerDown(e: React.PointerEvent, seat: SeatRef, studentId: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setStudentDrag({ from: seat, studentId, x: e.clientX, y: e.clientY, over: null });
  }

  function handleSeatPointerMove(e: React.PointerEvent) {
    if (!studentDrag) return;
    const over = seatAtPoint(e.clientX, e.clientY);
    setStudentDrag({ ...studentDrag, x: e.clientX, y: e.clientY, over });
  }

  function handleSeatPointerUp(e: React.PointerEvent) {
    if (!studentDrag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const target = seatAtPoint(e.clientX, e.clientY);
    if (target && seatKey(target) !== seatKey(studentDrag.from)) {
      onMoveStudent(studentDrag.from, target);
    }
    setStudentDrag(null);
  }

  const { width, height } = canvasSize(desks);
  const draggedStudent = studentDrag ? studentsById.get(studentDrag.studentId) : undefined;

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
              const isDragging = deskDrag?.deskId === desk.id;
              const isSelected = selectedId === desk.id;
              return (
                <div
                  key={desk.id}
                  className={`group absolute rounded-xl border bg-surface-raised shadow-sm ${
                    isDragging
                      ? "z-30 border-accent shadow-lg"
                      : isSelected
                        ? "z-20 border-accent"
                        : "z-10 border-border hover:border-accent/50"
                  }`}
                  style={{
                    left: desk.x,
                    top: desk.y,
                    width: deskWidth(seats),
                    height: deskHeight(seats),
                  }}
                >
                  {/* Topplinje: bordnavn + draghåndtak for pulten */}
                  <div
                    onPointerDown={(e) => handleHeaderPointerDown(e, desk)}
                    onPointerMove={handleHeaderPointerMove}
                    onPointerUp={handleHeaderPointerUp}
                    onPointerCancel={handleHeaderPointerUp}
                    title="Dra for å flytte pulten, klikk for å endre den"
                    className={`flex touch-none select-none items-center justify-center rounded-t-xl px-2 text-[11px] ${
                      isDragging ? "cursor-grabbing" : "cursor-grab"
                    } ${desk.name ? "font-medium text-muted" : "text-subtle"}`}
                    style={{ height: DESK_HEADER_HEIGHT }}
                  >
                    <span className="truncate">{desk.name || "⋯"}</span>
                  </div>

                  <div
                    className="grid px-1.5 pb-1.5"
                    style={{
                      height: `calc(100% - ${DESK_HEADER_HEIGHT}px)`,
                      gridTemplateColumns: `repeat(${seatGrid(seats).cols}, minmax(0, 1fr))`,
                      gridAutoRows: "minmax(0, 1fr)",
                      gap: SEAT_GAP,
                    }}
                  >
                    {Array.from({ length: seats }, (_, i) => {
                      const seat: SeatRef = { deskId: desk.id, index: i };
                      const studentId = seated[i] ?? null;
                      const student = studentId ? studentsById.get(studentId) : undefined;
                      const isOver = studentDrag?.over && seatKey(studentDrag.over) === seatKey(seat);
                      const isSource =
                        studentDrag && seatKey(studentDrag.from) === seatKey(seat);

                      if (!student) {
                        return (
                          <div
                            key={i}
                            data-seat={seatKey(seat)}
                            className={`flex h-full w-full items-center justify-center rounded-lg border border-dashed text-[11px] ${
                              isOver ? "border-accent bg-accent-soft text-accent" : "border-border text-subtle"
                            }`}
                          >
                            Ledig
                          </div>
                        );
                      }

                      return (
                        <div
                          key={i}
                          data-seat={seatKey(seat)}
                          onPointerDown={(e) => handleSeatPointerDown(e, seat, student.id)}
                          onPointerMove={handleSeatPointerMove}
                          onPointerUp={handleSeatPointerUp}
                          onPointerCancel={handleSeatPointerUp}
                          title={`${student.name} — dra for å bytte plass`}
                          className={`flex h-full w-full cursor-grab touch-none select-none items-center gap-1.5 overflow-hidden rounded-lg border px-2 ${
                            isOver
                              ? "border-accent bg-accent-soft"
                              : isSource
                                ? "border-dashed border-accent/60 bg-surface opacity-50"
                                : "border-border bg-surface"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(student.gender)}`}
                            aria-hidden
                          />
                          <span className="truncate text-[13px] font-medium">{student.name}</span>
                        </div>
                      );
                    })}
                  </div>

                  {isSelected && (
                    // Verktøylinja ligger under pulten: over den ville den blitt
                    // klippet bort av rullefeltet rundt lerretet.
                    <div
                      data-no-drag
                      className="absolute top-full left-1/2 z-40 mt-1.5 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-surface-raised px-1.5 py-1 shadow-md"
                    >
                      <input
                        defaultValue={desk.name ?? ""}
                        placeholder="Bordnavn"
                        onBlur={(e) => onRenameDesk(desk.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="w-28 rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] outline-none focus:border-accent"
                      />
                      <span className="h-4 w-px bg-border" aria-hidden />
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
                      <span className="h-4 w-px bg-border" aria-hidden />
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

      {/* Elevkortet som følger markøren under draging */}
      {studentDrag && draggedStudent && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-lg border border-accent bg-surface-raised px-2 py-1.5 shadow-lg"
          style={{ left: studentDrag.x + 12, top: studentDrag.y + 12 }}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(draggedStudent.gender)}`}
            aria-hidden
          />
          <span className="text-[13px] font-medium">{draggedStudent.name}</span>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-subtle">
        Dra et elevnavn til et annet sete for å bytte plass. Dra topplinja på en pult for å flytte den, og
        klikk den for å gi bordet navn eller endre antall plasser.
      </p>
    </div>
  );
}
