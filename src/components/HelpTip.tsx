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
 * **Teksten ligger som et lag over innholdet, ikke i flyten.** Den sto først i
 * flyten, og da flimret skjermen: hjelpen brukes nederst i menyen, der
 * seksjonen er forankret til bunnen med `mt-auto`. Teksten gjorde seksjonen
 * høyere, seksjonen vokste oppover, og spørsmålstegnet hoppet et par hundre
 * piksler vekk fra musepekeren — hvorpå teksten forsvant, alt falt tilbake, og
 * pekeren var over knappen på nytt. Et lag endrer ingen layout, så knappen blir
 * stående.
 *
 * Boksen sentreres over knappen. Står knappen helt ute ved en kant, kan den bli
 * klippet av en forelder som skjuler det som flyter utenfor.
 */
export default function HelpTip({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const id = useId();
  const vis = open || hover;

  return (
    <span className="relative inline-flex">
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
          vis
            ? "border-accent-text bg-accent-soft text-accent-text"
            : "border-border-strong text-subtle"
        }`}
      >
        <span aria-hidden>?</span>
      </button>

      {vis && (
        <span
          id={id}
          role="note"
          className="absolute bottom-full left-1/2 z-30 mb-2 block w-60 max-w-[80vw] -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-2 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-muted shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
