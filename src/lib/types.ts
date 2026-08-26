export type Gender = "jente" | "gutt" | "annet";

/**
 * En pult i klasserommet, fritt plassert med piksel-koordinater.
 * `seats` er hvor mange elever som får plass ved pulten (1 = enkeltpult,
 * 2 = topult, 3-4 = bordgruppe).
 */
export interface Desk {
  id: string;
  x: number;
  y: number;
  seats: number;
  /** Valgfritt bordnavn, f.eks. "Bord 1" eller "Grønn gruppe". */
  name?: string;
  /**
   * Egen bredde og høyde i piksler, satt ved å dra i hjørnet av pulten. Uten
   * dem får pulten standardmålet for antall plasser.
   */
  w?: number;
  h?: number;
}

/**
 * Hvilke elever som sitter hvor: pult-id -> elev-id per sete. `null` er et
 * ledig sete, slik at en elev kan flyttes til sete 2 selv om sete 1 er tomt.
 */
export type DeskAssignments = Record<string, (string | null)[]>;

/**
 * Et sete en elev er låst til. Låste elever blir stående når et nytt
 * klassekart genereres, og kan ikke dras vekk før låsen er tatt av.
 */
export interface SeatLock {
  desk_id: string;
  index: number;
}

/**
 * Låsene i en klasse, med elev-id som nøkkel. Én elev kan bare være låst ett
 * sted, og oppslaget «er denne eleven låst?» er det UI-et gjør oftest.
 */
export type SeatLocks = Record<string, SeatLock>;

export interface SchoolClass {
  id: string;
  name: string;
  default_contact_teacher: string | null;
  /** Klasserommets pultoppsett. Beholdes på tvers av genereringer. */
  desks: Desk[];
  /** Antall kolonner "Rydd opp" bruker når pultene stilles opp i rutenett. */
  desk_cols: number;
  /** Elever som er låst til et bestemt sete. Hører til klasserommet, ikke kartet. */
  locked_seats: SeatLocks;
  created_at: string;
}

export interface Student {
  id: string;
  class_id: string;
  name: string;
  /** Valgfritt: `null` er «ikke oppgitt», og er det vanlige. */
  gender: Gender | null;
  contact_teacher: string | null;
  created_at: string;
}

export interface SeatingChart {
  id: string;
  class_id: string;
  layout: DeskAssignments;
  created_at: string;
}

/**
 * Et elevpar læreren har bestemt at ikke skal sitte sammen. «Sammen» betyr
 * samme bord, slik resten av appen regner par: par-historikken og varmekartet
 * teller to elever som sammen når de sitter ved samme pult.
 *
 * Som `PairHistoryRow` har raden ingen id — klassen og de to elevene er
 * nøkkelen, og elevene lagres alltid i samme rekkefølge (`pairKey`).
 */
export interface ApartPair {
  class_id: string;
  student_a_id: string;
  student_b_id: string;
}

export interface PairHistoryRow {
  class_id: string;
  student_a_id: string;
  student_b_id: string;
  times_together: number;
  last_seated_at: string | null;
}

/**
 * En kontaktlærer læreren har lagt inn. Lista finnes for at kontaktlærer på
 * en elev skal velges fra faste navn og ikke skrives fritt — ellers blir
 * «Kari Nordmann» og «kari nordmann» to forskjellige lærere, og oversikten
 * over hvem som har hvilke elever sprekker.
 *
 * Elevene peker på navnet, ikke id-en. Det gjør at navn som alt sto på
 * elevene virker med én gang; til gjengjeld må elevene skrives om når en
 * kontaktlærer får nytt navn.
 */
export interface ContactTeacher {
  id: string;
  name: string;
  created_at: string;
}
