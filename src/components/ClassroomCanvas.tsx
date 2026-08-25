"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { genderDotClass, genderName } from "@/lib/gender";
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
  onResizeDesk: (deskId: string, w: number, h: number, persist: boolean) => void;
  onResetDeskSize: (deskId: string) => void;
  onMoveStudent: (from: SeatRef, to: SeatRef) => void;
}

interface DeskDrag {
  deskId: string;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

interface DeskResize {
  deskId: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
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

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
/**
 * «Tilpass» krymper ikke under dette. På en mobilskjerm ville et stort rom
 * havnet på 25 %, og da er navnene borte uansett — da er det bedre å la
 * kartet rulle. Vil du helt ut likevel, tar zoom-knappene deg dit.
 */
const MIN_FIT_ZOOM = 0.5;

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
  onResizeDesk,
  onResetDeskSize,
  onMoveStudent,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [deskDrag, setDeskDrag] = useState<DeskDrag | null>(null);
  const [deskResize, setDeskResize] = useState<DeskResize | null>(null);
  const [studentDrag, setStudentDrag] = useState<StudentDrag | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Setet som er «løftet» med tastatur, i påvente av et sete å bytte med. */
  const [picked, setPicked] = useState<SeatRef | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const { width, height } = canvasSize(desks);

  // --- Zoom ----------------------------------------------------------------
  // Klasserommet er ofte bredere enn skjermen. Før måtte du dra i et rullefelt
  // for å se resten av kartet; nå krympes lerretet så hele rommet er synlig,
  // med mulighet til å zoome inn manuelt.
  const [viewportWidth, setViewportWidth] = useState(0);
  const [manualZoom, setManualZoom] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setViewportWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const fitZoom =
    viewportWidth > 0
      ? Math.min(1, Math.max(MIN_FIT_ZOOM, viewportWidth / width))
      : 1;
  const zoom = manualZoom ?? fitZoom;
  const isFitted = manualZoom === null;

