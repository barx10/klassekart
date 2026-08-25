"use client";

import { mutate, newId, read, type LocalData } from "./local-db";
import { ensureCapacity, makeGrid } from "./classroom";
import { buildHistoryMap, countNewPairs, generateSeatingChart, pairsFromGroups } from "./seating";
import type {
  Desk,
  DeskAssignments,
  Gender,
  PairHistoryRow,
  SchoolClass,
  SeatingChart,
  Student,
} from "./types";

/**
 * Alt appen leser og skriver går gjennom denne modulen. Under ligger
 * nettleserens egen lagring (`local-db.ts`) — ingen database, ingen server.
 * Funksjonene er fortsatt asynkrone, siden lagringen er det.
 */

const byName = (a: Student, b: Student) => a.name.localeCompare(b.name, "no");
const pairKey = (a: string, b: string) => `${a}_${b}`;

function requireClass(data: LocalData, id: string): SchoolClass {
  const found = data.classes.find((c) => c.id === id);
  if (!found) throw new Error("Fant ikke klassen.");
  return found;
}

/**
 * Teller par opp eller ned, og oppretter rader som ikke finnes fra før.
 * Tilsvarer `upsert` i databasen appen brukte tidligere.
 */
function bumpPairs(
  data: LocalData,
  classId: string,
  pairs: [string, string][],
  delta: number,
  now: string
) {
  const existing = new Map(
    data.pairs
      .filter((p) => p.class_id === classId)
      .map((p) => [pairKey(p.student_a_id, p.student_b_id), p])
  );

  for (const [a, b] of pairs) {
    const prev = existing.get(pairKey(a, b));
    const times = Math.max(0, (prev?.times_together ?? 0) + delta);
    const lastSeated = delta > 0 ? now : (prev?.last_seated_at ?? null);
    if (prev) {
      prev.times_together = times;
      prev.last_seated_at = lastSeated;
    } else {
      const row: PairHistoryRow = {
        class_id: classId,
        student_a_id: a,
        student_b_id: b,
        times_together: times,
        last_seated_at: lastSeated,
      };
      data.pairs.push(row);
      existing.set(pairKey(a, b), row);
    }
  }
}

// ---------------------------------------------------------------------------
// Klasser
// ---------------------------------------------------------------------------

export async function fetchClasses(): Promise<SchoolClass[]> {
  return read((data) =>
    [...data.classes].sort((a, b) => a.created_at.localeCompare(b.created_at))
  );
}

export async function createClass(name: string, defaultContactTeacher?: string): Promise<SchoolClass> {
  return mutate((data) => {
    const created: SchoolClass = {
      id: newId(),
      name,
      default_contact_teacher: defaultContactTeacher || null,
      // Nye klasser starter med et ryddig klasserom læreren kan dra om på.
      desks: makeGrid(3, 3),
      desk_cols: 3,
      created_at: new Date().toISOString(),
    };
    data.classes.push(created);
    return created;
  });
}

/** Sletter klassen og alt som hang på den — elever, kart og par-historikk. */
export async function deleteClass(id: string): Promise<void> {
  await mutate((data) => {
    data.classes = data.classes.filter((c) => c.id !== id);
    data.students = data.students.filter((s) => s.class_id !== id);
    data.charts = data.charts.filter((c) => c.class_id !== id);
    data.pairs = data.pairs.filter((p) => p.class_id !== id);
  });
}

export async function updateDefaultContactTeacher(id: string, name: string | null): Promise<SchoolClass> {
  return mutate((data) => {
    const found = requireClass(data, id);
    found.default_contact_teacher = name;
    return found;
  });
}

/** Lagrer klasserommets pultoppsett (posisjoner + rutenettbredde). */
export async function updateDesks(id: string, desks: Desk[], deskCols: number): Promise<SchoolClass> {
  return mutate((data) => {
    const found = requireClass(data, id);
    found.desks = desks;
    found.desk_cols = deskCols;
    return found;
  });
}

// ---------------------------------------------------------------------------
// Elever
// ---------------------------------------------------------------------------

export async function fetchStudents(classId: string): Promise<Student[]> {
  return read((data) => data.students.filter((s) => s.class_id === classId).sort(byName));
}

/** Henter alle elever på tvers av klasser (til venstremenyen). */
export async function fetchAllStudents(): Promise<Student[]> {
  return read((data) => [...data.students].sort(byName));
}

export async function addStudents(
  classId: string,
  names: string[],
  gender: Gender | null,
  contactTeacher: string | null
): Promise<Student[]> {
  return mutate((data) => {
    const now = new Date().toISOString();
    const created: Student[] = names.map((name) => ({
      id: newId(),
      class_id: classId,
      name,
      gender,
      contact_teacher: contactTeacher,
      created_at: now,
    }));
    data.students.push(...created);
    return created;
  });
}

export async function updateStudent(
  id: string,
  fields: Partial<Pick<Student, "name" | "gender" | "contact_teacher">>
): Promise<Student> {
  return mutate((data) => {
    const found = data.students.find((s) => s.id === id);
    if (!found) throw new Error("Fant ikke eleven.");
    Object.assign(found, fields);
    return found;
  });
}

