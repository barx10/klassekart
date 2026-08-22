"use client";

import { supabase } from "./supabase";
import { buildHistoryMap, countNewPairs, generateSeatingChart, pairsFromLayout } from "./seating";
import type {
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

export async function fetchClass(id: string): Promise<SchoolClass> {
  return unwrap(supabase.from("classes").select("*").eq("id", id).single());
}

export async function createClass(name: string): Promise<SchoolClass> {
  return unwrap(supabase.from("classes").insert({ name }).select().single());
}

export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from("classes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateContactTeacher(
  id: string,
  info: {
    contact_teacher_name: string | null;
    contact_teacher_email: string | null;
    contact_teacher_phone: string | null;
    contact_teacher_note: string | null;
  }
): Promise<SchoolClass> {
  return unwrap(supabase.from("classes").update(info).eq("id", id).select().single());
}

// ---------------------------------------------------------------------------
// Elever
// ---------------------------------------------------------------------------

export async function fetchStudents(classId: string): Promise<Student[]> {
  return unwrap(
    supabase.from("students").select("*").eq("class_id", classId).order("name", { ascending: true })
  );
}

export async function addStudent(classId: string, name: string, gender: Gender): Promise<Student> {
  return unwrap(
    supabase.from("students").insert({ class_id: classId, name, gender }).select().single()
  );
}

export async function addStudents(classId: string, names: string[], gender: Gender): Promise<Student[]> {
  const rows = names.map((name) => ({ class_id: classId, name, gender }));
  return unwrap(supabase.from("students").insert(rows).select());
}

export async function updateStudent(
  id: string,
  fields: Partial<Pick<Student, "name" | "gender">>
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

export async function fetchLatestChart(classId: string): Promise<SeatingChart | null> {
  const { data, error } = await supabase
    .from("seating_charts")
    .select("*")
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
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
  newPairs: number;
  totalPairs: number;
}

/**
 * Genererer et nytt klassekart for klassen: henter elever og gjeldende
 * par-historikk, kjører seteplasseringsalgoritmen (som minimerer gjentatte
 * elevpar), lagrer det nye kartet og oppdaterer historikken.
 */
export async function generateAndSaveChart(classId: string, groupSize: number): Promise<GenerateResult> {
  const [students, historyRows] = await Promise.all([
    fetchStudents(classId),
    fetchPairHistory(classId),
  ]);

  if (students.length === 0) {
    throw new Error("Klassen har ingen elever ennå.");
  }

  const historyMap = buildHistoryMap(historyRows);
  const layout = generateSeatingChart(students, groupSize, historyMap);
  const { newPairs, totalPairs } = countNewPairs(layout, historyMap);

  const chart = await unwrap<SeatingChart>(
    supabase
      .from("seating_charts")
      .insert({ class_id: classId, group_size: groupSize, layout })
      .select()
      .single()
  );

  const now = new Date().toISOString();
  const pairs = pairsFromLayout(layout);
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

  return { chart, newPairs, totalPairs };
}
