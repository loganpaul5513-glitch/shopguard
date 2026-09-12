import { createClient } from "@supabase/supabase-js";
import { envGet } from "./http.js";

const DEFAULT_SUPABASE_URL = "https://myinlzdgkpyhcvjaabon.supabase.co";

export function createSupabaseAdmin(env) {
  const url = envGet(env, "SUPABASE_URL", DEFAULT_SUPABASE_URL);
  const serviceKey = envGet(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    const error = new Error("Supabase service role key is not configured.");
    error.statusCode = 500;
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
