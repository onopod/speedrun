import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateGuestName } from "@/lib/guest-rules";

export const GUEST_COOKIE = "speedrun_guest_v2";
export type Guest = { id: string; name: string };
let schemaReady: Promise<void> | undefined;
// Additive bootstrap; the lock prevents concurrent cold starts racing DDL.
export function ensureGuestSchema() {
  schemaReady ??= db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(73190642)`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS speedrun_guests_v2 (
      id UUID PRIMARY KEY, token_hash VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(16) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS speedrun_runs_v2 (
      id UUID PRIMARY KEY, guest_id UUID NOT NULL REFERENCES speedrun_guests_v2(id),
      course VARCHAR(40) NOT NULL, time_ms INTEGER NOT NULL CHECK(time_ms BETWEEN 30000 AND 3600000),
      coins INTEGER NOT NULL CHECK(coins BETWEEN 0 AND 60), input_type VARCHAR(16) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS speedrun_runs_v2_course_time_idx ON speedrun_runs_v2(course, time_ms, created_at)`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS speedrun_runs_v2_guest_idx ON speedrun_runs_v2(guest_id, course)`);
  }).then(() => undefined).catch(error => { schemaReady = undefined; throw error; });
  return schemaReady;
}
function tokenHash(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map(c => c.trim()).find(c => c.startsWith(GUEST_COOKIE + "="));
  const token = cookie?.slice(GUEST_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
export async function findGuest(request: Request): Promise<Guest | null> {
  const hash = tokenHash(request);
  if (!hash) return null;
  const result = await db.execute<{ id: string; name: string }>(sql`SELECT id, name FROM speedrun_guests_v2 WHERE token_hash = ${hash}`);
  return result.rows[0] ?? null;
}
export async function guestResponse(request: Request) {
  await ensureGuestSchema();
  const guest = await findGuest(request);
  if (guest) return NextResponse.json(guest, { headers: { "Cache-Control": "no-store" } });
  const token = randomBytes(32).toString("hex"), bytes = randomBytes(2), id = randomUUID();
  const hash = createHash("sha256").update(token).digest("hex");
  const name = generateGuestName(bytes[0], bytes[1]);
  await db.execute(sql`INSERT INTO speedrun_guests_v2(id, token_hash, name) VALUES (${id}, ${hash}, ${name})`);
  const response = NextResponse.json({ id, name }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(GUEST_COOKIE, token, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
export function validOrigin(request: Request) { return request.headers.get("origin") === new URL(request.url).origin; }
