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
  fetchAllStudents,
  fetchChartHistory,
  fetchClasses,
  fetchPairHistory,
  generateAndSaveChart,
  updateDefaultContactTeacher,
  updateDesks,
} from "./api";
import { normalizeDesks } from "./classroom";
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
  setContactTeacher: (classId: string, name: string | null) => Promise<void>;

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

  const setContactTeacher = useCallback(async (classId: string, name: string | null) => {
    const updated = await updateDefaultContactTeacher(classId, name);
    setClasses((prev) => prev.map((c) => (c.id === classId ? updated : c)));
  }, []);

  const showChart = useCallback((chartId: string) => setActiveChartId(chartId), []);

  const generate = useCallback(async () => {
    if (!activeClassId) return;
    setGenerating(true);
    setError(null);
    setGenerateResult(null);
    try {
      const { chart, newPairs, totalPairs } = await generateAndSaveChart(activeClassId, desks);
      setCharts((prev) => [chart, ...prev]);
      setActiveChartId(chart.id);
      setGenerateResult({ classId: activeClassId, newPairs, totalPairs });
      setPairHistory(await fetchPairHistory(activeClassId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [activeClassId, desks]);

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
      setContactTeacher,
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
      setContactTeacher,
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
