"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppData } from "@/lib/app-data";
import { secondaryButton } from "@/lib/ui";

/**
 * Skallet rundt samtalene: overskrifta, underfanene og feilmeldinga.
 *
 * **Underfanene er ekte adresser, ikke en bryter i en komponent.** Planlegginga
 * og spørsmålene er to ulike arbeidsøkter — uka før, og samtalen selv — og med
 * hver sin adresse kan læreren legge spørsmålene som bokmerke og komme rett dit
 * med telefonen i hånda. En bryter ville i tillegg betydd at MeetingPlanner
 * enten lå og tegnet i det skjulte, eller mistet hvilket oppsett som var åpent
 * hver gang læreren tok en titt på spørsmålene.
 *
 * Klassen leses fra `useAppData` og ikke fra `params`: adressa er alt kilden
 * provideren utleder den av, og da slipper layouten å være asynkron.
 */
export default function MeetingsLayout({ children }: { children: React.ReactNode }) {
  const { activeClass, loading, error, setError } = useAppData();
  const pathname = usePathname();

  if (loading)
    return (
      <p className="text-sm text-muted" role="status">
        Laster …
      </p>
    );
  if (!activeClass) return <p className="text-sm text-danger">Fant ikke klassen.</p>;

  const base = `/klasser/${activeClass.id}/samtaler`;
  const tabs = [
    { href: base, label: "Planlegging" },
    // «Alle klasser» hører hjemme ved siden av planlegginga og ikke inne i den:
    // en kontaktlærer med to klasser setter opp den ene og må kunne slå opp den
    // andre, uten å miste oppsettet hen står i.
    { href: `${base}/alle`, label: "Alle klasser" },
    { href: `${base}/sporsmal`, label: "Forslag til spørsmål" },
  ];

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

      <nav aria-label="Samtaler" className="mb-4 flex flex-wrap gap-1.5 print:hidden">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                active
                  ? "border-accent bg-accent-soft text-accent-text"
                  : "border-border bg-surface-raised text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

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

      {children}
    </div>
  );
}
