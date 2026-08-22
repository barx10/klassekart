"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAppData } from "@/lib/app-data";
import { genderDotClass } from "@/lib/gender";

export default function Sidebar() {
  const { classes, studentsByClass, loading, createClass } = useAppData();
  const pathname = usePathname();
  const router = useRouter();
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClassClick(id: string) {
    setOpenClassId((prev) => (prev === id ? null : id));
    router.push(`/klasser/${id}`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createClass(name.trim(), contact.trim() || undefined);
      setName("");
      setContact("");
      setShowForm(false);
      setOpenClassId(created.id);
      router.push(`/klasser/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="flex h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-raised">
      <Link href="/" className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Image src="/laererliv-logo.png" alt="" width={28} height={28} className="rounded-md" />
        <span className="text-base font-semibold tracking-tight">Klassekart</span>
      </Link>

      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Klasser</span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {showForm ? "Avbryt" : "+ Ny"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mx-4 mb-2 flex flex-col gap-2 rounded-md border border-border bg-surface p-2"
        >
          {error && <p className="text-xs text-danger">{error}</p>}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Navn, f.eks. 5B"
            className="rounded border border-border bg-surface-raised px-2 py-1 text-sm outline-none focus:border-accent"
            autoFocus
          />
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Kontaktlærer (valgfritt)"
            className="rounded border border-border bg-surface-raised px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-accent px-2 py-1 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Oppretter …" : "Opprett"}
          </button>
        </form>
      )}

      <nav className="flex-1 px-2 pb-4">
        {loading ? (
          <p className="px-2 text-sm text-muted">Laster …</p>
        ) : classes.length === 0 ? (
          <p className="px-2 text-sm text-muted">Ingen klasser ennå.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {classes.map((c) => {
              const isActive = pathname === `/klasser/${c.id}`;
              const isOpen = openClassId === c.id;
              const studs = studentsByClass.get(c.id) ?? [];
              return (
                <li key={c.id}>
                  <button
                    onClick={() => handleClassClick(c.id)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left ${
                      isActive ? "bg-accent-soft text-accent" : "hover:bg-background"
                    }`}
                  >
                    <span
                      className={`shrink-0 text-subtle transition-transform ${isOpen ? "rotate-90" : ""}`}
                      aria-hidden
                    >
                      ›
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-subtle">{studs.length}</span>
                  </button>

                  {isOpen && (
                    <ul className="mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 border-l border-border pl-3">
                      {studs.length === 0 ? (
                        <li className="py-1 text-xs text-subtle">Ingen elever</li>
                      ) : (
                        studs.map((s) => (
                          <li key={s.id} className="flex items-center gap-1.5 py-0.5">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${genderDotClass(s.gender)}`}
                              aria-hidden
                            />
                            <span className="truncate text-xs text-muted">{s.name}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
