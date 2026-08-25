"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/app-data";
import type { Gender, Student } from "@/lib/types";
import { genderOptions, genderLabel, genderName, genderDotClass } from "@/lib/gender";
import ConfirmDialog from "./ConfirmDialog";
import { inputClassSm, primaryButton, plural } from "@/lib/ui";

interface Props {
  classId: string;
  students: Student[];
  defaultContactTeacher: string | null;
}

/** Fra hvilket antall elever det lønner seg å kunne søke i lista. */
const FILTER_THRESHOLD = 12;

export default function StudentManager({ classId, students, defaultContactTeacher }: Props) {
  const { addStudents, updateStudent, removeStudent, setError } = useAppData();
  const [bulkNames, setBulkNames] = useState("");
  const [bulkGender, setBulkGender] = useState<Gender | null>(null);
  const [bulkContact, setBulkContact] = useState(defaultContactTeacher ?? "");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Student | null>(null);

  const pendingCount = bulkNames.split("\n").filter((n) => n.trim()).length;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, filter]);

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

  async function patch(
    student: Student,
    fields: Partial<Pick<Student, "name" | "gender" | "contact_teacher">>
  ) {
    try {
      await updateStudent(student.id, fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmDelete() {
    const student = pendingDelete;
    if (!student) return;
    setPendingDelete(null);
    try {
      await removeStudent(student.id);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2"
      >
        <label htmlFor="nye-elever" className="text-[11px] font-medium text-subtle">
          Legg til elever – ett navn per linje
        </label>
        <textarea
          id="nye-elever"
          value={bulkNames}
          onChange={(e) => setBulkNames(e.target.value)}
          rows={4}
          placeholder={"Kari Nordmann\nOla Nordmann"}
          className={`${inputClassSm} resize-y`}
        />
        <div className="flex gap-1.5">
          <label className="sr-only" htmlFor="nye-elever-kjonn">
            Kjønn
          </label>
          <select
            id="nye-elever-kjonn"
            value={bulkGender ?? ""}
            onChange={(e) => setBulkGender((e.target.value as Gender) || null)}
            className={inputClassSm}
          >
            <option value="">Kjønn (valgfritt)</option>
            {genderOptions.map((g) => (
              <option key={g} value={g}>
                {genderLabel[g]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="nye-elever-kontakt">
            Kontaktlærer
          </label>
          <input
            id="nye-elever-kontakt"
            value={bulkContact}
            onChange={(e) => setBulkContact(e.target.value)}
            placeholder="Kontaktlærer"
            className={inputClassSm}
          />
        </div>
        <button type="submit" disabled={adding || pendingCount === 0} className={primaryButton("sm")}>
          {adding
            ? "Legger til …"
            : pendingCount > 0
              ? `Legg til ${plural(pendingCount, "elev", "elever")}`
              : "Legg til elever"}
        </button>
        <p className="text-[11px] text-subtle">
          Kjønn og kontaktlærer gjelder alle i denne bunken. Du kan endre hver elev etterpå ved å
          klikke på navnet. Kjønn er valgfritt — det brukes bare til fargeprikken, ikke til
          fordelingen.
        </p>
      </form>

      {students.length >= FILTER_THRESHOLD && (
        <>
          <label className="sr-only" htmlFor="elevsok">
            Søk i elevlista
          </label>
          <input
            id="elevsok"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Søk etter elev …"
            className={inputClassSm}
          />
        </>
      )}

      {students.length === 0 ? (
        <p className="px-1 text-xs text-subtle">Ingen elever ennå.</p>
      ) : visible.length === 0 ? (
        <p className="px-1 text-xs text-subtle">Ingen treff på «{filter}».</p>
      ) : (
        <ul className="flex flex-col">
          {visible.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <li key={s.id} className="border-b border-border/60 last:border-0">
                <button
                  type="button"
                  onClick={() => setEditingId(isEditing ? null : s.id)}
                  aria-expanded={isEditing}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-2 text-left hover:text-accent-text"
                >
                  {s.gender && (
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${genderDotClass(s.gender)}`}
                      title={genderLabel[s.gender]}
                    />
                  )}
                  <span className="sr-only">{genderName(s.gender)}. </span>
                  <span className="min-w-0 flex-1 truncate text-xs">{s.name}</span>
                  {s.contact_teacher && (
                    <span
                      className="shrink-0 truncate text-[10px] text-subtle"
                      title={`Kontaktlærer: ${s.contact_teacher}`}
                    >
                      {s.contact_teacher}
                    </span>
                  )}
                </button>

                {isEditing && (
                  <div className="flex flex-col gap-1.5 px-1 pb-2">
                    <label className="sr-only" htmlFor={`navn-${s.id}`}>
                      Navn
                    </label>
                    <input
                      id={`navn-${s.id}`}
                      defaultValue={s.name}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          e.currentTarget.value = s.name;
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== s.name) patch(s, { name: v });
                        else e.target.value = s.name;
                      }}
                      className={inputClassSm}
                    />
                    <label className="sr-only" htmlFor={`kjonn-${s.id}`}>
                      Kjønn
                    </label>
                    <select
                      id={`kjonn-${s.id}`}
                      value={s.gender ?? ""}
                      onChange={(e) => patch(s, { gender: (e.target.value as Gender) || null })}
                      className={inputClassSm}
                    >
                      <option value="">Kjønn (valgfritt)</option>
                      {genderOptions.map((g) => (
                        <option key={g} value={g}>
                          {genderLabel[g]}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`kontakt-${s.id}`}>
                      Kontaktlærer
                    </label>
                    <input
                      id={`kontakt-${s.id}`}
                      defaultValue={s.contact_teacher ?? ""}
                      placeholder="Kontaktlærer"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== s.contact_teacher) patch(s, { contact_teacher: v });
                      }}
                      className={inputClassSm}
                    />
                    <button
                      type="button"
                      onClick={() => setPendingDelete(s)}
                      className="self-start rounded px-1 py-0.5 text-[11px] text-subtle hover:text-danger"
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

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 text-[11px] text-subtle">
        <span>{plural(students.length, "elev", "elever")}</span>
        <span className="flex items-center gap-2">
          {genderOptions.map((g) => (
            <span key={g} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${genderDotClass(g)}`} aria-hidden />
              {genderLabel[g]}
            </span>
          ))}
        </span>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={`Fjerne ${pendingDelete.name}?`}
          body={
            <>
              Eleven fjernes fra klassen, og par-historikken som gjelder{" "}
              <strong className="text-foreground">{pendingDelete.name}</strong> forsvinner med.
              Tidligere klassekart beholdes, men plassen står tom.
            </>
          }
          confirmLabel="Fjern eleven"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
