import { isSupabaseConfigured } from "@/lib/supabase";

export default function ConfigWarning() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="mb-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
      <strong>Supabase er ikke koblet til.</strong> Kopier <code>.env.example</code> til{" "}
      <code>.env.local</code>, fyll inn prosjektets URL og anon-nøkkel fra Supabase, og kjør{" "}
      <code>supabase/schema.sql</code> i SQL Editor. Se README for full oppskrift.
    </div>
  );
}
