import type { Gender } from "./types";

export const genderLabel: Record<Gender, string> = {
  jente: "Jente",
  gutt: "Gutt",
  annet: "Annet",
};

export const genderOptions: Gender[] = ["jente", "gutt", "annet"];

/** Tailwind-klasser (bakgrunn + tekst) for kjønnsmerket badge. */
export function genderBadgeClass(gender: Gender): string {
  switch (gender) {
    case "jente":
      return "bg-[var(--gender-jente-soft)] text-[var(--gender-jente)]";
    case "gutt":
      return "bg-[var(--gender-gutt-soft)] text-[var(--gender-gutt)]";
    default:
      return "bg-[var(--gender-annet-soft)] text-[var(--gender-annet)]";
  }
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
