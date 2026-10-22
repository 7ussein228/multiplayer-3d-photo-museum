import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { messages, visitors } from "@/db/schema";
import { authenticateVisitor, getGalleryByCode } from "@/lib/museum";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { code } = await context.params;
  const gallery = await getGalleryByCode(code);
  if (!gallery) return NextResponse.json({ error: "Museum not found" }, { status: 404 });
  const body = (await request.json()) as { token?: string; body?: string };
  const visitor = await authenticateVisitor(gallery.id, body.token ?? "");
  if (!visitor) return NextResponse.json({ error: "Your visit has expired." }, { status: 401 });
  const text = (body.body ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
  if (!text) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  const [message] = await db
    .insert(messages)
    .values({ galleryId: gallery.id, visitorId: visitor.id, name: visitor.name, body: text })
    .returning();
  await db.update(visitors).set({ lastSeen: new Date() }).where(eq(visitors.id, visitor.id));
  return NextResponse.json({
    message: { id: message.id, name: message.name, body: message.body, createdAt: message.createdAt.toISOString() },
  });
}
