/**
 * Samtaletidene som kalenderfil (iCalendar, `.ics`).
 *
 * Samtaleuka står i Klassekart, men lærerens dag står i skolens kalender. Uten
 * en vei mellom dem må hen skrive inn tjue avtaler for hånd, og det er der
 * feilene kommer: én samtale havner en time feil, og en familie møter til
 * stengt dør.
 *
 * **En fil, ikke en kobling.** En integrasjon mot Google eller Outlook ville
 * sendt elevnavn til en tjeneste, og dermed krevd databehandleravtale med hver
 * kommune — akkurat det `docs/personvern.md` sier appen ikke skal ha. Fila
 * lages her i nettleseren og havner på lærerens egen maskin; derfra er den
 * lærerens dokument, som et utskrevet ark.
 */

import { kindLabel, slotEnd, toMinutes } from "./meetings";
import type { MeetingKind, MeetingSlot } from "./types";

export interface CalendarEvent {
  /** Tidas id. Blir `UID` i fila, så en ny nedlasting oppdaterer avtalen i stedet for å lage en til. */
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  /** Merknaden læreren har skrevet, om det er noen. */
  note?: string;
}

/**
 * Tegn som betyr noe i formatet må rømmes, og linjeskift skrives som `\n`.
 * Et elevnavn med komma i — «Nordmann, Kari» skrevet av en som er vant til
 * fagsystemet — ville ellers delt feltet i to.
 */
function escape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * iCalendar tillater 75 oktetter per linje, og resten skal fortsette på neste
 * linje med et mellomrom først. Outlook godtar lange linjer, men ikke alle gjør
 * det, og en avkuttet linje er en avtale som mangler navnet sitt.
 *
 * Brytingen teller **oktetter og ikke tegn**: «Håkon» er fem tegn og seks byte i
 * UTF-8, og et brekk midt i et tegn gir tilfeldig rusk hos mottakeren.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const deler: string[] = [];
  let igjen = line;
  let grense = 75;
  while (igjen.length > 0) {
    if (new TextEncoder().encode(igjen).length <= grense) {
      deler.push(igjen);
      break;
    }
    let kutt = grense;
    while (kutt > 0 && new TextEncoder().encode(igjen.slice(0, kutt)).length > grense) kutt -= 1;
    deler.push(igjen.slice(0, kutt));
    igjen = igjen.slice(kutt);
    // Fortsettelseslinjene begynner med et mellomrom som ikke er en del av verdien.
    grense = 74;
  }
  return deler.join("\r\n ");
}

/** «2026-09-23» + «10:15» → «20260923T101500». */
function stamp(date: string, clock: string): string {
  const minutter = toMinutes(clock);
  const time = String(Math.floor(minutter / 60)).padStart(2, "0");
  const min = String(minutter % 60).padStart(2, "0");
  return `${date.replace(/-/g, "")}T${time}${min}00`;
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Bygger sjølve fila.
 *
 * Tidene står **uten tidssone**, som lokal tid. Det er med vilje: en samtale
 * klokka 15 er klokka 15 på skolen, og en fil med sone i seg flytter tidene en
 * time når vinterkloka stiller seg mellom oppsettet og samtalen. Hadde
 * samtalene vært på tvers av land, ville svaret vært et annet.
 */
export function toIcs(events: CalendarEvent[], calendarName: string): string {
  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Laererliv//Klassekart//NO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(calendarName)}`,
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@klassekart.laererliv.no`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${stamp(event.date, event.start)}`,
      `DTEND:${stamp(event.date, event.end)}`,
      `SUMMARY:${escape(event.title)}`
    );
    if (event.note?.trim()) lines.push(`DESCRIPTION:${escape(event.note.trim())}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // CRLF er det formatet krever, og det eldre kalenderprogrammer faktisk leser.
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * Samtaletidene som kalenderavtaler.
 *
 * Bare tider som gjelder noen kommer med — en ledig time er lærerens reserve og
 * ikke en avtale, og en kalender full av «ledig» er en kalender ingen ser på.
 * Merknadstider blir med: «møte med PPT» er nettopp noe som skal stå i kalenderen.
 */
export function slotsToEvents(
  slots: MeetingSlot[],
  kind: MeetingKind,
  className: string,
  nameOf: (studentId: string) => string
): CalendarEvent[] {
  return slots
    .filter((slot) => slot.student_id || slot.note.trim())
    .map((slot) => {
      const navn = slot.student_id ? nameOf(slot.student_id) : "";
      const hvem = navn || slot.note.trim();
      return {
        id: slot.id,
        date: slot.date,
        start: slot.start,
        end: slotEnd(slot),
        // «Utviklingssamtale: Anna Oline (7A)». Klassen står i tittelen fordi
        // to klasser har samtaleuke samtidig, og kalenderen er den ene lista
        // der begge møtes.
        title: `${kindLabel(kind)}: ${hvem}${className ? ` (${className})` : ""}`,
        note: navn ? slot.note : "",
      };
    });
}
