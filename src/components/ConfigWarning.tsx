import { isSupabaseConfigured } from "@/lib/supabase";

export default function ConfigWarning() {
  if (isSupabaseConfigured) return null;
  return (
    <div
      role="alert"
      className="mx-auto max-w-xl rounded-xl border border-danger/40 bg-danger-soft px-4 py-3.5 text-sm text-danger"
    >
      <strong className="block">Supabase er ikke koblet til.</strong>
      <p className="mt-1">
        Kopier <code className="font-mono">.env.example</code> til{" "}
        <code className="font-mono">.env.local</code>, fyll inn prosjektets URL og anon-nøkkel fra
        Supabase, og kjør <code className="font-mono">supabase/schema.sql</code> i SQL Editor. Se
        README for full oppskrift.
      </p>
    </div>
  );
}
