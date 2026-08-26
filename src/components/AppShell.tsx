"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Sidebar from "./Sidebar";
import AboutModal from "./AboutModal";
import Footer from "./Footer";

/** Nøkkelen menyvalget huskes under, så det overlever en omlasting. */
const HIDDEN_KEY = "klassekart:meny-skjult";

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Rammen rundt appen: meny til venstre, innhold til høyre, bunntekst under.
 *
 * Menya lå tidligere som en fast 288 px kolonne uansett skjermbredde, og spiste
 * mesteparten av en mobilskjerm. Under lg ligger den nå som en skuff over
 * innholdet, åpnet fra topplinja.
 *
 * På store skjermer kan den i tillegg legges bort (`hidden`), slik at et bredt
 * klassekart får hele vinduet. Da dukker den samme topplinja opp der også, så
 * det finnes en synlig vei tilbake.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Leses først etter montering: `localStorage` finnes ikke på serveren, og
  // et startsvar som er ulikt serverens ville brutt hydreringen.
  useEffect(() => {
    Promise.resolve(readHidden()).then(setHidden);
  }, []);

  function hideMenu() {
    setHidden(true);
    writeHidden(true);
  }

  function showMenu() {
    setHidden(false);
    writeHidden(false);
  }

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
        hidden={hidden}
        onClose={() => setMenuOpen(false)}
        onHide={hideMenu}
        onAbout={() => {
          setMenuOpen(false);
          setAboutOpen(true);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topplinje — på små skjermer alltid, på store når menya er lagt bort */}
        <header
          data-print-hide
          className={`sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface-raised px-3 py-2 ${
            hidden ? "" : "lg:hidden"
          }`}
        >
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Åpne meny"
            aria-expanded={menuOpen}
            className="rounded-md p-2 text-muted hover:bg-background hover:text-foreground lg:hidden"
          >
            <MenuIcon />
          </button>
          <button
            type="button"
            onClick={showMenu}
            aria-label="Vis meny"
            className="hidden rounded-md p-2 text-muted hover:bg-background hover:text-foreground lg:inline-flex"
          >
            <MenuIcon />
          </button>
          <Image src="/laererliv-logo.png" alt="" width={24} height={24} className="rounded" />
          <span className="text-sm font-semibold tracking-tight">Klassekart</span>
        </header>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</main>
        <Footer onAbout={() => setAboutOpen(true)} />
      </div>

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(value: boolean) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, value ? "1" : "0");
  } catch {
    // Privat modus kan nekte skriving. Da huskes valget bare denne økta.
  }
}
