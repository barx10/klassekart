"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/lib/app-data";
import { ghostButton, inputClassSm, plural, secondaryButton } from "@/lib/ui";

/**
 * Klasselista: navnene i klassen på ett ark, med ruter å krysse av i.
 *
 * Den er til turen og til vikaren — papiret læreren har i handa når klassen
 * skal telles ved bussen. Derfor er den ikke en visning av klassekartet med
 * pultene skrudd av: rekkefølgen er alfabetisk og ikke romlig, og det eneste
 * arket trenger er nummer, navn og en rute stor nok til en penn.
 *
 * **Arket er det samme på skjermen som på papiret.** Alle mål er `em` over en
 * skriftstørrelse som regnes ut av hvor mange elever lista har, så læreren ser
 * i forhåndsvisninga nøyaktig det hen får ut av skriveren. To sett med markup
 * — ett for skjerm og ett for print — ville før eller siden kommet fra
 * hverandre.
 */

/** Flere enn tre ruter gjør navnekolonnen for smal til lange navn. */
const MAX_COLUMNS = 3;

export default function ClassList() {
  const { activeClass, activeStudents, loading } = useAppData();

  /**
   * Hva lista gjelder — «Tur til Bygdøy», «Brannøvelse». Valgfritt, og lagres
   * ikke: en klasseliste skrives ut til en anledning og er ikke en innstilling
   * klassen skal bære med seg til neste gang.
   */
  const [occasion, setOccasion] = useState("");

  /**
   * Overskriftene på avkrysningsrutene. Lista starter med én rute som heter
   * «Til stede», for det er det de aller fleste turene trenger: én runde med
   * opptelling. En tur med buss både ut og hjem trenger to ruter, og da må
   * kolonnene ha navn — to rader med anonyme ruter er umulig å lese etterpå.
   * Overskrifta kan tømmes; da står ruta uten.
   */
  const [columns, setColumns] = useState<string[]>(["Til stede"]);

  const students = activeStudents;

  /**
   * Skriftstørrelsen arket bruker, i piksler.
   *
   * Poenget med lista er at den er **ett ark**: en klasseliste som fortsetter
   * på side to er til lita hjelp ved bussdøra. Derfor er det skrifta som gir
   * etter når klassen er stor, slik samtalearket gjør det. En vanlig klasse
   * havner på taket (12 px) og ser lik ut fra klasse til klasse; det er først
   * over førti navn at arket begynner å krympe.
   */
  const font = useMemo(() => {
    // Stående A4 er 297 mm høyt. 28 mm av det går til margene (6 mm fra
    // `@page` og 8 mm fra `main`, i begge ender), og 4 mm er avrundingsmonn:
    // uten det kan siste pikselrad tippe over på en ellers tom side to.
    // Et millimeter er ca. 3.78 px.
    const høyde = (297 - 28 - 9) * 3.78;
    // Alt på arket måles i `em`: overskrifta og tabellhodet tar til sammen
    // rundt 8 ganger skrifthøyden, og hver elevrad 2.6 — avkrysningsruta er
    // 1.6 em, og rundt den ligger lufta pennen trenger. Tallene er målt på
    // arket og runder oppover: en linje for mye gir en blank side to, en for
    // lite gir bare litt luft nederst.
    return Math.max(7, Math.min(12, høyde / (8 + 2.6 * students.length)));
  }, [students.length]);

  /**
   * Filnavnet utskriften foreslår. Nettleseren tar sidetittelen, og den sier
   * «Klassekart» på hver eneste side i appen — den som lagrer lista som PDF satt
   * igjen med en fil hen ikke kunne skille fra klassekartet. Tittelen byttes i
   * `beforeprint` og settes tilbake i `afterprint`: ren DOM, som krever ingen ny
   * tegning fra React før nettleseren tar bildet av sida.
   */
  useEffect(() => {
    if (!activeClass) return;
    const utskriftsnavn = `Klasseliste ${activeClass.name}`
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim();
    let forrige = "";
    const before = () => {
      forrige = document.title;
      document.title = utskriftsnavn;
    };
    const after = () => {
      if (forrige) document.title = forrige;
      forrige = "";
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, [activeClass]);

  if (loading)
    return (
      <p className="text-sm text-muted" role="status">
        Laster …
      </p>
    );
  if (!activeClass) return <p className="text-sm text-danger">Fant ikke klassen.</p>;

  return (
    <div className="mx-auto max-w-5xl print:max-w-none">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Klasseliste</h1>
          <p className="mt-0.5 text-xs text-subtle">
            {activeClass.name} · {plural(students.length, "elev", "elever")} · til turen, til
            vikaren, til opptellinga
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={students.length === 0}
          title={students.length === 0 ? "Legg til elever i klassen først" : "Skriv ut lista"}
          className={secondaryButton()}
        >
          Skriv ut
        </button>
      </div>

      {/* Valgene står over arket og kommer ikke med på papiret. */}
      <div className="mb-4 flex flex-wrap items-start gap-x-5 gap-y-3 rounded-xl border border-border bg-surface px-3 py-2.5 print:hidden">
        <div className="w-full max-w-xs min-w-[12rem] flex-1">
          <label htmlFor="liste-anledning" className="mb-1 block text-xs text-muted">
            Anledning (valgfritt)
          </label>
          <input
            id="liste-anledning"
            type="text"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            placeholder="Tur til Bygdøy"
            className={inputClassSm}
          />
        </div>

        <div className="shrink-0">
          <span className="mb-1 block text-xs text-muted">Ruter å krysse av i</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {columns.map((label, i) => (
              // Bredden ligger på wrapperen: `inputClassSm` har selv `w-full`,
              // og to breddeklasser på samme felt er en kamp om hvem som står
              // sist i CSS-en.
              <div key={i} className="w-32">
                <input
                  type="text"
                  value={label}
                  onChange={(e) =>
                    setColumns((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                  }
                  placeholder="Uten overskrift"
                  aria-label={`Overskrift på rute ${i + 1}`}
                  className={inputClassSm}
                />
              </div>
            ))}
            {columns.length < MAX_COLUMNS && (
              <button
                type="button"
                onClick={() => setColumns((prev) => [...prev, ""])}
                className={ghostButton("sm")}
              >
                + Én til
              </button>
            )}
            {columns.length > 1 && (
              <button
                type="button"
                onClick={() => setColumns((prev) => prev.slice(0, -1))}
                className={ghostButton("sm")}
              >
                − Fjern
              </button>
            )}
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-muted print:hidden">
          Klassen har ingen elever ennå. Legg dem inn under «Elever» i menyen, så er lista klar.
        </p>
      ) : (
        /* Arket selv. Rammen og skyggen er forhåndsvisninga — på papiret er de
           borte, og arket har bare margene utskriftsreglene gir det. */
        <div
          data-print-list
          style={{ fontSize: `${font}px` }}
          className="mx-auto max-w-[190mm] rounded-xl border border-border bg-surface-raised p-[2em] shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <header className="mb-[1em] flex flex-wrap items-end justify-between gap-[1em] border-b-2 border-foreground pb-[0.5em]">
            <div className="min-w-0">
              <p className="text-[2em] font-bold leading-tight">Klasseliste</p>
              <p className="mt-[0.1em] text-[1.4em] font-semibold leading-tight">
                {activeClass.name}
              </p>
            </div>
            <div className="text-right text-[1em] leading-tight text-muted">
              {occasion.trim() && (
                <p className="mb-[0.35em] text-[1.3em] font-medium text-foreground">
                  {occasion.trim()}
                </p>
              )}
              {/* Datoen skrives for hånd: den samme lista brukes gjerne på nytt
                  neste tur, og en dato trykt på arket gjør den til søppel. */}
              <p>Dato: ______________</p>
              <p className="mt-[0.25em]">{plural(students.length, "elev", "elever")}</p>
            </div>
          </header>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-strong">
                <th className="w-[2.5em] py-[0.35em] pr-[0.5em] text-left text-[0.95em] font-semibold text-muted">
                  Nr
                </th>
                <th className="py-[0.35em] text-left text-[0.95em] font-semibold text-muted">
                  Navn
                </th>
                {columns.map((label, i) => (
                  <th
                    key={i}
                    className="w-[6em] py-[0.35em] text-center text-[0.95em] font-semibold text-muted"
                  >
                    {label.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student, i) => (
                // Raden skal ikke deles av et sidebrudd: et navn på side én og
                // ruta på side to er ingen avkryssing.
                <tr key={student.id} className="break-inside-avoid border-b border-border">
                  {/* Nummereringen er til opptellinga: læreren som teller hoder
                      ved bussen sammenligner med det siste tallet i lista. */}
                  <td className="py-[0.4em] pr-[0.5em] text-[1em] tabular-nums text-subtle">
                    {i + 1}
                  </td>
                  <td className="py-[0.4em] text-[1.15em] font-medium leading-tight">
                    {student.name}
                  </td>
                  {columns.map((_, c) => (
                    <td key={c} className="py-[0.4em] text-center">
                      <span
                        aria-hidden="true"
                        className="inline-block h-[1.6em] w-[1.6em] rounded-[0.2em] border-2 border-border-strong align-middle"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
