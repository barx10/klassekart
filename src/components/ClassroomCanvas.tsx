"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DESK_HEADER_HEIGHT,
  MAX_SEATS,
  MIN_SEATS,
  SEAT_GAP,
  alignDesks,
  canvasSize,
  clampSeats,
  deskHeight,
  deskWidth,
  desksInRect,
  distributeDesks,
  moveDesksFrom,
  nudgeDesks,
  seatGrid,
  spreadAxis,
  type Rect,
} from "@/lib/classroom";
import { genderDotClass, genderName } from "@/lib/gender";
import { pairKey } from "@/lib/seating";
import type { Desk, DeskAssignments, SeatLocks, Student } from "@/lib/types";
import { inputClassSm, plural } from "@/lib/ui";

interface SeatRef {
  deskId: string;
  index: number;
}

interface Props {
  desks: Desk[];
  assignments: DeskAssignments;
  studentsById: Map<string, Student>;
  /** Elever som er låst til et sete, med elev-id som nøkkel. */
  locks: SeatLocks;
  /** Elevpar som ikke skal sitte ved samme bord, som kanoniske par-nøkler. */
  apartKeys: Set<string>;
  /** Kalles mens pulter dras (persist=false) og når de slippes (persist=true). */
  onDesksChange: (desks: Desk[], persist: boolean) => void;
  onRemoveDesks: (deskIds: string[]) => void;
  /** Endrer antall plasser med ett steg, på alle pultene i utvalget. */
  onSeatsChange: (deskIds: string[], delta: number) => void;
  onRenameDesk: (deskId: string, name: string) => void;
  onResizeDesk: (deskId: string, w: number, h: number, persist: boolean) => void;
  onResetDeskSize: (deskId: string) => void;
  onMoveStudent: (from: SeatRef, to: SeatRef) => void;
  onToggleLock: (studentId: string, seat: SeatRef) => void;
}

