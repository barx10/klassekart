import type { Desk, SeatLocks } from "./types";

/**
 * Piksel-mål for pulter og rutenettet "Rydd opp" stiller dem opp i.
 *
 * Setet var 84 px bredt med plass til én linje, og da ble nesten alle
 * elevnavn kuttet til «Amina …» — et klassekart du ikke kan lese navnene på
 * er ubrukelig. Setet er nå bredt nok, og høyt nok, til fornavn og etternavn
 * på hver sin linje.
 */
export const SEAT_WIDTH = 132;
export const SEAT_HEIGHT = 54;
/** Grensene for hvor lite og stort et sete kan dras. */
export const MIN_SEAT_WIDTH = 64;
export const MAX_SEAT_WIDTH = 240;
export const MIN_SEAT_HEIGHT = 34;
export const MAX_SEAT_HEIGHT = 110;
export const SEAT_GAP = 6;
export const DESK_PADDING = 6;
/** Topplinja på pulten: viser bordnavnet og er draghåndtaket for pulten. */
export const DESK_HEADER_HEIGHT = 20;
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
    .map((d) => {
      const desk: Desk = {
        id: String(d.id ?? newDeskId()),
        x: Number(d.x) || 0,
        y: Number(d.y) || 0,
        seats: clampSeats(Number(d.seats) || DEFAULT_SEATS),
      };
      if (typeof d.name === "string" && d.name.trim()) desk.name = d.name.trim();
      const w = Number(d.w);
      const h = Number(d.h);
      if (Number.isFinite(w) && w > 0) desk.w = w;
      if (Number.isFinite(h) && h > 0) desk.h = h;
      return clampDeskSize(desk);
    });
}

/**
 * Hvordan plassene står ved en pult. En firergruppe er to og to vendt mot
 * hverandre (et kvadrat), slik bordgrupper faktisk står i et klasserom —
 * ikke fire seter på rekke. 1-3 plasser står på rekke.
 */
export function seatGrid(seats: number): { cols: number; rows: number } {
  const n = clampSeats(seats);
  return n === 4 ? { cols: 2, rows: 2 } : { cols: n, rows: 1 };
}

/** Bredden en pult får når den ikke er dratt til en egen størrelse. */
export function defaultDeskWidth(seats: number): number {
  const { cols } = seatGrid(seats);
  return cols * SEAT_WIDTH + (cols - 1) * SEAT_GAP + DESK_PADDING * 2;
}

export function defaultDeskHeight(seats: number): number {
  const { rows } = seatGrid(seats);
  return rows * SEAT_HEIGHT + (rows - 1) * SEAT_GAP + DESK_PADDING * 2 + DESK_HEADER_HEIGHT;
}

/** Rammen rundt setene: alt som ikke er selve setene. */
function chromeWidth(seats: number): number {
  const { cols } = seatGrid(seats);
  return (cols - 1) * SEAT_GAP + DESK_PADDING * 2;
}

function chromeHeight(seats: number): number {
  const { rows } = seatGrid(seats);
  return (rows - 1) * SEAT_GAP + DESK_PADDING * 2 + DESK_HEADER_HEIGHT;
}

/** Hvor liten og hvor stor en pult kan dras, gitt antall plasser. */
export function deskSizeBounds(seats: number): {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
} {
  const { cols, rows } = seatGrid(seats);
  return {
    minW: cols * MIN_SEAT_WIDTH + chromeWidth(seats),
    maxW: cols * MAX_SEAT_WIDTH + chromeWidth(seats),
    minH: rows * MIN_SEAT_HEIGHT + chromeHeight(seats),
    maxH: rows * MAX_SEAT_HEIGHT + chromeHeight(seats),
  };
}

/**
 * Holder en egendefinert størrelse innenfor grensene. Endrer læreren antall
 * plasser etterpå, kan en lagret bredde ha blitt for trang — derfor klemmes
 * den på nytt hver gang pulten leses eller endres.
 */
