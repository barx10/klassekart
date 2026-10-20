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
 * Det samme for de to andre reglene: et par som skal sitte sammen men havner
 * ved hvert sitt bord, og en elev som skal sitte foran men havner lenger bak.
 * Like tungt som «ikke sammen» — ingen av reglene er viktigere enn de andre, og
 * alle tre veier mer enn historikken.
 */
const TOGETHER_PENALTY = 1000;
const FRONT_PENALTY = 1000;

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
  /** Elevpar som skal sitte ved samme bord, som kanoniske par-nøkler. */
  together?: Set<string>;
  /** Elever som skal sitte foran. Teller bare når `frontGroups` er gitt. */
  front?: Set<string>;
  /**
   * Plassene i `capacities` som er fremste rad. Gruppene til prosjektarbeid
   * har ingen pulter og dermed ingen rad, og gir ingen.
   */
  frontGroups?: Set<number>;
}

/** En regel kartet ikke klarte å oppfylle. */
export type RuleBreak =
  | { kind: "apart"; a: string; b: string }
  | { kind: "together"; a: string; b: string }
  | { kind: "front"; student: string };

/** Reglene slik herdingen bruker dem: alle felt fylt inn. */
interface Rules {
  apart: Set<string>;
  /** Elev -> elevene den skal sitte med. */
  partners: Map<string, string[]>;
  front: Set<string>;
  frontGroups: Set<number>;
}

function partnersOf(together: Set<string>): Map<string, string[]> {
  const partners = new Map<string, string[]>();
  for (const key of together) {
    const [a, b] = key.split("_");
    partners.set(a, [...(partners.get(a) ?? []), b]);
    partners.set(b, [...(partners.get(b) ?? []), a]);
  }
  return partners;
}

function toRules(options: SeatingOptions): Rules {
  const frontGroups = options.frontGroups ?? new Set<number>();
  return {
    apart: options.apart ?? new Set<string>(),
    partners: partnersOf(options.together ?? new Set<string>()),
    // Uten en fremste rad finnes det ikke noe «foran» å holde eleven til.
    front: frontGroups.size > 0 ? (options.front ?? new Set<string>()) : new Set<string>(),
    frontGroups,
  };
}

function hasRules(rules: Rules): boolean {
  return rules.apart.size > 0 || rules.partners.size > 0 || rules.front.size > 0;
}

/**
 * Hva én pult koster. Alle tre reglene lar seg regne pult for pult, og det er
 * det som gjør at et bytte bare trenger å se på de to pultene det gjelder.
 *
 * Et par som skal sitte sammen men sitter hver for seg, telles hos begge — med
 * halv straff hver, så bruddet koster det samme som de andre reglene. Partneren
 * ved et tredje bord flytter seg ikke i byttet, så bidraget derfra står i ro.
 */
function groupCost(
  group: string[],
  index: number,
  historyMap: Map<string, number>,
  rules: Rules
): number {
  let cost = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const key = pairKey(group[i], group[j]);
      cost += historyMap.get(key) ?? 0;
      if (rules.apart.has(key)) cost += APART_PENALTY;
    }
    const id = group[i];
    if (rules.front.has(id) && !rules.frontGroups.has(index)) cost += FRONT_PENALTY;
    for (const partner of rules.partners.get(id) ?? []) {
      if (!group.includes(partner)) cost += TOGETHER_PENALTY / 2;
    }
  }
  return cost;
}

/** Parene i fordelingen som bryter en regel om å ikke sitte sammen. */
export function apartViolations(groups: SeatingGroups, apart: Set<string>): [string, string][] {
  if (apart.size === 0) return [];
  return pairsFromGroups(groups).filter(([a, b]) => apart.has(pairKey(a, b)));
}

/** Alle reglene fordelingen bryter: par sammen, par fra hverandre, og hvem som sitter bak. */
export function ruleBreaks(groups: SeatingGroups, options: SeatingOptions): RuleBreak[] {
  const rules = toRules(options);
  const breaks: RuleBreak[] = apartViolations(groups, rules.apart).map(([a, b]) => ({
    kind: "apart",
    a,
    b,
  }));

  const groupOf = new Map<string, number>();
  groups.forEach((group, i) => group.forEach((id) => groupOf.set(id, i)));

  for (const key of options.together ?? []) {
    const [a, b] = key.split("_");
    // En elev som ikke er med i fordelingen, kan ikke bryte noe.
    if (!groupOf.has(a) || !groupOf.has(b)) continue;
    if (groupOf.get(a) !== groupOf.get(b)) breaks.push({ kind: "together", a, b });
  }

  for (const id of rules.front) {
    const group = groupOf.get(id);
    if (group !== undefined && !rules.frontGroups.has(group)) {
      breaks.push({ kind: "front", student: id });
    }
  }
  return breaks;
}

/**
 * Deler `count` elever i grupper på omtrent `size`.
 *
 * Går det ikke opp, blir gruppene så jevne som mulig i stedet for at resten
 * blir en gruppe for seg: 30 elever i firergrupper blir seks firere og to
 * treere, ikke sju firere og én toer. En elev som står igjen alene har ingen
 * å samarbeide med, og det er nettopp det gruppene er til for.
 */
export function groupSizes(count: number, size: number): number[] {
  const perGroup = Math.max(2, Math.round(size));
  if (count <= 0) return [];
  const groups = Math.max(1, Math.ceil(count / perGroup));
  const base = Math.floor(count / groups);
  const rest = count % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < rest ? 1 : 0));
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
 * regler, prøves fordelingen på nytt til ingen av dem brytes, eller til
 * forsøkene er brukt opp. Det som blir igjen da,
 * er regler som ikke lar seg oppfylle — og det skal læreren få vite.
 */
export function generateSeatingChart(
  students: Student[],
  capacities: number[],
  historyMap: Map<string, number>,
  options: SeatingOptions = {}
): SeatingGroups {
  if (students.length === 0) return [];

  const rules = toRules(options);
  const attempts = hasRules(rules) ? APART_ATTEMPTS : 1;

  let best = anneal(students, capacities, historyMap, options, rules);
  let fewest = ruleBreaks(best, options).length;

  for (let attempt = 1; attempt < attempts && fewest > 0; attempt++) {
    const next = anneal(students, capacities, historyMap, options, rules);
    const broken = ruleBreaks(next, options).length;
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
  rules: Rules
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

  // Fremste rad fylles først. Byttene flytter bare elever mellom pulter, aldri
  // inn på et tomt sete, så de ledige plassene blir der utgangsstillingen la
  // dem — og da hører de bakerst, ikke foran tavla der noen skal sitte.
  const indices = caps.map((_, i) => i);
  const order = [
    ...indices.filter((i) => rules.frontGroups.has(i)),
    ...indices.filter((i) => !rules.frontGroups.has(i)),
  ];
  let next = 0;
  for (const id of free) {
    while (next < order.length && groups[order[next]].length >= caps[order[next]]) next++;
    if (next >= order.length) break;
    groups[order[next]].push(id);
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

    const before =
      groupCost(groups[g1], g1, historyMap, rules) + groupCost(groups[g2], g2, historyMap, rules);

    const tmp = groups[g1][i1];
    groups[g1][i1] = groups[g2][i2];
    groups[g2][i2] = tmp;

    const after =
      groupCost(groups[g1], g1, historyMap, rules) + groupCost(groups[g2], g2, historyMap, rules);
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
