import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, galleries } from "@/db/schema";

export const DEMO_CODE = "STILL";

const demoPhotographs = [
  ["Where the light begins", "https://images.pexels.com/photos/10803085/pexels-photo-10803085.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["A box of yesterdays", "https://images.pexels.com/photos/36510987/pexels-photo-36510987.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["Blue hour, open country", "https://images.pexels.com/photos/35922284/pexels-photo-35922284.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["The long way home", "https://images.pexels.com/photos/5970067/pexels-photo-5970067.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["A quiet arrangement", "https://images.pexels.com/photos/26836745/pexels-photo-26836745.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["Walking with June", "https://images.pexels.com/photos/40100087/pexels-photo-40100087.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["The lake at five", "https://images.pexels.com/photos/26836746/pexels-photo-26836746.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["Before anyone woke", "https://images.pexels.com/photos/16734873/pexels-photo-16734873.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["Last light through glass", "https://images.pexels.com/photos/7525562/pexels-photo-7525562.jpeg?auto=compress&cs=tinysrgb&w=1400"],
  ["East Java, in spring", "https://images.pexels.com/photos/35922308/pexels-photo-35922308.jpeg?auto=compress&cs=tinysrgb&w=1400"],
] as const;

export async function ensureDemoGallery() {
  await db
    .insert(galleries)
    .values({
      code: DEMO_CODE,
      title: "The Light We Kept",
      curator: "Mara & Elian",
      dedication:
        "For the days that asked us to slow down. For every small light that found us, and for everyone who walks through these memories with us.",
    })
    .onConflictDoNothing();

  const [gallery] = await db.select().from(galleries).where(eq(galleries.code, DEMO_CODE)).limit(1);
  if (!gallery) throw new Error("Unable to prepare the demonstration gallery");

  const existing = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.galleryId, gallery.id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(assets).values([
      ...demoPhotographs.map(([title, externalUrl], position) => ({
        galleryId: gallery.id,
        kind: "photo",
        position,
        title,
        mimeType: "image/jpeg",
        externalUrl,
      })),
      {
        galleryId: gallery.id,
        kind: "video",
        position: 0,
        title: "Tide / a sixteen second study",
        mimeType: "video/mp4",
        externalUrl:
          "https://videos.pexels.com/video-files/9722412/9722412-uhd_4096_1742_25fps.mp4",
      },
    ]);
  }

  return gallery;
}

export async function listGalleryAssets(galleryId: string) {
  return db.select().from(assets).where(eq(assets.galleryId, galleryId)).orderBy(asc(assets.position));
}
