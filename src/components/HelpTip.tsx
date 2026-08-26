"use client";

import { useId, useState } from "react";

interface Props {
  /** Hva knappen forklarer, for skjermlesere: «Hva er en sikkerhetskopi?» */
  label: string;
  children: React.ReactNode;
}

/**
 * Et spørsmålstegn som forklarer noe ved siden av seg.
 *
 * Teksten kommer fram både ved å holde musepekeren over og ved å trykke.
 * Bare hover ville stengt ute alle som bruker tastatur eller berøringsskjerm,
 * og `title`-attributtet — det nettleseren viser av seg selv — er tregt, kan
 * ikke leses av skjermlesere på en pålitelig måte, og forsvinner idet du
 * beveger pekeren.
 *
 * Teksten står i flyten under, ikke som et lag oppå. I den smale menyen ville
 * en boble uansett ikke fått plass ved siden av. Til gjengjeld må den rulles
 * fram: hjelpen brukes nederst i menyen, der det som skyves ned havner utenfor
 * skjermkanten.
 */
export default function HelpTip({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const id = useId();

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold leading-none ${
          open || hover
            ? "border-accent-text bg-accent-soft text-accent-text"
            : "border-border-strong text-subtle"
        }`}
      >
        <span aria-hidden>?</span>
      </button>

      {(open || hover) && (
        <div
          id={id}
          role="note"
          ref={(el) => {
            el?.scrollIntoView({ block: "nearest" });
          }}
          className="mt-1.5 basis-full rounded-md border border-border bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-muted"
        >
          {children}
        </div>
      )}
    </>
  );
}
