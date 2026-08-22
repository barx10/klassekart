"use client";

import { useState } from "react";
import { useAppData } from "@/lib/app-data";
import type { Gender, Student } from "@/lib/types";
import { genderOptions, genderLabel, genderDotClass } from "@/lib/gender";

interface Props {
  classId: string;
  students: Student[];
  defaultContactTeacher: string | null;
}

export default function StudentManager({ classId, students, defaultContactTeacher }: Props) {
  const { addStudents, updateStudent, removeStudent, setError } = useAppData();
  const [bulkNames, setBulkNames] = useState("");
  const [bulkGender, setBulkGender] = useState<Gender>("annet");
  const [bulkContact, setBulkContact] = useState(defaultContactTeacher ?? "");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const names = bulkNames
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setAdding(true);
    try {
      await addStudents(classId, names, bulkGender, bulkContact.trim() || null);
      setBulkNames("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function patch(student: Student, fields: Partial<Pick<Student, "name" | "gender" | "contact_teacher">>) {
    try {
      await updateStudent(student.id, fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(student: Student) {
    if (!confirm(`Fjerne ${student.name} fra klassen?`)) return;
    try {
      await removeStudent(student.id);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const inputClass =
    "w-full rounded border border-border bg-surface-raised px-2 py-1 text-xs outline-none focus:border-accent";

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={handleAdd} className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2">
        <textarea
          value={bulkNames}
          onChange={(e) => setBulkNames(e.target.value)}
          rows={2}
          placeholder={"Ett navn per linje\nKari Nordmann"}
          className={inputClass}
        />
        <div className="flex gap-1.5">
          <select
            value={bulkGender}
            onChange={(e) => setBulkGender(e.target.value as Gender)}
            className={inputClass}
          >
            {genderOptions.map((g) => (
              <option key={g} value={g}>
                {genderLabel[g]}
              </option>
            ))}
          </select>
          <input
            value={bulkContact}
            onChange={(e) => setBulkContact(e.target.value)}
            placeholder="Kontaktlærer"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {adding ? "Legger til …" : "Legg til elever"}
        </button>
      </form>

      {students.length === 0 ? (
        <p className="px-1 text-xs text-subtle">Ingen elever ennå.</p>
      ) : (
        <ul className="flex flex-col">
          {students.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <li key={s.id} className="border-b border-border/60 last:border-0">
                <button
                  onClick={() => setEditingId(isEditing ? null : s.id)}
                  className="flex w-full items-center gap-1.5 py-1.5 text-left hover:text-accent"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${genderDotClass(s.gender)}`} aria-hidden />
                  <span className="flex-1 truncate text-xs">{s.name}</span>
                  {s.contact_teacher && (
                    <span className="shrink-0 truncate text-[10px] text-subtle">{s.contact_teacher}</span>
                  )}
                </button>

                {isEditing && (
                  <div className="flex flex-col gap-1.5 pb-2">
                    <input
                      defaultValue={s.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== s.name) patch(s, { name: v });
                      }}
                      className={inputClass}
                    />
                    <select
                      value={s.gender}
                      onChange={(e) => patch(s, { gender: e.target.value as Gender })}
                      className={inputClass}
                    >
                      {genderOptions.map((g) => (
                        <option key={g} value={g}>
                          {genderLabel[g]}
                        </option>
                      ))}
                    </select>
                    <input
                      defaultValue={s.contact_teacher ?? ""}
                      placeholder="Kontaktlærer"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== s.contact_teacher) patch(s, { contact_teacher: v });
                      }}
                      className={inputClass}
                    />
                    <button
                      onClick={() => handleDelete(s)}
                      className="self-start text-[11px] text-subtle hover:text-danger"
                    >
                      Fjern eleven
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-1 text-[11px] text-subtle">{students.length} elev(er)</p>
    </div>
  );
}
