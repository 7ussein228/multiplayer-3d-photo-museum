import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, galleries } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PHOTOS = 45;
const MIN_PHOTOS = 6;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;

function cleanText(value: FormDataEntryValue | null, fallback: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, max);
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomBytes(5).toString("base64url").replace(/[-_]/g, "A").slice(0, 6).toUpperCase();
    try {
      const [created] = await db
        .insert(galleries)
        .values({ code, title: "Untitled", curator: "Curator", dedication: "" })
        .returning();
      return created;
    } catch {
      // A rare code collision simply causes another attempt.
    }
  }
  throw new Error("Could not reserve a gallery code");
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const photos = form.getAll("photos").filter((entry): entry is File => entry instanceof File);
    const videoEntry = form.get("video");
    const video = videoEntry instanceof File && videoEntry.size > 0 ? videoEntry : null;

    if (photos.length < MIN_PHOTOS || photos.length > MAX_PHOTOS) {
      return NextResponse.json({ error: `Choose between ${MIN_PHOTOS} and ${MAX_PHOTOS} photographs.` }, { status: 400 });
    }
    if (photos.some((photo) => !photo.type.startsWith("image/") || photo.size > MAX_PHOTO_BYTES)) {
      return NextResponse.json({ error: "Each photograph must be an image smaller than 10 MB." }, { status: 400 });
    }
    if (video && (!video.type.startsWith("video/") || video.size > MAX_VIDEO_BYTES)) {
      return NextResponse.json({ error: "The film must be a video smaller than 45 MB." }, { status: 400 });
    }

    const title = cleanText(form.get("title"), "Our Quiet Museum", 80);
    const curator = cleanText(form.get("curator"), "The curator", 40);
    const dedication = cleanText(form.get("dedication"), "For the moments we never want to forget.", 500);
    const gallery = await uniqueCode();

    await db
      .update(galleries)
      .set({ title, curator, dedication })
      .where(eq(galleries.id, gallery.id));

    const rows = [];
    for (let position = 0; position < photos.length; position += 1) {
      const photo = photos[position];
      const buffer = Buffer.from(await photo.arrayBuffer());
      rows.push({
        galleryId: gallery.id,
        kind: "photo",
        position,
        title: photo.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 90) || `Memory ${position + 1}`,
        mimeType: photo.type || "image/jpeg",
        data: buffer.toString("base64"),
      });
    }
    if (video) {
      const buffer = Buffer.from(await video.arrayBuffer());
      rows.push({
        galleryId: gallery.id,
        kind: "video",
        position: 0,
        title: video.name.replace(/\.[^.]+$/, "").slice(0, 90) || "Our film",
        mimeType: video.type || "video/mp4",
        data: buffer.toString("base64"),
      });
    }
    await db.insert(assets).values(rows);

    return NextResponse.json({ code: gallery.code, url: `/museum/${gallery.code}` });
  } catch (error) {
    console.error("Gallery creation failed", error);
    return NextResponse.json({ error: "The museum could not be prepared. Try smaller files or fewer at once." }, { status: 500 });
  }
}
