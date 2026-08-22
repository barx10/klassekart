"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createClass as apiCreateClass,
  deleteClass as apiDeleteClass,
  fetchAllStudents,
  fetchClasses,
} from "./api";
import type { SchoolClass, Student } from "./types";
import { isSupabaseConfigured } from "./supabase";

interface AppDataValue {
  classes: SchoolClass[];
  studentsByClass: Map<string, Student[]>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createClass: (name: string, defaultContactTeacher?: string) => Promise<SchoolClass>;
  deleteClass: (id: string) => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [cls, studs] = await Promise.all([fetchClasses(), fetchAllStudents()]);
      setClasses(cls);
      setStudents(studs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

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

  const studentsByClass = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const s of students) {
      const list = map.get(s.class_id) ?? [];
      list.push(s);
      map.set(s.class_id, list);
    }
    return map;
  }, [students]);

  const createClass = useCallback(async (name: string, defaultContactTeacher?: string) => {
    const created = await apiCreateClass(name, defaultContactTeacher);
    setClasses((prev) => [...prev, created]);
    return created;
  }, []);

  const deleteClass = useCallback(async (id: string) => {
    await apiDeleteClass(id);
    setClasses((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo(
    () => ({ classes, studentsByClass, loading, error, refresh, createClass, deleteClass }),
    [classes, studentsByClass, loading, error, refresh, createClass, deleteClass]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData må brukes inni AppDataProvider");
  return ctx;
}
