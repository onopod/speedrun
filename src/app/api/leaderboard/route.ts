import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { scores } from "@/db/schema";
import { db } from "@/lib/db";
import { parseScore } from "@/lib/game-rules";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const rows = await db.select({
      id: scores.id,
      name: scores.playerName,
      timeMs: scores.timeMs,
      input: scores.inputType,
    }).from(scores).orderBy(asc(scores.timeMs), asc(scores.createdAt)).limit(10);
    return NextResponse.json(rows, { headers });
  } catch (error) {
    console.error("leaderboard.get", error);
    return NextResponse.json([], { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers }); }
  const score = parseScore(body);
  if (!score) return NextResponse.json({ error: "Invalid score" }, { status: 400, headers });
  try {
    await db.insert(scores).values(score);
    return NextResponse.json({ ok: true }, { status: 201, headers });
  } catch (error) {
    console.error("leaderboard.post", error);
    return NextResponse.json({ error: "Score service unavailable" }, { status: 503, headers });
  }
}
