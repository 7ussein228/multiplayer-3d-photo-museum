import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assets } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Invalid media id", { status: 400 });
  const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!asset?.data) return new NextResponse("Media not found", { status: 404 });
  const bytes = Buffer.from(asset.data, "base64");
  const range = request.headers.get("range");
  const commonHeaders = {
    "Content-Type": asset.mimeType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) return new NextResponse("Invalid range", { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    const suffixLength = match[1] ? 0 : Number(match[2]);
    const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - suffixLength);
    const requestedEnd = match[1] && match[2] ? Number(match[2]) : bytes.length - 1;
    const end = Math.min(bytes.length - 1, requestedEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= bytes.length) {
      return new NextResponse("Range not satisfiable", { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    }
    const chunk = bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
      },
    });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: { ...commonHeaders, "Content-Length": String(bytes.byteLength) },
  });
}
