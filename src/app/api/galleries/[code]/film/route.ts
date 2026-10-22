import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assets, galleries } from "@/db/schema";
import { authenticateVisitor, getGalleryByCode, getGalleryInfo } from "@/lib/museum";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { code } = await context.params;
  const gallery = await getGalleryByCode(code);
  if (!gallery) return NextResponse.json({ error: "Museum not found" }, { status: 404 });
  const body = (await request.json()) as { token?: string; action?: string; offset?: number };
  const visitor = await authenticateVisitor(gallery.id, body.token ?? "");
  if (!visitor) return NextResponse.json({ error: "Your visit has expired." }, { status: 401 });
  const [film] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.galleryId, gallery.id), eq(assets.kind, "video")))
    .limit(1);
  if (!film) return NextResponse.json({ error: "There is no film in this museum." }, { status: 404 });

  const action = body.action;
  const suppliedOffset = Number.isFinite(body.offset) ? Math.max(0, Number(body.offset)) : gallery.filmOffset;
  const playing = action === "play" || action === "restart";
  const offset = action === "restart" ? 0 : suppliedOffset;
  if (!["play", "pause", "restart", "end"].includes(action ?? "")) {
    return NextResponse.json({ error: "Unknown film action." }, { status: 400 });
  }
  await db
    .update(galleries)
    .set({
      filmPlaying: playing,
      filmStartedAt: playing ? new Date() : null,
      filmOffset: action === "end" ? 0 : offset,
      filmRevision: gallery.filmRevision + 1,
    })
    .where(eq(galleries.id, gallery.id));
  const updated = await getGalleryInfo(gallery.id);
  return NextResponse.json({ film: updated?.film });
}
