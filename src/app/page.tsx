"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/lib/app-data";
import ConfigWarning from "@/components/ConfigWarning";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const { classes, loading, error } = useAppData();

  useEffect(() => {
    if (!loading && classes.length > 0) {
      router.replace(`/klasser/${classes[0].id}`);
    }
  }, [loading, classes, router]);

  if (!isSupabaseConfigured) {
    return <ConfigWarning />;
  }

  if (loading || classes.length > 0) {
    return <p className="text-sm text-muted">Laster …</p>;
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-background p-10 text-center">
        <div className="mx-auto mb-6 w-full max-w-xs rounded-full border border-border bg-surface-raised py-2 text-center text-sm font-medium text-muted shadow-sm">
          Tavle
        </div>
        <h1 className="mb-1 text-xl font-semibold">Ingen klasser ennå</h1>
        <p className="text-sm text-muted">
          Opprett din første klasse i menyen til venstre (&ldquo;+ Ny&rdquo;) for å komme i gang.
        </p>
      </div>
    </div>
  );
}
