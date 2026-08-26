import { DEFAULT_SEATS } from "./classroom";
import type { DeskAssignments, PairHistoryRow, Student } from "./types";

/** Elevfordeling som en liste av pulter, hver med elevene som sitter der. */
export type SeatingGroups = string[][];

/** Kanonisk nøkkel for et elevpar, uavhengig av rekkefølge. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function buildHistoryMap(rows: PairHistoryRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(pairKey(row.student_a_id, row.student_b_id), row.times_together);
  }
  return map;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Hva det koster å sette to elever som ikke skal sitte sammen ved samme bord.
 *
 * Historikken teller hvor mange ganger et par har sittet sammen — et tosifret
 * tall i løpet av et skoleår. Tusen gjør regelen tyngre enn all historikken til
 * sammen, uansett hvor lenge klassen har vært i gang, så algoritmen bryter den
 * bare når den ikke har noe valg.
 */
const APART_PENALTY = 1000;

/**
 * Hvor mange ganger fordelingen prøves på nytt når reglene brytes. Et brudd i
 * første forsøk er som regel uflaks i utgangsstillingen og ikke en umulig
 * regel; noen forsøk til koster millisekunder, og gjør «kunne ikke oppfylles»
 * til noe læreren kan stole på.
 */
const APART_ATTEMPTS = 6;

export interface SeatingOptions {
  /**
   * Elever læreren har låst til en pult, som elev-id -> pultens plass i
   * `capacities`. De settes ved pulten sin før herdingen og holdes utenfor
   * byttene. Det gjør låsen absolutt: en straff i kostfunksjonen ville bare
   * gjort det dyrt å flytte dem, ikke umulig.
   */
  pinned?: Map<string, number>;
  /** Elevpar som ikke skal sitte ved samme bord, som kanoniske par-nøkler. */
  apart?: Set<string>;
}

function groupCost(
  group: string[],
  historyMap: Map<string, number>,
  apart: Set<string>
): number {
  let cost = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const key = pairKey(group[i], group[j]);
      cost += historyMap.get(key) ?? 0;
      if (apart.has(key)) cost += APART_PENALTY;
    }
  }
  return cost;
}

/** Parene i fordelingen som bryter en regel om å ikke sitte sammen. */
export function apartViolations(groups: SeatingGroups, apart: Set<string>): [string, string][] {
  if (apart.size === 0) return [];
  return pairsFromGroups(groups).filter(([a, b]) => apart.has(pairKey(a, b)));
}

/**
 * Genererer et nytt klassekart: fordeler elevene på pultene i klasserommet og
 * bruker simulert herding (simulated annealing) for å minimere hvor mange
 * ganger de samme elevene har sittet sammen før. Elevene starter i tilfeldig
 * rekkefølge, så selv uten historikk blir hver generering forskjellig.
 *
 * `capacities` er antall plasser ved hver pult (1 = enkeltpult, 2 = topult,
 * 3-4 = bordgruppe), i samme rekkefølge som pultene. Er det færre plasser enn
 * elever, legges det til topulter på slutten; er det flere, blir plassene
 * stående tomme. Byttene under herdingen holder gruppestørrelsene uendret, så
 * ingen pult blir overfylt.
 *
 * Låser og regler kommer inn gjennom `options` (se `SeatingOptions`). Er det
 * regler om hvem som ikke skal sitte sammen, prøves fordelingen på nytt til
 * ingen av dem brytes, eller til forsøkene er brukt opp. Det som blir igjen da,
 * er regler som ikke lar seg oppfylle — og det skal læreren få vite.
 */
export function generateSeatingChart(
  students: Student[],
  capacities: number[],
  historyMap: Map<string, number>,
  options: SeatingOptions = {}
): SeatingGroups {
  if (students.length === 0) return [];

  const apart = options.apart ?? new Set<string>();
  const attempts = apart.size > 0 ? APART_ATTEMPTS : 1;

  let best = anneal(students, capacities, historyMap, options, apart);
  let fewest = apartViolations(best, apart).length;

  for (let attempt = 1; attempt < attempts && fewest > 0; attempt++) {
    const next = anneal(students, capacities, historyMap, options, apart);
    const broken = apartViolations(next, apart).length;
    if (broken < fewest) {
      best = next;
      fewest = broken;
    }
  }
  return best;
}

