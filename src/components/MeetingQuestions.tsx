"use client";

import { useState } from "react";
import { useAppData } from "@/lib/app-data";
import HelpTip from "./HelpTip";
import { MEETING_KINDS, kindLabel } from "@/lib/meetings";
import { questionCount, questionsFor } from "@/lib/meeting-questions";
import type { MeetingKind } from "@/lib/types";

/**
 * Forslag til spørsmål å stille i en samtale — en huskeliste læreren kan ha
 * åpen ved siden av seg, eller skrive ut og ta med inn.
 *
 * **Egen underfane, ikke en hjelpetekst ved skjemaet.** Spørsmålene brukes i
 * selve samtalen, mens skjemaet brukes uka før: det er to ulike øyeblikk, og en
 * liste med tjue spørsmål mellom feltene ville dessuten dyttet tidene ut av
 * syne på den sida der tidene er poenget.
 *
 * **Typen velges her, og følger ikke oppsettet læreren har åpnet.** Det er
 * bare startpunktet som arves fra det nyeste oppsettet i klassen — læreren kan
 * være i gang med å sette opp utviklingssamtaler og likevel ville lese gjennom
 * elevsamtalespørsmålene. Et valg utledet av oppsettet ville ikke latt hen det.
 *
 * **Ingenting lagres.** Spørsmålene er faste (se `meeting-questions.ts`), og
 * det er ingen avkryssing eller notatfelt her: notatene fra en samtale er
 * opplysninger om et barn, og hele poenget med denne appen er at slike
 * opplysninger ikke ligger her. De hører hjemme i skolens eget system.
 */
export default function MeetingQuestions() {
  const { activeClass, meetingPlans } = useAppData();

  // Utledet med overstyring, ikke satt i en effekt: det læreren har valgt,
  // ellers typen på det nyeste oppsettet i klassen.
  const [picked, setPicked] = useState<MeetingKind | null>(null);
  const kind = picked ?? meetingPlans[0]?.kind ?? "elevsamtale";
  const set = questionsFor(kind);

  return (
    <div className="flex flex-col gap-4">
      <div
        data-print-hide
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-3 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {MEETING_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setPicked(k.kind)}
              aria-pressed={k.kind === kind}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                k.kind === kind
                  ? "border-accent bg-accent-soft text-accent-text"
                  : "border-border bg-surface-raised hover:border-border-strong"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-subtle">{questionCount(set)} forslag</span>

        <HelpTip label="Hva er dette?">
          Forslag til hva du kan spørre om, ikke et skjema som skal fylles ut. Ta dem i den
          rekkefølgen samtalen går, og hopp over det som ikke passer. Trykk{" "}
          <strong className="text-foreground">Skriv ut</strong> for å få listen med deg inn i
          samtalen.
        </HelpTip>
      </div>

      <div className="rounded-xl border border-border bg-surface px-4 py-4 print:rounded-none print:border-0 print:px-0 print:py-0">
        <header className="mb-3">
          <h2 className="text-lg font-semibold">
            {kindLabel(kind)}: forslag til spørsmål
            <span className="hidden font-normal text-muted print:inline"> · {activeClass?.name}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">{set.who}</p>
        </header>

        {/* To spalter på papiret: arket er liggende A4 — det er formatet
            klassekartet og samtalearket krever — og én spalte tvers over en
            slik side gir linjer ingen finner tilbake til. */}
        <div className="flex flex-col gap-4 print:block print:columns-2 print:gap-6">
          {set.groups.map((group) => (
            <section
              key={group.title}
              className="break-inside-avoid print:mb-3 print:inline-block print:w-full"
            >
              <h3 className="mb-1.5 text-sm font-semibold text-accent-text">{group.title}</h3>
              <ul className="flex flex-col gap-1.5">
                {group.questions.map((q) => (
                  <li
                    key={q.text}
                    className="break-inside-avoid border-l-2 border-border pl-3 text-sm leading-snug"
                  >
                    {q.label && <span className="font-medium">{q.label}: </span>}
                    <span className="text-muted print:text-foreground">{q.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
