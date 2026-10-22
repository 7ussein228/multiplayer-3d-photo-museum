import { randomBytes } from "node:crypto";
import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { visitors } from "@/db/schema";
import { ACTIVE_VISITOR_WINDOW_MS, getGalleryByCode, VISITOR_COLORS } from "@/lib/museum";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { code } = await context.params;
  const gallery = await getGalleryByCode(code);
  if (!gallery) return NextResponse.json({ error: "Museum not found" }, { status: 404 });
  const body = (await request.json()) as { name?: string; token?: string };
  const name = (body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  if (!name) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });

  // The advisory transaction lock makes the four-person limit hold even when
  // several invitations are opened at exactly the same time.
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${gallery.id}))`);
    const cutoff = new Date(Date.now() - ACTIVE_VISITOR_WINDOW_MS);
    const existing = body.token
      ? (await tx
          .select()
          .from(visitors)
          .where(and(eq(visitors.galleryId, gallery.id), eq(visitors.token, body.token)))
          .limit(1))[0]
      : undefined;

    const occupancyConditions = existing
      ? and(eq(visitors.galleryId, gallery.id), ne(visitors.id, existing.id), gt(visitors.lastSeen, cutoff))
      : and(eq(visitors.galleryId, gallery.id), gt(visitors.lastSeen, cutoff));
    const [occupancy] = await tx.select({ value: count() }).from(visitors).where(occupancyConditions);
    const occupied = occupancy?.value ?? 0;
    if (occupied >= 4) return { full: true as const };

    if (existing) {
      const [visitor] = await tx
        .update(visitors)
        .set({ name, lastSeen: new Date(), seated: false, seatId: null })
        .where(eq(visitors.id, existing.id))
        .returning();
      return { full: false as const, visitor };
    }

    const spawnX = [-1.6, 1.6, -3.2, 3.2][occupied] ?? 0;
    const [visitor] = await tx
      .insert(visitors)
      .values({
        galleryId: gallery.id,
        token: randomBytes(24).toString("hex"),
        name,
        color: VISITOR_COLORS[occupied] ?? VISITOR_COLORS[0],
        x: spawnX,
        z: 19,
        yaw: 0,
      })
      .returning();
    return { full: false as const, visitor };
  });

  if (result.full) {
    return NextResponse.json(
      { error: "This museum is full. Four visitors are already inside." },
      { status: 409 },
    );
  }
  return NextResponse.json({ visitor: result.visitor });
}
