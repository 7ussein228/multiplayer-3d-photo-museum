"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { ArrowIcon, CloseIcon, LinkIcon, PlayIcon } from "./museum/Icons";

type PhotoDraft = { id: string; file: File; preview: string };

async function compressPhoto(photo: File) {
  try {
    const bitmap = await createImageBitmap(photo);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return photo;
    context.fillStyle = "#ece9e1";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (!blob) return photo;
    return new File([blob], photo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return photo;
  }
}

export default function GalleryCreator() {
  const [title, setTitle] = useState("The Light We Kept");
  const [curator, setCurator] = useState("");
  const [dedication, setDedication] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const photosRef = useRef<PhotoDraft[]>([]);
  const videoPreviewRef = useRef("");
  const draggedId = useRef<string | null>(null);
  photosRef.current = photos;
  videoPreviewRef.current = videoPreview;

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    if (videoPreviewRef.current) URL.revokeObjectURL(videoPreviewRef.current);
  }, []);

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    const available = 45 - photos.length;
    if (files.length > available) setError(`A museum holds 45 photographs. ${Math.max(0, available)} spaces remain.`);
    const accepted = files.slice(0, Math.max(0, available)).filter((file) => file.type.startsWith("image/") && file.size <= 25 * 1024 * 1024);
    if (accepted.length !== Math.min(files.length, available)) setError("Some files were skipped. Use images smaller than 25 MB each.");
    setPhotos((current) => [
      ...current,
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) })),
    ]);
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((photo) => photo.id !== id);
    });
  };

  const movePhoto = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    setPhotos((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const dropPhoto = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    if (!draggedId.current || draggedId.current === targetId) return;
    setPhotos((current) => {
      const from = current.findIndex((photo) => photo.id === draggedId.current);
      const to = current.findIndex((photo) => photo.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    draggedId.current = null;
  };

  const chooseVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError("");
    if (!file) return;
    if (!file.type.startsWith("video/") || file.size > 45 * 1024 * 1024) {
      setError("Choose a video smaller than 45 MB. MP4 works on most devices.");
      return;
    }
    const preview = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = preview;
    probe.onloadedmetadata = () => {
      if (probe.duration > 180) {
        URL.revokeObjectURL(preview);
        setError("The gallery screen is for short films of three minutes or less.");
        return;
      }
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      setVideo(file);
      setVideoPreview(preview);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(preview);
      setError("This video format could not be read. Try an MP4 file.");
    };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (photos.length < 6) {
      setError(`Add ${6 - photos.length} more ${6 - photos.length === 1 ? "photograph" : "photographs"}. A museum needs at least six.`);
      document.getElementById("photographs")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!curator.trim()) {
      setError("Add your name so guests know who made this collection.");
      return;
    }
    if (!dedication.trim()) {
      setError("Write a few words for the dedication at the entrance.");
      return;
    }
    setBusy(true);
    try {
      setStage("Optimising your photographs for the gallery walls…");
      const compressed = [];
      for (const photo of photos) compressed.push(await compressPhoto(photo.file));
      setStage("Framing the collection and preparing your room…");
      const form = new FormData();
      form.set("title", title);
      form.set("curator", curator);
      form.set("dedication", dedication);
      compressed.forEach((photo) => form.append("photos", photo));
      if (video) form.set("video", video);
      const response = await fetch("/api/galleries", { method: "POST", body: form });
      const data = (await response.json()) as { code?: string; error?: string };
      if (!response.ok || !data.code) throw new Error(data.error ?? "The museum could not be created.");
      setCreatedCode(data.code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The museum could not be created.");
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const copyCreatedInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/museum/${createdCode}`);
    setCopied(true);
  };

  return (
    <main className="creator-page">
      <header className="creator-nav">
        <Link href="/" className="brand-link">STILL <span>PRIVATE MUSEUM</span></Link>
        <Link href="/museum/STILL" className="quiet-link">Visit the demo <ArrowIcon size={15} /></Link>
      </header>
      <div className="creator-intro">
        <p>BUILD YOUR COLLECTION</p>
        <h1>A room for what<br /><em>you remember.</em></h1>
        <span>Choose the photographs. Write the dedication. We will take care of the light.</span>
      </div>
      <form className="creator-form" onSubmit={submit}>
        <section className="creator-section" id="photographs">
          <div className="section-number">01</div>
          <div className="section-content">
            <div className="section-heading"><div><p>THE COLLECTION</p><h2>Your photographs</h2></div><span className={photos.length >= 6 ? "valid" : ""}>{photos.length} / 45 <small>6 minimum</small></span></div>
            <p className="section-description">The first photograph becomes the large centrepiece at the end of the hall. Drag to reorder, or choose a new centrepiece.</p>
            <label className="photo-dropzone">
              <input type="file" accept="image/*" multiple onChange={addPhotos} disabled={photos.length >= 45 || busy} />
              <span className="dropzone-plus">+</span>
              <strong>{photos.length ? "Add more photographs" : "Choose your photographs"}</strong>
              <small>JPG, PNG or WEBP · up to 25 MB each</small>
            </label>
            {photos.length > 0 && (
              <div className="photo-grid">
                {photos.map((photo, index) => (
                  <article
                    key={photo.id}
                    className={`photo-draft ${index === 0 ? "centrepiece-draft" : ""}`}
                    draggable={!busy}
                    onDragStart={() => { draggedId.current = photo.id; }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropPhoto(event, photo.id)}
                  >
                    <img src={photo.preview} alt={photo.file.name} draggable={false} />
                    <div className="photo-draft-top"><span>{index === 0 ? "CENTREPIECE" : String(index + 1).padStart(2, "0")}</span><button type="button" onClick={() => removePhoto(photo.id)} title="Remove"><CloseIcon size={15} /></button></div>
                    <div className="photo-draft-bottom"><p>{photo.file.name}</p><div>
                      <button type="button" onClick={() => movePhoto(index, index - 1)} disabled={index === 0} title="Move earlier"><ArrowIcon left size={14} /></button>
                      <button type="button" onClick={() => movePhoto(index, index + 1)} disabled={index === photos.length - 1} title="Move later"><ArrowIcon size={14} /></button>
                      {index !== 0 && <button type="button" className="make-centre" onClick={() => movePhoto(index, 0)}>Make centrepiece</button>}
                    </div></div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="creator-section">
          <div className="section-number">02</div>
          <div className="section-content">
            <div className="section-heading"><div><p>THE WORDS</p><h2>Name it & dedicate it</h2></div></div>
            <p className="section-description">Your dedication hangs at the entrance and appears in each guest&rsquo;s invitation.</p>
            <div className="field-row">
              <label><span>MUSEUM TITLE</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required placeholder="The Light We Kept" /></label>
              <label><span>YOUR NAME(S)</span><input value={curator} onChange={(event) => setCurator(event.target.value)} maxLength={40} required placeholder="Mara & Elian" /></label>
            </div>
            <label className="dedication-field"><span>THE DEDICATION</span><textarea value={dedication} onChange={(event) => setDedication(event.target.value)} maxLength={500} required placeholder="For the days that asked us to slow down…" rows={5} /><small>{dedication.length} / 500</small></label>
          </div>
        </section>

        <section className="creator-section">
          <div className="section-number">03</div>
          <div className="section-content">
            <div className="section-heading"><div><p>THE MOVING IMAGE</p><h2>Add a short film <em>optional</em></h2></div></div>
            <p className="section-description">It plays on the gallery screen. Anyone in the room can start it, and every guest watches in sync.</p>
            {!video ? (
              <label className="video-dropzone"><input type="file" accept="video/*" onChange={chooseVideo} disabled={busy} /><PlayIcon size={25} /><div><strong>Choose a short film</strong><small>MP4 recommended · 3 minutes maximum · 45 MB</small></div><span>Browse</span></label>
            ) : (
              <div className="video-draft"><video src={videoPreview} controls muted playsInline /><div><p>{video.name}</p><span>{(video.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" onClick={() => { URL.revokeObjectURL(videoPreview); setVideo(null); setVideoPreview(""); }}>Remove film</button></div></div>
            )}
          </div>
        </section>

        <div className="creator-submit">
          <div><span>YOUR MUSEUM INCLUDES</span><p>{photos.length || "6–45"} photographs · walking for four · live conversation{video ? " · one film" : ""}</p></div>
          <button disabled={busy || photos.length < 6}>{busy ? "Building your museum…" : "Open my museum"}<ArrowIcon /></button>
        </div>
        {error && <div className="creator-error" role="alert">{error}</div>}
      </form>

      {(busy || createdCode) && (
        <div className="creator-modal-wrap">
          {busy ? <div className="building-modal"><div className="building-frame"><i /></div><p>PLEASE KEEP THIS WINDOW OPEN</p><h2>{stage}</h2><span>Real rooms take a moment.</span></div> : (
            <div className="created-modal"><p>YOUR DOORS ARE OPEN</p><h2>{title}</h2><span>Your private room code</span><strong>{createdCode}</strong><p className="created-note">Send the invitation to up to three other people. You can each enter from your own phone or computer.</p><div><button onClick={() => void copyCreatedInvite()}><LinkIcon />{copied ? "Invitation copied" : "Copy invitation"}</button><Link href={`/museum/${createdCode}`}>Enter your museum <ArrowIcon /></Link></div></div>
          )}
        </div>
      )}
    </main>
  );
}
