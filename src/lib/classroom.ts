import type { Desk } from "./types";

/** Piksel-mål for pulter og rutenettet "Rydd opp" stiller dem opp i. */
export const SEAT_WIDTH = 84;
export const SEAT_GAP = 6;
export const DESK_PADDING = 6;
export const DESK_HEIGHT = 62;
export const GAP_X = 28;
export const GAP_Y = 40;
export const PADDING = 16;

/** Tillatt antall plasser ved én pult: enkeltpult, topult eller bordgruppe. */
export const MIN_SEATS = 1;
export const MAX_SEATS = 4;
export const DEFAULT_SEATS = 2;

let deskCounter = 0;

export function newDeskId(): string {
  deskCounter += 1;
  return `d${Date.now().toString(36)}${deskCounter.toString(36)}`;
}

export function clampSeats(seats: number): number {
  if (!Number.isFinite(seats)) return DEFAULT_SEATS;
  return Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(seats)));
}

/**
 * Leser pulter fra databasen. Pulter lagret før flerplass-støtten mangler
 * `seats`, og tolkes som topulter.
 */
export function normalizeDesks(raw: unknown): Desk[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => ({
      id: String(d.id ?? newDeskId()),
      x: Number(d.x) || 0,
      y: Number(d.y) || 0,
      seats: clampSeats(Number(d.seats) || DEFAULT_SEATS),
    }));
}

export function deskWidth(seats: number): number {
  const n = clampSeats(seats);
  return n * SEAT_WIDTH + (n - 1) * SEAT_GAP + DESK_PADDING * 2;
}

export function createDesk(seats = DEFAULT_SEATS): Desk {
  return { id: newDeskId(), x: 0, y: 0, seats: clampSeats(seats) };
}

/**
 * Sorterer pultene i lese-rekkefølge (rad for rad, venstre mot høyre) slik at
 * "Rydd opp" beholder omtrent den plasseringen læreren allerede har dratt dem
 * til, bare pent innrettet.
 */
function readingOrder(desks: Desk[]): Desk[] {
  return [...desks].sort((a, b) =>
    Math.abs(a.y - b.y) > DESK_HEIGHT / 2 ? a.y - b.y : a.x - b.x
  );
}

/**
 * Stiller pultene opp i jevne rader med `cols` pulter per rad. Pultene kan ha
 * ulik bredde, så hver rad pakkes fra venstre med faktisk pultbredde.
 */
export function tidyDesks(desks: Desk[], cols: number): Desk[] {
  const safeCols = Math.max(1, cols);
  const ordered = readingOrder(desks);
  const result: Desk[] = [];
  let y = PADDING;

  for (let i = 0; i < ordered.length; i += safeCols) {
    let x = PADDING;
    for (const desk of ordered.slice(i, i + safeCols)) {
      result.push({ ...desk, x, y });
      x += deskWidth(desk.seats) + GAP_X;
    }
    y += DESK_HEIGHT + GAP_Y;
  }
  return result;
}

/** Hvor mange rader pultene fyller med gjeldende kolonnebredde. */
export function rowCount(deskCount: number, cols: number): number {
  return Math.max(1, Math.ceil(deskCount / Math.max(1, cols)));
}

/** Legger til én rad med pulter nederst, og rydder opp. */
export function addRow(desks: Desk[], cols: number, seats = DEFAULT_SEATS): Desk[] {
  const safeCols = Math.max(1, cols);
  const added = Array.from({ length: safeCols }, () => createDesk(seats));
  return tidyDesks([...readingOrder(desks), ...added], safeCols);
}

/** Fjerner den nederste raden med pulter. */
export function removeRow(desks: Desk[], cols: number): Desk[] {
  const safeCols = Math.max(1, cols);
  const ordered = readingOrder(desks);
  const keep = Math.max(0, ordered.length - safeCols);
  return tidyDesks(ordered.slice(0, keep), safeCols);
}

