"use client";

import Link from "next/link";

export default function Footer({ onAbout }: { onAbout: () => void }) {
  return (
    <footer className="mt-8 border-t border-border px-4 py-6 text-center">
      <div data-print-hide className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
        <button type="button" onClick={onAbout} className="text-accent-text hover:underline">
          Om Klassekart
        </button>
        <span className="text-subtle" aria-hidden>
          ·
        </span>
        <Link href="/personvern" className="text-accent-text hover:underline">
          Personvern
        </Link>
        <span className="text-subtle" aria-hidden>
          ·
        </span>
        <a
          href="https://laererliv.no"
          target="_blank"
          rel="noreferrer"
          className="text-accent-text hover:underline"
        >
          laererliv.no
        </a>
        <span className="text-subtle" aria-hidden>
          ·
        </span>
        <a href="mailto:kenneth@laererliv.no" className="text-accent-text hover:underline">
          kenneth@laererliv.no
        </a>
      </div>
      <p className="text-xs text-subtle">Lærerliv © 2026</p>
    </footer>
  );
}
