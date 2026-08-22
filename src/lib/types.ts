export type Gender = "jente" | "gutt" | "annet";

/** En pult i klasserommet, fritt plassert med piksel-koordinater. */
export interface Desk {
  id: string;
  x: number;
  y: number;
}

/** Hvilke elever som sitter ved hvilken pult: pult-id -> elev-id-er (maks 2). */
export type DeskAssignments = Record<string, string[]>;

export interface SchoolClass {
  id: string;
  name: string;
  default_contact_teacher: string | null;
  /** Klasserommets pultoppsett. Beholdes på tvers av genereringer. */
  desks: Desk[];
  /** Antall kolonner "Rydd opp" bruker når pultene stilles opp i rutenett. */
  desk_cols: number;
  created_at: string;
}

export interface Student {
  id: string;
  class_id: string;
  name: string;
  gender: Gender;
  contact_teacher: string | null;
  created_at: string;
}

export interface SeatingChart {
  id: string;
  class_id: string;
  layout: DeskAssignments;
  created_at: string;
}

export interface PairHistoryRow {
  class_id: string;
  student_a_id: string;
  student_b_id: string;
  times_together: number;
  last_seated_at: string | null;
}
