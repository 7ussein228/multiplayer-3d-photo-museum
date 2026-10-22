import { and, eq, gt, ne, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { visitors } from "@/db/schema";
import { SEATS } from "@/components/museum/layout";
import { ACTIVE_VISITOR_WINDOW_MS, authenticateVisitor, getGalleryByCode } from "@/lib/museum";
import type { PresencePayload } from "@/lib/types";

type Context = { params: Promise<{ code: string }> };
const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export async function POST(request: NextRequest, context: Context) {
  const { code } = await context.params;
  const gallery = await getGalleryByCode(code);
  if (!gallery) return NextResponse.json({ error: "Museum not found" }, { status: 404 });
  const body = (await request.json()) as PresencePayload;
  const visitor = await authenticateVisitor(gallery.id, body.token ?? "");
  if (!visitor) return NextResponse.json({ error: "Your visit has expired. Enter again." }, { status: 401 });

  const seated = Boolean(body.seated && body.seatId);
  const seatId = seated ? body.seatId : null;
  if (seated && !SEATS.some((seat) => seat.id === seatId)) {
    return NextResponse.json({ error: "That bench is not in this museum." }, { status: 400 });
  }
  const visited = Array.isArray(body.visited)
    ? [...new Set(body.visited.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 45)
    : visitor.visited;
  const values = {
    x: clamp(finite(body.x), -10.5, 10.5),
    y: clamp(finite(body.y), 0, 2),
    z: clamp(finite(body.z, 19), -30.5, 21),
    yaw: finite(body.yaw),
    seated,
    seatId,
    visited,
    lastSeen: new Date(),
  };

  let updated: typeof visitors.$inferSelect | undefined;
  if (seated && seatId) {
    updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${gallery.id}:${seatId}`}))`);
      const cutoff = new Date(Date.now() - ACTIVE_VISITOR_WINDOW_MS);
      const [occupied] = await tx
        .select({ id: visitors.id })
        .from(visitors)
        .where(
          and(
            eq(visitors.galleryId, gallery.id),
            eq(visitors.seatId, seatId),
            eq(visitors.seated, true),
            ne(visitors.id, visitor.id),
            gt(visitors.lastSeen, cutoff),
          ),
        )
        .limit(1);
      if (occupied) return undefined;
      const [row] = await tx.update(visitors).set(values).where(eq(visitors.id, visitor.id)).returning();
      return row;
    });
    if (!updated) return NextResponse.json({ error: "Someone else just took this seat." }, { status: 409 });
  } else {
    [updated] = await db.update(visitors).set(values).where(eq(visitors.id, visitor.id)).returning();
  }
  return NextResponse.json({ visitor: updated });
}
