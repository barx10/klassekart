"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAppData } from "@/lib/app-data";
import { teacherKey } from "@/lib/local-db";
import { genderDotClass, genderName } from "@/lib/gender";
import type { Student } from "@/lib/types";
import { inputClassSm, plural, primaryButton } from "@/lib/ui";

/** Elevene til én kontaktlærer, samlet klassevis. */
interface Bunke {
  classId: string;
  className: string;
  students: Student[];
}

interface Props {
  /** Lukker vinduet oversikten står i, når man går inn i en klasse. */
  onNavigate: () => void;
  /**
   * Ber om å få fjernet en kontaktlærer. Bekreftelsen tas utenfor, av den som
   * eier vinduet — to dialoger oppå hverandre ville slåss om fokuset.
   */
  onRequestDelete: (teacher: { id: string; name: string }) => void;
}

/**
 * Hvem er kontaktlærer for hvem. Lista over lærere vedlikeholdes her, og et
 * klikk på et navn viser elevene som har hen — på tvers av alle klasser, som
 * er hele poenget: er du kontaktlærer for ni i 7A og seks i 7B, er det summen
 * du vil se.
 *
 * Elevene knyttes til navnet, ikke til en id. Derfor sammenlignes navn alltid
 * gjennom `teacherKey`, så «Kari Nordmann» og «kari nordmann» er én lærer.
 */
