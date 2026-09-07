import type { Gender } from "./types";

/**
 * Kjønn er **valgfritt**. Algoritmen bruker det ikke til noe — det er bare en
 * farge: på setet i klassekartet, og som en prikk foran navnet i listene. Den
 * gjør det lettere å se sammensetningen av en bordgruppe. Er kjønn ikke
 * oppgitt, står setet hvitt og prikken uteblir, og da lagrer vi heller ikke
 * opplysningen. Se `docs/personvern.md`: det vi ikke lagrer, trenger vi ikke
 * sikre eller slette.
 */

export const genderLabel: Record<Gender, string> = {
  jente: "Jente",
  gutt: "Gutt",
  annet: "Annet",
};

export const genderOptions: Gender[] = ["jente", "gutt", "annet"];

/** Til skjermlesere og hjelpetekster, der «ikke oppgitt» også må ha ord. */
export function genderName(gender: Gender | null): string {
  return gender ? genderLabel[gender] : "Kjønn ikke oppgitt";
}

export function genderDotClass(gender: Gender): string {
  switch (gender) {
    case "jente":
      return "bg-[var(--gender-jente)]";
    case "gutt":
      return "bg-[var(--gender-gutt)]";
    default:
      return "bg-[var(--gender-annet)]";
  }
}

/**
 * Fargene på selve setet: lyst fyll og en ramme i kjønnsfargen.
 *
 * Tidligere lå kjønnet i en 2 px prikk foran navnet. På skjermen var den så
 * vidt synlig, og på et utskrevet klassekart på pulten forsvant den helt.
 * Fyllet leses på avstand, og prikken kan gå ut — det gir navnet den plassen
 * den tok. Fyllet er lyst og ikke fullt: navnet skal stå i vanlig tekstfarge,
 * og et ark med tjue mettede flater bruker mye blekk.
 */
export function genderSeatClass(gender: Gender | null): string {
  switch (gender) {
    case "jente":
      return "border-[var(--gender-jente)] bg-[var(--gender-jente-soft)]";
    case "gutt":
      return "border-[var(--gender-gutt)] bg-[var(--gender-gutt-soft)]";
    case "annet":
      return "border-[var(--gender-annet)] bg-[var(--gender-annet-soft)]";
    default:
      return "border-border bg-surface";
  }
}
