"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAppData } from "@/lib/app-data";
import StudentManager from "./StudentManager";
import PairHeatmap from "./PairHeatmap";
import Modal from "./Modal";

type Section = "elever" | "historikk" | null;

function SectionHeader({
  label,
  open,
  onClick,
  badge,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  badge?: string | number;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-background"
    >
      <span className={`shrink-0 text-subtle transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
        ›
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge !== undefined && <span className="shrink-0 text-xs text-subtle">{badge}</span>}
    </button>
  );
}

export default function Sidebar() {
  const {
    classes,
    studentsByClass,
    loading,
    createClass,
    deleteClass,
    activeClass,
    activeStudents,
    charts,
    activeChartId,
    showChart,
    pairHistory,
    setError,
  } = useAppData();

  const pathname = usePathname();
  const router = useRouter();

  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("elever");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [creating, setCreating] = useState(false);

  function handleClassClick(id: string) {
    setOpenClassId((prev) => (prev === id ? null : id));
    router.push(`/klasser/${id}`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await createClass(name.trim(), contact.trim() || undefined);
      setName("");
      setContact("");
      setShowForm(false);
      setOpenClassId(created.id);
      router.push(`/klasser/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteClass(id: string, className: string) {
    if (!confirm(`Slette ${className}? Elever og historikk for klassen slettes også.`)) return;
    try {
      await deleteClass(id);
      if (pathname === `/klasser/${id}`) router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <aside className="flex h-dvh w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-raised">
      <Link href="/" className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Image src="/laererliv-logo.png" alt="" width={28} height={28} className="rounded-md" />
        <span className="text-base font-semibold tracking-tight">Klassekart</span>
      </Link>

      {/* --- Klasser --- */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Klasser</span>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs font-medium text-accent hover:underline">
          {showForm ? "Avbryt" : "+ Ny"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mx-3 mb-2 flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Navn, f.eks. 5B"
            className="rounded border border-border bg-surface-raised px-2 py-1 text-sm outline-none focus:border-accent"
            autoFocus
          />
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Kontaktlærer (valgfritt)"
            className="rounded border border-border bg-surface-raised px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-accent px-2 py-1 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Oppretter …" : "Opprett"}
          </button>
        </form>
      )}

      <nav className="px-2">
        {loading ? (
          <p className="px-2 text-sm text-muted">Laster …</p>
        ) : classes.length === 0 ? (
          <p className="px-2 text-sm text-muted">Ingen klasser ennå.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {classes.map((c) => {
              const isActive = pathname === `/klasser/${c.id}`;
              const isOpen = openClassId === c.id;
              const studs = studentsByClass.get(c.id) ?? [];
              return (
                <li key={c.id}>
                  <div
                    className={`flex items-center rounded-md ${
                      isActive ? "bg-accent-soft text-accent" : "hover:bg-background"
                    }`}
                  >
                    <button
                      onClick={() => handleClassClick(c.id)}
                      aria-expanded={isOpen}
                      className="flex flex-1 items-center gap-1.5 px-2 py-1.5 text-left"
                    >
                      <span
                        className={`shrink-0 text-subtle transition-transform ${isOpen ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        ›
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                      <span className="shrink-0 text-xs text-subtle">{studs.length}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteClass(c.id, c.name)}
                      aria-label={`Slett ${c.name}`}
                      className="px-2 text-xs text-subtle hover:text-danger"
                    >
                      ×
                    </button>
                  </div>

                  {isOpen && (
                    <ul className="mt-0.5 mb-1 ml-4 flex flex-col border-l border-border pl-3">
                      {studs.length === 0 ? (
                        <li className="py-1 text-xs text-subtle">Ingen elever</li>
                      ) : (
                        studs.map((s) => (
                          <li key={s.id} className="truncate py-0.5 text-xs text-muted">
                            {s.name}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* --- Verktøy for klassen som vises --- */}
      {activeClass && (
        <div className="mt-4 border-t border-border px-2 pt-3 pb-6">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
            {activeClass.name}
          </p>

          <SectionHeader
            label="Elever"
            badge={activeStudents.length}
            open={section === "elever"}
            onClick={() => setSection(section === "elever" ? null : "elever")}
          />
          {section === "elever" && (
            <div className="px-2 pb-2">
              <StudentManager
                classId={activeClass.id}
                students={activeStudents}
                defaultContactTeacher={activeClass.default_contact_teacher}
              />
            </div>
          )}

          <button
            onClick={() => setShowHeatmap(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-background"
          >
            <span className="shrink-0 text-subtle" aria-hidden>
              ›
            </span>
            <span className="flex-1">Oversikt over par</span>
          </button>

          <SectionHeader
            label="Tidligere kart"
            badge={charts.length}
            open={section === "historikk"}
            onClick={() => setSection(section === "historikk" ? null : "historikk")}
          />
          {section === "historikk" && (
            <ul className="flex flex-col gap-1 px-2 pb-2">
              {charts.length === 0 ? (
                <li className="text-xs text-subtle">Ingen kart generert ennå.</li>
              ) : (
                charts.map((chart) => (
                  <li key={chart.id}>
                    <button
                      onClick={() => showChart(chart.id)}
                      className={`w-full rounded border px-2 py-1 text-left text-xs ${
                        chart.id === activeChartId
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border hover:bg-background"
                      }`}
                    >
                      {new Date(chart.created_at).toLocaleString("no-NO")}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {showHeatmap && activeClass && (
        <Modal title={`Oversikt over par – ${activeClass.name}`} onClose={() => setShowHeatmap(false)}>
          <PairHeatmap students={activeStudents} historyRows={pairHistory} />
        </Modal>
      )}
    </aside>
  );
}
