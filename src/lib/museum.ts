import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { assets, galleries, messages, visitors } from "@/db/schema";
import type { GalleryInfo, MuseumSnapshot } from "./types";

export const VISITOR_COLORS = ["#d7a84b", "#7ea8a2", "#c98174", "#8794bd"];
export const ACTIVE_VISITOR_WINDOW_MS = 15_000;

export async function getGalleryByCode(code: string) {
  const normalized = code.trim().toUpperCase();
  const [gallery] = await db.select().from(galleries).where(eq(galleries.code, normalized)).limit(1);
  return gallery ?? null;
}

export async function getGalleryInfo(galleryId: string): Promise<GalleryInfo | null> {
  const [gallery] = await db.select().from(galleries).where(eq(galleries.id, galleryId)).limit(1);
  if (!gallery) return null;
  const media = await db
    .select({
      id: assets.id,
      kind: assets.kind,
      position: assets.position,
      title: assets.title,
      externalUrl: assets.externalUrl,
    })
    .from(assets)
    .where(eq(assets.galleryId, galleryId))
    .orderBy(assets.position);

  const photos = media
    .filter((asset) => asset.kind === "photo")
    .sort((a, b) => a.position - b.position)
    .map((asset) => ({
      id: asset.id,
      title: asset.title,
      position: asset.position,
      url: asset.externalUrl ?? `/api/media/${asset.id}`,
    }));
  const film = media.find((asset) => asset.kind === "video");

  return {
    code: gallery.code,
    title: gallery.title,
    curator: gallery.curator,
    dedication: gallery.dedication,
    createdAt: gallery.createdAt.toISOString(),
    artworks: photos,
    film: {
      playing: gallery.filmPlaying,
      startedAt: gallery.filmStartedAt?.toISOString() ?? null,
      offset: gallery.filmOffset,
      revision: gallery.filmRevision,
      url: film ? film.externalUrl ?? `/api/media/${film.id}` : null,
    },
  };
}

export async function getMuseumSnapshot(galleryId: string): Promise<MuseumSnapshot | null> {
  const gallery = await getGalleryInfo(galleryId);
  if (!gallery) return null;
  const cutoff = new Date(Date.now() - ACTIVE_VISITOR_WINDOW_MS);
  const [present, recentMessages] = await Promise.all([
    db
      .select()
      .from(visitors)
      .where(and(eq(visitors.galleryId, galleryId), gt(visitors.lastSeen, cutoff)))
      .orderBy(visitors.createdAt),
    db
      .select({
        id: messages.id,
        name: messages.name,
        body: messages.body,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.galleryId, galleryId))
      .orderBy(desc(messages.createdAt))
      .limit(50),
  ]);

  return {
    gallery,
    visitors: present.map((visitor) => ({
      id: visitor.id,
      name: visitor.name,
      color: visitor.color,
      x: visitor.x,
      y: visitor.y,
      z: visitor.z,
      yaw: visitor.yaw,
      seated: visitor.seated,
      seatId: visitor.seatId,
      visited: visitor.visited,
    })),
    messages: recentMessages
      .reverse()
      .map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
    serverTime: new Date().toISOString(),
  };
}

export async function authenticateVisitor(galleryId: string, token: string) {
  const [visitor] = await db
    .select()
    .from(visitors)
    .where(and(eq(visitors.galleryId, galleryId), eq(visitors.token, token)))
    .limit(1);
  return visitor ?? null;
}

export async function removeStaleVisitors(galleryId: string) {
  await db
    .update(visitors)
    .set({ seated: false, seatId: null })
    .where(
      and(
        eq(visitors.galleryId, galleryId),
        sql`${visitors.lastSeen} < now() - interval '20 seconds'`,
      ),
    );
}