/**
 * Legger til én kolonne: hver rad får én pult ekstra, og rutenettet blir én
 * kolonne bredere.
 */
export function addColumn(
  desks: Desk[],
  cols: number,
  seats = DEFAULT_SEATS
): { desks: Desk[]; cols: number } {
  const safeCols = Math.max(1, cols);
  const nextCols = safeCols + 1;
  const rows = rowCount(desks.length, safeCols);
  const target = rows * nextCols;
  const ordered = readingOrder(desks);
  while (ordered.length < target) ordered.push(createDesk(seats));
  return { desks: tidyDesks(ordered, nextCols), cols: nextCols };
}

/** Fjerner den siste pulten i hver rad, og gjør rutenettet én kolonne smalere. */
export function removeColumn(desks: Desk[], cols: number): { desks: Desk[]; cols: number } {
  const safeCols = Math.max(1, cols);
  const nextCols = Math.max(1, safeCols - 1);
  if (nextCols === safeCols) return { desks, cols: safeCols };

  const ordered = readingOrder(desks);
  const kept: Desk[] = [];
  for (let i = 0; i < ordered.length; i += safeCols) {
    kept.push(...ordered.slice(i, i + nextCols));
  }
  return { desks: tidyDesks(kept, nextCols), cols: nextCols };
}

/** Legger til én enkelt pult, plassert til høyre for den siste pulten. */
export function addDesk(desks: Desk[], seats = DEFAULT_SEATS): Desk[] {
  const desk = createDesk(seats);
  if (desks.length === 0) {
    return [{ ...desk, x: PADDING, y: PADDING }];
  }
  const last = readingOrder(desks)[desks.length - 1];
  return [...desks, { ...desk, x: last.x + deskWidth(last.seats) + GAP_X, y: last.y }];
}

/** Endrer antall plasser ved én pult. */
export function setDeskSeats(desks: Desk[], deskId: string, seats: number): Desk[] {
  return desks.map((d) => (d.id === deskId ? { ...d, seats: clampSeats(seats) } : d));
}

/** Samlet antall elevplasser i klasserommet. */
export function totalSeats(desks: Desk[]): number {
  return desks.reduce((sum, d) => sum + clampSeats(d.seats), 0);
}

/**
 * Sørger for at det finnes nok plasser til alle elevene ved å legge til
 * topulter til høyre for de eksisterende.
 */
export function ensureCapacity(desks: Desk[], studentCount: number, cols: number): Desk[] {
  let result = [...desks];
  while (totalSeats(result) < studentCount) {
    result = addDesk(result, DEFAULT_SEATS);
  }
  return result.length === desks.length ? desks : tidyDesks(result, cols);
}

/**
 * Plass under nederste pultrad, slik at verktøylinja for en valgt pult får
 * rom uten å bli klippet bort av rullefeltet.
 */
export const TOOLBAR_ROOM = 44;

/** Størrelsen lerretet må ha for å romme alle pultene. */
export function canvasSize(desks: Desk[]): { width: number; height: number } {
  if (desks.length === 0) {
    return {
      width: PADDING * 2 + deskWidth(DEFAULT_SEATS),
      height: PADDING * 2 + DESK_HEIGHT + TOOLBAR_ROOM,
    };
  }
  const maxX = Math.max(...desks.map((d) => d.x + deskWidth(d.seats)));
  const maxY = Math.max(...desks.map((d) => d.y));
  return { width: maxX + PADDING, height: maxY + DESK_HEIGHT + PADDING + TOOLBAR_ROOM };
}

/** Lager et ferdig oppstilt rutenett med topulter. */
export function makeGrid(rows: number, cols: number, seats = DEFAULT_SEATS): Desk[] {
  const total = Math.max(1, rows) * Math.max(1, cols);
  return tidyDesks(
    Array.from({ length: total }, () => createDesk(seats)),
    cols
  );
}
