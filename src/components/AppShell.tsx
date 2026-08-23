"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Sidebar from "./Sidebar";
import AboutModal from "./AboutModal";
import Footer from "./Footer";

/**
 * Rammen rundt appen: meny til venstre, innhold til høyre, bunntekst under.
 *
 * Menya lå tidligere som en fast 288 px kolonne uansett skjermbredde, og spiste
 * mesteparten av en mobilskjerm. Under lg ligger den nå som en skuff over
 * innholdet, åpnet fra topplinja.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      {/* Topplinje — kun på små skjermer */}
      <header
        data-print-hide
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface-raised px-3 py-2 lg:hidden"
      >
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Åpne meny"
          aria-expanded={menuOpen}
          className="rounded-md p-2 text-muted hover:bg-background hover:text-foreground"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
          </svg>
        </button>
        <Image src="/laererliv-logo.png" alt="" width={24} height={24} className="rounded" />
        <span className="text-sm font-semibold tracking-tight">Klassekart</span>
      </header>

      {/* Bakteppe bak skuffen */}
      {menuOpen && (
        <div
          data-print-hide
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          role="presentation"
        />
      )}

      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAbout={() => {
          setMenuOpen(false);
          setAboutOpen(true);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</main>
        <Footer onAbout={() => setAboutOpen(true)} />
      </div>

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
