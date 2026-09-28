import { createClient, SupabaseClient } from "@supabase/supabase-js";

declare global {
  // eslint-disable-next-line no-var
  var __vmmSupabase: SupabaseClient | undefined;
}

export function isSupabaseEnabled(): boolean {
  return (process.env.DB_PROVIDER ?? "sqlite") === "supabase";
}

export function getSupabase(): SupabaseClient {
  if (!global.__vmmSupabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "DB_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local. " +
          "Run supabase/schema.sql in your project's SQL editor first."
      );
    }
    global.__vmmSupabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return global.__vmmSupabase;
}

/** Throws a readable error instead of a raw PostgrestError. */
export function assertNoError<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Supabase error: ${result.error.message}`);
  return result.data;
}
