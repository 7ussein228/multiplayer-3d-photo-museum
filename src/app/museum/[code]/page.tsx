import { notFound } from "next/navigation";
import MuseumClient from "@/components/museum/MuseumClient";
import { DEMO_CODE, ensureDemoGallery } from "@/lib/demo";
import { getGalleryByCode, getGalleryInfo } from "@/lib/museum";

export const dynamic = "force-dynamic";

export default async function MuseumPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (code === DEMO_CODE) await ensureDemoGallery();
  const gallery = await getGalleryByCode(code);
  if (!gallery) notFound();
  const info = await getGalleryInfo(gallery.id);
  if (!info || info.artworks.length < 1) notFound();
  return <MuseumClient initialGallery={info} />;
}
