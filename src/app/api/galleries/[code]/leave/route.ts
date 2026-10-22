import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { visitors } from "@/db/schema";
import { authenticateVisitor, getGalleryByCode } from "@/lib/museum";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const gallery = await getGalleryByCode(code);
  if (!gallery) return NextResponse.json({ error: "Museum not found" }, { status: 404 });
  const body = (await request.json()) as { token?: string };
  const visitor = await authenticateVisitor(gallery.id, body.token ?? "");
  if (!visitor) return NextResponse.json({ ok: true });
  await db
    .update(visitors)
    .set({ lastSeen: new Date(0), seated: false, seatId: null })
    .where(eq(visitors.id, visitor.id));
  return NextResponse.json({ ok: true });
}