export function clampDeskSize(desk: Desk): Desk {
  const { minW, maxW, minH, maxH } = deskSizeBounds(desk.seats);
  const next = { ...desk };
  if (next.w !== undefined) next.w = Math.round(Math.min(maxW, Math.max(minW, next.w)));
  if (next.h !== undefined) next.h = Math.round(Math.min(maxH, Math.max(minH, next.h)));
  return next;
}

export function deskWidth(desk: Desk): number {
  return desk.w ?? defaultDeskWidth(desk.seats);
}

export function deskHeight(desk: Desk): number {
  return desk.h ?? defaultDeskHeight(desk.seats);
}

/** Høyden på en vanlig pult med én rad plasser. */
export const DESK_HEIGHT = SEAT_HEIGHT + DESK_PADDING * 2 + DESK_HEADER_HEIGHT;

export function createDesk(seats = DEFAULT_SEATS): Desk {
  return { id: newDeskId(), x: 0, y: 0, seats: clampSeats(seats) };
}

/** Setter en egen størrelse på én pult (fra draghjørnet). */
export function setDeskSize(desks: Desk[], deskId: string, w: number, h: number): Desk[] {
  return desks.map((d) => (d.id === deskId ? clampDeskSize({ ...d, w, h }) : d));
}

/** Gir pulten standardstørrelsen tilbake. */
export function resetDeskSize(desks: Desk[], deskId: string): Desk[] {
  return desks.map((d) => {
    if (d.id !== deskId) return d;
    const next = { ...d };
    delete next.w;
    delete next.h;
    return next;
  });
}

// ---------------------------------------------------------------------------
// Flere pulter om gangen
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rammen rundt et knippe pulter. Brukes til å plassere verktøylinja. */
export function deskBounds(desks: Desk[]): Rect | null {
  if (desks.length === 0) return null;
  const x = Math.min(...desks.map((d) => d.x));
  const y = Math.min(...desks.map((d) => d.y));
  const right = Math.max(...desks.map((d) => d.x + deskWidth(d)));
  const bottom = Math.max(...desks.map((d) => d.y + deskHeight(d)));
  return { x, y, width: right - x, height: bottom - y };
}

/** Pultene som berøres av en ramme dratt over lerretet. */
export function desksInRect(desks: Desk[], rect: Rect): string[] {
  return desks
    .filter(
      (d) =>
        d.x < rect.x + rect.width &&
        rect.x < d.x + deskWidth(d) &&
        d.y < rect.y + rect.height &&
        rect.y < d.y + deskHeight(d)
    )
    .map((d) => d.id);
}

/**
 * Flytter et utvalg pulter like langt, målt fra der de sto da draget startet.
 * Vi regner fra startposisjonene og ikke fra forrige bilde, ellers samler
 * avrundingen seg opp og pultene sklir fra hverandre underveis.
 *
 * Draget klemmes samlet mot venstre- og toppkanten: stoppet én pult ved kanten
 * mens resten fortsatte, ville rekka læreren nettopp rettet inn blitt skjev.
 */
export function moveDesksFrom(
  desks: Desk[],
  origins: Record<string, { x: number; y: number }>,
  dx: number,
  dy: number
): Desk[] {
  const points = Object.values(origins);
  if (points.length === 0) return desks;
  const clampedX = Math.max(dx, -Math.min(...points.map((p) => p.x)));
  const clampedY = Math.max(dy, -Math.min(...points.map((p) => p.y)));
  return desks.map((d) => {
    const origin = origins[d.id];
    if (!origin) return d;
    return { ...d, x: origin.x + clampedX, y: origin.y + clampedY };
  });
}

/** Samme flytting, men fra der pultene står nå — piltastene bruker denne. */
export function nudgeDesks(desks: Desk[], ids: Set<string>, dx: number, dy: number): Desk[] {
  const chosen = desks.filter((d) => ids.has(d.id));
  if (chosen.length === 0) return desks;
  const clampedX = Math.max(dx, -Math.min(...chosen.map((d) => d.x)));
  const clampedY = Math.max(dy, -Math.min(...chosen.map((d) => d.y)));
  return desks.map((d) => (ids.has(d.id) ? { ...d, x: d.x + clampedX, y: d.y + clampedY } : d));
}