/** Ett forsøk på en fordeling: tilfeldig utgangsstilling, så simulert herding. */
function anneal(
  students: Student[],
  capacities: number[],
  historyMap: Map<string, number>,
  options: SeatingOptions,
  apart: Set<string>
): SeatingGroups {
  const pinned = options.pinned ?? new Map<string, number>();
  const ids = shuffle(students.map((s) => s.id));

  const caps = capacities.length > 0 ? capacities.map((c) => Math.max(1, c)) : [DEFAULT_SEATS];
  let available = caps.reduce((sum, c) => sum + c, 0);
  while (available < ids.length) {
    caps.push(DEFAULT_SEATS);
    available += DEFAULT_SEATS;
  }

  const numGroups = caps.length;
  const groups: string[][] = caps.map(() => []);

  // Låste elever først, så de andre fyller det som er igjen. Er en pult låst
  // fullere enn den har plasser, blir de overtallige med i den vanlige
  // fordelingen — ellers ville de falt ut av kartet.
  const locked = new Set<string>();
  const free: string[] = [];
  for (const id of ids) {
    const deskIndex = pinned.get(id);
    if (deskIndex !== undefined && deskIndex < numGroups && groups[deskIndex].length < caps[deskIndex]) {
      groups[deskIndex].push(id);
      locked.add(id);
    } else {
      free.push(id);
    }
  }

  let deskIndex = 0;
  for (const id of free) {
    while (deskIndex < numGroups && groups[deskIndex].length >= caps[deskIndex]) deskIndex++;
    if (deskIndex >= numGroups) break;
    groups[deskIndex].push(id);
  }

  const iterations = Math.max(800, ids.length * 80);

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations;
    const g1 = Math.floor(Math.random() * numGroups);
    const g2 = Math.floor(Math.random() * numGroups);
    if (g1 === g2 || groups[g1].length === 0 || groups[g2].length === 0) continue;

    const i1 = Math.floor(Math.random() * groups[g1].length);
    const i2 = Math.floor(Math.random() * groups[g2].length);
    if (locked.has(groups[g1][i1]) || locked.has(groups[g2][i2])) continue;

    const before = groupCost(groups[g1], historyMap, apart) + groupCost(groups[g2], historyMap, apart);

    const tmp = groups[g1][i1];
    groups[g1][i1] = groups[g2][i2];
    groups[g2][i2] = tmp;

    const after = groupCost(groups[g1], historyMap, apart) + groupCost(groups[g2], historyMap, apart);
    const delta = after - before;

    const accept = delta <= 0 || Math.random() < Math.exp(-delta / (temperature + 0.05));
    if (!accept) {
      // reverter byttet
      groups[g2][i2] = groups[g1][i1];
      groups[g1][i1] = tmp;
    }
  }

  return groups;
}

export function pairsFromGroups(groups: SeatingGroups): [string, string][] {
  const pairs: [string, string][] = [];
  for (const group of groups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        pairs.push(a < b ? [a, b] : [b, a]);
      }
    }
  }
  return pairs;
}

/** Alle elevpar i et lagret klassekart (ledige seter hoppes over). */
export function pairsFromAssignments(layout: DeskAssignments): [string, string][] {
  const groups = Object.values(layout).map((seats) => seats.filter((id): id is string => Boolean(id)));
  return pairsFromGroups(groups);
}

/** Antall par i kartet som ikke har sittet sammen før (basert på historikk før dette kartet). */
export function countNewPairs(groups: SeatingGroups, historyMap: Map<string, number>): {
  newPairs: number;
  totalPairs: number;
} {
  const pairs = pairsFromGroups(groups);
  const newPairs = pairs.filter(([a, b]) => !(historyMap.get(pairKey(a, b)) ?? 0)).length;
  return { newPairs, totalPairs: pairs.length };
}
