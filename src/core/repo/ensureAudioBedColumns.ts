/**
 * Best-effort: add video_style_json + audio_bed_json to video_projects.
 * Safe to call repeatedly; no-ops if columns exist or DB is unreachable.
 */
import fs from "fs";
import path from "path";

let attempted = false;
let columnsReady: boolean | null = null;

export function audioBedColumnsReady(): boolean | null {
  return columnsReady;
}

export async function ensureAudioBedColumns(): Promise<boolean> {
  if (attempted) return columnsReady === true;
  attempted = true;

  try {
    // pg ships without types in this project; used only for optional DDL.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const pg = require("pg") as { Client: new (config: object) => {
      connect: () => Promise<void>;
      query: (sql: string) => Promise<unknown>;
      end: () => Promise<void>;
    } };
    const { Client } = pg;
    const env = loadEnvLocal();
    const url = env.SUPABASE_URL || process.env.SUPABASE_URL || "";
    const password =
      env.SUPABASE_DB_PASSWORD ||
      process.env.SUPABASE_DB_PASSWORD ||
      env.POSTGRES_PASSWORD ||
      process.env.POSTGRES_PASSWORD ||
      "";
    let conn = env.DATABASE_URL || process.env.DATABASE_URL || env.SUPABASE_DB_URL || "";

    if (!conn) {
      if (!url || !password) {
        columnsReady = false;
        return false;
      }
      const ref = url.replace(/^https:\/\//, "").split(".")[0];
      const enc = encodeURIComponent(password);
      // Prefer pooler (IPv4); fall back to direct host.
      conn = `postgresql://postgres.${ref}:${enc}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
    }

    const client = new Client({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });

    try {
      await client.connect();
      await client.query(`
        alter table video_projects add column if not exists video_style_json jsonb;
        alter table video_projects add column if not exists audio_bed_json jsonb;
      `);
      columnsReady = true;
      console.info("[audio-bed] Supabase columns video_style_json / audio_bed_json ready");
      return true;
    } catch (err) {
      // Retry direct host once if pooler tenant missing
      const message = err instanceof Error ? err.message : String(err);
      if (/tenant|ENOTFOUND|EHOSTUNREACH|timeout/i.test(message) && url && password) {
        const ref = url.replace(/^https:\/\//, "").split(".")[0];
        const enc = encodeURIComponent(password);
        const direct = new Client({
          connectionString: `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 8000,
        });
        try {
          await direct.connect();
          await direct.query(`
            alter table video_projects add column if not exists video_style_json jsonb;
            alter table video_projects add column if not exists audio_bed_json jsonb;
          `);
          columnsReady = true;
          console.info("[audio-bed] Supabase columns ready (direct)");
          await direct.end().catch(() => undefined);
          return true;
        } catch (err2) {
          console.warn(
            "[audio-bed] DDL skipped — using disk overlay:",
            err2 instanceof Error ? err2.message : String(err2)
          );
          columnsReady = false;
          await direct.end().catch(() => undefined);
          return false;
        }
      }
      console.warn("[audio-bed] DDL skipped — using disk overlay:", message);
      columnsReady = false;
      return false;
    } finally {
      await client.end().catch(() => undefined);
    }
  } catch (err) {
    console.warn(
      "[audio-bed] DDL unavailable — using disk overlay:",
      err instanceof Error ? err.message : String(err)
    );
    columnsReady = false;
    return false;
  }
}

function loadEnvLocal(): Record<string, string> {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return {};
    const out: Record<string, string> = {};
    for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}
