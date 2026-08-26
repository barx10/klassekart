"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAppData } from "@/lib/app-data";
import StudentManager from "./StudentManager";
import PairHeatmap from "./PairHeatmap";
import ContactTeachers from "./ContactTeachers";
import HelpTip from "./HelpTip";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import NewClassForm from "./NewClassForm";
import { backupFilename, exportBackup, parseBackup, replaceAll, type LocalData } from "@/lib/local-db";
import { SaveCancelled, saveTextToFile } from "@/lib/backup-file";
import { ghostButton, plural, secondaryButton } from "@/lib/ui";

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
  /** Skuffen er dratt fram på små skjermer. */
  open: boolean;
  /** Menya er lagt bort på store skjermer, så klassekartet får hele vinduet. */
  hidden: boolean;
  onClose: () => void;
  onHide: () => void;
  onAbout: () => void;
}

export default function Sidebar({ open, hidden, onClose, onHide, onAbout }: Props) {
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
    resetPairHistory,
    contactTeachers,
    removeContactTeacher,
    setError,
    reload,
  } = useAppData();

  const pathname = usePathname();
  const router = useRouter();

  const [section, setSection] = useState<Section>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showTeachers, setShowTeachers] = useState(false);
  const [pendingTeacherDelete, setPendingTeacherDelete] = useState<{ id: string; name: string } | null>(
    null
  );
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingChartDelete, setPendingChartDelete] = useState<{ id: string; label: string } | null>(
    null
  );
  const [pendingImport, setPendingImport] = useState<{ data: LocalData; name: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function doRemoveTeacher() {
    if (!pendingTeacherDelete) return;
    const { id } = pendingTeacherDelete;
    setPendingTeacherDelete(null);
    try {
      await removeContactTeacher(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function doResetPairs() {
    setConfirmReset(false);
    try {
      await resetPairHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Lagrer alt som ligger i programmet som én fil — alle klassene, ikke bare
   * den som vises. Derfor står det ikke noe klassenavn i filnavnet: fila er
   * hele datasettet, og å hente den inn igjen erstatter alt.
   */
  async function saveBackup() {
    try {
      await saveTextToFile(await exportBackup(), backupFilename());
    } catch (e) {
      // Lukket brukeren «Lagre som» uten å velge noe, er det ikke en feil.
      if (e instanceof SaveCancelled) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pickBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Nullstill, ellers gir ikke nettleseren beskjed om samme fil velges igjen.
    e.target.value = "";
    if (!file) return;
    try {
      setPendingImport({ data: parseBackup(await file.text()), name: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const { data } = pendingImport;
    setPendingImport(null);
    try {
      await replaceAll(data);
      // Klassen som ble vist finnes neppe i kopien, så vi går til forsiden og
      // leser alt inn på nytt derfra.
      router.push("/");
      await reload();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

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
        } ${hidden ? "lg:hidden" : ""}`}
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
          {/* På store skjermer legges menya bort i stedet — kartet får hele vinduet. */}
          <button
            type="button"
            onClick={onHide}
            aria-label="Skjul meny"
            title="Skjul meny"
            className="hidden rounded-md p-1.5 text-subtle hover:bg-background hover:text-foreground lg:inline-flex"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M11 5L6 10l5 5M15 4v12" strokeLinecap="round" strokeLinejoin="round" />
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

        {/* Kontaktlærerne går på tvers av klassene, så knappen står utenfor
            delen som hører til klassen som vises. */}
        <button
          type="button"
          onClick={() => setShowTeachers(true)}
          className="mt-1 flex w-full items-center gap-1.5 rounded-md px-4 py-2 text-left text-sm font-medium hover:bg-background"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-subtle" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M6 7.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z M1.5 13.5c0-2.2 2-3.5 4.5-3.5s4.5 1.3 4.5 3.5 M11 3.3a2.25 2.25 0 010 4.4 M12.2 10.2c1.4.5 2.3 1.5 2.3 3.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="flex-1">Kontaktlærere</span>
          {contactTeachers.length > 0 && (
            <span className="shrink-0 text-xs text-subtle tabular-nums">{contactTeachers.length}</span>
          )}
        </button>

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
          <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Sikkerhetskopi
            </h2>
            <HelpTip label="Hva er sikkerhetskopien, og hva slags fil er det?">
              Kopien inneholder <strong className="text-foreground">alle</strong> klassene,
              elevene, kontaktlærerne og de tidligere kartene — ikke bare klassen du ser på nå.
              Henter du den inn igjen, erstatter den alt som ligger i programmet.
              <br />
              <br />
              Fila heter noe slikt som{" "}
              <span className="font-mono text-[10px] text-foreground">{backupFilename()}</span>.
              «.json» er bare formatet Klassekart lagrer i — fila hører til programmet og skal ikke
              åpnes i Word eller Excel. Du henter den inn igjen med knappen under. Legg den gjerne
              i OneDrive eller der skolen ellers lagrer ting.
            </HelpTip>
          </div>
          <p className="px-2 pb-1.5 text-xs text-subtle">
            Alt lagres i denne nettleseren. Lagre en kopi jevnlig — tømmes
            nettleserdataene, er klassene borte.
          </p>
          <button
            type="button"
            onClick={saveBackup}
            className={`${ghostButton("sm")} w-full justify-start`}
          >
            Lagre sikkerhetskopi …
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={`${ghostButton("sm")} w-full justify-start`}
          >
            Hent inn sikkerhetskopi …
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={pickBackup}
            className="hidden"
          />
          <button
            type="button"
            onClick={onAbout}
            className={`${ghostButton("sm")} mt-1 w-full justify-start border-t border-border pt-2`}
          >
            Om Klassekart
          </button>
        </div>
      </aside>

      {showHeatmap && activeClass && (
        <Modal
          title={`Oversikt over par – ${activeClass.name}`}
          description="Hvor mange ganger hvert elevpar har sittet ved samme bord."
          onClose={() => setShowHeatmap(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  // Bekreftelsen får stå alene — to dialoger oppå hverandre
                  // ville slåss om fokuset.
                  setShowHeatmap(false);
                  setConfirmReset(true);
                }}
                className={`${ghostButton()} mr-auto hover:text-danger`}
              >
                Nullstill historikken
              </button>
              <button
                type="button"
                onClick={() => setShowHeatmap(false)}
                className={secondaryButton()}
              >
                Lukk
              </button>
            </>
          }
        >
          <PairHeatmap students={activeStudents} historyRows={pairHistory} />
        </Modal>
      )}

      {showTeachers && (
        <Modal
          title="Kontaktlærere"
          description="Legg inn kontaktlærerne, og velg et navn for å se elevene deres."
          size="lg"
          onClose={() => setShowTeachers(false)}
          footer={
            <button
              type="button"
              onClick={() => setShowTeachers(false)}
              className={secondaryButton()}
            >
              Lukk
            </button>
          }
        >
          <ContactTeachers
            onNavigate={() => {
              setShowTeachers(false);
              onClose();
            }}
            onRequestDelete={(teacher) => {
              // Samme grunn som ved nullstillingen under: bekreftelsen får stå
              // alene, ellers slåss to dialoger om fokuset.
              setShowTeachers(false);
              setPendingTeacherDelete(teacher);
            }}
          />
        </Modal>
      )}

      {pendingTeacherDelete && (
        <ConfirmDialog
          title={`Fjerne ${pendingTeacherDelete.name}?`}
          body={
            <>
              Elevene blir stående, men uten kontaktlærer.{" "}
              <strong className="text-foreground">{pendingTeacherDelete.name}</strong> kan legges
              inn igjen senere.
            </>
          }
          confirmLabel="Fjern"
          onConfirm={doRemoveTeacher}
          onCancel={() => setPendingTeacherDelete(null)}
        />
      )}

      {confirmReset && activeClass && (
        <ConfirmDialog
          title="Nullstille par-historikken?"
          body={
            <>
              Alle tellingene for{" "}
              <strong className="text-foreground">{activeClass.name}</strong> settes til null, så
              neste klassekart fordeler elevene som om ingen har sittet sammen før. Bruk det ved
              skoleårsslutt. Elevene og de tidligere kartene beholdes.
            </>
          }
          confirmLabel="Nullstill"
          onConfirm={doResetPairs}
          onCancel={() => setConfirmReset(false)}
        />
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

      {pendingImport && (
        <ConfirmDialog
          title="Hente inn denne sikkerhetskopien?"
          body={
            <>
              <strong className="text-foreground">{pendingImport.name}</strong> inneholder{" "}
              {plural(pendingImport.data.classes.length, "klasse", "klasser")} og{" "}
              {plural(pendingImport.data.students.length, "elev", "elever")}. Alt som ligger i
              nettleseren nå blir erstattet. Vil du beholde det, lagrer du en kopi av det først.
            </>
          }
          confirmLabel="Hent inn"
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
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
