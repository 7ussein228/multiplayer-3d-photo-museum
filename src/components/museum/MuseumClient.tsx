"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MuseumEngine } from "./MuseumEngine";
import type {
  Artwork,
  ChatMessage,
  FilmState,
  GalleryInfo,
  MuseumSnapshot,
  VisitorState,
} from "@/lib/types";
import {
  ArrowIcon,
  ChatIcon,
  CloseIcon,
  ExpandIcon,
  HelpIcon,
  LinkIcon,
  MapIcon,
  PlayIcon,
  SeatIcon,
  UsersIcon,
  VolumeIcon,
} from "./Icons";

type Overlay = "art" | "dedication" | "help" | null;
type LocalSession = { token: string; visitor: VisitorState };

function asVisitor(value: VisitorState): VisitorState {
  return { ...value, visited: Array.isArray(value.visited) ? value.visited : [] };
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.34;
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y);
    if (length > radius) {
      x = (x / length) * radius;
      y = (y / length) * radius;
    }
    setKnob({ x, y });
    onMove(x / radius, -y / radius);
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (active.current !== event.pointerId) return;
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      className="touch-joystick"
      aria-label="Movement joystick"
      onPointerDown={(event) => {
        active.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (active.current === event.pointerId) update(event);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="joystick-ring" />
      <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function MuseumMap({
  visitors,
  localId,
  localPosition,
}: {
  visitors: VisitorState[];
  localId: string;
  localPosition: { x: number; z: number };
}) {
  const pointStyle = (x: number, z: number) => ({
    left: `${((x + 11) / 22) * 100}%`,
    top: `${((21 - z) / 53) * 100}%`,
  });
  return (
    <div className="museum-map" aria-label="Museum floor plan">
      <div className="map-room">
        <span className="map-label map-entrance">ENTRANCE</span>
        <span className="map-label map-centre">CENTREPIECE</span>
        <span className="map-label map-screen">FILM</span>
        <span className="map-screen-line" />
        {[4, -9, -26.5, -20, -24.2].map((z, index) => (
          <i key={`${z}-${index}`} className="map-bench" style={pointStyle(index === 1 ? 4.5 : index > 2 ? -6.3 : 0, z)} />
        ))}
        {visitors.filter((visitor) => visitor.id !== localId).map((visitor) => (
          <span
            key={visitor.id}
            className="map-visitor"
            style={{ ...pointStyle(visitor.x, visitor.z), backgroundColor: visitor.color }}
            title={visitor.name}
          />
        ))}
        <span className="map-local" style={pointStyle(localPosition.x, localPosition.z)} title="You" />
      </div>
      <div className="map-key"><span><i className="you-dot" /> You</span><span><i className="guest-dot" /> Other guests</span></div>
    </div>
  );
}

export default function MuseumClient({ initialGallery }: { initialGallery: GalleryInfo }) {
  const code = initialGallery.code;
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MuseumEngine | null>(null);
  const sessionRef = useRef<LocalSession | null>(null);
  const galleryRef = useRef(initialGallery);
  const visitedRef = useRef<string[]>([]);
  const filmActionRef = useRef<() => void>(() => undefined);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const previousMessageCount = useRef(0);
  const completionNotified = useRef(false);
  const [gallery, setGallery] = useState(initialGallery);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [visitors, setVisitors] = useState<VisitorState[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [name, setName] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [locked, setLocked] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selectedArtwork, setSelectedArtwork] = useState(0);
  const [visited, setVisited] = useState<string[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [unread, setUnread] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  const [muted, setMuted] = useState(true);
  const [toast, setToast] = useState("");
  const [localPosition, setLocalPosition] = useState({ x: 0, z: 19 });
  const [localSeat, setLocalSeat] = useState<string | null>(null);

  galleryRef.current = gallery;
  sessionRef.current = session;
  visitedRef.current = visited;

  useEffect(() => {
    const storedName = window.localStorage.getItem(`still:${code}:name`) ?? "";
    const storedToken = window.localStorage.getItem(`still:${code}:token`) ?? "";
    setName(storedName);
    setSavedToken(storedToken);
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/galleries/${code}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Museum unavailable");
        const snapshot = (await response.json()) as MuseumSnapshot;
        if (cancelled) return;
        setConnected(true);
        setGallery(snapshot.gallery);
        setVisitors(snapshot.visitors);
        setMessages(snapshot.messages);
        engineRef.current?.setVisitors(snapshot.visitors);
        engineRef.current?.setFilm(snapshot.gallery.film, snapshot.serverTime);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    void poll();
    const interval = window.setInterval(poll, 850);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [code]);

  const showToast = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const controlFilm = useCallback(async (requested?: "play" | "pause" | "restart" | "end") => {
    const currentSession = sessionRef.current;
    const film = galleryRef.current.film;
    if (!currentSession || !film.url) return;
    const action = requested ?? (film.playing ? "pause" : "play");
    try {
      const response = await fetch(`/api/galleries/${code}/film`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: currentSession.token,
          action,
          offset: engineRef.current?.getFilmTimecode() ?? film.offset,
        }),
      });
      const data = (await response.json()) as { film?: FilmState; error?: string };
      if (!response.ok || !data.film) throw new Error(data.error ?? "Film control unavailable");
      setGallery((current) => ({ ...current, film: data.film! }));
      engineRef.current?.setFilm(data.film);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Film control unavailable");
    }
  }, [code, showToast]);
  filmActionRef.current = () => void controlFilm();

  useEffect(() => {
    if (!session || !mountRef.current || engineRef.current) return;
    try {
      const engine = new MuseumEngine(mountRef.current, galleryRef.current, session.visitor, {
        onReady: () => setEngineReady(true),
        onPrompt: setPrompt,
        onViewArtwork: (index) => {
          setSelectedArtwork(index);
          setOverlay("art");
          const id = galleryRef.current.artworks[index]?.id;
          if (id) setVisited((current) => current.includes(id) ? current : [...current, id]);
        },
        onViewDedication: () => setOverlay("dedication"),
        onSeatChange: setLocalSeat,
        onFilmRequest: () => filmActionRef.current(),
        onFilmEnded: () => {
          if (galleryRef.current.film.playing) void controlFilm("end");
        },
        onFilmMuteChange: setMuted,
        onOpenChat: () => setChatOpen(true),
        onLockChange: setLocked,
      });
      engineRef.current = engine;
      engine.setVisitors(visitors);
      engine.setFilm(galleryRef.current.film);
    } catch (error) {
      console.error(error);
      setEngineError("This device could not open the 3D gallery. Please enable WebGL or try another browser.");
    }
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // The engine has one lifetime per entered session; network state is pushed into it separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.visitor.id]);

  useEffect(() => {
    engineRef.current?.setPaused(Boolean(overlay) || chatOpen || guestsOpen);
  }, [overlay, chatOpen, guestsOpen, engineReady]);

  useEffect(() => {
    if (!session || !engineReady) return;
    let cancelled = false;
    const sendPresence = async () => {
      const engine = engineRef.current;
      if (!engine) return;
      const position = engine.getPresence();
      setLocalPosition({ x: position.x, z: position.z });
      try {
        const response = await fetch(`/api/galleries/${code}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: session.token, ...position, visited: visitedRef.current }),
        });
        if (response.status === 409) {
          engine.rejectSeat();
          if (!cancelled) showToast("That seat was just taken. Choose another bench.");
        } else if (response.status === 401 && !cancelled) {
          setSession(null);
          setEngineReady(false);
          setJoinError("Your visit expired. Please enter again.");
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    void sendPresence();
    const interval = window.setInterval(sendPresence, 280);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session, engineReady, code, showToast]);

  useEffect(() => {
    if (chatOpen) {
      setUnread(0);
      requestAnimationFrame(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight }));
    } else if (messages.length > previousMessageCount.current && previousMessageCount.current > 0) {
      setUnread((count) => count + messages.length - previousMessageCount.current);
    }
    previousMessageCount.current = messages.length;
  }, [messages, chatOpen]);

  const viewedCount = gallery.artworks.filter((artwork) => visited.includes(artwork.id)).length;
  useEffect(() => {
    if (viewedCount === gallery.artworks.length && viewedCount > 0 && !completionNotified.current) {
      completionNotified.current = true;
      showToast("Collection complete — you have spent time with every memory.");
    }
  }, [viewedCount, gallery.artworks.length, showToast]);

  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setJoinError("Tell us your name before entering.");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const response = await fetch(`/api/galleries/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, token: savedToken || undefined }),
      });
      const data = (await response.json()) as { visitor?: VisitorState & { token: string }; error?: string };
      if (!response.ok || !data.visitor) throw new Error(data.error ?? "Could not enter the museum");
      const local: LocalSession = { token: data.visitor.token, visitor: asVisitor(data.visitor) };
      window.localStorage.setItem(`still:${code}:name`, local.visitor.name);
      window.localStorage.setItem(`still:${code}:token`, local.token);
      setSavedToken(local.token);
      setVisited(local.visitor.visited);
      setLocalPosition({ x: local.visitor.x, z: local.visitor.z });
      setSession(local);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Could not enter the museum");
    } finally {
      setJoining(false);
    }
  };

  const leave = async () => {
    const current = sessionRef.current;
    if (current) {
      void fetch(`/api/galleries/${code}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: current.token }),
      });
    }
    engineRef.current?.dispose();
    engineRef.current = null;
    setSession(null);
    setEngineReady(false);
    setGuestsOpen(false);
    setChatOpen(false);
    setOverlay(null);
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const current = sessionRef.current;
    const body = chatText.trim();
    if (!current || !body || sendingChat) return;
    setSendingChat(true);
    try {
      const response = await fetch(`/api/galleries/${code}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: current.token, body }),
      });
      const data = (await response.json()) as { message?: ChatMessage; error?: string };
      if (!response.ok || !data.message) throw new Error(data.error ?? "Message not sent");
      setMessages((currentMessages) => [...currentMessages.slice(-49), data.message!]);
      setChatText("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Message not sent");
    } finally {
      setSendingChat(false);
    }
  };

  const selectArtwork = (index: number) => {
    const normalized = (index + gallery.artworks.length) % gallery.artworks.length;
    setSelectedArtwork(normalized);
    const id = gallery.artworks[normalized]?.id;
    if (id) setVisited((current) => current.includes(id) ? current : [...current, id]);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Invitation copied. Send it to up to three other guests.");
    } catch {
      showToast(`Your museum code is ${code}`);
    }
  };

  const selected: Artwork | undefined = gallery.artworks[selectedArtwork];
  const otherVisitors = visitors.filter((visitor) => visitor.id !== session?.visitor.id);

  return (
    <main className="museum-shell">
      <div ref={mountRef} className="museum-stage" />
      <div className="museum-vignette" />

      {session && (
        <>
          <header className="museum-topbar">
            <div className="museum-wordmark"><span>STILL</span><i /></div>
            <div className="museum-heading">
              <strong>{gallery.title}</strong>
              <button onClick={copyInvite} title="Copy invitation">ROOM {code} <LinkIcon size={13} /></button>
            </div>
            <div className="museum-top-actions">
              <span className={`connection-dot ${connected ? "online" : "offline"}`} title={connected ? "Connected" : "Reconnecting"} />
              <button className="hud-button collection-count" onClick={() => setOverlay("help")}>
                <span>{viewedCount}/{gallery.artworks.length}</span><small>VIEWED</small>
              </button>
              <button className={`hud-button ${mapOpen ? "active" : ""}`} onClick={() => setMapOpen((open) => !open)} title="Museum map"><MapIcon /></button>
              <button className={`hud-button ${guestsOpen ? "active" : ""}`} onClick={() => setGuestsOpen((open) => !open)} title="Guests"><UsersIcon /><span>{visitors.length}/4</span></button>
              <button className="hud-button" onClick={() => setOverlay("help")} title="Controls"><HelpIcon /></button>
              <button className="hud-button desktop-action" onClick={() => void document.documentElement.requestFullscreen?.()} title="Fullscreen"><ExpandIcon /></button>
            </div>
          </header>

          {!engineReady && !engineError && <div className="scene-loading"><span /> Preparing the light…</div>}
          {engineError && <div className="engine-error">{engineError}</div>}
          {!locked && engineReady && !overlay && !chatOpen && <div className="look-hint desktop-only">Click the hall to look around</div>}
          <div className="crosshair"><i /><i /></div>

          {mapOpen && (
            <aside className="museum-card map-card">
              <div className="card-eyebrow">FLOOR PLAN <button onClick={() => setMapOpen(false)}><CloseIcon size={15} /></button></div>
              <MuseumMap visitors={visitors} localId={session.visitor.id} localPosition={localPosition} />
            </aside>
          )}

          {guestsOpen && (
            <aside className="museum-card guests-card">
              <div className="card-eyebrow">IN THE MUSEUM <button onClick={() => setGuestsOpen(false)}><CloseIcon size={15} /></button></div>
              <div className="guest-list">
                {visitors.map((visitor) => (
                  <div className="guest-row" key={visitor.id}>
                    <i style={{ background: visitor.color }} />
                    <div><strong>{visitor.name}{visitor.id === session.visitor.id ? " (you)" : ""}</strong><span>{visitor.seated ? "Sitting with the collection" : `${visitor.visited.length} works viewed`}</span></div>
                    {visitor.seated && <SeatIcon size={16} />}
                  </div>
                ))}
                {visitors.length === 0 && <p>The hall is quiet.</p>}
              </div>
              <button className="text-button" onClick={copyInvite}><LinkIcon size={15} /> Invite someone</button>
              <button className="text-button muted" onClick={() => void leave()}>Leave museum</button>
            </aside>
          )}

          <div className="museum-bottom-left">
            <button className={`chat-toggle ${chatOpen ? "active" : ""}`} onClick={() => setChatOpen((open) => !open)}>
              <ChatIcon /> <span>Conversation</span><kbd>C</kbd>{unread > 0 && <b>{unread}</b>}
            </button>
            {chatOpen && (
              <section className="chat-panel">
                <div className="chat-heading"><span>A QUIET CONVERSATION</span><button onClick={() => setChatOpen(false)}><CloseIcon size={16} /></button></div>
                <div className="chat-messages" ref={chatScrollRef}>
                  {messages.length === 0 && <p className="chat-empty">No one has spoken yet. Share a thought about what you see.</p>}
                  {messages.map((message) => (
                    <div className="chat-message" key={message.id}>
                      <strong>{message.name}</strong><p>{message.body}</p>
                      <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                  ))}
                </div>
                <form className="chat-form" onSubmit={sendChat}>
                  <input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={180} placeholder="Write to the room…" autoFocus />
                  <button disabled={!chatText.trim() || sendingChat}>Send</button>
                </form>
              </section>
            )}
          </div>

          {gallery.film.url && (
            <div className="film-controls">
              <button onClick={() => void controlFilm()} title={gallery.film.playing ? "Pause film" : "Play film"}><PlayIcon pause={gallery.film.playing} /></button>
              <div><strong>GALLERY FILM</strong><span>{gallery.film.playing ? "Playing in the screening room" : "Paused"} · F near screen</span></div>
              <button onClick={() => {
                const next = !muted;
                setMuted(next);
                engineRef.current?.setFilmMuted(next);
              }} title={muted ? "Unmute film" : "Mute film"}><VolumeIcon muted={muted} /></button>
            </div>
          )}

          <div className={`interaction-prompt ${prompt ? "visible" : ""}`}>
            <span>{prompt || ""}</span>
            <button onClick={() => engineRef.current?.interact()} aria-label="Interact"><ArrowIcon /></button>
          </div>
          <div className="desktop-controls">WASD <span>walk</span> · MOUSE <span>look</span> · E <span>interact</span> · SHIFT <span>faster</span></div>
          <div className="touch-controls">
            <Joystick onMove={(x, y) => engineRef.current?.setMobileMove(x, y)} />
            <div className="touch-look-label">DRAG TO LOOK</div>
            <button className="touch-interact" onClick={() => engineRef.current?.interact()}>E<small>ACTION</small></button>
          </div>
          {localSeat && <div className="seated-indicator"><SeatIcon size={15} /> Seated · move or press E to stand</div>}
        </>
      )}

      {!session && (
        <div className="entry-overlay">
          <section className="entry-panel">
            <div className="entry-brand">STILL <span>PRIVATE MUSEUM</span></div>
            <p className="entry-kicker">YOU ARE INVITED TO</p>
            <h1>{gallery.title}</h1>
            <p className="entry-curator">A collection by {gallery.curator}</p>
            <blockquote>“{gallery.dedication}”</blockquote>
            <div className="entry-details">
              <span>{gallery.artworks.length} photographs</span><i />
              <span>{gallery.film.url ? "A gallery film" : "A quiet collection"}</span><i />
              <span>Up to 4 guests</span>
            </div>
            <form onSubmit={join} className="join-form">
              <label htmlFor="visitor-name">YOUR NAME</label>
              <div><input id="visitor-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="How should guests know you?" autoComplete="nickname" /><button disabled={joining}>{joining ? "Opening…" : savedToken ? "Return to the museum" : "Enter the museum"}<ArrowIcon /></button></div>
              {joinError && <p className="form-error">{joinError}</p>}
            </form>
            <div className="entry-footer"><span className={`connection-dot ${connected ? "online" : "offline"}`} />{visitors.length ? `${visitors.map((visitor) => visitor.name).join(", ")} ${visitors.length === 1 ? "is" : "are"} inside` : "The museum is open"}<button onClick={copyInvite}>Share room {code}</button></div>
          </section>
        </div>
      )}

      {overlay === "art" && selected && (
        <div className="artwork-overlay" role="dialog" aria-modal="true" aria-label={selected.title}>
          <button className="overlay-close" onClick={() => setOverlay(null)}><CloseIcon /><span>Return to the hall</span></button>
          <div className="artwork-view">
            <div className="artwork-image-wrap"><img src={selected.url} alt={selected.title} /></div>
            <div className="artwork-caption"><span>{selected.position === 0 ? "THE CENTREPIECE" : `MEMORY ${String(selected.position + 1).padStart(2, "0")}`}</span><h2>{selected.title}</h2><p>From {gallery.curator}&rsquo;s private collection</p></div>
          </div>
          <div className="artwork-navigation">
            <button onClick={() => selectArtwork(selectedArtwork - 1)}><ArrowIcon left /> Previous</button>
            <span>{selectedArtwork + 1} <i /> {gallery.artworks.length}</span>
            <button onClick={() => selectArtwork(selectedArtwork + 1)}>Next <ArrowIcon /></button>
          </div>
        </div>
      )}

      {overlay === "dedication" && (
        <div className="simple-overlay" role="dialog" aria-modal="true">
          <section className="dedication-card">
            <button className="overlay-close" onClick={() => setOverlay(null)}><CloseIcon /></button>
            <p>A DEDICATION</p><h2>For you, from {gallery.curator}</h2><blockquote>{gallery.dedication}</blockquote><span>{gallery.title} · Room {code}</span>
          </section>
        </div>
      )}

      {overlay === "help" && (
        <div className="simple-overlay" role="dialog" aria-modal="true">
          <section className="help-card">
            <button className="overlay-close" onClick={() => setOverlay(null)}><CloseIcon /></button>
            <p className="card-eyebrow">HOW TO BE HERE</p><h2>Take your time.</h2>
            <div className="help-grid">
              <div><kbd>W A S D</kbd><span>Walk the halls</span></div><div><kbd>MOUSE</kbd><span>Look around</span></div>
              <div><kbd>E</kbd><span>View, sit, stand</span></div><div><kbd>F</kbd><span>Film near the screen</span></div>
              <div><kbd>C</kbd><span>Open conversation</span></div><div><kbd>M</kbd><span>Toggle film sound</span></div>
            </div>
            <p className="help-note">On a phone, use the left circle to walk and drag the hall to look. The first photograph always hangs as the centrepiece at the far end.</p>
            <div className="collection-progress"><span style={{ width: `${(viewedCount / gallery.artworks.length) * 100}%` }} /></div>
            <small>{viewedCount} of {gallery.artworks.length} works viewed · {otherVisitors.length} other {otherVisitors.length === 1 ? "guest" : "guests"} inside</small>
          </section>
        </div>
      )}

      {toast && <div className="museum-toast">{toast}</div>}
    </main>
  );
}
