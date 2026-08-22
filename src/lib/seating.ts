import type { PairHistoryRow, SeatingLayout, Student } from "./types";

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

function groupCost(group: string[], historyMap: Map<string, number>): number {
  let cost = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      cost += historyMap.get(pairKey(group[i], group[j])) ?? 0;
    }
  }
  return cost;
}

/**
 * Genererer et nytt klassekart: fordeler elever i bordgrupper og bruker
 * simulert herding (simulated annealing) for å minimere hvor mange ganger
 * de samme elevene har sittet sammen før. Elevene starter i tilfeldig
 * rekkefølge, så selv uten historikk blir hver generering forskjellig.
 */
export function generateSeatingChart(
  students: Student[],
  groupSize: number,
  historyMap: Map<string, number>
): SeatingLayout {
  if (students.length === 0) return [];

  const ids = shuffle(students.map((s) => s.id));
  const numGroups = Math.max(1, Math.ceil(ids.length / groupSize));
  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  ids.forEach((id, i) => groups[i % numGroups].push(id));

  const iterations = Math.max(800, ids.length * 80);

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations;
    const g1 = Math.floor(Math.random() * numGroups);
    const g2 = Math.floor(Math.random() * numGroups);
    if (g1 === g2 || groups[g1].length === 0 || groups[g2].length === 0) continue;

    const i1 = Math.floor(Math.random() * groups[g1].length);
    const i2 = Math.floor(Math.random() * groups[g2].length);

    const before = groupCost(groups[g1], historyMap) + groupCost(groups[g2], historyMap);

    const tmp = groups[g1][i1];
    groups[g1][i1] = groups[g2][i2];
    groups[g2][i2] = tmp;

    const after = groupCost(groups[g1], historyMap) + groupCost(groups[g2], historyMap);
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

export function pairsFromLayout(layout: SeatingLayout): [string, string][] {
  const pairs: [string, string][] = [];
  for (const group of layout) {
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

/** Antall par i kartet som ikke har sittet sammen før (basert på historikk før dette kartet). */
export function countNewPairs(layout: SeatingLayout, historyMap: Map<string, number>): {
  newPairs: number;
  totalPairs: number;
} {
  const pairs = pairsFromLayout(layout);
  const newPairs = pairs.filter(([a, b]) => !(historyMap.get(pairKey(a, b)) ?? 0)).length;
  return { newPairs, totalPairs: pairs.length };
}
