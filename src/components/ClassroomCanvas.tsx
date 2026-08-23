"use client";

import { useEffect, useRef, useState } from "react";
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
import { genderDotClass, genderLabel } from "@/lib/gender";
import type { Desk, DeskAssignments, Student } from "@/lib/types";
import { inputClassSm } from "@/lib/ui";

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

/** Hvor mange piksler pilene flytter en valgt pult. Shift gir grovere steg. */
const NUDGE = 8;
const NUDGE_LARGE = 32;

function seatKey(seat: SeatRef): string {
  return `${seat.deskId}:${seat.index}`;
}

/** Fornavn og etternavn står på hver sin linje i setet, så begge får plass. */
function firstName(name: string): string {
  return name.split(" ")[0];
}

function lastName(name: string): string {
  return name.split(" ").slice(1).join(" ");
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
  /** Setet som er «løftet» med tastatur, i påvente av et sete å bytte med. */
  const [picked, setPicked] = useState<SeatRef | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const deskLabel = (desk: Desk) =>
    desk.name || `Pult ${desks.findIndex((d) => d.id === desk.id) + 1}`;

  // Escape avbryter både valgt pult og et løftet elevnavn.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (picked) {
        setPicked(null);
        setAnnouncement("Avbrutt.");
      } else if (selectedId) {
        setSelectedId(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [picked, selectedId]);

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

  /** Pilene flytter en valgt pult, så oppsettet også kan endres med tastatur. */
  function handleHeaderKeyDown(e: React.KeyboardEvent, desk: Desk) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setSelectedId((prev) => (prev === desk.id ? null : desk.id));
      return;
    }
    const step = e.shiftKey ? NUDGE_LARGE : NUDGE;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[e.key];
    if (!move) return;
    e.preventDefault();
    onDesksChange(
      desks.map((d) =>
        d.id === desk.id
          ? { ...d, x: Math.max(0, d.x + move[0]), y: Math.max(0, d.y + move[1]) }
          : d
      ),
      true
    );
  }

  // --- Flytting av elever mellom seter ------------------------------------

  function handleSeatPointerDown(e: React.PointerEvent, seat: SeatRef, studentId: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
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

  /**
   * Tastaturvarianten av dra-og-slipp: Enter løfter eleven i setet, Enter på et
   * annet sete bytter dem. Uten dette var det umulig å flytte en elev uten mus.
   */
  function handleSeatKeyDown(e: React.KeyboardEvent, seat: SeatRef, student: Student | undefined) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();

    if (!picked) {
      if (!student) return;
      setPicked(seat);
      setAnnouncement(`${student.name} er løftet. Velg et annet sete og trykk Enter for å bytte.`);
      return;
    }

    if (seatKey(picked) === seatKey(seat)) {
      setPicked(null);
      setAnnouncement("Avbrutt.");
      return;
    }

    const movedName = (() => {
      const id = (assignments[picked.deskId] ?? [])[picked.index];
      return id ? studentsById.get(id)?.name : undefined;
    })();

    onMoveStudent(picked, seat);
    setPicked(null);
    setAnnouncement(
      student
        ? `${movedName ?? "Eleven"} og ${student.name} byttet plass.`
        : `${movedName ?? "Eleven"} flyttet til ledig sete.`
    );
  }

  const { width, height } = canvasSize(desks);
  const draggedStudent = studentDrag ? studentsById.get(studentDrag.studentId) : undefined;

  return (
    <div
      data-print-area
      className="rounded-2xl border border-border bg-background p-4 sm:p-6"
      onPointerDown={(e) => {
        // Klikk på tomt lerret opphever valget, slik at verktøylinja forsvinner.
        if (e.target === e.currentTarget) setSelectedId(null);
      }}
    >
      <div className="mx-auto mb-6 w-full max-w-sm rounded-full border border-border bg-surface-raised py-2 text-center text-sm font-medium text-muted shadow-sm">
        Tavle
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {desks.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Ingen pulter ennå. Bruk knappene over for å legge til rader, kolonner eller enkeltpulter.
        </p>
      ) : (
        <div data-print-area className="overflow-x-auto">
          <div ref={canvasRef} className="relative mx-auto" style={{ width, height, minWidth: width }}>
            {desks.map((desk) => {
              const seated = assignments[desk.id] ?? [];
              const seats = clampSeats(desk.seats);
              const isDragging = deskDrag?.deskId === desk.id;
              const isSelected = selectedId === desk.id;
              const label = deskLabel(desk);
              return (
                <div
                  key={desk.id}
                  className={`group absolute rounded-xl border bg-surface-raised shadow-sm ${
                    isDragging
                      ? "z-30 border-accent shadow-lg"
                      : isSelected
                        ? "z-20 border-accent"
                        : "z-10 border-border hover:border-border-strong"
                  }`}
                  style={{
                    left: desk.x,
                    top: desk.y,
                    width: deskWidth(seats),
                    height: deskHeight(seats),
                  }}
                >
                  {/* Topplinje: bordnavn + draghåndtak for pulten */}
                  <button
                    type="button"
                    onPointerDown={(e) => handleHeaderPointerDown(e, desk)}
                    onPointerMove={handleHeaderPointerMove}
                    onPointerUp={handleHeaderPointerUp}
                    onPointerCancel={handleHeaderPointerUp}
                    onKeyDown={(e) => handleHeaderKeyDown(e, desk)}
                    aria-label={`${label}. Enter velger pulten, piltastene flytter den.`}
                    aria-pressed={isSelected}
                    title="Dra for å flytte pulten, klikk for å endre den"
                    className={`flex w-full touch-none select-none items-center justify-center rounded-t-xl px-2 text-[11px] ${
                      isDragging ? "cursor-grabbing" : "cursor-grab"
                    } ${desk.name ? "font-medium text-muted" : "text-subtle"}`}
                    style={{ height: DESK_HEADER_HEIGHT }}
                  >
                    <span className="truncate">
                      {desk.name || <span className="print:hidden">⋯</span>}
                    </span>
                  </button>

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
                      const isSource = studentDrag && seatKey(studentDrag.from) === seatKey(seat);
                      const isPicked = picked && seatKey(picked) === seatKey(seat);
                      const isTarget = picked && !isPicked;

                      if (!student) {
                        return (
                          <button
                            key={i}
                            type="button"
                            data-seat={seatKey(seat)}
                            disabled={!picked}
                            onKeyDown={(e) => handleSeatKeyDown(e, seat, undefined)}
                            aria-label={`Ledig sete ${i + 1} ved ${label}`}
                            className={`flex h-full w-full items-center justify-center rounded-lg border border-dashed text-[11px] disabled:cursor-default disabled:opacity-100 ${
                              isOver || isTarget
                                ? "border-accent bg-accent-soft text-accent-text"
                                : "border-border text-subtle"
                            }`}
                          >
                            Ledig
                          </button>
                        );
                      }

                      return (
                        <button
                          key={i}
                          type="button"
                          data-seat={seatKey(seat)}
                          onPointerDown={(e) => handleSeatPointerDown(e, seat, student.id)}
                          onPointerMove={handleSeatPointerMove}
                          onPointerUp={handleSeatPointerUp}
                          onPointerCancel={handleSeatPointerUp}
                          onKeyDown={(e) => handleSeatKeyDown(e, seat, student)}
                          aria-label={`${student.name}, ${genderLabel[student.gender].toLowerCase()}, sete ${
                            i + 1
                          } ved ${label}. Enter for å bytte plass.`}
                          aria-pressed={Boolean(isPicked)}
                          title={`${student.name} — dra, eller trykk Enter, for å bytte plass`}
                          className={`flex h-full w-full cursor-grab touch-none select-none items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-left ${
                            isOver || isPicked
                              ? "border-accent bg-accent-soft"
                              : isSource
                                ? "border-dashed border-accent/60 bg-surface opacity-50"
                                : isTarget
                                  ? "border-accent/40 bg-surface"
                                  : "border-border bg-surface"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(student.gender)}`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate text-[13px] font-medium">
                              {firstName(student.name)}
                            </span>
                            {lastName(student.name) && (
                              <span className="block truncate text-[11px] text-subtle">
                                {lastName(student.name)}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {isSelected && (
                    // Verktøylinja ligger under pulten: over den ville den blitt
                    // klippet bort av rullefeltet rundt lerretet.
                    <div
                      data-no-drag
                      data-print-hide
                      className="absolute top-full left-1/2 z-40 mt-1.5 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-surface-raised px-1.5 py-1 shadow-md"
                    >
                      <label className="sr-only" htmlFor={`bordnavn-${desk.id}`}>
                        Navn på {label}
                      </label>
                      <input
                        id={`bordnavn-${desk.id}`}
                        defaultValue={desk.name ?? ""}
                        placeholder="Bordnavn"
                        onBlur={(e) => onRenameDesk(desk.id, e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className={`${inputClassSm} w-28 py-0.5 text-[11px]`}
                      />
                      <span className="h-4 w-px bg-border" aria-hidden />
                      <button
                        type="button"
                        onClick={() => onSeatsChange(desk.id, seats - 1)}
                        disabled={seats <= MIN_SEATS}
                        aria-label="Færre plasser"
                        className="rounded px-1.5 py-0.5 text-sm text-muted hover:text-foreground disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="min-w-[3.5rem] text-center text-[11px] text-muted">
                        {seats} {seats === 1 ? "plass" : "plasser"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSeatsChange(desk.id, seats + 1)}
                        disabled={seats >= MAX_SEATS}
                        aria-label="Flere plasser"
                        className="rounded px-1.5 py-0.5 text-sm text-muted hover:text-foreground disabled:opacity-30"
                      >
                        +
                      </button>
                      <span className="h-4 w-px bg-border" aria-hidden />
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(null);
                          onRemoveDesk(desk.id);
                        }}
                        aria-label={`Fjern ${label}`}
                        className="rounded px-1.5 py-0.5 text-subtle hover:text-danger"
                      >
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
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

      <p data-print-hide className="mt-4 text-center text-xs text-subtle">
        Dra et elevnavn til et annet sete for å bytte plass, eller trykk Enter på setet og Enter på
        setet det skal byttes med. Dra topplinja på en pult for å flytte den, og klikk den for å gi
        bordet navn eller endre antall plasser.
      </p>
    </div>
  );
}
