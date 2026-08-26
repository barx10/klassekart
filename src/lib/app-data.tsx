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
  addContactTeacher as apiAddContactTeacher,
  addStudents as apiAddStudents,
  createClass as apiCreateClass,
  deleteContactTeacher as apiDeleteContactTeacher,
  renameContactTeacher as apiRenameContactTeacher,
  deleteClass as apiDeleteClass,
  deleteChart as apiDeleteChart,
  deleteStudent as apiDeleteStudent,
  updateStudent as apiUpdateStudent,
  adjustPairHistory,
  fetchAllStudents,
  fetchChartHistory,
  fetchContactTeachers,
  fetchClasses,
  fetchPairHistory,
  resetPairHistory as apiResetPairHistory,
  generateAndSaveChart,
  updateChartLayout,
  updateDesks,
} from "./api";
import { clampSeats, normalizeDesks } from "./classroom";
import { pairsFromAssignments } from "./seating";
import type {
  ContactTeacher,
  Desk,
  DeskAssignments,
  Gender,
  PairHistoryRow,
  SchoolClass,
  SeatingChart,
  Student,
} from "./types";

interface AppDataValue {
  classes: SchoolClass[];
  studentsByClass: Map<string, Student[]>;
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;

  createClass: (name: string, defaultContactTeacher?: string) => Promise<SchoolClass>;
  deleteClass: (id: string) => Promise<void>;
  addStudents: (classId: string, names: string[], gender: Gender | null, contactTeacher: string | null) => Promise<void>;
  updateStudent: (id: string, fields: Partial<Pick<Student, "name" | "gender" | "contact_teacher">>) => Promise<void>;
  removeStudent: (id: string) => Promise<void>;

  /** Kontaktlærerne, på tvers av klasser. Elevene peker på navnet. */
  contactTeachers: ContactTeacher[];
  addContactTeacher: (name: string) => Promise<void>;
  renameContactTeacher: (id: string, name: string) => Promise<void>;
  removeContactTeacher: (id: string) => Promise<void>;

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
  deleteChart: (chartId: string) => Promise<void>;
  pairHistory: PairHistoryRow[];
  /** Nullstiller par-historikken for klassen som vises (skoleårsslutt). */
  resetPairHistory: () => Promise<void>;
  moveStudent: (
    from: { deskId: string; index: number },
    to: { deskId: string; index: number }
  ) => void;
  generate: () => Promise<void>;
  generating: boolean;
  lastResult: { newPairs: number; totalPairs: number } | null;
  classLoading: boolean;
  /** Leser alt inn på nytt fra lagringen — etter at en sikkerhetskopi er hentet inn. */
  reload: () => Promise<void>;
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
  const [contactTeachers, setContactTeachers] = useState<ContactTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [charts, setCharts] = useState<SeatingChart[]>([]);
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [pairHistory, setPairHistory] = useState<PairHistoryRow[]>([]);
  const [loadedClassId, setLoadedClassId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // Teller opp når lagringen er byttet ut under føttene på oss (import), slik
  // at klassen som vises leses inn på nytt selv om adressen står stille.
  const [dataVersion, setDataVersion] = useState(0);
  const [generateResult, setGenerateResult] = useState<
    { classId: string; newPairs: number; totalPairs: number } | null
  >(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Globale data: klasser og elever ------------------------------------
  const loadAll = useCallback(
    () =>
      Promise.all([fetchClasses(), fetchAllStudents(), fetchContactTeachers()]).then(
        ([cls, studs, teachers]) => {
          setClasses(cls);
          setStudents(studs);
          setContactTeachers(teachers);
        }
      ),
    []
  );

  useEffect(() => {
    loadAll()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadAll]);

  const reload = useCallback(async () => {
    setCharts([]);
    setActiveChartId(null);
    setPairHistory([]);
    setLoadedClassId(null);
    setGenerateResult(null);
    await loadAll();
    setDataVersion((v) => v + 1);
  }, [loadAll]);

  // --- Data for klassen som vises nå --------------------------------------
  useEffect(() => {
    if (!activeClassId) return;
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
  }, [activeClassId, dataVersion]);

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
    async (classId: string, names: string[], gender: Gender | null, contactTeacher: string | null) => {
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

  const addContactTeacher = useCallback(async (name: string) => {
    const created = await apiAddContactTeacher(name);
    setContactTeachers((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "no"))
    );
  }, []);

  /**
   * Å gi en kontaktlærer nytt navn eller fjerne hen skriver også om elevene,
   * siden de peker på navnet. Begge lister leses derfor inn på nytt — hele
   * datasettet er noen kilobyte, så det er billigere enn å speile endringen
   * to steder og risikere at de sklir fra hverandre.
   */
  const refreshTeachers = useCallback(async () => {
    const [teachers, studs] = await Promise.all([fetchContactTeachers(), fetchAllStudents()]);
    setContactTeachers(teachers);
    setStudents(studs);
  }, []);

  const renameContactTeacher = useCallback(
    async (id: string, name: string) => {
      await apiRenameContactTeacher(id, name);
      await refreshTeachers();
    },
    [refreshTeachers]
  );

  const removeContactTeacher = useCallback(
    async (id: string) => {
      await apiDeleteContactTeacher(id);
      await refreshTeachers();
    },
    [refreshTeachers]
  );

  const showChart = useCallback((chartId: string) => setActiveChartId(chartId), []);

  const resetPairHistory = useCallback(async () => {
    if (!activeClassId) return;
    await apiResetPairHistory(activeClassId);
    setPairHistory([]);
  }, [activeClassId]);

  /**
   * Sletter ett tidligere klassekart. Parene kartet bidro med telles ned igjen,
   * ellers ville varmekartet fortsatt telle et kart som ikke finnes lenger.
   */
  const deleteChart = useCallback(
    async (chartId: string) => {
      if (!activeClassId) return;
      const chart = charts.find((c) => c.id === chartId);
      if (!chart) return;

      await apiDeleteChart(chartId);
      await adjustPairHistory(activeClassId, pairsFromAssignments(chart.layout), []);

      const remaining = charts.filter((c) => c.id !== chartId);
      setCharts(remaining);
      // Slettet du kartet du så på, vis det nyeste som er igjen.
      setActiveChartId((prev) => (prev === chartId ? remaining[0]?.id ?? null : prev));
      setPairHistory(await fetchPairHistory(activeClassId));
    },
    [activeClassId, charts]
  );

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
      contactTeachers,
      addContactTeacher,
      renameContactTeacher,
      removeContactTeacher,
      activeClass,
      activeStudents,
      desks,
      deskCols,
      applyDesks,
      assignments,
      charts,
      activeChartId,
      showChart,
      deleteChart,
      pairHistory,
      resetPairHistory,
      moveStudent,
      generate,
      generating,
      lastResult,
      classLoading,
      reload,
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
      contactTeachers,
      addContactTeacher,
      renameContactTeacher,
      removeContactTeacher,
      activeClass,
      activeStudents,
      desks,
      deskCols,
      applyDesks,
      assignments,
      charts,
      activeChartId,
      showChart,
      deleteChart,
      pairHistory,
      resetPairHistory,
      moveStudent,
      generate,
      generating,
      lastResult,
      classLoading,
      reload,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData må brukes inni AppDataProvider");
  return ctx;
}
