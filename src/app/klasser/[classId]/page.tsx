"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchChartHistory,
  fetchClass,
  fetchLatestChart,
  fetchPairHistory,
  fetchStudents,
  generateAndSaveChart,
  updateDefaultContactTeacher,
} from "@/lib/api";
import { SEATS_PER_DESK } from "@/lib/seating";
import type { PairHistoryRow, SchoolClass, SeatingChart, Student } from "@/lib/types";
import ConfigWarning from "@/components/ConfigWarning";
import StudentManager from "@/components/StudentManager";
import ClassroomView from "@/components/ClassroomView";
import PairHeatmap from "@/components/PairHeatmap";
import { isSupabaseConfigured } from "@/lib/supabase";

type Tab = "kart" | "oversikt" | "historikk";

function defaultGrid(studentCount: number): { rows: number; cols: number } {
  const minDesks = Math.max(1, Math.ceil(studentCount / SEATS_PER_DESK));
  const cols = Math.max(1, Math.ceil(Math.sqrt(minDesks)));
  const rows = Math.max(1, Math.ceil(minDesks / cols));
  return { rows, cols };
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      {label}
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          className="px-2.5 py-1.5 text-muted hover:text-foreground"
          aria-label={`Færre ${label.toLowerCase()}`}
        >
          −
        </button>
        <span className="w-6 text-center tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="px-2.5 py-1.5 text-muted hover:text-foreground"
          aria-label={`Flere ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
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

  const [tab, setTab] = useState<Tab>("kart");
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<{ newPairs: number; totalPairs: number } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !classId) return;
    Promise.all([
      fetchClass(classId),
      fetchStudents(classId),
      fetchPairHistory(classId),
      fetchLatestChart(classId),
    ])
      .then(([cls, studs, history, chart]) => {
        setSchoolClass(cls);
        setStudents(studs);
        setHistoryRows(history);
        setCurrentChart(chart);
        if (chart) {
          setRows(chart.rows);
          setCols(chart.cols);
        } else if (studs.length > 0) {
          const grid = defaultGrid(studs.length);
          setRows(grid.rows);
          setCols(grid.cols);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [classId]);

  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const capacity = rows * cols * SEATS_PER_DESK;

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
      const { chart, newPairs, totalPairs } = await generateAndSaveChart(classId, rows, cols);
      setCurrentChart(chart);
      setLastResult({ newPairs, totalPairs });
      const refreshedHistory = await fetchPairHistory(classId);
      setHistoryRows(refreshedHistory);
      setChartHistory([]); // tving ny henting neste gang fanen åpnes
      setTab("kart");
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
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

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Elever</h2>
        <StudentManager
          classId={classId}
          students={students}
          defaultContactTeacher={schoolClass.default_contact_teacher}
          onChange={setStudents}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Klasserom</h2>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Stepper label="Rader" value={rows} onChange={setRows} />
          <Stepper label="Kolonner" value={cols} onChange={setCols} />
          <button
            onClick={handleGenerate}
            disabled={generating || students.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {generating ? "Genererer …" : "Generer klassekart"}
          </button>
          {lastResult && (
            <p className="text-sm text-muted">
              {lastResult.newPairs} av {lastResult.totalPairs} elevpar sitter sammen for første gang.
            </p>
          )}
        </div>
        {students.length > capacity && (
          <p className="mb-3 text-xs text-subtle">
            {rows} × {cols} pulter gir kun plass til {capacity} elever — utvider automatisk med flere rader
            ved generering.
          </p>
        )}

        <div className="mb-4 flex gap-1 border-b border-border text-sm">
          {(
            [
              ["kart", "Klassekart"],
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

        {tab === "kart" && (
          <ClassroomView
            layout={currentChart?.layout ?? []}
            cols={currentChart?.cols ?? cols}
            studentsById={studentsById}
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
                    onClick={() => {
                      setCurrentChart(chart);
                      setTab("kart");
                    }}
                    className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-surface-raised"
                  >
                    {new Date(chart.created_at).toLocaleString("no-NO")} &mdash; {chart.rows} × {chart.cols}{" "}
                    pulter
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
