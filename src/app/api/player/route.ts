import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureGuestSchema, findGuest, guestResponse, validOrigin } from "@/lib/guest-store";
import { normalizeGuestName } from "@/lib/guest-rules";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return await guestResponse(request); }
  catch { return NextResponse.json({ error: "名前を取得できませんでした。" }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = normalizeGuestName(body?.name);
  if (!name) return NextResponse.json({ error: "名前は3〜6文字の文字・数字で入力してください。" }, { status: 400 });
  try {
    await ensureGuestSchema(); const guest = await findGuest(request);
    if (!guest) return NextResponse.json({ error: "ブラウザのCookieを有効にしてください。" }, { status: 401 });
    await db.execute(sql`UPDATE speedrun_guests_v2 SET name = ${name} WHERE id = ${guest.id}`);
    return NextResponse.json({ id: guest.id, name }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "名前を変更できませんでした。再試行してください。" }, { status: 503 }); }
}
