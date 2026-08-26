"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/app-data";
import { genderDotClass } from "@/lib/gender";
import { pairKey } from "@/lib/seating";
import { inputClassSm, primaryButton } from "@/lib/ui";

/**
 * Elevpar læreren har bestemt at ikke skal sitte sammen. «Sammen» betyr samme
 * bord — det er slik resten av appen regner par, og slik en bordgruppe faktisk
 * fungerer i klasserommet.
 *
 * Reglene står i to nedtrekkslister og ikke i et fritekstfelt: da kan de bare
 * peke på elever som finnes, og det finnes ingen plass å skrive *hvorfor* to
 * ikke skal sitte sammen. Begrunnelsen er som regel sensitiv, og den har ikke
 * noe å gjøre i en sikkerhetskopi.
 */
export default function ApartPairs() {
  const { activeStudents, apartPairs, addApartPair, removeApartPair, setError } = useAppData();

  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [lagrer, setLagrer] = useState(false);

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
          key: pairKey(p.student_a_id, p.student_b_id),
          ids: [p.student_a_id, p.student_b_id] as [string, string],
        }))
        // En regel kan peke på en elev som er slettet mens vinduet står åpent.
        .filter((r) => r.a && r.b)
        .sort((x, y) => x.a!.name.localeCompare(y.a!.name, "no")),
    [apartPairs, byId]
  );

  const finnes = a && b && apartPairs.some(
    (p) => pairKey(p.student_a_id, p.student_b_id) === pairKey(a, b)
  );
  const kanLeggeTil = Boolean(a) && Boolean(b) && a !== b && !finnes;

  async function leggTil() {
    if (!kanLeggeTil) return;
    setLagrer(true);
    try {
      await addApartPair(a, b);
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

  const Navn = ({ id }: { id: string }) => {
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
  };

  if (activeStudents.length < 2) {
    return (
      <p className="text-sm text-muted">
        Klassen trenger minst to elever før du kan lage en regel.
      </p>
    );
  }

  return (
    <div>
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
        <span className="pb-1.5 text-xs text-subtle">skal ikke sitte med</span>
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
        <p className="mt-1.5 text-xs text-muted">De to står i lista fra før.</p>
      )}

      <div className="mt-4 border-t border-border pt-3">
        {rader.length === 0 ? (
          <p className="text-sm text-muted">
            Ingen regler ennå. Uten regler fordeles elevene bare etter hvem som har sittet sammen
            før.
          </p>
        ) : (
          <ul className="space-y-1">
            {rader.map((rad) => (
              <li
                key={rad.key}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background"
              >
                <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Navn id={rad.ids[0]} />
                  <span className="text-xs text-subtle">og</span>
                  <Navn id={rad.ids[1]} />
                </span>
                <button
                  type="button"
                  onClick={() => fjern(rad.ids)}
                  aria-label={`Fjern regelen om ${rad.a!.name} og ${rad.b!.name}`}
                  title="Fjern regelen"
                  className="rounded p-1 text-subtle opacity-0 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
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
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs text-subtle">
        Reglene gjelder når du genererer et nytt klassekart, og de holder elevene fra hverandre ved
        bordet — ikke i rommet. Flytter du noen for hånd etterpå, sier appen fra, men lar deg gjøre
        det: i øyeblikket er det du som vet best.
      </p>
    </div>
  );
}
