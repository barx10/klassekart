"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DESK_HEADER_HEIGHT,
  SEAT_GAP,
  TOOLBAR_ROOM,
  canvasSize,
  clampSeats,
  deskHeight,
  deskWidth,
  seatGrid,
} from "@/lib/classroom";
import { genderSeatClass } from "@/lib/gender";
import type { Desk, DeskAssignments, Student } from "@/lib/types";

/**
 * Klassekartet i fullskjerm — til projektoren og smartboardet.
 *
 * Dette er en egen visning og ikke klasserommet med verktøyene skrudd av.
 * Lerretet i `ClassroomCanvas` er en editor: hvert sete er en knapp som kan
 * dras, hver pult har håndtak, og zoomen er tilpasset spalta ved siden av
 * menya. Her er det bare navn som skal leses fra bakerste pult, og da er
 * skaleringen en annen: kartet fyller *hele* skjermen, både i bredden og i
 * høyden, og det finnes ingenting å klikke på som kan endre plasseringen ved
 * et uhell mens klassen ser på.
 */

/** Hvor mye et lite klasserom får forstørres. Over dette blir navnene plakater. */
const MAX_ZOOM = 4;
const MIN_ZOOM = 0.2;

/** Høyden tavla og lufta under den tar, som kartet ikke får bruke. */
const BOARD_ROOM = 56;

function firstName(name: string): string {
  return name.split(" ")[0];
}

function lastName(name: string): string {
  return name.split(" ").slice(1).join(" ");
}

interface Props {
  className: string;
  desks: Desk[];
  assignments: DeskAssignments;
  studentsById: Map<string, Student>;
  /** Datoen kartet ble laget, vist ved siden av klassenavnet. */
  chartDate?: string;
  onClose: () => void;
}

export default function ClassroomView({
  className,
  desks,
  assignments,
  studentsById,
  chartDate,
  onClose,
}: Props) {
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  // Callback-ref og ikke en effekt: elementet finnes først etter at portalen er
  // montert, og en effekt med tom avhengighetsliste ville målt for tidlig.
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const next = new ResizeObserver(([entry]) =>
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height })
    );
    next.observe(el);
    observer.current = next;
    setArea({ width: el.clientWidth, height: el.clientHeight });
  }, []);

  // Lukkefunksjonen holdes i en ref, så lytterne under kan settes opp én gang.
  // Uten den ville en ny `onClose` fra foreldrekomponenten kjørt effekten på
  // nytt for hver tegning — og fullskjermen blitt slått av og på igjen.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape lukker. Visningen har ingen andre taster: den skal være umulig å
  // endre noe med mens den står på storskjermen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Ekte fullskjerm om nettleseren vil: da forsvinner også fanelinja og
   * adressefeltet, som er det som stjeler plass på en projektor. Sier den nei
   * — Safari på iPad gjør det — ligger overlegget uansett over hele vinduet,
   * og visningen fungerer som før.
   */
  useEffect(() => {
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => {});

    // Lukker brukeren fullskjermen med F11 eller Escape i nettleseren, skal
    // visningen følge etter — ellers blir den liggende igjen i vanlig vindu.
    const onChange = () => {
      if (!document.fullscreenElement) onCloseRef.current();
    };
    document.addEventListener("fullscreenchange", onChange);

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const room = canvasSize(desks);
  // Verktøylinja under nederste pultrad finnes ikke her, så plassen den
  // reserverer skal ikke telle med når kartet skaleres.
  const roomHeight = Math.max(1, room.height - TOOLBAR_ROOM);
  const zoom = area
    ? Math.min(
        MAX_ZOOM,
        Math.max(
          MIN_ZOOM,
          Math.min(area.width / room.width, (area.height - BOARD_ROOM) / roomHeight)
        )
      )
    : 1;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-print-hide
      role="dialog"
      aria-modal="true"
      aria-label={`Klassekart for ${className}`}
      className="fixed inset-0 z-50 flex flex-col bg-background p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{className}</h2>
          {chartDate && <p className="text-xs text-subtle">Klassekart {chartDate}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-muted hover:bg-background hover:text-foreground"
        >
          Lukk visningen{" "}
          <span aria-hidden className="ml-1 text-xs text-subtle">
            (Esc)
          </span>
        </button>
      </div>

      {/* Tavla står sammen med rommet og ikke oppe i toppen av skjermen: de to
          sentreres som én blokk, ellers blir det et gap mellom tavla og
          fremste pultrad når rommet er lavere enn skjermen. Tavla følger
          samtidig bredden kartet faktisk får. */}
      <div ref={measure} className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div
          className="mb-3 shrink-0"
          style={{ width: room.width * zoom, maxWidth: "100%" }}
        >
          <div className="mx-auto w-full max-w-xs rounded-xl bg-accent px-4 py-2 text-center text-sm font-semibold tracking-wide text-accent-on">
            Tavle
          </div>
        </div>

        <div style={{ width: room.width * zoom, height: roomHeight * zoom }}>
          <div
            className="relative origin-top-left"
            style={{ width: room.width, height: roomHeight, transform: `scale(${zoom})` }}
          >
            {desks.map((desk) => {
              const seated = assignments[desk.id] ?? [];
              const seats = clampSeats(desk.seats);
              return (
                <div
                  key={desk.id}
                  className="absolute rounded-xl border border-border bg-surface-raised shadow-sm"
                  style={{
                    left: desk.x,
                    top: desk.y,
                    width: deskWidth(desk),
                    height: deskHeight(desk),
                  }}
                >
                  <div
                    className="flex items-center justify-center px-2 text-[11px] font-medium text-muted"
                    style={{ height: DESK_HEADER_HEIGHT }}
                  >
                    <span className="truncate">{desk.name}</span>
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
                      const studentId = seated[i] ?? null;
                      const student = studentId ? studentsById.get(studentId) : undefined;
                      if (!student) {
                        return (
                          <span
                            key={i}
                            className="rounded-lg border border-dashed border-border"
                            aria-hidden
                          />
                        );
                      }
                      return (
                        <span
                          key={i}
                          className={`flex items-center overflow-hidden rounded-lg border px-2 ${genderSeatClass(
                            student.gender
                          )}`}
                        >
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate text-[16px] font-semibold">
                              {firstName(student.name)}
                            </span>
                            {lastName(student.name) && (
                              <span className="block truncate text-[12px] text-muted">
                                {lastName(student.name)}
                              </span>
                            )}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
