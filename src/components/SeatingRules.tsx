"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/app-data";
import { genderDotClass } from "@/lib/gender";
import { pairKey } from "@/lib/seating";
import type { PairRuleKind } from "@/lib/types";
import { inputClassSm, primaryButton } from "@/lib/ui";

/**
 * Reglene fordelingen skal følge: elevpar som ikke skal, eller som skal, sitte
 * ved samme bord, og elever som skal sitte foran. «Sammen» betyr samme bord —
 * det er slik resten av appen regner par, og slik en bordgruppe faktisk
 * fungerer i klasserommet.
 *
 * Reglene velges i nedtrekkslister og ikke i et fritekstfelt: da kan de bare
 * peke på elever som finnes, og det finnes ingen plass å skrive *hvorfor*.
 * Begrunnelsen er som regel sensitiv — et syn, en diagnose, en konflikt — og
 * den har ikke noe å gjøre i en sikkerhetskopi.
 */

const KIND_TEXT: Record<PairRuleKind, string> = {
  apart: "skal ikke sitte med",
  together: "skal sitte med",
};

const LIST_TITLE: Record<PairRuleKind, string> = {
  apart: "Skal ikke sitte sammen",
  together: "Skal sitte sammen",
};

/** Krysset som fjerner en regel. Står der hele tiden — det skal også finnes på nettbrett. */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 rounded p-1 text-subtle hover:bg-danger-soft hover:text-danger"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export default function SeatingRules() {
  const {
    activeStudents,
    apartPairs,
    addApartPair,
    removeApartPair,
    frontStudents,
    toggleFront,
    setError,
  } = useAppData();

  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [kind, setKind] = useState<PairRuleKind>("apart");
  const [lagrer, setLagrer] = useState(false);
  const [foran, setForan] = useState("");

  const byId = useMemo(
    () => new Map(activeStudents.map((s) => [s.id, s])),
    [activeStudents]
  );

  /** Reglene med navn på, sortert alfabetisk slik lista ellers er. */
  const rader = useMemo(
    () =>
      apartPairs
        .map((p) => ({
          a: byId.get(p.student_a_id),
          b: byId.get(p.student_b_id),
          kind: p.kind,
          key: pairKey(p.student_a_id, p.student_b_id),
          ids: [p.student_a_id, p.student_b_id] as [string, string],
        }))
        // En regel kan peke på en elev som er slettet mens vinduet står åpent.
        .filter((r) => r.a && r.b)
        .sort((x, y) => x.a!.name.localeCompare(y.a!.name, "no")),
    [apartPairs, byId]
  );

  const finnes = Boolean(a && b) && rader.some((r) => r.key === pairKey(a, b));
  const kanLeggeTil = Boolean(a) && Boolean(b) && a !== b && !finnes;

  const foranRader = useMemo(
    () =>
      frontStudents
        .map((id) => byId.get(id))
        .filter((s) => s !== undefined)
        .sort((x, y) => x.name.localeCompare(y.name, "no")),
    [frontStudents, byId]
  );

  async function leggTil() {
    if (!kanLeggeTil) return;
    setLagrer(true);
    try {
      await addApartPair(a, b, kind);
      setA("");
      setB("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLagrer(false);
    }
  }

  async function fjern(ids: [string, string]) {
    try {
      await removeApartPair(ids[0], ids[1]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // En funksjon og ikke en komponent: en komponent definert inni en annen er
  // en ny type for hver tegning, og React ville bygget navnet opp på nytt hver gang.
  function navn(id: string) {
    const student = byId.get(id);
    if (!student) return null;
    return (
      <span className="inline-flex items-center gap-1.5">
        {student.gender && (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(student.gender)}`}
            aria-hidden
          />
        )}
        {student.name}
      </span>
    );
  }

  if (activeStudents.length < 2) {
    return (
      <p className="text-sm text-muted">
        Klassen trenger minst to elever før du kan lage en regel.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Elevpar</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-muted">Denne eleven</span>
            <select value={a} onChange={(e) => setA(e.target.value)} className={inputClassSm}>
              <option value="">Velg elev …</option>
              {activeStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="shrink-0">
            <span className="sr-only">Regel</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PairRuleKind)}
              className={inputClassSm}
            >
              <option value="apart">{KIND_TEXT.apart}</option>
              <option value="together">{KIND_TEXT.together}</option>
            </select>
          </label>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-muted">Denne</span>
            <select value={b} onChange={(e) => setB(e.target.value)} className={inputClassSm}>
              <option value="">Velg elev …</option>
              {activeStudents
                .filter((s) => s.id !== a)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            onClick={leggTil}
            disabled={!kanLeggeTil || lagrer}
            className={primaryButton("sm")}
          >
            Legg til
          </button>
        </div>

        {finnes && (
          <p className="mt-1.5 text-xs text-muted">
            De to har en regel fra før. Fjern den først om du vil bytte.
          </p>
        )}

        {rader.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Ingen elevpar ennå. Uten regler fordeles elevene bare etter hvem som har sittet sammen
            før.
          </p>
        ) : (
          (["apart", "together"] as const).map((k) => {
            const liste = rader.filter((r) => r.kind === k);
            if (liste.length === 0) return null;
            return (
              <div key={k} className="mt-3 border-t border-border pt-3">
                <h4 className="mb-1 text-xs font-medium text-muted">{LIST_TITLE[k]}</h4>
                <ul className="space-y-1">
                  {liste.map((rad) => (
                    <li
                      key={rad.key}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background"
                    >
                      <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                        {navn(rad.ids[0])}
                        <span className="text-xs text-subtle">og</span>
                        {navn(rad.ids[1])}
                      </span>
                      <RemoveButton
                        label={`Fjern regelen om ${rad.a!.name} og ${rad.b!.name}`}
                        onClick={() => fjern(rad.ids)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <section className="border-t border-border pt-4">
        <h3 className="mb-0.5 text-sm font-semibold">Skal sitte foran</h3>
        <p className="mb-2 text-xs text-subtle">
          Fremste rad, nærmest tavla. Eleven får nye sidemenn fra kart til kart, men blir sittende
          foran. Er det flere enn det er plass til der, brukes raden bak også.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Elev som skal sitte foran</span>
            <select
              value={foran}
              onChange={(e) => setForan(e.target.value)}
              className={inputClassSm}
            >
              <option value="">Velg elev …</option>
              {activeStudents
                .filter((s) => !frontStudents.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              if (!foran) return;
              toggleFront(foran);
              setForan("");
            }}
            disabled={!foran}
            className={primaryButton("sm")}
          >
            Legg til
          </button>
        </div>

        {foranRader.length > 0 && (
          <ul className="mt-3 space-y-1">
            {foranRader.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background"
              >
                <span className="flex-1">{navn(s.id)}</span>
                <RemoveButton
                  label={`${s.name} trenger ikke sitte foran`}
                  onClick={() => toggleFront(s.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-subtle">
        Reglene gjelder når du genererer et nytt klassekart. Elevparene gjelder også når du lager
        grupper. Flytter du noen for hånd etterpå, sier appen fra, men lar deg gjøre det: i
        øyeblikket er det du som vet best.
      </p>
    </div>
  );
}
