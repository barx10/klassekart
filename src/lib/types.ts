export type Gender = "jente" | "gutt" | "annet";

export interface SchoolClass {
  id: string;
  name: string;
  contact_teacher_name: string | null;
  contact_teacher_email: string | null;
  contact_teacher_phone: string | null;
  contact_teacher_note: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  class_id: string;
  name: string;
  gender: Gender;
  created_at: string;
}

export type SeatingLayout = string[][]; // array of groups, each a list of student ids

export interface SeatingChart {
  id: string;
  class_id: string;
  group_size: number;
  layout: SeatingLayout;
  created_at: string;
}

export interface PairHistoryRow {
  class_id: string;
  student_a_id: string;
  student_b_id: string;
  times_together: number;
  last_seated_at: string | null;
}
