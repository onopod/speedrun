import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureGuestSchema, findGuest, validOrigin } from "@/lib/guest-store";
import { parseRun } from "@/lib/guest-rules";
import { COURSE_ID } from "@/lib/autorun";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  try {
    await ensureGuestSchema();
    const result = await db.execute(sql`SELECT best.id, g.name, best.time_ms AS "timeMs", best.coins,
      best.input_type AS input, best.guest_id AS "playerId"
      FROM (SELECT DISTINCT ON (guest_id) * FROM speedrun_runs_v2 WHERE course = ${COURSE_ID}
        ORDER BY guest_id, time_ms ASC, coins DESC, created_at ASC) best
      JOIN speedrun_guests_v2 g ON g.id = best.guest_id
      ORDER BY best.time_ms ASC, best.coins DESC, best.created_at ASC LIMIT 10`);
    return NextResponse.json(result.rows, { headers });
  } catch { return NextResponse.json({ error: "ランキングに接続できません。" }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  const score = parseRun(await request.json().catch(() => null));
  if (!score) return NextResponse.json({ error: "Invalid score" }, { status: 400, headers });
  try {
    await ensureGuestSchema(); const guest = await findGuest(request);
    if (!guest) return NextResponse.json({ error: "ブラウザのCookieを有効にして再試行してください。" }, { status: 401, headers });
    // Stable run UUID makes retries idempotent, including a lost success response.
    const result = await db.execute(sql`INSERT INTO speedrun_runs_v2(id, guest_id, course, time_ms, coins, input_type)
      VALUES (${score.runId}, ${guest.id}, ${COURSE_ID}, ${score.timeMs}, ${score.coins}, ${score.input})
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      WHERE speedrun_runs_v2.guest_id = EXCLUDED.guest_id RETURNING id`);
    if (!result.rows.length) return NextResponse.json({ error: "Invalid run" }, { status: 409, headers });
    return NextResponse.json({ ok: true }, { status: 201, headers });
  } catch { return NextResponse.json({ error: "記録を保存できませんでした。再送信してください。" }, { status: 503, headers }); }
}
