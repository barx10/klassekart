import type { Gender } from "./types";

/**
 * Kjønn er **valgfritt**. Algoritmen bruker det ikke til noe — det er bare en
 * fargeprikk som gjør det lettere å se sammensetningen av en bordgruppe. Er
 * det ikke oppgitt, vises ingen prikk, og da lagrer vi heller ikke
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
