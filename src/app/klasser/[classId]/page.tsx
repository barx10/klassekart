"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  fetchChartHistory,
  fetchClass,
  fetchLatestChart,
  fetchPairHistory,
  fetchStudents,
  generateAndSaveChart,
} from "@/lib/api";
import type { PairHistoryRow, SchoolClass, SeatingChart, Student } from "@/lib/types";
import ConfigWarning from "@/components/ConfigWarning";
import ContactTeacherModal from "@/components/ContactTeacherModal";
import StudentManager from "@/components/StudentManager";
import SeatingChartView from "@/components/SeatingChartView";
import PairHeatmap from "@/components/PairHeatmap";
import { isSupabaseConfigured } from "@/lib/supabase";

type Tab = "kart" | "oversikt" | "historikk";

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

  const [showContactModal, setShowContactModal] = useState(false);
  const [tab, setTab] = useState<Tab>("kart");
  const [groupSize, setGroupSize] = useState(4);
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
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [classId]);

  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setLastResult(null);
    try {
      const { chart, newPairs, totalPairs } = await generateAndSaveChart(classId, groupSize);
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
        const rows = await fetchChartHistory(classId);
        setChartHistory(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div>
        <Link href="/" className="text-sm text-accent hover:underline">
          &larr; Tilbake til klasser
        </Link>
        <ConfigWarning />
      </div>
    );
  }

  if (loading) return <p className="text-sm text-muted">Laster …</p>;
  if (!schoolClass) return <p className="text-sm text-danger">Fant ikke klassen.</p>;

  return (
    <div>
      <Link href="/" className="text-sm text-accent hover:underline">
        &larr; Tilbake til klasser
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{schoolClass.name}</h1>
        <button
          onClick={() => setShowContactModal(true)}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-raised"
        >
          Kontaktlærer
          {schoolClass.contact_teacher_name ? `: ${schoolClass.contact_teacher_name}` : ""}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Elever</h2>
        <StudentManager classId={classId} students={students} onChange={setStudents} />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Generer klassekart</h2>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Elever per bord
            <select
              value={groupSize}
              onChange={(e) => setGroupSize(Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleGenerate}
            disabled={generating || students.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {generating ? "Genererer …" : "Generer nytt klassekart"}
          </button>
          {lastResult && (
            <p className="text-sm text-muted">
              {lastResult.newPairs} av {lastResult.totalPairs} elevpar sitter sammen for første gang.
            </p>
          )}
        </div>

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

        {tab === "kart" &&
          (currentChart ? (
            <SeatingChartView layout={currentChart.layout} studentsById={studentsById} />
          ) : (
            <p className="text-sm text-muted">Ingen klassekart generert ennå.</p>
          ))}

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
                    {new Date(chart.created_at).toLocaleString("no-NO")} &mdash; {chart.group_size} per
                    bord
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      {showContactModal && (
        <ContactTeacherModal
          schoolClass={schoolClass}
          onClose={() => setShowContactModal(false)}
          onSaved={setSchoolClass}
        />
      )}
    </div>
  );
}