interface DeskDrag {
  /** Pulten det ble tatt tak i — den avgjør hva et klikk uten bevegelse gjør. */
  deskId: string;
  /** Hvor pultene som dras sto da draget startet. */
  origins: Record<string, { x: number; y: number }>;
  startX: number;
  startY: number;
  moved: boolean;
  /** Om pulten var den eneste merkede da draget startet. */
  wasOnly: boolean;
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

/** Ramma læreren drar over lerretet for å merke flere pulter. */
interface Marquee {
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Shift beholder det som alt er merket. */
  add: boolean;
}

/** Hvor mange piksler pilene flytter merkede pulter. Shift gir grovere steg. */
const NUDGE = 8;
const NUDGE_LARGE = 32;

/**
 * Hvor langt markøren må flyttes før det telles som et drag og ikke et klikk.
 * Uten den ville en skjelven hånd på klikket gjort at pulten ikke ble merket.
 */
const DRAG_THRESHOLD = 3;

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

function marqueeRect(m: Marquee): Rect {
  return {
    x: Math.min(m.startX, m.x),
    y: Math.min(m.startY, m.y),
    width: Math.abs(m.x - m.startX),
    height: Math.abs(m.y - m.startY),
  };
}

/** Finner setet under markøren. Ghost-elementet har pointer-events: none. */
function seatAtPoint(x: number, y: number): SeatRef | null {
  const el = document.elementFromPoint(x, y);
  const seatEl = el?.closest<HTMLElement>("[data-seat]");
  if (!seatEl?.dataset.seat) return null;
  const [deskId, index] = seatEl.dataset.seat.split(":");
  return { deskId, index: Number(index) };
}

/** Hengelåsen på et elevnavn: lukket når plassen er låst, åpen ellers. */
function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
      <path
        d={locked ? "M5.6 7V4.9a2.4 2.4 0 0 1 4.8 0V7" : "M5.6 7V4.9a2.4 2.4 0 0 1 4.7-.7"}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ClassroomCanvas({
  desks,
  assignments,
  studentsById,
  locks,
  apartKeys,
  onDesksChange,
  onRemoveDesks,
  onSeatsChange,
  onRenameDesk,
  onResizeDesk,
  onResetDeskSize,
  onMoveStudent,
  onToggleLock,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [deskDrag, setDeskDrag] = useState<DeskDrag | null>(null);
  const [deskResize, setDeskResize] = useState<DeskResize | null>(null);
  const [studentDrag, setStudentDrag] = useState<StudentDrag | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  /**
   * Merkede pulter. Flere om gangen, slik at en hel rekke kan rettes inn i én
   * operasjon i stedet for å dras på plass én og én.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Setet som er «løftet» med tastatur, i påvente av et sete å bytte med. */
  const [picked, setPicked] = useState<SeatRef | null>(null);
  const [announcement, setAnnouncement] = useState("");

  /**
   * Målene lerretet låses til mens et drag pågår. `null` betyr «følg pultene».
   */
  const [heldRoom, setHeldRoom] = useState<{ width: number; height: number; zoom: number } | null>(
    null
  );

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  // Merkede pulter som fortsatt finnes. Fjernes en pult, faller den ut av
  // utvalget av seg selv, uten en effekt som rydder i tilstanden.
  const selectedDesks = useMemo(
    () => desks.filter((d) => selected.has(d.id)),
    [desks, selected]
  );
  const many = selectedDesks.length > 1;

  /**
   * Bord der to elever sitter sammen som ikke skal det. Genereringen holder dem
   * fra hverandre, men læreren kan dra dem sammen etterpå — og skal få lov: i
   * øyeblikket vet hen best. Da sier vi fra i stedet for å nekte.
   */
  const conflicts = useMemo(() => {
    const perDesk = new Map<string, string[]>();
    if (apartKeys.size === 0) return perDesk;

    for (const desk of desks) {
      const seated = (assignments[desk.id] ?? []).filter((id): id is string => Boolean(id));
      const brutt: string[] = [];
      for (let i = 0; i < seated.length; i++) {
        for (let j = i + 1; j < seated.length; j++) {
          if (!apartKeys.has(pairKey(seated[i], seated[j]))) continue;
          const a = studentsById.get(seated[i])?.name ?? "Eleven";
          const b = studentsById.get(seated[j])?.name ?? "eleven";
          brutt.push(`${a} og ${b}`);
        }
      }
      if (brutt.length > 0) perDesk.set(desk.id, brutt);
    }
    return perDesk;
  }, [desks, assignments, apartKeys, studentsById]);

  // --- Lerretets mål og zoom ----------------------------------------------
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

  /**
   * Lerretet følger pultene — men står helt stille mens en pult dras.
   *
   * Uten det måles rommet på nytt for hver eneste musebevegelse, og både
   * bredden og «Tilpass»-zoomen endrer seg mens du drar. Lerretet er sentrert
   * med `mx-auto`, så en ny bredde flytter hele klasserommet sidelengs under
   * markøren; en ny zoom skalerer alt samtidig, og kan legge til eller fjerne
   * rullefeltet, som endrer bredden igjen. Det er dette som ser ut som
   * flimring.
   *
   * Målene låses derfor både mot å krympe *og* mot å vokse — det er veksten
   * som flytter sentreringen. Ingenting går tapt av å la dem stå: pulten dras
   * med markøren, og markøren er alltid innenfor skjermen. Når du slipper,
   * finner rommet sin nye størrelse i én bevegelse.
   */
  const room = canvasSize(desks);
  const width = heldRoom ? heldRoom.width : room.width;
  const height = heldRoom ? heldRoom.height : room.height;

  const fitZoom =
    viewportWidth > 0
      ? Math.min(1, Math.max(MIN_FIT_ZOOM, viewportWidth / width))
      : 1;
  const zoom = manualZoom ?? heldRoom?.zoom ?? fitZoom;
  const isFitted = manualZoom === null;

  /** Låser målene mens et drag pågår, og slipper dem etterpå. */
  const holdRoom = () => setHeldRoom({ ...canvasSize(desks), zoom });
  const releaseRoom = () => setHeldRoom(null);

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

  const toggleSelected = (deskId: string) =>
    setSelectedIds((prev) =>
      prev.includes(deskId) ? prev.filter((id) => id !== deskId) : [...prev, deskId]
    );

  // Escape avbryter både merkingen og et løftet elevnavn.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (picked) {
        setPicked(null);
        setAnnouncement("Avbrutt.");
      } else if (selectedIds.length > 0) {
        setSelectedIds([]);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [picked, selectedIds]);

  // --- Flytting av pulter (draghåndtaket er topplinja) ---------------------

  function handleHeaderPointerDown(e: React.PointerEvent, desk: Desk) {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const point = toCanvas(e.clientX, e.clientY);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    holdRoom();

    // Shift (eller Ctrl/Cmd) legger pulten til utvalget i stedet for å dra den.
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      toggleSelected(desk.id);
      return;
    }

    // Tar du tak i en pult som ikke er merket, blir den utvalget. Er den
    // allerede med, følger resten av utvalget med på draget.
    const dragIds = selected.has(desk.id) ? selectedIds : [desk.id];
    if (!selected.has(desk.id)) setSelectedIds([desk.id]);

    const origins: Record<string, { x: number; y: number }> = {};
    for (const d of desks) {
      if (dragIds.includes(d.id)) origins[d.id] = { x: d.x, y: d.y };
    }

    setDeskDrag({
      deskId: desk.id,
      origins,
      startX: point.x,
      startY: point.y,
      moved: false,
      wasOnly: selectedIds.length === 1 && selectedIds[0] === desk.id,
    });
  }

