"use client";

import { useState } from "react";
import Modal from "./Modal";
import { updateContactTeacher } from "@/lib/api";
import type { SchoolClass } from "@/lib/types";

interface Props {
  schoolClass: SchoolClass;
  onClose: () => void;
  onSaved: (updated: SchoolClass) => void;
}

export default function ContactTeacherModal({ schoolClass, onClose, onSaved }: Props) {
  const [name, setName] = useState(schoolClass.contact_teacher_name ?? "");
  const [email, setEmail] = useState(schoolClass.contact_teacher_email ?? "");
  const [phone, setPhone] = useState(schoolClass.contact_teacher_phone ?? "");
  const [note, setNote] = useState(schoolClass.contact_teacher_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateContactTeacher(schoolClass.id, {
        contact_teacher_name: name.trim() || null,
        contact_teacher_email: email.trim() || null,
        contact_teacher_phone: phone.trim() || null,
        contact_teacher_note: note.trim() || null,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Kontaktlærer – ${schoolClass.name}`} onClose={onClose}>
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        {error && <p className="text-sm text-danger">{error}</p>}
        <label className="flex flex-col gap-1 text-sm">
          Navn
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ola Nordmann"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          E-post
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ola.nordmann@skole.no"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Telefon
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="123 45 678"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Notat
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Treffetid, kontor, e.l."
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-muted hover:bg-background"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Lagrer …" : "Lagre"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
