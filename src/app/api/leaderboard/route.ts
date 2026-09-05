import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { scores } from "@/db/schema";
import { db } from "@/lib/db";

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
  try {
    const body = await request.json() as { name?: unknown; timeMs?: unknown; input?: unknown };
    const name = typeof body.name === "string"
      ? body.name.normalize("NFKC").replace(/[^\p{L}\p{N}_\- ]/gu, "").trim().slice(0, 16)
      : "";
    const timeMs = typeof body.timeMs === "number" ? Math.round(body.timeMs) : 0;
    const input = body.input === "gamepad" ? "gamepad" : "keyboard";
    if (!name || timeMs < 1_000 || timeMs > 3_600_000) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400, headers });
    }
    await db.insert(scores).values({ playerName: name, timeMs, inputType: input });
    return NextResponse.json({ ok: true }, { status: 201, headers });
  } catch (error) {
    console.error("leaderboard.post", error);
    return NextResponse.json({ error: "Score service unavailable" }, { status: 503, headers });
  }
}
