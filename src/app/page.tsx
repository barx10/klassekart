"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClass, deleteClass, fetchClasses } from "@/lib/api";
import type { SchoolClass } from "@/lib/types";
import ConfigWarning from "@/components/ConfigWarning";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function DashboardPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newContactTeacher, setNewContactTeacher] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchClasses()
      .then(setClasses)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createClass(newName.trim(), newContactTeacher.trim());
      setClasses((prev) => [...prev, created]);
      setNewName("");
      setNewContactTeacher("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Slette klassen? Dette sletter også alle elever og all historikk for klassen.")) return;
    try {
      await deleteClass(id);
      setClasses((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Klasser</h1>
      <p className="mb-6 text-sm text-muted">Velg en klasse eller opprett en ny for å komme i gang.</p>

      <ConfigWarning />

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Navn på ny klasse, f.eks. 5B"
          className="w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          disabled={!isSupabaseConfigured}
        />
        <input
          value={newContactTeacher}
          onChange={(e) => setNewContactTeacher(e.target.value)}
          placeholder="Kontaktlærer (valgfritt)"
          className="w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          disabled={!isSupabaseConfigured}
        />
        <button
          type="submit"
          disabled={creating || !isSupabaseConfigured}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Opprett klasse
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-muted">Laster …</p>
      ) : classes.length === 0 ? (
        <p className="text-sm text-muted">Ingen klasser ennå.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {classes.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-raised px-4 py-3"
            >
              <Link href={`/klasser/${c.id}`} className="hover:text-accent">
                <span className="font-medium">{c.name}</span>
                {c.default_contact_teacher && (
                  <span className="ml-2 text-xs text-subtle">Kontaktlærer: {c.default_contact_teacher}</span>
                )}
              </Link>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-xs text-subtle hover:text-danger"
                aria-label={`Slett ${c.name}`}
              >
                Slett
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
