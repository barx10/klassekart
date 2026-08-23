"use client";

import { supabase } from "./supabase";
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

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------------
// Klasser
// ---------------------------------------------------------------------------

export async function fetchClasses(): Promise<SchoolClass[]> {
  return unwrap(
    supabase.from("classes").select("*").order("created_at", { ascending: true })
  );
}

export async function createClass(name: string, defaultContactTeacher?: string): Promise<SchoolClass> {
  // Nye klasser starter med et ryddig klasserom læreren kan dra om på.
  const desks = makeGrid(3, 3);
  return unwrap(
    supabase
      .from("classes")
      .insert({
        name,
        default_contact_teacher: defaultContactTeacher || null,
        desks,
        desk_cols: 3,
      })
      .select()
      .single()
  );
}

export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from("classes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateDefaultContactTeacher(id: string, name: string | null): Promise<SchoolClass> {
  return unwrap(
    supabase.from("classes").update({ default_contact_teacher: name }).eq("id", id).select().single()
  );
}

/** Lagrer klasserommets pultoppsett (posisjoner + rutenettbredde). */
export async function updateDesks(id: string, desks: Desk[], deskCols: number): Promise<SchoolClass> {
  return unwrap(
    supabase.from("classes").update({ desks, desk_cols: deskCols }).eq("id", id).select().single()
  );
}

// ---------------------------------------------------------------------------
// Elever
// ---------------------------------------------------------------------------

export async function fetchStudents(classId: string): Promise<Student[]> {
  return unwrap(
    supabase.from("students").select("*").eq("class_id", classId).order("name", { ascending: true })
  );
}

/** Henter alle elever på tvers av klasser (til venstremenyen). */
export async function fetchAllStudents(): Promise<Student[]> {
  return unwrap(supabase.from("students").select("*").order("name", { ascending: true }));
}

export async function addStudents(
  classId: string,
  names: string[],
  gender: Gender,
  contactTeacher: string | null
): Promise<Student[]> {
  const rows = names.map((name) => ({ class_id: classId, name, gender, contact_teacher: contactTeacher }));
  return unwrap(supabase.from("students").insert(rows).select());
}

export async function updateStudent(
  id: string,
  fields: Partial<Pick<Student, "name" | "gender" | "contact_teacher">>
): Promise<Student> {
  return unwrap(supabase.from("students").update(fields).eq("id", id).select().single());
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Klassekart / historikk
// ---------------------------------------------------------------------------

export async function fetchPairHistory(classId: string): Promise<PairHistoryRow[]> {
  return unwrap(supabase.from("pair_history").select("*").eq("class_id", classId));
}

export async function fetchChartHistory(classId: string): Promise<SeatingChart[]> {
  return unwrap(
    supabase
      .from("seating_charts")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
  );
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
  const { error } = await supabase.from("seating_charts").update({ layout }).eq("id", chartId);
  if (error) throw new Error(error.message);
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
  const key = (p: [string, string]) => `${p[0]}_${p[1]}`;
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));

  const removed = before.filter((p) => !afterKeys.has(key(p)));
  const added = after.filter((p) => !beforeKeys.has(key(p)));
  if (removed.length === 0 && added.length === 0) return;

  const historyRows = await fetchPairHistory(classId);
  const existing = new Map(historyRows.map((r) => [`${r.student_a_id}_${r.student_b_id}`, r]));
  const now = new Date().toISOString();

  const rows = [...removed.map((p) => [p, -1] as const), ...added.map((p) => [p, 1] as const)].map(
    ([[a, b], delta]) => {
      const prev = existing.get(`${a}_${b}`);
      return {
        class_id: classId,
        student_a_id: a,
        student_b_id: b,
        times_together: Math.max(0, (prev?.times_together ?? 0) + delta),
        last_seated_at: delta > 0 ? now : (prev?.last_seated_at ?? null),
      };
    }
  );

  const { error } = await supabase
    .from("pair_history")
    .upsert(rows, { onConflict: "class_id,student_a_id,student_b_id" });
  if (error) throw new Error(error.message);
}

/**
 * Genererer et nytt klassekart for klassen: henter elever og gjeldende
 * par-historikk, kjører seteplasseringsalgoritmen (som minimerer gjentatte
 * elevpar), lagrer det nye kartet og oppdaterer historikken. Elevene
 * fordeles på pultene læreren har satt opp i klasserommet.
 */
export async function generateAndSaveChart(
  classId: string,
  desks: Desk[],
  deskCols: number
): Promise<GenerateResult> {
  const [students, historyRows] = await Promise.all([
    fetchStudents(classId),
    fetchPairHistory(classId),
  ]);

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

  const historyMap = buildHistoryMap(historyRows);
  const groups = generateSeatingChart(students, roomyDesks.map((d) => d.seats), historyMap);
  const { newPairs, totalPairs } = countNewPairs(groups, historyMap);

  const layout: DeskAssignments = {};
  groups.forEach((group, i) => {
    const desk = roomyDesks[i];
    if (desk && group.length > 0) layout[desk.id] = group;
  });

  const chart = await unwrap<SeatingChart>(
    supabase
      .from("seating_charts")
      .insert({ class_id: classId, layout })
      .select()
      .single()
  );

  const now = new Date().toISOString();
  const pairs = pairsFromGroups(groups);
  if (pairs.length > 0) {
    const existing = new Map(historyRows.map((r) => [`${r.student_a_id}_${r.student_b_id}`, r]));
    const upsertRows = pairs.map(([a, b]) => {
      const key = `${a}_${b}`;
      const prev = existing.get(key);
      return {
        class_id: classId,
        student_a_id: a,
        student_b_id: b,
        times_together: (prev?.times_together ?? 0) + 1,
        last_seated_at: now,
      };
    });
    const { error } = await supabase
      .from("pair_history")
      .upsert(upsertRows, { onConflict: "class_id,student_a_id,student_b_id" });
    if (error) throw new Error(error.message);
  }

  if (roomyDesks !== desks) await updateDesks(classId, roomyDesks, deskCols);

  return { chart, desks: roomyDesks, newPairs, totalPairs };
}
