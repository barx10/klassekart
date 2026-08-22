import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Under bygg (og hvis miljøvariablene mangler i utvikling) lager vi en klient
// med placeholder-verdier slik at appen ikke krasjer på import. Kall som
// faktisk treffer nettverket vil feile med en tydelig feilmelding i UI-et
// (se isSupabaseConfigured / ConfigWarning).
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);
