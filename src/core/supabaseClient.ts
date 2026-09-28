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

/**
 * Throws a readable error instead of a raw PostgrestError. Accepts
 * `data: T | null` because that's supabase-js's actual response shape
 * (nullable even on success in its types) — without this, TS infers the
 * generic as nullable too and every call site fails to build with "Object
 * is possibly 'null'". The cast on return is deliberate, not a bug: a null
 * `error` genuinely means `data` is present for list/insert/update queries,
 * and `.maybeSingle()` callers already handle a legitimate `null` (no row
 * found) themselves right after calling this — this helper must not turn
 * that into a thrown error.
 */
export function assertNoError<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Supabase error: ${result.error.message}`);
  return result.data as T;
}
