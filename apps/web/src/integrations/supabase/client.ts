import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.warn(
    "[STOA] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY em falta. Cria apps/web/.env.local a partir de .env.example."
  );
}

export const supabase = createClient<Database>(url ?? "", anonKey ?? "", {
  auth: { persistSession: true, autoRefreshToken: true },
});
