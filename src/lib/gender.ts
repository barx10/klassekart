import type { Gender } from "./types";

export const genderLabel: Record<Gender, string> = {
  jente: "Jente",
  gutt: "Gutt",
  annet: "Annet",
};

export const genderOptions: Gender[] = ["jente", "gutt", "annet"];

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
