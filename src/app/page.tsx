"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAppData } from "@/lib/app-data";
import NewClassForm from "@/components/NewClassForm";

export default function HomePage() {
  const router = useRouter();
  const { classes, loading, error } = useAppData();

  useEffect(() => {
    if (!loading && classes.length > 0) {
      router.replace(`/klasser/${classes[0].id}`);
    }
  }, [loading, classes, router]);

  if (loading || classes.length > 0) {
    return (
      <p className="text-sm text-muted" role="status">
        Laster …
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      {/*
        Klasserommet bak kortet. Bildet er dempet og lagt under et lag som
        toner over i sidefargen, ellers ville detaljene i fotoet konkurrert
        med skjemaet som faktisk skal fylles ut.
      */}
      <div
        aria-hidden
        data-print-hide
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <Image
          src="/splashscreen.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-40 dark:opacity-25"
        />
        <div className="absolute inset-0 bg-linear-to-b from-background/40 via-background/70 to-background" />
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-4 py-2.5 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface-raised/85 p-6 text-center shadow-xl shadow-black/5 backdrop-blur-md sm:p-8">
        <div className="mx-auto mb-6 w-full max-w-xs rounded-full border border-border bg-background py-2 text-center text-sm font-medium text-muted">
          Tavle
        </div>

        <h1 className="mb-1 text-xl font-semibold">Kom i gang</h1>
        <p className="mb-5 text-sm text-muted">
          Opprett den første klassen din. Etterpå legger du inn elevene, setter opp pultene og
          genererer klassekart.
        </p>

        <div className="mx-auto max-w-xs text-left">
          <NewClassForm />
        </div>
      </div>
    </div>
  );
}
