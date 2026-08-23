/**
 * Felles knappe- og feltstiler. Klassene lå tidligere spredt som lange
 * literaler i hver komponent, så samme knapp kunne ha ulik høyde, radius og
 * hover-farge fra side til side.
 */

const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonSize = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3 py-2 text-sm",
} as const;

export type ButtonSize = keyof typeof buttonSize;

/** Hovedhandling — én per skjermbilde. */
export function primaryButton(size: ButtonSize = "md"): string {
  return `${base} ${buttonSize[size]} bg-accent text-accent-on hover:bg-accent-hover`;
}

/** Sekundær handling med ramme. */
export function secondaryButton(size: ButtonSize = "md"): string {
  return `${base} ${buttonSize[size]} border border-border bg-surface-raised text-foreground hover:border-border-strong hover:bg-background`;
}

/** Lavmælt handling uten ramme. */
export function ghostButton(size: ButtonSize = "md"): string {
  return `${base} ${buttonSize[size]} text-muted hover:bg-background hover:text-foreground`;
}

/** Handling som sletter noe. */
export function dangerButton(size: ButtonSize = "md"): string {
  return `${base} ${buttonSize[size]} bg-danger text-white hover:bg-danger-hover`;
}

export const inputClass =
  "w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-foreground placeholder:text-subtle outline-none focus:border-accent";

export const inputClassSm =
  "w-full rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground placeholder:text-subtle outline-none focus:border-accent";

/** «3 elever» / «1 elev» — unngår «elev(er)». */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