  function handleHeaderPointerMove(e: React.PointerEvent) {
    if (!deskDrag) return;
    const point = toCanvas(e.clientX, e.clientY);
    if (!point) return;
    const dx = point.x - deskDrag.startX;
    const dy = point.y - deskDrag.startY;
    if (!deskDrag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      setDeskDrag({ ...deskDrag, moved: true });
    }
    onDesksChange(moveDesksFrom(desks, deskDrag.origins, dx, dy), false);
  }

  function handleHeaderPointerUp(e: React.PointerEvent) {
    releaseRoom();
    if (!deskDrag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);

    // Et klikk uten bevegelse merker pulten alene, eller opphever merkingen.
    if (!deskDrag.moved) {
      setSelectedIds(deskDrag.wasOnly ? [] : [deskDrag.deskId]);
      setDeskDrag(null);
      return;
    }
    // Regn sluttstillingen ut fra der markøren slippes, og ikke fra det siste
    // bildet: slippes knappen i samme øyeblikk som den siste bevegelsen, har
    // React ikke rukket å tegne den ennå, og pulten ville blitt liggende noen
    // piksler fra der læreren faktisk slapp den.
    const point = toCanvas(e.clientX, e.clientY);
    const placed = point
      ? moveDesksFrom(desks, deskDrag.origins, point.x - deskDrag.startX, point.y - deskDrag.startY)
      : desks;

    // Flytt de dratte pultene bakerst i lista slik at de tegnes øverst — ellers
    // kan en pult bli liggende skjult under en den er dratt oppå.
    const dragged = placed.filter((d) => deskDrag.origins[d.id]);
    const rest = placed.filter((d) => !deskDrag.origins[d.id]);
    setDeskDrag(null);
    onDesksChange([...rest, ...dragged], true);
  }

