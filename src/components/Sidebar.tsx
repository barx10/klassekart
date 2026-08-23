"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAppData } from "@/lib/app-data";
import StudentManager from "./StudentManager";
import PairHeatmap from "./PairHeatmap";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import NewClassForm from "./NewClassForm";
import { ghostButton, plural } from "@/lib/ui";

type Section = "elever" | "historikk" | null;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 shrink-0 text-subtle transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left hover:bg-background"
    >
      <Chevron open={open} />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge !== undefined && <span className="shrink-0 text-xs text-subtle tabular-nums">{badge}</span>}
    </button>
  );
}

/** «I dag 14:30» / «23.08.2026, 14:30» — kort nok for den smale menyen. */
function chartLabel(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return `I dag ${time}`;
  return `${date.toLocaleDateString("nb-NO", { day: "2-digit", month: "short" })} ${time}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAbout: () => void;
}

export default function Sidebar({ open, onClose, onAbout }: Props) {
  const {
    classes,
    studentsByClass,
    loading,
    deleteClass,
    activeClass,
    activeStudents,
    charts,
    activeChartId,
    showChart,
    deleteChart,
    pairHistory,
    setError,
  } = useAppData();

  const pathname = usePathname();
  const router = useRouter();

  const [section, setSection] = useState<Section>("elever");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingChartDelete, setPendingChartDelete] = useState<{ id: string; label: string } | null>(
    null
  );

  async function confirmChartDelete() {
    if (!pendingChartDelete) return;
    const { id } = pendingChartDelete;
    setPendingChartDelete(null);
    try {
      await deleteChart(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteClass(id);
      if (pathname === `/klasser/${id}`) router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <aside
        data-print-hide
        aria-label="Klasser og verktøy"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-raised transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:max-w-none lg:translate-x-0 ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
          <Link href="/" onClick={onClose} className="flex min-w-0 flex-1 items-center gap-2">
            <Image src="/laererliv-logo.png" alt="" width={28} height={28} className="rounded-md" />
            <span className="truncate text-base font-semibold tracking-tight">Klassekart</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk meny"
            className="rounded-md p-1.5 text-subtle hover:bg-background hover:text-foreground lg:hidden"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* --- Klasser --- */}
        <div className="flex items-center justify-between px-4 pt-4 pb-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">Klasser</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
            className="rounded px-1 text-xs font-medium text-accent-text hover:underline"
          >
            {showForm ? "Avbryt" : "+ Ny klasse"}
          </button>
        </div>

        {showForm && (
          <div className="mx-3 mb-2 rounded-lg border border-border bg-surface p-2">
            <NewClassForm
              size="sm"
              autoFocus
              onCreated={() => {
                setShowForm(false);
                onClose();
              }}
            />
          </div>
        )}

        <nav className="px-2" aria-label="Klasser">
          {loading ? (
            <p className="px-2 py-1 text-sm text-muted" role="status">
              Laster …
            </p>
          ) : classes.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted">Ingen klasser ennå.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {classes.map((c) => {
                const isActive = pathname === `/klasser/${c.id}`;
                const count = (studentsByClass.get(c.id) ?? []).length;
                return (
                  <li
                    key={c.id}
                    className={`group flex items-center rounded-md ${
                      isActive ? "bg-accent-soft text-accent-text" : "hover:bg-background"
                    }`}
                  >
                    <Link
                      href={`/klasser/${c.id}`}
                      onClick={onClose}
                      aria-current={isActive ? "page" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                      <span
                        className="shrink-0 text-xs text-subtle tabular-nums"
                        title={plural(count, "elev", "elever")}
                      >
                        {count}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ id: c.id, name: c.name })}
                      aria-label={`Slett ${c.name}`}
                      title={`Slett ${c.name}`}
                      className="mr-0.5 rounded p-1.5 text-subtle opacity-0 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                        <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* --- Verktøy for klassen som vises --- */}
        {activeClass && (
          <div className="mt-4 border-t border-border px-2 pt-3 pb-4">
            <h2 className="truncate px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
              {activeClass.name}
            </h2>

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
                  charts.map((chart) => {
                    const label = chartLabel(chart.created_at);
                    const isShown = chart.id === activeChartId;
                    return (
                      <li
                        key={chart.id}
                        className={`group flex items-center gap-0.5 rounded border ${
                          isShown
                            ? "border-accent bg-accent-soft text-accent-text"
                            : "border-border hover:bg-background"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            showChart(chart.id);
                            onClose();
                          }}
                          aria-pressed={isShown}
                          title={new Date(chart.created_at).toLocaleString("nb-NO")}
                          className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs"
                        >
                          {label}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingChartDelete({ id: chart.id, label })}
                          aria-label={`Slett kartet fra ${label}`}
                          title={`Slett kartet fra ${label}`}
                          className="mr-0.5 rounded p-1 text-subtle opacity-0 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            aria-hidden
                          >
                            <path
                              d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}

            {/* Egen knapp, ikke en seksjon: den åpner et vindu i stedet for å
                folde ut noe her — derfor ingen chevron. */}
            <button
              type="button"
              onClick={() => setShowHeatmap(true)}
              className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-background"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-subtle" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M2 2h12v12H2z M2 6h12 M2 10h12 M6 2v12 M10 2v12" />
              </svg>
              <span className="flex-1">Oversikt over par</span>
            </button>
          </div>
        )}

        <div className="mt-auto border-t border-border p-2">
          <button type="button" onClick={onAbout} className={`${ghostButton("sm")} w-full justify-start`}>
            Om Klassekart
          </button>
        </div>
      </aside>

      {showHeatmap && activeClass && (
        <Modal
          title={`Oversikt over par – ${activeClass.name}`}
          description="Hvor mange ganger hvert elevpar har sittet ved samme bord."
          onClose={() => setShowHeatmap(false)}
        >
          <PairHeatmap students={activeStudents} historyRows={pairHistory} />
        </Modal>
      )}

      {pendingChartDelete && (
        <ConfirmDialog
          title="Slette dette klassekartet?"
          body={
            <>
              Kartet fra{" "}
              <strong className="text-foreground">{pendingChartDelete.label}</strong> slettes, og
              parene det bidro med telles ned igjen i oversikten over par. Elevene og de andre
              kartene beholdes.
            </>
          }
          confirmLabel="Slett kartet"
          onConfirm={confirmChartDelete}
          onCancel={() => setPendingChartDelete(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Slette ${pendingDelete.name}?`}
          body={
            <>
              Alle elever, genererte klassekart og par-historikken for{" "}
              <strong className="text-foreground">{pendingDelete.name}</strong> slettes også. Dette
              kan ikke angres.
            </>
          }
          confirmLabel="Slett klassen"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