export default function ContactTeachers({ onNavigate, onRequestDelete }: Props) {
  const {
    classes,
    studentsByClass,
    contactTeachers,
    addContactTeacher,
    renameContactTeacher,
    setError,
  } = useAppData();

  const [valgt, setValgt] = useState<string | null>(null);
  const [nyttNavn, setNyttNavn] = useState("");
  const [lagrer, setLagrer] = useState(false);
  const [redigerer, setRedigerer] = useState<string | null>(null);

  /** Antall elever per kontaktlærer, og hvor mange som ikke har noen. */
  const { antall, utenKontaktlaerer } = useMemo(() => {
    const antall = new Map<string, number>();
    let uten = 0;
    for (const liste of studentsByClass.values()) {
      for (const student of liste) {
        const navn = student.contact_teacher?.trim();
        if (!navn) {
          uten += 1;
          continue;
        }
        const nokkel = teacherKey(navn);
        antall.set(nokkel, (antall.get(nokkel) ?? 0) + 1);
      }
    }
    return { antall, utenKontaktlaerer: uten };
  }, [studentsByClass]);

  /**
   * Elevene til den valgte læreren, klasse for klasse. `valgt` er en nøkkel og
   * ikke en id, slik at «uten kontaktlærer» kan velges på samme måte.
   */
  const bunker: Bunke[] = useMemo(() => {
    if (valgt === null) return [];
    return classes
      .map((klasse) => ({
        classId: klasse.id,
        className: klasse.name,
        students: (studentsByClass.get(klasse.id) ?? []).filter((s) => {
          const navn = s.contact_teacher?.trim();
          return valgt === "" ? !navn : !!navn && teacherKey(navn) === valgt;
        }),
      }))
      .filter((b) => b.students.length > 0);
  }, [valgt, classes, studentsByClass]);

  const valgtNavn =
    valgt === "" ? "Uten kontaktlærer" : contactTeachers.find((t) => teacherKey(t.name) === valgt)?.name;
  const valgtAntall = bunker.reduce((sum, b) => sum + b.students.length, 0);

  async function leggTil(e: React.FormEvent) {
    e.preventDefault();
    if (!nyttNavn.trim()) return;
    setLagrer(true);
    try {
      await addContactTeacher(nyttNavn);
      setNyttNavn("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLagrer(false);
    }
  }

  async function døpOm(id: string, navn: string) {
    setRedigerer(null);
    try {
      await renameContactTeacher(id, navn);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      {/* --- Lærerne --- */}
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-0.5">
          {contactTeachers.map((laerer) => {
            const nokkel = teacherKey(laerer.name);
            const erValgt = valgt === nokkel;
            const n = antall.get(nokkel) ?? 0;

            if (redigerer === laerer.id) {
              return (
                <li key={laerer.id}>
                  <label className="sr-only" htmlFor={`navn-${laerer.id}`}>
                    Nytt navn på kontaktlærer
                  </label>
                  <input
                    id={`navn-${laerer.id}`}
                    autoFocus
                    defaultValue={laerer.name}
                    className={inputClassSm}
                    onBlur={(e) => døpOm(laerer.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        e.currentTarget.value = laerer.name;
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </li>
              );
            }

            return (
              <li
                key={laerer.id}
                className={`group flex items-center gap-0.5 rounded-md border ${
                  erValgt
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-transparent hover:bg-background"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setValgt(erValgt ? null : nokkel)}
                  aria-pressed={erValgt}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{laerer.name}</span>
                  <span className="shrink-0 text-xs text-subtle tabular-nums">{n}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRedigerer(laerer.id)}
                  aria-label={`Endre navn på ${laerer.name}`}
                  className="shrink-0 rounded p-1 text-subtle opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onRequestDelete({ id: laerer.id, name: laerer.name })}
                  aria-label={`Fjern ${laerer.name}`}
                  className="mr-1 shrink-0 rounded p-1 text-subtle opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            );
          })}

          {/* Elever ingen har tatt ansvar for ennå. Skjules når det ikke er noen. */}
          {utenKontaktlaerer > 0 && (
            <li
              className={`mt-1 flex items-center rounded-md border ${
                valgt === ""
                  ? "border-accent bg-accent-soft text-accent-text"
                  : "border-transparent hover:bg-background"
              }`}
            >
              <button
                type="button"
                onClick={() => setValgt(valgt === "" ? null : "")}
                aria-pressed={valgt === ""}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-muted">Uten kontaktlærer</span>
                <span className="shrink-0 text-xs text-subtle tabular-nums">{utenKontaktlaerer}</span>
              </button>
            </li>
          )}
        </ul>

        <form onSubmit={leggTil} className="flex gap-1.5">
          <label className="sr-only" htmlFor="ny-kontaktlaerer">
            Navn på kontaktlærer
          </label>
          <input
            id="ny-kontaktlaerer"
            value={nyttNavn}
            onChange={(e) => setNyttNavn(e.target.value)}
            placeholder="Legg til kontaktlærer"
            className={inputClassSm}
          />
          <button type="submit" disabled={!nyttNavn.trim() || lagrer} className={primaryButton("sm")}>
            Legg til
          </button>
        </form>
      </div>

      {/* --- Elevene til den valgte --- */}
      <div className="min-w-0 sm:border-l sm:border-border sm:pl-5">
        {contactTeachers.length === 0 && utenKontaktlaerer === 0 ? (
          <p className="text-sm text-muted">
            Legg inn kontaktlærerne først. Så velger du kontaktlærer på hver elev under «Elever»
            i menyen, og elevene dukker opp her.
          </p>
        ) : valgt === null ? (
          <p className="text-sm text-muted">Velg en kontaktlærer for å se elevene.</p>
        ) : valgtAntall === 0 ? (
          <p className="text-sm text-muted">
            {valgtNavn} har ingen elever ennå. Sett kontaktlærer på elevene under «Elever» i
            menyen.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {valgtNavn} · {plural(valgtAntall, "elev", "elever")} i{" "}
              {plural(bunker.length, "klasse", "klasser")}
            </p>
            <div className="flex flex-col gap-4">
              {bunker.map((bunke) => (
                <div key={bunke.classId}>
                  <h3 className="mb-1 flex items-baseline gap-2">
                    <Link
                      href={`/klasser/${bunke.classId}`}
                      onClick={onNavigate}
                      className="text-sm font-semibold text-accent-text hover:underline"
                    >
                      {bunke.className}
                    </Link>
                    <span className="text-xs text-subtle tabular-nums">{bunke.students.length}</span>
                  </h3>
                  <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                    {bunke.students.map((student) => (
                      <li key={student.id} className="flex items-center gap-1.5 text-sm">
                        {student.gender && (
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(student.gender)}`}
                            aria-hidden
                          />
                        )}
                        <span className="sr-only">{genderName(student.gender)}. </span>
                        <span className="truncate">{student.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
