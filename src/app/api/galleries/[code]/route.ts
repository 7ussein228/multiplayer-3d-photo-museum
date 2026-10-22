import { NextRequest, NextResponse } from "next/server";
import { DEMO_CODE, ensureDemoGallery } from "@/lib/demo";
import { getGalleryByCode, getMuseumSnapshot, removeStaleVisitors } from "@/lib/museum";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { code: rawCode } = await context.params;
  const code = rawCode.toUpperCase();
  if (code === DEMO_CODE) await ensureDemoGallery();
  const gallery = await getGalleryByCode(code);
  if (!gallery) return NextResponse.json({ error: "Museum not found" }, { status: 404 });
  await removeStaleVisitors(gallery.id);
  const snapshot = await getMuseumSnapshot(gallery.id);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