/**
 * Stiller de merkede pultene på linje: `top` gir en vannrett rekke, `left` en
 * loddrett kolonne. Linja legges der den øverste — eller den venstre — pulten
 * alt står. Et gjennomsnitt ville flyttet på hver eneste pult; slik vet
 * læreren på forhånd hvor rekka havner.
 */
export function alignDesks(desks: Desk[], ids: Set<string>, edge: "top" | "left"): Desk[] {
  const chosen = desks.filter((d) => ids.has(d.id));
  if (chosen.length < 2) return desks;

  if (edge === "top") {
    const y = Math.min(...chosen.map((d) => d.y));
    return desks.map((d) => (ids.has(d.id) ? { ...d, y } : d));
  }
  const x = Math.min(...chosen.map((d) => d.x));
  return desks.map((d) => (ids.has(d.id) ? { ...d, x } : d));
}

/**
 * Gir de merkede pultene lik avstand. Den første og den siste blir stående, og
 * resten fordeles mellom dem. Avstanden regnes mellom pultkantene og ikke
 * mellom midtpunktene, så en rekke med både topulter og treerbord fortsatt ser
 * jevn ut.
 *
 * Er pultene bredere til sammen enn plassen mellom den første og den siste,
 * blir avstanden null i stedet for negativ: da står de kant i kant, og den
 * siste skyves ut. Å regne ut en negativ avstand ville lagt pultene oppå
 * hverandre — det motsatte av å rette dem inn.
 */
export function distributeDesks(desks: Desk[], ids: Set<string>, axis: "x" | "y"): Desk[] {
  const chosen = desks.filter((d) => ids.has(d.id));
  if (chosen.length < 3) return desks;

  const size = (d: Desk) => (axis === "x" ? deskWidth(d) : deskHeight(d));
  const start = (d: Desk) => (axis === "x" ? d.x : d.y);

  const ordered = [...chosen].sort((a, b) => start(a) - start(b));
  const last = ordered[ordered.length - 1];
  const span = start(last) + size(last) - start(ordered[0]);
  const used = ordered.reduce((sum, d) => sum + size(d), 0);
  const gap = Math.max(0, (span - used) / (ordered.length - 1));

  const placed = new Map<string, number>();
  let cursor = start(ordered[0]);
  for (const desk of ordered) {
    placed.set(desk.id, Math.max(0, Math.round(cursor)));
    cursor += size(desk) + gap;
  }

  return desks.map((d) => {
    const value = placed.get(d.id);
    if (value === undefined) return d;
    return axis === "x" ? { ...d, x: value } : { ...d, y: value };
  });
}

/**
 * Aksen et utvalg ligger langs. En rekke er bredere enn den er høy, og skal
 * fordeles vannrett; en kolonne motsatt.
 */
export function spreadAxis(desks: Desk[], ids: Set<string>): "x" | "y" {
  const bounds = deskBounds(desks.filter((d) => ids.has(d.id)));
  return !bounds || bounds.width >= bounds.height ? "x" : "y";
}

/** Endrer antall plasser på flere pulter samtidig, ett steg om gangen. */
export function changeDeskSeats(desks: Desk[], ids: Set<string>, delta: number): Desk[] {
  return desks.map((d) =>
    ids.has(d.id) ? clampDeskSize({ ...d, seats: clampSeats(d.seats + delta) }) : d
  );
}

// ---------------------------------------------------------------------------
// Låste plasser
// ---------------------------------------------------------------------------

/**
 * Leser låsene og kaster dem som ikke lenger peker på et sete som finnes:
 * pulten kan være fjernet, eller ha fått færre plasser, siden læreren låste.
 * En lås til et sete som ikke finnes ville ellers blitt liggende usynlig og
 * holdt eleven utenfor fordelingen.
 *
 * `studentIds` fjerner i tillegg låser på elever som er slettet.
 */
