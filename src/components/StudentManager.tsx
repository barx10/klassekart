"use client";

import { useState } from "react";
import { addStudents, deleteStudent, updateStudent } from "@/lib/api";
import type { Gender, Student } from "@/lib/types";
import { genderOptions, genderLabel, genderBadgeClass } from "@/lib/gender";

interface Props {
  classId: string;
  students: Student[];
  onChange: (students: Student[]) => void;
}

export default function StudentManager({ classId, students, onChange }: Props) {
  const [bulkNames, setBulkNames] = useState("");
  const [bulkGender, setBulkGender] = useState<Gender>("annet");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const names = bulkNames
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const created = await addStudents(classId, names, bulkGender);
      onChange([...students, ...created].sort((a, b) => a.name.localeCompare(b.name, "no")));
      setBulkNames("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleGenderChange(student: Student, gender: Gender) {
    try {
      const updated = await updateStudent(student.id, { gender });
      onChange(students.map((s) => (s.id === student.id ? updated : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleNameChange(student: Student, name: string) {
    if (!name.trim() || name === student.name) return;
    try {
      const updated = await updateStudent(student.id, { name: name.trim() });
      onChange(
        students
          .map((s) => (s.id === student.id ? updated : s))
          .sort((a, b) => a.name.localeCompare(b.name, "no"))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(student: Student) {
    if (!confirm(`Fjerne ${student.name} fra klassen?`)) return;
    try {
      await deleteStudent(student.id);
      onChange(students.filter((s) => s.id !== student.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      <form onSubmit={handleAdd} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Legg til elever (ett navn per linje)
          <textarea
            value={bulkNames}
            onChange={(e) => setBulkNames(e.target.value)}
            rows={3}
            placeholder={"Kari Nordmann\nPer Hansen\n..."}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Kjønn
            <select
              value={bulkGender}
              onChange={(e) => setBulkGender(e.target.value as Gender)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {genderOptions.map((g) => (
                <option key={g} value={g}>
                  {genderLabel[g]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={adding}
            className="h-fit self-end rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Legg til
          </button>
        </div>
      </form>

      {students.length === 0 ? (
        <p className="text-sm text-muted">Ingen elever lagt til ennå.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
          {students.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${genderBadgeClass(s.gender)}`} aria-hidden />
              <input
                defaultValue={s.name}
                onBlur={(e) => handleNameChange(s, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm hover:border-border focus:border-accent focus:bg-surface focus:outline-none"
              />
              <select
                value={s.gender}
                onChange={(e) => handleGenderChange(s, e.target.value as Gender)}
                className={`rounded-md border-0 px-2 py-1 text-xs font-medium ${genderBadgeClass(s.gender)}`}
              >
                {genderOptions.map((g) => (
                  <option key={g} value={g}>
                    {genderLabel[g]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleDelete(s)}
                aria-label={`Fjern ${s.name}`}
                className="text-xs text-subtle hover:text-danger"
              >
                Fjern
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-subtle">{students.length} elev(er) i klassen</p>
    </div>
  );
}
