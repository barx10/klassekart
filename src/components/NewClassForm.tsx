"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/lib/app-data";
import { inputClass, inputClassSm, primaryButton } from "@/lib/ui";

interface Props {
  /** «sm» er menyvarianten, «md» brukes i den tomme startsida. */
  size?: "sm" | "md";
  autoFocus?: boolean;
  onCreated?: () => void;
}

/**
 * Skjemaet for å opprette en klasse. Delt mellom menya og den tomme startsida,
 * som tidligere bare pekte på «+ Ny» i menyen — en henvisning som ikke ga
 * mening på mobil, der menya er skjult.
 */
export default function NewClassForm({ size = "md", autoFocus, onCreated }: Props) {
  const { createClass, setError } = useAppData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [creating, setCreating] = useState(false);

  const field = size === "sm" ? inputClassSm : inputClass;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await createClass(name.trim(), contact.trim() || undefined);
      setName("");
      setContact("");
      onCreated?.();
      router.push(`/klasser/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  const id = size === "sm" ? "meny" : "start";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`klassenavn-${id}`}>
        Navn på klassen
      </label>
      <input
        id={`klassenavn-${id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Navn, f.eks. 5B"
        className={field}
        autoFocus={autoFocus}
      />
      <label className="sr-only" htmlFor={`kontaktlaerer-${id}`}>
        Kontaktlærer
      </label>
      <input
        id={`kontaktlaerer-${id}`}
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="Kontaktlærer (valgfritt)"
        className={field}
      />
      <button
        type="submit"
        disabled={creating || !name.trim()}
        className={primaryButton(size === "sm" ? "sm" : "md")}
      >
        {creating ? "Oppretter …" : "Opprett klasse"}
      </button>
    </form>
  );
}