/** Sletter eleven og par-radene eleven inngår i. */
export async function deleteStudent(id: string): Promise<void> {
  await mutate((data) => {
    data.students = data.students.filter((s) => s.id !== id);
    data.pairs = data.pairs.filter((p) => p.student_a_id !== id && p.student_b_id !== id);
  });
}

// ---------------------------------------------------------------------------
// Klassekart / historikk
// ---------------------------------------------------------------------------

export async function fetchPairHistory(classId: string): Promise<PairHistoryRow[]> {
  return read((data) => data.pairs.filter((p) => p.class_id === classId));
}

/**
 * Nullstiller par-historikken for klassen — typisk ved skoleårsslutt, når
 * elevene skal stokkes fritt igjen. Tidligere kart blir stående; de er en
 * logg over hva som faktisk skjedde.
 */
export async function resetPairHistory(classId: string): Promise<void> {
  await mutate((data) => {
    data.pairs = data.pairs.filter((p) => p.class_id !== classId);
  });
}

export async function fetchChartHistory(classId: string): Promise<SeatingChart[]> {
  return read((data) =>
    data.charts
      .filter((c) => c.class_id === classId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  );
}

export async function deleteChart(chartId: string): Promise<void> {
  await mutate((data) => {
    data.charts = data.charts.filter((c) => c.id !== chartId);
  });
}

export interface GenerateResult {
  chart: SeatingChart;
  /** Pultene kartet faktisk ble laget for — kan ha fått påfyll, se under. */
  desks: Desk[];
  newPairs: number;
  totalPairs: number;
}

/** Lagrer en endret elevplassering (f.eks. etter at læreren har dratt en elev). */
export async function updateChartLayout(chartId: string, layout: DeskAssignments): Promise<void> {
  await mutate((data) => {
    const found = data.charts.find((c) => c.id === chartId);
    if (!found) throw new Error("Fant ikke klassekartet.");
    found.layout = layout;
  });
}

/**
 * Justerer par-historikken når læreren flytter elever manuelt. Uten dette
 * ville varmekartet fortsatt telle parene slik de var da kartet ble generert.
 * Par som forsvant telles ned, nye par telles opp.
 */
export async function adjustPairHistory(
  classId: string,
  before: [string, string][],
  after: [string, string][]
): Promise<void> {
  const key = (p: [string, string]) => pairKey(p[0], p[1]);
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));

  const removed = before.filter((p) => !afterKeys.has(key(p)));
  const added = after.filter((p) => !beforeKeys.has(key(p)));
  if (removed.length === 0 && added.length === 0) return;

  await mutate((data) => {
    const now = new Date().toISOString();
    bumpPairs(data, classId, removed, -1, now);
    bumpPairs(data, classId, added, 1, now);
  });
}

/**
 * Genererer et nytt klassekart for klassen: henter elever og gjeldende
 * par-historikk, kjører seteplasseringsalgoritmen (som minimerer gjentatte
 * elevpar), lagrer det nye kartet og oppdaterer historikken. Elevene
 * fordeles på pultene læreren har satt opp i klasserommet.
 *
 * Alt skjer i én endring, slik at et kart aldri kan bli lagret uten at
 * parene det ga blir talt med — eller motsatt.
 */
export async function generateAndSaveChart(
  classId: string,
  desks: Desk[],
  deskCols: number
): Promise<GenerateResult> {
  return mutate((data) => {
    const students = data.students.filter((s) => s.class_id === classId).sort(byName);
    if (students.length === 0) {
      throw new Error("Klassen har ingen elever ennå.");
    }
    if (desks.length === 0) {
      throw new Error("Klasserommet har ingen pulter ennå.");
    }

    // Er det færre plasser enn elever, fyller vi på med pulter *før* vi
    // genererer. Algoritmen ville uansett laget en gruppe for hver elev, men
    // gruppene uten en tilhørende pult falt ut av kartet nedenfor — elevene
    // forsvant fra klassekartet samtidig som parene deres ble ført i historikken.
    const roomyDesks = ensureCapacity(desks, students.length, deskCols);

    const historyMap = buildHistoryMap(data.pairs.filter((p) => p.class_id === classId));
    const groups = generateSeatingChart(students, roomyDesks.map((d) => d.seats), historyMap);
    const { newPairs, totalPairs } = countNewPairs(groups, historyMap);

    const layout: DeskAssignments = {};
    groups.forEach((group, i) => {
      const desk = roomyDesks[i];
      if (desk && group.length > 0) layout[desk.id] = group;
    });

    const now = new Date().toISOString();
    const chart: SeatingChart = { id: newId(), class_id: classId, layout, created_at: now };
    // Nyeste først, samme rekkefølge som fetchChartHistory gir.
    data.charts.unshift(chart);

    bumpPairs(data, classId, pairsFromGroups(groups), 1, now);

    if (roomyDesks !== desks) {
      const found = requireClass(data, classId);
      found.desks = roomyDesks;
      found.desk_cols = deskCols;
    }

    return { chart, desks: roomyDesks, newPairs, totalPairs };
  });
}
