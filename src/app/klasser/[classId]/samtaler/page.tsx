"use client";

import { useAppData } from "@/lib/app-data";
import MeetingPlanner from "@/components/MeetingPlanner";
import { secondaryButton } from "@/lib/ui";

/**
 * Samtalesida: elevsamtaler og utviklingssamtaler for klassen, satt opp i en
 * arbeidsuke. Tynn side, som klasserommet — alt arbeidet ligger i
 * `MeetingPlanner`.
 *
 * Egen side og ikke et vindu som gruppene: et samtaleskjema er en uke bredt,
 * og læreren sitter i det en stund av gangen. En dialog ville både blitt for
 * trang og lagt seg i veien for utskriften.
 */
export default function MeetingsPage() {
  const { activeClass, loading, error, setError } = useAppData();

  if (loading)
    return (
      <p className="text-sm text-muted" role="status">
        Laster …
      </p>
    );
  if (!activeClass) return <p className="text-sm text-danger">Fant ikke klassen.</p>;

  return (
    <div className="mx-auto max-w-7xl print:max-w-none">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Samtaler</h1>
          <p className="mt-0.5 text-xs text-subtle">
            {activeClass.name} · elevsamtaler og utviklingssamtaler
          </p>
        </div>
        <button type="button" onClick={() => window.print()} className={secondaryButton()}>
          Skriv ut
        </button>
      </div>

      {error && (
        <div
          role="alert"
          data-print-hide
          className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-danger/40 bg-danger-soft px-4 py-2.5 text-sm text-danger"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Lukk feilmelding"
            className="shrink-0 rounded px-1"
          >
            ✕
          </button>
        </div>
      )}

      <MeetingPlanner />
    </div>
  );
}