  /** Pilene flytter de merkede pultene, så oppsettet kan endres med tastatur. */
  function handleHeaderKeyDown(e: React.KeyboardEvent, desk: Desk) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) toggleSelected(desk.id);
      else setSelectedIds(isOnlySelected(desk.id) ? [] : [desk.id]);
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
    const ids = selected.has(desk.id) ? selected : new Set([desk.id]);
    onDesksChange(nudgeDesks(desks, ids, move[0], move[1]), true);
  }

  function isOnlySelected(deskId: string): boolean {
    return selectedIds.length === 1 && selectedIds[0] === deskId;
  }

  // --- Merke flere pulter med en ramme over lerretet -----------------------

  function handleCanvasPointerDown(e: React.PointerEvent) {
    // Bare tomt lerret starter en ramme; pultene har sine egne håndtak.
    if (e.target !== e.currentTarget) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const point = toCanvas(e.clientX, e.clientY);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setMarquee({ startX: point.x, startY: point.y, x: point.x, y: point.y, add: e.shiftKey });
  }

  function handleCanvasPointerMove(e: React.PointerEvent) {
    if (!marquee) return;
    const point = toCanvas(e.clientX, e.clientY);
    if (!point) return;
    setMarquee({ ...marquee, x: point.x, y: point.y });
  }

  function handleCanvasPointerUp(e: React.PointerEvent) {
    if (!marquee) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const rect = marqueeRect(marquee);
    setMarquee(null);

    // En ramme uten størrelse er et klikk på tomt lerret: opphev merkingen.
    if (rect.width < DRAG_THRESHOLD && rect.height < DRAG_THRESHOLD) {
      if (!marquee.add) setSelectedIds([]);
      return;
    }
    const hit = desksInRect(desks, rect);
    setSelectedIds(marquee.add ? [...new Set([...selectedIds, ...hit])] : hit);
  }

  // --- Endre størrelse på en pult (håndtaket nede til høyre) ---------------

  function handleResizePointerDown(e: React.PointerEvent, desk: Desk) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    holdRoom();
    setSelectedIds([desk.id]);
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
    releaseRoom();
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

    // En låst elev står i ro, og kan heller ikke dyttes vekk av en annen.
    if (student && locks[student.id]) {
      setAnnouncement(`${student.name} har låst plass. Lås opp for å flytte.`);
      return;
    }

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

  function toggleLock(seat: SeatRef, student: Student) {
    const locked = Boolean(locks[student.id]);
    onToggleLock(student.id, seat);
    setAnnouncement(
      locked
        ? `${student.name} kan flyttes igjen.`
        : `${student.name} er låst til plassen sin.`
    );
  }

  // --- Handlinger på flere pulter -----------------------------------------

  const canShrink = selectedDesks.some((d) => clampSeats(d.seats) > MIN_SEATS);
  const canGrow = selectedDesks.some((d) => clampSeats(d.seats) < MAX_SEATS);

  const draggedStudent = studentDrag ? studentsById.get(studentDrag.studentId) : undefined;
  const band = marquee ? marqueeRect(marquee) : null;

  return (
    <div
      data-print-area
      className="rounded-2xl border border-border bg-background p-4 sm:p-6"
      onPointerDown={(e) => {
        // Klikk på tomt lerret opphever merkingen, slik at verktøylinja forsvinner.
        if (e.target === e.currentTarget) setSelectedIds([]);
      }}
    >
      {desks.length > 0 && (
        // Fast høyde på linja: uten den vokser den når verktøylinja for flere
        // merkede dukker opp, og hele klasserommet hopper nedover.
        <div
          data-print-hide
          className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2"
        >
          {/* Verktøylinja for flere merkede pulter ligger her og ikke under dem:
              sentrert under utvalget ville den blitt klippet av rullefeltet så
              snart utvalget lå ute mot kanten av rommet. */}
          {many ? (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-accent bg-accent-soft px-1.5 py-1 text-accent-text">
              <span className="px-1 text-xs font-medium">
                {plural(selectedDesks.length, "pult", "pulter")} merket
              </span>
              <span className="h-4 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => onDesksChange(alignDesks(desks, selected, "top"), true)}
                title="Gi pultene samme overkant, så de står på rekke"
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-surface-raised"
              >
                På rekke
              </button>
              <button
                type="button"
                onClick={() => onDesksChange(alignDesks(desks, selected, "left"), true)}
                title="Gi pultene samme venstrekant, så de står i kolonne"
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-surface-raised"
              >
                I kolonne
              </button>
              <button
                type="button"
                onClick={() =>
                  onDesksChange(distributeDesks(desks, selected, spreadAxis(desks, selected)), true)
                }
                disabled={selectedDesks.length < 3}
                title="Lik avstand mellom pultene, med den første og den siste i ro"
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-surface-raised disabled:opacity-40"
              >
                Jevn avstand
              </button>
              <span className="h-4 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => onSeatsChange(selectedIds, -1)}
                disabled={!canShrink}
                aria-label="Færre plasser ved de merkede pultene"
                className="rounded px-1.5 py-0.5 text-sm hover:bg-surface-raised disabled:opacity-40"
              >
                −
              </button>
              <span className="text-[11px]">plasser</span>
              <button
                type="button"
                onClick={() => onSeatsChange(selectedIds, 1)}
                disabled={!canGrow}
                aria-label="Flere plasser ved de merkede pultene"
                className="rounded px-1.5 py-0.5 text-sm hover:bg-surface-raised disabled:opacity-40"
              >
                +
              </button>
              <span className="h-4 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => {
                  onRemoveDesks(selectedIds);
                  setSelectedIds([]);
                }}
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-surface-raised hover:text-danger"
              >
                Fjern
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded px-2 py-0.5 text-xs hover:bg-surface-raised"
              >
                Avmerk
              </button>
            </div>
          ) : (
            <p className="text-xs text-subtle">
              Dra en ramme rundt en rekke, eller shift-klikk på flere bord, for å rette dem inn.
            </p>
          )}

          <div className="flex items-center gap-1">
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
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              className="absolute top-0 left-0 origin-top-left touch-none"
              style={{ width, height, transform: `scale(${zoom})` }}
            >
              {band && (
                <div
                  data-print-hide
                  className="pointer-events-none absolute z-40 rounded border border-dashed border-accent bg-accent-soft/40"
                  style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
                  aria-hidden
                />
              )}

              {desks.map((desk) => {
                const seated = assignments[desk.id] ?? [];
                const seats = clampSeats(desk.seats);
                const isDragging = Boolean(deskDrag?.moved && deskDrag.origins[desk.id]);
                const isResizing = deskResize?.deskId === desk.id;
                const isSelected = selected.has(desk.id);
                const label = deskLabel(desk);
                const brutt = conflicts.get(desk.id);
                return (
                  <div
                    key={desk.id}
                    className={`group absolute rounded-xl border bg-surface-raised shadow-sm ${
                      isDragging || isResizing
                        ? "z-30 border-accent shadow-lg"
                        : isSelected
                          ? "z-20 border-accent"
                          : brutt
                            ? "z-10 border-danger"
                            : "z-10 border-border hover:border-border-strong"
                    }`}
                    style={{
                      left: desk.x,
                      top: desk.y,
                      width: deskWidth(desk),
                      height: deskHeight(desk),
                    }}
                  >
                    {brutt && (
                      <span
                        data-print-hide
                        title={`${brutt.join(", ")} skal ikke sitte sammen`}
                        className="absolute -top-1.5 -left-1.5 z-30 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white"
                      >
                        <span aria-hidden>!</span>
                        <span className="sr-only">{brutt.join(", ")} skal ikke sitte sammen.</span>
                      </span>
                    )}

                    {/* Topplinje: bordnavn + draghåndtak for pulten */}
                    <button
                      type="button"
                      onPointerDown={(e) => handleHeaderPointerDown(e, desk)}
                      onPointerMove={handleHeaderPointerMove}
                      onPointerUp={handleHeaderPointerUp}
                      onPointerCancel={handleHeaderPointerUp}
                      onKeyDown={(e) => handleHeaderKeyDown(e, desk)}
                      aria-label={`${label}. Enter merker pulten, shift+Enter merker flere, piltastene flytter dem.`}
                      aria-pressed={isSelected}
                      title="Dra for å flytte pulten, klikk for å merke den, shift-klikk for å merke flere"
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
                            <span key={i} data-seat={seatKey(seat)} className="block h-full w-full">
                              <button
                                type="button"
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
                            </span>
                          );
                        }

                        // Låsen hører til klasserommet: eleven blir stående her
                        // også når det genereres et nytt klassekart.
                        const lock = locks[student.id];
                        const isLocked =
                          Boolean(lock) && lock.desk_id === desk.id && lock.index === i;

                        return (
                          <span
                            key={i}
                            data-seat={seatKey(seat)}
                            className="relative block h-full w-full min-w-0"
                          >
                            <button
                              type="button"
                              onPointerDown={
                                isLocked
                                  ? undefined
                                  : (e) => handleSeatPointerDown(e, seat, student.id)
                              }
                              onPointerMove={isLocked ? undefined : handleSeatPointerMove}
                              onPointerUp={isLocked ? undefined : handleSeatPointerUp}
                              onPointerCancel={isLocked ? undefined : handleSeatPointerUp}
                              onKeyDown={(e) => handleSeatKeyDown(e, seat, student)}
                              aria-label={`${student.name}${
                                student.gender ? `, ${genderName(student.gender).toLowerCase()}` : ""
                              }, sete ${i + 1} ved ${label}.${
                                isLocked ? " Låst plass." : " Enter for å bytte plass."
                              }`}
                              aria-pressed={Boolean(isPicked)}
                              title={
                                isLocked
                                  ? `${student.name} har låst plass`
                                  : `${student.name} — dra, eller trykk Enter, for å bytte plass`
                              }
                              className={`flex h-full w-full touch-none select-none items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-left ${
                                isLocked ? "cursor-default pr-5" : "cursor-grab"
                              } ${
                                isOver || isPicked
                                  ? "border-accent bg-accent-soft"
                                  : isSource
                                    ? "border-dashed border-accent/60 bg-surface opacity-50"
                                    : isLocked
                                      ? "border-accent/50 bg-surface"
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

                            {/* Hengelåsen ligger utenfor seteknappen, ikke inni:
                                en knapp inni en knapp er ugyldig, og setet er
                                selv draghåndtaket for elevnavnet. */}
                            <button
                              type="button"
                              data-no-drag
                              data-print-hide
                              onClick={() => toggleLock(seat, student)}
                              aria-pressed={isLocked}
                              aria-label={
                                isLocked
                                  ? `Lås opp plassen til ${student.name}`
                                  : `Lås ${student.name} til denne plassen`
                              }
                              title={
                                isLocked
                                  ? "Låst plass — eleven blir stående når du genererer nytt kart"
                                  : "Lås eleven til denne plassen"
                              }
                              className={`absolute top-0.5 right-0.5 z-20 flex h-4 w-4 items-center justify-center rounded ${
                                isLocked
                                  ? "text-accent-text opacity-100"
                                  : `text-subtle hover:text-accent-text focus-visible:opacity-100 ${
                                      // Vises også når pulten er merket alene, så den
                                      // finnes uten mus. Er flere merket, ville en
                                      // hengelås på hvert eneste navn bare vært støy.
                                      isSelected && !many
                                        ? "opacity-100"
                                        : "opacity-0 group-hover:opacity-100"
                                    }`
                              }`}
                            >
                              <LockIcon locked={isLocked} />
                            </button>
                          </span>
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

                    {isSelected && !many && (
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
                          onClick={() => onSeatsChange([desk.id], -1)}
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
                          onClick={() => onSeatsChange([desk.id], 1)}
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
                            setSelectedIds([]);
                            onRemoveDesks([desk.id]);
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
        setet det skal byttes med. Hengelåsen ved navnet holder eleven på plassen sin, også når du
        genererer et nytt kart. Dra topplinja på en pult for å flytte den, hjørnet nede til høyre for
        å endre størrelsen, og klikk pulten for å gi bordet navn eller endre antall plasser.
      </p>
    </div>
  );
}