  const stepZoom = (delta: number) =>
    setManualZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((zoom + delta) * 100) / 100)));

  /** Klientkoordinater om til lerret-koordinater, med zoomen regnet inn. */
  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    },
    [zoom]
  );

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
    const point = toCanvas(e.clientX, e.clientY);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDeskDrag({
      deskId: desk.id,
      offsetX: point.x - desk.x,
      offsetY: point.y - desk.y,
      moved: false,
    });
  }

  function handleHeaderPointerMove(e: React.PointerEvent) {
    if (!deskDrag) return;
    const point = toCanvas(e.clientX, e.clientY);
    if (!point) return;
    const x = Math.max(0, point.x - deskDrag.offsetX);
    const y = Math.max(0, point.y - deskDrag.offsetY);
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

  // --- Endre størrelse på en pult (håndtaket nede til høyre) ---------------

  function handleResizePointerDown(e: React.PointerEvent, desk: Desk) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(desk.id);
    setDeskResize({
      deskId: desk.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: deskWidth(desk),
      startH: deskHeight(desk),
    });
  }

  function handleResizePointerMove(e: React.PointerEvent) {
    if (!deskResize) return;
    onResizeDesk(
      deskResize.deskId,
      deskResize.startW + (e.clientX - deskResize.startX) / zoom,
      deskResize.startH + (e.clientY - deskResize.startY) / zoom,
      false
    );
  }

  function handleResizePointerUp(e: React.PointerEvent) {
    if (!deskResize) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onResizeDesk(
      deskResize.deskId,
      deskResize.startW + (e.clientX - deskResize.startX) / zoom,
      deskResize.startH + (e.clientY - deskResize.startY) / zoom,
      true
    );
    setDeskResize(null);
  }

  /** Størrelsen kan også endres med piltastene, for de som ikke bruker mus. */
  function handleResizeKeyDown(e: React.KeyboardEvent, desk: Desk) {
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
    onResizeDesk(desk.id, deskWidth(desk) + move[0], deskHeight(desk) + move[1], true);
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
      {desks.length > 0 && (
        <div data-print-hide className="mb-2 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setManualZoom(null)}
            aria-pressed={isFitted}
            title="Vis hele klasserommet"
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              isFitted
                ? "border-accent bg-accent-soft text-accent-text"
                : "border-border bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            Tilpass
          </button>
          <div className="flex items-center overflow-hidden rounded-md border border-border bg-surface-raised">
            <button
              type="button"
              onClick={() => stepZoom(-ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom ut"
              className="px-2 py-1 text-muted hover:bg-background hover:text-foreground disabled:opacity-30"
            >
              −
            </button>
            <span
              aria-live="polite"
              className="min-w-[3rem] px-1 text-center text-xs tabular-nums text-muted"
            >
              {Math.round(zoom * 100)} %
            </span>
            <button
              type="button"
              onClick={() => stepZoom(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom inn"
              className="px-2 py-1 text-muted hover:bg-background hover:text-foreground disabled:opacity-30"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Tavla følger bredden på rommet slik det vises nå — ellers ville den
          blitt stående bred igjen mens klasserommet krympet under den. */}
      <div
        className="mx-auto mb-6"
        style={desks.length > 0 ? { width: width * zoom, maxWidth: "100%" } : undefined}
      >
        <div className="mx-auto w-full max-w-sm rounded-full border border-border bg-surface-raised py-2 text-center text-sm font-medium text-muted shadow-sm">
          Tavle
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {desks.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Ingen pulter ennå. Bruk knappene over for å legge til rader, kolonner eller enkeltpulter.
        </p>
      ) : (
        <div ref={viewportRef} data-print-area className="overflow-x-auto">
          {/* Ytre boks tar den skalerte plassen, så sida flyter riktig rundt. */}
          <div
            className="relative mx-auto"
            style={{ width: width * zoom, height: height * zoom }}
          >
            <div
              ref={canvasRef}
              className="absolute top-0 left-0 origin-top-left"
              style={{ width, height, transform: `scale(${zoom})` }}
            >
              {desks.map((desk) => {
                const seated = assignments[desk.id] ?? [];
                const seats = clampSeats(desk.seats);
                const isDragging = deskDrag?.deskId === desk.id;
                const isResizing = deskResize?.deskId === desk.id;
                const isSelected = selectedId === desk.id;
                const label = deskLabel(desk);
                return (
                  <div
                    key={desk.id}
                    className={`group absolute rounded-xl border bg-surface-raised shadow-sm ${
                      isDragging || isResizing
                        ? "z-30 border-accent shadow-lg"
                        : isSelected
                          ? "z-20 border-accent"
                          : "z-10 border-border hover:border-border-strong"
                    }`}
                    style={{
                      left: desk.x,
                      top: desk.y,
                      width: deskWidth(desk),
                      height: deskHeight(desk),
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
                        const isOver =
                          studentDrag?.over && seatKey(studentDrag.over) === seatKey(seat);
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
                            aria-label={`${student.name}${
                              student.gender ? `, ${genderName(student.gender).toLowerCase()}` : ""
                            }, sete ${i + 1} ved ${label}. Enter for å bytte plass.`}
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
                            {student.gender && (
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(
                                  student.gender
                                )}`}
                                aria-hidden
                              />
                            )}
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

                    {/* Håndtaket nede til høyre endrer størrelsen på pulten. */}
                    <button
                      type="button"
                      data-no-drag
                      data-print-hide
                      onPointerDown={(e) => handleResizePointerDown(e, desk)}
                      onPointerMove={handleResizePointerMove}
                      onPointerUp={handleResizePointerUp}
                      onPointerCancel={handleResizePointerUp}
                      onKeyDown={(e) => handleResizeKeyDown(e, desk)}
                      aria-label={`Endre størrelse på ${label}. Piltastene justerer bredde og høyde.`}
                      title="Dra for å endre størrelsen på pulten"
                      className={`absolute -right-0.5 -bottom-0.5 z-30 flex h-4 w-4 cursor-nwse-resize touch-none items-end justify-end rounded-br-xl text-subtle transition-opacity hover:text-accent-text focus-visible:opacity-100 ${
                        isSelected || isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
                        <path
                          d="M9 1v8H1"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>

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
                        {(desk.w !== undefined || desk.h !== undefined) && (
                          <>
                            <span className="h-4 w-px bg-border" aria-hidden />
                            <button
                              type="button"
                              onClick={() => onResetDeskSize(desk.id)}
                              className="rounded px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground"
                            >
                              Standardstørrelse
                            </button>
                          </>
                        )}
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Elevkortet som følger markøren under draging */}
      {studentDrag && draggedStudent && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-lg border border-accent bg-surface-raised px-2 py-1.5 shadow-lg"
          style={{ left: studentDrag.x + 12, top: studentDrag.y + 12 }}
        >
          {draggedStudent.gender && (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(draggedStudent.gender)}`}
              aria-hidden
            />
          )}
          <span className="text-[13px] font-medium">{draggedStudent.name}</span>
        </div>
      )}

      <p data-print-hide className="mt-4 text-center text-xs text-subtle">
        Dra et elevnavn til et annet sete for å bytte plass, eller trykk Enter på setet og Enter på
        setet det skal byttes med. Dra topplinja på en pult for å flytte den, hjørnet nede til høyre
        for å endre størrelsen, og klikk pulten for å gi bordet navn eller endre antall plasser.
      </p>
    </div>
  );
}
