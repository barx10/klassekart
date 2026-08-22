import type { Desk } from "./types";

/** Piksel-mål for én pult og for rutenettet "Rydd opp" stiller pultene opp i. */
export const DESK_WIDTH = 184;
export const DESK_HEIGHT = 62;
export const GAP_X = 32;
export const GAP_Y = 40;
export const PADDING = 16;

export const STEP_X = DESK_WIDTH + GAP_X;
export const STEP_Y = DESK_HEIGHT + GAP_Y;

/** Antall elever som får plass ved én pult. */
export const SEATS_PER_DESK = 2;

let deskCounter = 0;

export function newDeskId(): string {
  deskCounter += 1;
  return `d${Date.now().toString(36)}${deskCounter.toString(36)}`;
}

export function gridPosition(index: number, cols: number): { x: number; y: number } {
  const safeCols = Math.max(1, cols);
  return {
    x: PADDING + (index % safeCols) * STEP_X,
    y: PADDING + Math.floor(index / safeCols) * STEP_Y,
  };
}

/** Lager et ferdig oppstilt rutenett med pulter. */
export function makeGrid(rows: number, cols: number): Desk[] {
  const total = Math.max(1, rows) * Math.max(1, cols);
  return Array.from({ length: total }, (_, i) => ({ id: newDeskId(), ...gridPosition(i, cols) }));
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

/** Stiller pultene opp i et jevnt rutenett med `cols` kolonner. */
export function tidyDesks(desks: Desk[], cols: number): Desk[] {
  return readingOrder(desks).map((desk, i) => ({ ...desk, ...gridPosition(i, cols) }));
}

/** Hvor mange rader pultene fyller med gjeldende kolonnebredde. */
export function rowCount(deskCount: number, cols: number): number {
  return Math.max(1, Math.ceil(deskCount / Math.max(1, cols)));
}

/** Legger til én rad med pulter nederst, og rydder opp. */
export function addRow(desks: Desk[], cols: number): Desk[] {
  const safeCols = Math.max(1, cols);
  const added = Array.from({ length: safeCols }, () => ({ id: newDeskId(), x: 0, y: 0 }));
  return tidyDesks([...readingOrder(desks), ...added], safeCols);
}

/**
 * Legger til én kolonne: hver rad får én pult ekstra, og rutenettet blir én
 * kolonne bredere.
 */
export function addColumn(desks: Desk[], cols: number): { desks: Desk[]; cols: number } {
  const safeCols = Math.max(1, cols);
  const nextCols = safeCols + 1;
  const rows = rowCount(desks.length, safeCols);
  const target = rows * nextCols;
  const ordered = readingOrder(desks);
  while (ordered.length < target) {
    ordered.push({ id: newDeskId(), x: 0, y: 0 });
  }
  return { desks: tidyDesks(ordered, nextCols), cols: nextCols };
}

/** Legger til én enkelt pult på første ledige rutenett-plass. */
export function addDesk(desks: Desk[], cols: number): Desk[] {
  return [...desks, { id: newDeskId(), ...gridPosition(desks.length, cols) }];
}

/**
 * Sørger for at det finnes nok pulter til alle elevene. Nye pulter legges
 * til på rutenett-plassene som følger etter de eksisterende.
 */
export function ensureCapacity(desks: Desk[], studentCount: number, cols: number): Desk[] {
  const needed = Math.ceil(studentCount / SEATS_PER_DESK);
  if (desks.length >= needed) return desks;
  const result = [...desks];
  for (let i = desks.length; i < needed; i++) {
    result.push({ id: newDeskId(), ...gridPosition(i, cols) });
  }
  return result;
}

/** Størrelsen lerretet må ha for å romme alle pultene. */
export function canvasSize(desks: Desk[]): { width: number; height: number } {
  if (desks.length === 0) {
    return { width: PADDING * 2 + DESK_WIDTH, height: PADDING * 2 + DESK_HEIGHT };
  }
  const maxX = Math.max(...desks.map((d) => d.x));
  const maxY = Math.max(...desks.map((d) => d.y));
  return {
    width: maxX + DESK_WIDTH + PADDING,
    height: maxY + DESK_HEIGHT + PADDING,
  };
}
