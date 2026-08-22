"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchChartHistory,
  fetchClass,
  fetchLatestChart,
  fetchPairHistory,
  fetchStudents,
  generateAndSaveChart,
  updateDefaultContactTeacher,
  updateDesks,
} from "@/lib/api";
import {
  SEATS_PER_DESK,
  addColumn,
  addDesk,
  addRow,
  ensureCapacity,
  makeGrid,
  tidyDesks,
} from "@/lib/classroom";
import type { Desk, PairHistoryRow, SchoolClass, SeatingChart, Student } from "@/lib/types";
import ConfigWarning from "@/components/ConfigWarning";
import StudentManager from "@/components/StudentManager";
import ClassroomCanvas from "@/components/ClassroomCanvas";
import PairHeatmap from "@/components/PairHeatmap";
import { isSupabaseConfigured } from "@/lib/supabase";

type Tab = "elever" | "oversikt" | "historikk";

const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 3;

function ToolbarButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium hover:border-accent/50 hover:text-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export default function ClassDetailPage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;

  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [historyRows, setHistoryRows] = useState<PairHistoryRow[]>([]);
  const [currentChart, setCurrentChart] = useState<SeatingChart | null>(null);
  const [chartHistory, setChartHistory] = useState<SeatingChart[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const [desks, setDesks] = useState<Desk[]>([]);
  const [deskCols, setDeskCols] = useState(DEFAULT_COLS);
  const [tab, setTab] = useState<Tab>("elever");
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<{ newPairs: number; totalPairs: number } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !classId) return;
    let cancelled = false;
    Promise.all([
      fetchClass(classId),
      fetchStudents(classId),
      fetchPairHistory(classId),
      fetchLatestChart(classId),
    ])
      .then(([cls, studs, history, chart]) => {
        if (cancelled) return;
        setSchoolClass(cls);
        setStudents(studs);
        setHistoryRows(history);
        setCurrentChart(chart);
        setDeskCols(cls.desk_cols || DEFAULT_COLS);

        const existing = Array.isArray(cls.desks) ? cls.desks : [];
        if (existing.length > 0) {
          setDesks(existing);
        } else {
          // Nytt klasserom: start med et ryddig rutenett som dekker klassen.
          const cols = cls.desk_cols || DEFAULT_COLS;
          const starter = ensureCapacity(makeGrid(DEFAULT_ROWS, cols), studs.length, cols);
          setDesks(starter);
          updateDesks(classId, starter, cols).catch(() => {});
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const capacity = desks.length * SEATS_PER_DESK;

  const persistDesks = useCallback(
    (next: Desk[], cols: number) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateDesks(classId, next, cols).catch((e) =>
          setError(e instanceof Error ? e.message : String(e))
        );
      }, 300);
    },
    [classId]
  );

  const handleDesksChange = useCallback(
    (next: Desk[], persist: boolean) => {
      setDesks(next);
      if (persist) persistDesks(next, deskCols);
    },
    [deskCols, persistDesks]
  );

  function applyDesks(next: Desk[], cols = deskCols) {
    setDesks(next);
    setDeskCols(cols);
    persistDesks(next, cols);
  }

  function handleRemoveDesk(deskId: string) {
    applyDesks(desks.filter((d) => d.id !== deskId));
  }

  async function handleDefaultContactTeacherChange(value: string) {
    const trimmed = value.trim() || null;
    if (!schoolClass || trimmed === schoolClass.default_contact_teacher) return;
    try {
      const updated = await updateDefaultContactTeacher(schoolClass.id, trimmed);
      setSchoolClass(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setLastResult(null);
    try {
      // Sørg for at det finnes nok pulter til alle elevene før vi genererer.
      const enough = ensureCapacity(desks, students.length, deskCols);
      if (enough.length !== desks.length) applyDesks(enough);

      const { chart, newPairs, totalPairs } = await generateAndSaveChart(classId, enough);
      setCurrentChart(chart);
      setLastResult({ newPairs, totalPairs });
      const refreshedHistory = await fetchPairHistory(classId);
      setHistoryRows(refreshedHistory);
      setChartHistory([]); // tving ny henting neste gang fanen åpnes
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function openHistorikk() {
    setTab("historikk");
    if (chartHistory.length === 0) {
      try {
        const history = await fetchChartHistory(classId);
        setChartHistory(history);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  if (!isSupabaseConfigured) return <ConfigWarning />;
  if (loading) return <p className="text-sm text-muted">Laster …</p>;
  if (!schoolClass) return <p className="text-sm text-danger">Fant ikke klassen.</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">{schoolClass.name}</h1>
        <label className="flex flex-col gap-1 text-sm">
          Kontaktlærer (standard for nye elever)
          <input
            defaultValue={schoolClass.default_contact_teacher ?? ""}
            onBlur={(e) => handleDefaultContactTeacherChange(e.target.value)}
            placeholder="Navn"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ToolbarButton onClick={() => applyDesks(addRow(desks, deskCols))}>+ Rad</ToolbarButton>
        <ToolbarButton
          onClick={() => {
            const next = addColumn(desks, deskCols);
            applyDesks(next.desks, next.cols);
          }}
        >
          + Kolonne
        </ToolbarButton>
        <ToolbarButton onClick={() => applyDesks(addDesk(desks, deskCols))}>+ Pult</ToolbarButton>
        <ToolbarButton onClick={() => applyDesks(tidyDesks(desks, deskCols))} disabled={desks.length === 0}>
          Rydd opp
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <button
          onClick={handleGenerate}
          disabled={generating || students.length === 0}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {generating ? "Genererer …" : "Generer klassekart"}
        </button>

        <span className="text-xs text-subtle">
          {desks.length} pulter · {capacity} plasser · {students.length} elever
        </span>
        {lastResult && (
          <span className="text-xs text-muted">
            {lastResult.newPairs} av {lastResult.totalPairs} elevpar sitter sammen for første gang.
          </span>
        )}
      </div>

      <ClassroomCanvas
        desks={desks}
        assignments={currentChart?.layout ?? {}}
        studentsById={studentsById}
        onDesksChange={handleDesksChange}
        onRemoveDesk={handleRemoveDesk}
      />

      <section className="mt-8">
        <div className="mb-4 flex gap-1 border-b border-border text-sm">
          {(
            [
              ["elever", "Elever"],
              ["oversikt", "Oversikt over par"],
              ["historikk", "Tidligere kart"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => (key === "historikk" ? openHistorikk() : setTab(key))}
              className={`-mb-px border-b-2 px-3 py-2 font-medium ${
                tab === key ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "elever" && (
          <StudentManager
            classId={classId}
            students={students}
            defaultContactTeacher={schoolClass.default_contact_teacher}
            onChange={setStudents}
          />
        )}

        {tab === "oversikt" && <PairHeatmap students={students} historyRows={historyRows} />}

        {tab === "historikk" && (
          <ul className="flex flex-col gap-2 text-sm">
            {chartHistory.length === 0 ? (
              <li className="text-muted">Ingen tidligere klassekart.</li>
            ) : (
              chartHistory.map((chart) => (
                <li key={chart.id}>
                  <button
                    onClick={() => setCurrentChart(chart)}
                    className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-surface-raised"
                  >
                    {new Date(chart.created_at).toLocaleString("no-NO")}
                    {chart.id === currentChart?.id && (
                      <span className="ml-2 text-xs text-accent">vises nå</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