export function validLocks(raw: unknown, desks: Desk[], studentIds?: Set<string>): SeatLocks {
  if (typeof raw !== "object" || raw === null) return {};

  const seatsByDesk = new Map(desks.map((d) => [d.id, clampSeats(d.seats)]));
  const result: SeatLocks = {};

  for (const [studentId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (studentIds && !studentIds.has(studentId)) continue;
    if (typeof value !== "object" || value === null) continue;

    const lock = value as { desk_id?: unknown; index?: unknown };
    const deskId = typeof lock.desk_id === "string" ? lock.desk_id : "";
    const index = Number(lock.index);
    const seats = seatsByDesk.get(deskId);
    if (seats === undefined) continue;
    if (!Number.isInteger(index) || index < 0 || index >= seats) continue;

    result[studentId] = { desk_id: deskId, index };
  }
  return result;
}

/** Om to sett med låser er like — sparer en lagring når ingenting endret seg. */
export function sameLocks(a: SeatLocks, b: SeatLocks): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((id) => b[id] && b[id].desk_id === a[id].desk_id && b[id].index === a[id].index);
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
 * ulik bredde og høyde, så hver rad pakkes fra venstre med faktisk pultbredde,
 * og radhøyden følger den høyeste pulten i raden.
 */
export function tidyDesks(desks: Desk[], cols: number): Desk[] {
  const safeCols = Math.max(1, cols);
  const ordered = readingOrder(desks);
  const result: Desk[] = [];
  let y = PADDING;

  for (let i = 0; i < ordered.length; i += safeCols) {
    const row = ordered.slice(i, i + safeCols);
    let x = PADDING;
    for (const desk of row) {
      result.push({ ...desk, x, y });
      x += deskWidth(desk) + GAP_X;
    }
    y += Math.max(...row.map(deskHeight)) + GAP_Y;
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
  return [...desks, { ...desk, x: last.x + deskWidth(last) + GAP_X, y: last.y }];
}

/** Endrer antall plasser ved én pult. */
export function setDeskSeats(desks: Desk[], deskId: string, seats: number): Desk[] {
  return desks.map((d) =>
    d.id === deskId ? clampDeskSize({ ...d, seats: clampSeats(seats) }) : d
  );
}

/** Gir pulten et navn (tom streng fjerner navnet). */
export function setDeskName(desks: Desk[], deskId: string, name: string): Desk[] {
  const trimmed = name.trim();
  return desks.map((d) => {
    if (d.id !== deskId) return d;
    const next = { ...d };
    if (trimmed) next.name = trimmed;
    else delete next.name;
    return next;
  });
}

/**
 * Om noen pulter ligger oppå hverandre. Pulter lagret før setene ble brede nok
 * til hele navn ble plassert etter de gamle målene, så et gammelt oppsett kan
 * overlappe nå. Vi flytter dem ikke av oss selv — læreren har gjerne stilt dem
 * opp slik rommet faktisk ser ut — men vi kan si fra og tilby «Rydd opp».
 */
export function desksOverlap(desks: Desk[]): boolean {
  for (let i = 0; i < desks.length; i++) {
    const a = desks[i];
    const aw = deskWidth(a);
    const ah = deskHeight(a);
    for (let j = i + 1; j < desks.length; j++) {
      const b = desks[j];
      if (
        a.x < b.x + deskWidth(b) &&
        b.x < a.x + aw &&
        a.y < b.y + deskHeight(b) &&
        b.y < a.y + ah
      ) {
        return true;
      }
    }
  }
  return false;
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
      width: PADDING * 2 + defaultDeskWidth(DEFAULT_SEATS),
      height: PADDING * 2 + DESK_HEIGHT + TOOLBAR_ROOM,
    };
  }
  const maxX = Math.max(...desks.map((d) => d.x + deskWidth(d)));
  const maxY = Math.max(...desks.map((d) => d.y + deskHeight(d)));
  return { width: maxX + PADDING, height: maxY + PADDING + TOOLBAR_ROOM };
}

/** Lager et ferdig oppstilt rutenett med topulter. */
export function makeGrid(rows: number, cols: number, seats = DEFAULT_SEATS): Desk[] {
  const total = Math.max(1, rows) * Math.max(1, cols);
  return tidyDesks(
    Array.from({ length: total }, () => createDesk(seats)),
    cols
  );
}
