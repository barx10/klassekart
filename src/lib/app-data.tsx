"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  addStudents as apiAddStudents,
  createClass as apiCreateClass,
  deleteClass as apiDeleteClass,
  deleteStudent as apiDeleteStudent,
  updateStudent as apiUpdateStudent,
  adjustPairHistory,
  fetchAllStudents,
  fetchChartHistory,
  fetchClasses,
  fetchPairHistory,
  generateAndSaveChart,
  updateChartLayout,
  updateDesks,
} from "./api";
import { clampSeats, normalizeDesks } from "./classroom";
import { pairsFromAssignments } from "./seating";
import type {
  Desk,
  DeskAssignments,
  Gender,
  PairHistoryRow,
  SchoolClass,
  SeatingChart,
  Student,
} from "./types";
import { isSupabaseConfigured } from "./supabase";

interface AppDataValue {
  classes: SchoolClass[];
  studentsByClass: Map<string, Student[]>;
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;

  createClass: (name: string, defaultContactTeacher?: string) => Promise<SchoolClass>;
  deleteClass: (id: string) => Promise<void>;
  addStudents: (classId: string, names: string[], gender: Gender, contactTeacher: string | null) => Promise<void>;
  updateStudent: (id: string, fields: Partial<Pick<Student, "name" | "gender" | "contact_teacher">>) => Promise<void>;
  removeStudent: (id: string) => Promise<void>;

  /** Klassen som vises i klasserommet nå (utledet fra adressen). */
  activeClass: SchoolClass | null;
  activeStudents: Student[];
  desks: Desk[];
  deskCols: number;
  applyDesks: (desks: Desk[], cols?: number, persist?: boolean) => void;
  assignments: DeskAssignments;
  charts: SeatingChart[];
  activeChartId: string | null;
  showChart: (chartId: string) => void;
  pairHistory: PairHistoryRow[];
  moveStudent: (
    from: { deskId: string; index: number },
    to: { deskId: string; index: number }
  ) => void;
  generate: () => Promise<void>;
  generating: boolean;
  lastResult: { newPairs: number; totalPairs: number } | null;
  classLoading: boolean;
}

const AppDataContext = createContext<AppDataValue | null>(null);

function classIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/klasser\/([^/]+)/);
  return match ? match[1] : null;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeClassId = classIdFromPath(pathname);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const [charts, setCharts] = useState<SeatingChart[]>([]);
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [pairHistory, setPairHistory] = useState<PairHistoryRow[]>([]);
  const [loadedClassId, setLoadedClassId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<
    { classId: string; newPairs: number; totalPairs: number } | null
  >(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Globale data: klasser og elever ------------------------------------
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    Promise.all([fetchClasses(), fetchAllStudents()])
      .then(([cls, studs]) => {
        setClasses(cls);
        setStudents(studs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // --- Data for klassen som vises nå --------------------------------------
  useEffect(() => {
    if (!isSupabaseConfigured || !activeClassId) return;
    let cancelled = false;

    Promise.all([fetchChartHistory(activeClassId), fetchPairHistory(activeClassId)])
      .then(([chartRows, history]) => {
        if (cancelled) return;
        setCharts(chartRows);
        setActiveChartId(chartRows[0]?.id ?? null);
        setPairHistory(history);
        setLoadedClassId(activeClassId);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [activeClassId]);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId) ?? null,
    [classes, activeClassId]
  );

  // Pultoppsettet leses direkte fra klasseraden, så det finnes bare én kilde
  // til sannhet. applyDesks oppdaterer klasseraden lokalt og lagrer i bakgrunnen.
  const desks = useMemo(() => normalizeDesks(activeClass?.desks), [activeClass]);
  const deskCols = activeClass?.desk_cols || 3;
  const classLoading = Boolean(activeClassId) && loadedClassId !== activeClassId;
  const lastResult = useMemo(
    () =>
      generateResult && generateResult.classId === activeClassId
        ? { newPairs: generateResult.newPairs, totalPairs: generateResult.totalPairs }
        : null,
    [generateResult, activeClassId]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const studentsByClass = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const s of students) {
      const list = map.get(s.class_id) ?? [];
      list.push(s);
      map.set(s.class_id, list);
    }
    return map;
  }, [students]);

  const activeStudents = useMemo(
    () => (activeClassId ? studentsByClass.get(activeClassId) ?? [] : []),
    [studentsByClass, activeClassId]
  );

  const assignments = useMemo(
    () => charts.find((c) => c.id === activeChartId)?.layout ?? {},
    [charts, activeChartId]
  );

  // --- Endringer -----------------------------------------------------------

  const applyDesks = useCallback(
    (next: Desk[], cols?: number, persist = true) => {
      if (!activeClassId) return;
      const nextCols = cols ?? deskCols;

      setClasses((prev) =>
        prev.map((c) => (c.id === activeClassId ? { ...c, desks: next, desk_cols: nextCols } : c))
      );
      if (!persist) return;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateDesks(activeClassId, next, nextCols).catch((e) =>
          setError(e instanceof Error ? e.message : String(e))
        );
      }, 300);
    },
    [activeClassId, deskCols]
  );

  const createClass = useCallback(async (name: string, defaultContactTeacher?: string) => {
    const created = await apiCreateClass(name, defaultContactTeacher);
    setClasses((prev) => [...prev, created]);
    return created;
  }, []);

  const deleteClass = useCallback(async (id: string) => {
    await apiDeleteClass(id);
    setClasses((prev) => prev.filter((c) => c.id !== id));
    setStudents((prev) => prev.filter((s) => s.class_id !== id));
  }, []);

  const addStudents = useCallback(
    async (classId: string, names: string[], gender: Gender, contactTeacher: string | null) => {
      const created = await apiAddStudents(classId, names, gender, contactTeacher);
      setStudents((prev) =>
        [...prev, ...created].sort((a, b) => a.name.localeCompare(b.name, "no"))
      );
    },
    []
  );

  const updateStudent = useCallback(
    async (id: string, fields: Partial<Pick<Student, "name" | "gender" | "contact_teacher">>) => {
      const updated = await apiUpdateStudent(id, fields);
      setStudents((prev) =>
        prev
          .map((s) => (s.id === id ? updated : s))
          .sort((a, b) => a.name.localeCompare(b.name, "no"))
      );
    },
    []
  );

  const removeStudent = useCallback(async (id: string) => {
    await apiDeleteStudent(id);
    setStudents((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const showChart = useCallback((chartId: string) => setActiveChartId(chartId), []);

  /**
   * Flytter en elev til et annet sete. Er setet opptatt, bytter de to elevene
   * plass. Par-historikken justeres slik at varmekartet stemmer med hvem som
   * faktisk sitter sammen etter flyttingen.
   */
  const moveStudent = useCallback(
    (from: { deskId: string; index: number }, to: { deskId: string; index: number }) => {
      if (!activeClassId || !activeChartId) return;
      if (from.deskId === to.deskId && from.index === to.index) return;

      const chart = charts.find((c) => c.id === activeChartId);
      if (!chart) return;

      const seatsFor = (deskId: string) =>
        clampSeats(desks.find((d) => d.id === deskId)?.seats ?? 2);

      const nextLayout: DeskAssignments = {};
      for (const desk of desks) {
        const current = chart.layout[desk.id] ?? [];
        nextLayout[desk.id] = Array.from(
          { length: clampSeats(desk.seats) },
          (_, i) => current[i] ?? null
        );
      }
      if (!nextLayout[from.deskId] || !nextLayout[to.deskId]) return;
      if (to.index >= seatsFor(to.deskId)) return;

      const moving = nextLayout[from.deskId][from.index] ?? null;
      if (!moving) return;
      nextLayout[from.deskId][from.index] = nextLayout[to.deskId][to.index] ?? null;
      nextLayout[to.deskId][to.index] = moving;

      const before = pairsFromAssignments(chart.layout);
      const after = pairsFromAssignments(nextLayout);

      setCharts((prev) =>
        prev.map((c) => (c.id === activeChartId ? { ...c, layout: nextLayout } : c))
      );

      updateChartLayout(activeChartId, nextLayout)
        .then(() => adjustPairHistory(activeClassId, before, after))
        .then(() => fetchPairHistory(activeClassId))
        .then(setPairHistory)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    },
    [activeClassId, activeChartId, charts, desks]
  );

  const generate = useCallback(async () => {
    if (!activeClassId) return;
    setGenerating(true);
    setError(null);
    setGenerateResult(null);
    try {
      const {
        chart,
        desks: usedDesks,
        newPairs,
        totalPairs,
      } = await generateAndSaveChart(activeClassId, desks, deskCols);

      // Manglet det plasser, la generereringen til pulter og lagret dem.
      // Speil det lokalt, ellers ville klasserommet vist et gammelt oppsett
      // uten pultene elevene nettopp ble plassert ved.
      if (usedDesks !== desks) {
        setClasses((prev) =>
          prev.map((c) => (c.id === activeClassId ? { ...c, desks: usedDesks } : c))
        );
      }

      setCharts((prev) => [chart, ...prev]);
      setActiveChartId(chart.id);
      setGenerateResult({ classId: activeClassId, newPairs, totalPairs });
      setPairHistory(await fetchPairHistory(activeClassId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [activeClassId, desks, deskCols]);

  const value = useMemo(
    () => ({
      classes,
      studentsByClass,
      loading,
      error,
      setError,
      createClass,
      deleteClass,
      addStudents,
      updateStudent,
      removeStudent,
      activeClass,
      activeStudents,
      desks,
      deskCols,
      applyDesks,
      assignments,
      charts,
      activeChartId,
      showChart,
      pairHistory,
      moveStudent,
      generate,
      generating,
      lastResult,
      classLoading,
    }),
    [
      classes,
      studentsByClass,
      loading,
      error,
      createClass,
      deleteClass,
      addStudents,
      updateStudent,
      removeStudent,
      activeClass,
      activeStudents,
      desks,
      deskCols,
      applyDesks,
      assignments,
      charts,
      activeChartId,
      showChart,
      pairHistory,
      moveStudent,
      generate,
      generating,
      lastResult,
      classLoading,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData må brukes inni AppDataProvider");
  return ctx;
}
