"use client";

import * as THREE from "three";
import type { FilmState, GalleryInfo, VisitorState } from "@/lib/types";
import {
  BENCHES,
  DEDICATION_POSITION,
  FILM_POSITION,
  getArtworkPlacements,
  ROOM_BOUNDS,
  SEATS,
  type Seat,
} from "./layout";

type EngineCallbacks = {
  onReady: () => void;
  onPrompt: (prompt: string) => void;
  onViewArtwork: (index: number) => void;
  onViewDedication: () => void;
  onSeatChange: (seatId: string | null) => void;
  onFilmRequest: () => void;
  onFilmEnded: () => void;
  onFilmMuteChange: (muted: boolean) => void;
  onOpenChat: () => void;
  onLockChange: (locked: boolean) => void;
};

type FrameParts = {
  group: THREE.Group;
  image: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  mat: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  backing: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  bars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[];
  label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  lamp: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  centrepiece: boolean;
};

type Avatar = {
  group: THREE.Group;
  target: VisitorState;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  phase: number;
  lastX: number;
  lastZ: number;
};

type Interaction =
  | { type: "art"; index: number }
  | { type: "bench"; seat: Seat }
  | { type: "film" }
  | { type: "dedication" }
  | { type: "stand" }
  | null;

const tempVector = new THREE.Vector3();

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function makeNameSprite(name: string, color: string) {
  const texture = canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = "rgba(19, 20, 18, .86)";
    ctx.beginPath();
    ctx.roundRect(40, 24, 432, 76, 38);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(78, 62, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f7f3e9";
    ctx.font = "500 34px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 20), 278, 62, 350);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.9, 0.475, 1);
  sprite.position.y = 2.12;
  return sprite;
}

export class MuseumEngine {
  private readonly container: HTMLElement;
  private readonly gallery: GalleryInfo;
  private readonly localVisitorId: string;
  private readonly callbacks: EngineCallbacks;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(67, 1, 0.06, 130);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly keys = new Set<string>();
  private readonly mobileMove = new THREE.Vector2();
  private readonly velocity = new THREE.Vector3();
  private readonly avatars = new Map<string, Avatar>();
    private animationFrame = 0;
  private lastTime = performance.now();
  private elapsed = 0;
  private yaw = 0;
  private pitch = 0;
  private seatedSeat: Seat | null = null;
  private paused = false;
  private disposed = false;
  private interaction: Interaction = null;
  private prompt = "";
  private touchPointer: number | null = null;
  private touchX = 0;
  private touchY = 0;
  private video: HTMLVideoElement | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private filmMaterial: THREE.MeshBasicMaterial | null = null;
  private filmState: FilmState;
  private filmRevision = -1;
  private clockSkew = 0;
  private filmEndNotified = false;

  constructor(
    container: HTMLElement,
    gallery: GalleryInfo,
    localVisitor: VisitorState,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.gallery = gallery;
    this.localVisitorId = localVisitor.id;
    this.callbacks = callbacks;
    this.filmState = gallery.film;
    this.camera.position.set(localVisitor.x, 1.65, localVisitor.z);
    this.yaw = localVisitor.yaw;
    this.scene.background = new THREE.Color("#171a18");
    this.scene.fog = new THREE.FogExp2("#242721", 0.012);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.matchMedia("(pointer: coarse)").matches ? 1.4 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "museum-canvas";
    this.renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional museum");
    this.container.appendChild(this.renderer.domElement);

    this.buildRoom();
    this.buildArtworks();
    this.buildBenches();
    this.buildDedication();
    this.buildFilmScreen();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
    queueMicrotask(() => {
      if (!this.disposed) this.callbacks.onReady();
    });
  }

  private buildRoom() {
    const floorMap = canvasTexture(512, 512, (ctx) => {
      ctx.fillStyle = "#aaa99f";
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2400; i += 1) {
        const shade = 145 + Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgba(${shade},${shade},${shade - 5},.08)`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
      ctx.strokeStyle = "rgba(66,68,62,.28)";
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, 510, 510);
      ctx.beginPath();
      ctx.moveTo(256, 0);
      ctx.lineTo(256, 512);
      ctx.moveTo(0, 256);
      ctx.lineTo(512, 256);
      ctx.stroke();
    });
    floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
    floorMap.repeat.set(6, 15);
    floorMap.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(22.4, 54),
      new THREE.MeshStandardMaterial({ map: floorMap, color: "#c5c2b7", roughness: 0.56, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -4.5);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const plaster = new THREE.MeshStandardMaterial({ color: "#d7d3c7", roughness: 0.94 });
    const darkWood = new THREE.MeshStandardMaterial({ color: "#282923", roughness: 0.68 });
    const addBox = (size: [number, number, number], position: [number, number, number], material = plaster) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    addBox([0.42, 6.6, 54], [-11.2, 3.25, -4.5]);
    addBox([0.42, 6.6, 54], [11.2, 3.25, -4.5]);
    addBox([22.8, 6.6, 0.42], [0, 3.25, -31.4]);
    addBox([22.8, 6.6, 0.42], [0, 3.25, 22.15]);
    addBox([22.4, 0.25, 54], [0, 6.48, -4.5], new THREE.MeshStandardMaterial({ color: "#c8c5bb", roughness: 1 }));
    addBox([0.16, 0.34, 53.5], [-10.93, 0.17, -4.5], darkWood);
    addBox([0.16, 0.34, 53.5], [10.93, 0.17, -4.5], darkWood);
    addBox([21.8, 0.34, 0.16], [0, 0.17, -31.13], darkWood);
    addBox([21.8, 0.34, 0.16], [0, 0.17, 21.87], darkWood);

    const stone = new THREE.MeshStandardMaterial({ color: "#bcb9ae", roughness: 0.78 });
    for (const x of [-9.7, 9.7]) {
      for (const z of [14, 6, -2, -10, -18, -27]) {
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 5.65, 16), stone);
        column.position.set(x, 2.86, z);
        column.castShadow = true;
        column.receiveShadow = true;
        this.scene.add(column);
        addBox([0.74, 0.18, 0.74], [x, 0.11, z], stone);
        addBox([0.68, 0.2, 0.68], [x, 5.72, z], stone);
      }
    }
    for (let z = 18; z >= -29; z -= 7.8) {
      addBox([21.7, 0.24, 0.24], [0, 6.15, z], darkWood);
      for (const x of [-5.4, 0, 5.4]) {
        const lamp = new THREE.Mesh(
          new THREE.CylinderGeometry(0.19, 0.28, 0.09, 20),
          new THREE.MeshStandardMaterial({ color: "#fff4d5", emissive: "#ffe5aa", emissiveIntensity: 2.2 }),
        );
        lamp.position.set(x, 6.29, z - 2.4);
        this.scene.add(lamp);
      }
    }

    this.scene.add(new THREE.HemisphereLight("#fff6df", "#4a4c43", 1.55));
    const sunlight = new THREE.DirectionalLight("#fff0d2", 2.0);
    sunlight.position.set(4, 11, 13);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -15;
    sunlight.shadow.camera.right = 15;
    sunlight.shadow.camera.top = 20;
    sunlight.shadow.camera.bottom = -25;
    sunlight.shadow.bias = -0.0003;
    this.scene.add(sunlight);
    for (const z of [14, 0, -14, -26]) {
      const light = new THREE.PointLight("#ffe6b5", 16, 15, 2);
      light.position.set(z % 2 === 0 ? -3 : 3, 5.7, z);
      this.scene.add(light);
    }
    const centreLight = new THREE.SpotLight("#ffe8bd", 70, 18, 0.52, 0.65, 1.6);
    centreLight.position.set(0, 5.9, -25.5);
    centreLight.target.position.set(0, 2.8, -31);
    centreLight.castShadow = true;
    centreLight.shadow.mapSize.set(512, 512);
    this.scene.add(centreLight, centreLight.target);
  }

  private buildArtworks() {
    const placements = getArtworkPlacements(this.gallery.artworks.length);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    this.gallery.artworks.forEach((artwork, index) => {
      const placement = placements[index];
      if (!placement) return;
      const group = new THREE.Group();
      group.position.set(placement.x, placement.y, placement.z);
      group.rotation.y = placement.rotation;
      const backingMaterial = new THREE.MeshStandardMaterial({ color: index === 0 ? "#322c20" : "#3d3830", roughness: 0.5 });
      const frameMaterial = new THREE.MeshStandardMaterial({
        color: index === 0 ? "#aa8a4e" : "#71634a",
        metalness: index === 0 ? 0.52 : 0.22,
        roughness: 0.42,
      });
      const imageMaterial = new THREE.MeshStandardMaterial({ color: "#5b5b54", roughness: 0.88 });
      const image = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), imageMaterial);
      image.position.z = 0.035;
      const mat = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: "#e8e3d6", roughness: 0.96 }),
      );
      const backing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.12), backingMaterial);
      backing.position.z = -0.075;
      const bars = Array.from({ length: 4 }, () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.15), frameMaterial));
      bars.forEach((bar) => {
        bar.position.z = 0.02;
        bar.castShadow = placement.centrepiece;
      });
      const labelTexture = canvasTexture(640, 144, (ctx) => {
        ctx.fillStyle = "#e5e0d4";
        ctx.fillRect(0, 0, 640, 144);
        ctx.fillStyle = "#292a25";
        ctx.font = "600 25px Arial";
        ctx.textAlign = "center";
        ctx.fillText(artwork.title.toUpperCase().slice(0, 42), 320, 57, 580);
        ctx.fillStyle = "#6d6a61";
        ctx.font = "18px Arial";
        ctx.fillText(index === 0 ? `CENTREPIECE  /  ${this.gallery.curator}` : `MEMORY ${String(index + 1).padStart(2, "0")}  /  PRIVATE COLLECTION`, 320, 101, 580);
      });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: labelTexture }));
      label.position.z = 0.025;
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.07, 0.09),
        new THREE.MeshStandardMaterial({ color: "#5d513d", emissive: "#ffc969", emissiveIntensity: 0.4 }),
      );
      group.add(backing, mat, image, ...bars, label, lamp);
      this.scene.add(group);
      const parts: FrameParts = { group, image, mat, backing, bars, label, lamp, centrepiece: placement.centrepiece };
      this.layoutFrame(parts, placement.centrepiece ? 1.5 : 1.35);
      loader.load(
        artwork.url,
        (texture) => {
          if (this.disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          imageMaterial.map = texture;
          imageMaterial.emissiveMap = texture;
          imageMaterial.emissive = new THREE.Color("#ffffff");
          imageMaterial.emissiveIntensity = 0.16;
          imageMaterial.color.set("#ffffff");
          imageMaterial.needsUpdate = true;
          const imageElement = texture.image as { width?: number; height?: number };
          this.layoutFrame(parts, (imageElement.width ?? 3) / (imageElement.height ?? 2));
        },
        undefined,
        () => {
          imageMaterial.color.set("#605e55");
        },
      );
    });
  }

  private layoutFrame(parts: FrameParts, aspect: number) {
    const safeAspect = THREE.MathUtils.clamp(Number.isFinite(aspect) ? aspect : 1.4, 0.45, 2.4);
    const maxWidth = parts.centrepiece ? 6.0 : 1.62;
    const maxHeight = parts.centrepiece ? 3.85 : 1.52;
    let width = maxWidth;
    let height = width / safeAspect;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * safeAspect;
    }
    const border = parts.centrepiece ? 0.24 : 0.105;
    const matBorder = parts.centrepiece ? 0.28 : 0.13;
    parts.image.scale.set(width, height, 1);
    parts.mat.scale.set(width + matBorder * 2, height + matBorder * 2, 1);
    parts.backing.scale.set(width + (matBorder + border) * 2, height + (matBorder + border) * 2, 1);
    const outerW = width + (matBorder + border) * 2;
    const outerH = height + (matBorder + border) * 2;
    parts.bars[0].scale.set(outerW, border, 1);
    parts.bars[1].scale.set(outerW, border, 1);
    parts.bars[0].position.y = outerH / 2 - border / 2;
    parts.bars[1].position.y = -outerH / 2 + border / 2;
    parts.bars[2].scale.set(border, outerH - border * 2, 1);
    parts.bars[3].scale.set(border, outerH - border * 2, 1);
    parts.bars[2].position.x = -outerW / 2 + border / 2;
    parts.bars[3].position.x = outerW / 2 - border / 2;
    parts.label.scale.set(parts.centrepiece ? 3.2 : 1.45, parts.centrepiece ? 0.72 : 0.326, 1);
    parts.label.position.y = -outerH / 2 - (parts.centrepiece ? 0.55 : 0.29);
    parts.lamp.scale.set(parts.centrepiece ? 2.1 : 0.72, 1, 1);
    parts.lamp.position.set(0, outerH / 2 + (parts.centrepiece ? 0.43 : 0.25), 0.18);
  }

  private buildBenches() {
    const wood = new THREE.MeshStandardMaterial({ color: "#51402e", roughness: 0.58 });
    const metal = new THREE.MeshStandardMaterial({ color: "#252722", metalness: 0.55, roughness: 0.5 });
    for (const bench of BENCHES) {
      const group = new THREE.Group();
      group.position.set(bench.x, 0, bench.z);
      group.rotation.y = bench.yaw;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.15, 0.68), wood);
      seat.position.y = 0.58;
      seat.castShadow = true;
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.68, 0.12), wood);
      back.position.set(0, 0.93, 0.29);
      back.rotation.x = -0.09;
      back.castShadow = true;
      group.add(seat, back);
      for (const x of [-1.25, 1.25]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.54), metal);
        leg.position.set(x, 0.28, 0);
        group.add(leg);
      }
      this.scene.add(group);
    }
  }

  private buildDedication() {
    const texture = canvasTexture(1200, 760, (ctx) => {
      ctx.fillStyle = "#262923";
      ctx.fillRect(0, 0, 1200, 760);
      ctx.strokeStyle = "#9d8d66";
      ctx.lineWidth = 3;
      ctx.strokeRect(34, 34, 1132, 692);
      ctx.fillStyle = "#b5a174";
      ctx.font = "22px Arial";
      ctx.textAlign = "center";
      ctx.fillText("A DEDICATION", 600, 115);
      ctx.fillStyle = "#f0eadc";
      ctx.font = "italic 52px Georgia";
      const lines = wrapText(ctx, this.gallery.dedication, 930).slice(0, 6);
      lines.forEach((line, index) => ctx.fillText(line, 600, 225 + index * 67, 1000));
      ctx.fillStyle = "#b5a174";
      ctx.font = "25px Arial";
      ctx.fillText(`${this.gallery.curator}  ·  ${this.gallery.title}`.toUpperCase(), 600, 665, 1000);
    });
    const group = new THREE.Group();
    group.position.set(DEDICATION_POSITION.x, DEDICATION_POSITION.y, DEDICATION_POSITION.z);
    group.rotation.y = DEDICATION_POSITION.rotation;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.42), new THREE.MeshBasicMaterial({ map: texture }));
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(5.65, 3.67, 0.12),
      new THREE.MeshStandardMaterial({ color: "#8b774d", metalness: 0.45, roughness: 0.45 }),
    );
    backing.position.z = -0.08;
    group.add(backing, plaque);
    this.scene.add(group);
  }

  private buildFilmScreen() {
    const group = new THREE.Group();
    group.position.set(FILM_POSITION.x, FILM_POSITION.y, FILM_POSITION.z);
    group.rotation.y = FILM_POSITION.rotation;
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(6.85, 4.08, 0.18),
      new THREE.MeshStandardMaterial({ color: "#161814", roughness: 0.4 }),
    );
    backing.position.z = -0.08;
    group.add(backing);
    let material: THREE.MeshBasicMaterial;
    if (this.gallery.film.url) {
      const video = document.createElement("video");
      video.src = this.gallery.film.url;
      video.crossOrigin = "anonymous";
      video.playsInline = true;
      video.preload = "auto";
      video.muted = true;
      video.setAttribute("playsinline", "");
      this.video = video;
      this.videoTexture = new THREE.VideoTexture(video);
      this.videoTexture.colorSpace = THREE.SRGBColorSpace;
      material = new THREE.MeshBasicMaterial({ map: this.videoTexture, color: "#d8d8d0", toneMapped: false });
      video.addEventListener("ended", () => {
        if (!this.filmEndNotified) {
          this.filmEndNotified = true;
          this.callbacks.onFilmEnded();
        }
      });
    } else {
      const texture = canvasTexture(1280, 720, (ctx) => {
        ctx.fillStyle = "#171a17";
        ctx.fillRect(0, 0, 1280, 720);
        ctx.strokeStyle = "#4d5348";
        ctx.strokeRect(40, 40, 1200, 640);
        ctx.fillStyle = "#a9ad9e";
        ctx.textAlign = "center";
        ctx.font = "22px Arial";
        ctx.fillText("THE GALLERY SCREEN", 640, 305);
        ctx.fillStyle = "#e0e1d7";
        ctx.font = "italic 42px Georgia";
        ctx.fillText("No film has been added to this collection.", 640, 380);
      });
      material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    }
    this.filmMaterial = material;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), material);
    screen.position.z = 0.03;
    group.add(screen);
    const labelTexture = canvasTexture(640, 100, (ctx) => {
      ctx.fillStyle = "#e5e0d4";
      ctx.fillRect(0, 0, 640, 100);
      ctx.fillStyle = "#31332d";
      ctx.font = "22px Arial";
      ctx.textAlign = "center";
      ctx.fillText("THE MOVING IMAGE  /  GALLERY SCREEN", 320, 61);
    });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.34), new THREE.MeshBasicMaterial({ map: labelTexture }));
    label.position.set(0, -2.35, 0.03);
    group.add(label);
    this.scene.add(group);
  }

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.renderer.domElement.addEventListener("click", this.onCanvasClick);
    this.renderer.domElement.addEventListener("pointerdown", this.onTouchStart);
    this.renderer.domElement.addEventListener("pointermove", this.onTouchMove);
    this.renderer.domElement.addEventListener("pointerup", this.onTouchEnd);
    this.renderer.domElement.addEventListener("pointercancel", this.onTouchEnd);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    if (event.code === "KeyE" && !event.repeat) this.interact();
    if (event.code === "KeyF" && !event.repeat && this.gallery.film.url) {
      const distance = Math.hypot(this.camera.position.x - FILM_POSITION.x, this.camera.position.z - FILM_POSITION.z);
      if (distance < 10) this.callbacks.onFilmRequest();
    }
    if (event.code === "KeyC" && !event.repeat) this.callbacks.onOpenChat();
    if (event.code === "KeyM" && !event.repeat) {
      const muted = !(this.video?.muted ?? true);
      this.setFilmMuted(muted);
      this.callbacks.onFilmMuteChange(muted);
    }
    this.keys.add(event.code);
    if (this.seatedSeat && ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      this.stand();
    }
  };

  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement || this.paused) return;
    this.yaw -= event.movementX * 0.00185;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.00165, -1.25, 1.25);
  };

  private onPointerLockChange = () => {
    this.callbacks.onLockChange(document.pointerLockElement === this.renderer.domElement);
  };

  private onCanvasClick = () => {
    if (this.paused || this.touchPointer !== null || !window.matchMedia("(pointer: fine)").matches) return;
    if (document.pointerLockElement !== this.renderer.domElement) void this.renderer.domElement.requestPointerLock();
  };

  private onTouchStart = (event: PointerEvent) => {
    if (event.pointerType === "mouse" || this.paused) return;
    this.touchPointer = event.pointerId;
    this.touchX = event.clientX;
    this.touchY = event.clientY;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private onTouchMove = (event: PointerEvent) => {
    if (event.pointerId !== this.touchPointer || this.paused) return;
    const dx = event.clientX - this.touchX;
    const dy = event.clientY - this.touchY;
    this.touchX = event.clientX;
    this.touchY = event.clientY;
    this.yaw -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.15, 1.15);
  };

  private onTouchEnd = (event: PointerEvent) => {
    if (event.pointerId === this.touchPointer) this.touchPointer = null;
  };

  private resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = () => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += delta;
    if (!this.paused) this.updateMovement(delta);
    this.updateAvatars(delta);
    this.updateInteraction();
    this.syncFilm();
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.renderer.render(this.scene, this.camera);
  };

  private updateMovement(delta: number) {
    if (this.seatedSeat) {
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.seatedSeat.x, 12, delta);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.seatedSeat.z, 12, delta);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 1.26, 12, delta);
      return;
    }
    let horizontal = this.mobileMove.x;
    let forward = this.mobileMove.y;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) horizontal -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) horizontal += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
    const length = Math.hypot(horizontal, forward);
    if (length > 1) {
      horizontal /= length;
      forward /= length;
    }
    const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 5.1 : 3.25;
    const targetX = (Math.cos(this.yaw) * horizontal - Math.sin(this.yaw) * forward) * speed;
    const targetZ = (-Math.sin(this.yaw) * horizontal - Math.cos(this.yaw) * forward) * speed;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, targetX, length > 0.01 ? 12 : 8, delta);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetZ, length > 0.01 ? 12 : 8, delta);
    this.camera.position.x += this.velocity.x * delta;
    this.camera.position.z += this.velocity.z * delta;
    this.resolveCollisions();
    const moving = Math.hypot(this.velocity.x, this.velocity.z);
    const bob = moving > 0.2 ? Math.sin(this.elapsed * 9.5) * Math.min(0.026, moving * 0.006) : 0;
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 1.65 + bob, 14, delta);
  }

  private resolveCollisions() {
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, ROOM_BOUNDS.minX, ROOM_BOUNDS.maxX);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, ROOM_BOUNDS.minZ, ROOM_BOUNDS.maxZ);
    const radius = 0.28;
    for (const bench of BENCHES) {
      const dx = this.camera.position.x - bench.x;
      const dz = this.camera.position.z - bench.z;
      const cos = Math.cos(bench.yaw);
      const sin = Math.sin(bench.yaw);
      let lx = cos * dx - sin * dz;
      let lz = sin * dx + cos * dz;
      const hx = 1.72 + radius;
      const hz = 0.47 + radius;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
        const pushX = hx - Math.abs(lx);
        const pushZ = hz - Math.abs(lz);
        if (pushX < pushZ) lx = Math.sign(lx || 1) * hx;
        else lz = Math.sign(lz || 1) * hz;
        this.camera.position.x = bench.x + cos * lx + sin * lz;
        this.camera.position.z = bench.z - sin * lx + cos * lz;
      }
    }
    for (const x of [-9.7, 9.7]) {
      for (const z of [14, 6, -2, -10, -18, -27]) {
        const dx = this.camera.position.x - x;
        const dz = this.camera.position.z - z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.57 && distance > 0.001) {
          this.camera.position.x = x + (dx / distance) * 0.57;
          this.camera.position.z = z + (dz / distance) * 0.57;
        }
      }
    }
  }

  private updateInteraction() {
    if (this.paused) return;
    let next: Interaction = null;
    let prompt = "";
    if (this.seatedSeat) {
      next = { type: "stand" };
      const nearFilm = Math.hypot(this.camera.position.x - FILM_POSITION.x, this.camera.position.z - FILM_POSITION.z) < 9;
      prompt = nearFilm && this.gallery.film.url ? "E  Stand   ·   F  Film" : "E  Stand up";
    } else {
      let closest = Number.POSITIVE_INFINITY;
      const placements = getArtworkPlacements(this.gallery.artworks.length);
      placements.forEach((placement, index) => {
        const distance = Math.hypot(this.camera.position.x - placement.x, this.camera.position.z - placement.z);
        if (distance < 2.65 && distance < closest) {
          closest = distance;
          next = { type: "art", index };
          prompt = `E  View ${index === 0 ? "centrepiece" : "photograph"}`;
        }
      });
      for (const seat of SEATS) {
        const distance = Math.hypot(this.camera.position.x - seat.x, this.camera.position.z - seat.z);
        if (distance < 2.05 && distance < closest) {
          closest = distance;
          next = { type: "bench", seat };
          prompt = "E  Sit on bench";
        }
      }
      const filmDistance = Math.hypot(this.camera.position.x - FILM_POSITION.x, this.camera.position.z - FILM_POSITION.z);
      if (this.gallery.film.url && filmDistance < 6.2 && filmDistance < closest) {
        closest = filmDistance;
        next = { type: "film" };
        prompt = `E  ${this.filmState.playing ? "Pause" : "Play"} the film`;
      }
      const dedicationDistance = Math.hypot(
        this.camera.position.x - DEDICATION_POSITION.x,
        this.camera.position.z - DEDICATION_POSITION.z,
      );
      if (dedicationDistance < 3.7 && dedicationDistance < closest) {
        next = { type: "dedication" };
        prompt = "E  Read the dedication";
      }
    }
    this.interaction = next;
    if (prompt !== this.prompt) {
      this.prompt = prompt;
      this.callbacks.onPrompt(prompt);
    }
  }

  private updateAvatars(delta: number) {
    for (const avatar of this.avatars.values()) {
      const targetY = avatar.target.seated ? 0.43 : 0;
      tempVector.set(avatar.target.x, targetY, avatar.target.z);
      avatar.group.position.lerp(tempVector, 1 - Math.exp(-delta * 11));
      const angleDelta = Math.atan2(Math.sin(avatar.target.yaw - avatar.group.rotation.y), Math.cos(avatar.target.yaw - avatar.group.rotation.y));
      avatar.group.rotation.y += angleDelta * (1 - Math.exp(-delta * 10));
      const distance = Math.hypot(avatar.group.position.x - avatar.lastX, avatar.group.position.z - avatar.lastZ);
      avatar.lastX = avatar.group.position.x;
      avatar.lastZ = avatar.group.position.z;
      const walking = distance > 0.002 && !avatar.target.seated;
      avatar.phase += delta * (walking ? 9 : 2);
      const swing = walking ? Math.sin(avatar.phase) * 0.55 : 0;
      avatar.leftLeg.rotation.x = avatar.target.seated ? -1.25 : swing;
      avatar.rightLeg.rotation.x = avatar.target.seated ? -1.25 : -swing;
      avatar.leftArm.rotation.x = avatar.target.seated ? -0.25 : -swing * 0.65;
      avatar.rightArm.rotation.x = avatar.target.seated ? -0.25 : swing * 0.65;
    }
  }

  private createAvatar(visitor: VisitorState): Avatar {
    const group = new THREE.Group();
    group.position.set(visitor.x, visitor.seated ? 0.43 : 0, visitor.z);
    group.rotation.y = visitor.yaw;
    const cloth = new THREE.MeshStandardMaterial({ color: visitor.color, roughness: 0.82 });
    const dark = new THREE.MeshStandardMaterial({ color: "#282a27", roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: "#b98264", roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.56, 5, 10), cloth);
    torso.position.y = 1.15;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
    head.position.y = 1.78;
    head.castShadow = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), dark);
    hair.position.y = 1.82;
    group.add(torso, head, hair, makeNameSprite(visitor.name, visitor.color));
    const limb = (x: number, y: number, material: THREE.Material, length: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, length - 0.13, 4, 8), material);
      mesh.position.y = -length / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      return pivot;
    };
    const leftLeg = limb(-0.13, 0.85, dark, 0.78);
    const rightLeg = limb(0.13, 0.85, dark, 0.78);
    const leftArm = limb(-0.34, 1.43, cloth, 0.65);
    const rightArm = limb(0.34, 1.43, cloth, 0.65);
    this.scene.add(group);
    return { group, target: visitor, leftLeg, rightLeg, leftArm, rightArm, phase: Math.random() * 6, lastX: visitor.x, lastZ: visitor.z };
  }

  setVisitors(visitors: VisitorState[]) {
    const present = new Set<string>();
    for (const visitor of visitors) {
      if (visitor.id === this.localVisitorId) continue;
      present.add(visitor.id);
      const existing = this.avatars.get(visitor.id);
      if (existing && existing.target.name === visitor.name && existing.target.color === visitor.color) {
        existing.target = visitor;
      } else {
        if (existing) this.scene.remove(existing.group);
        this.avatars.set(visitor.id, this.createAvatar(visitor));
      }
    }
    for (const [id, avatar] of this.avatars) {
      if (!present.has(id)) {
        this.scene.remove(avatar.group);
        this.avatars.delete(id);
      }
    }
  }

  setFilm(film: FilmState, serverTime?: string) {
    if (serverTime) this.clockSkew = new Date(serverTime).getTime() - Date.now();
    this.filmState = film;
    if (!this.video || film.revision === this.filmRevision) return;
    this.filmRevision = film.revision;
    this.filmEndNotified = false;
    const target = this.getFilmTime(film);
    const apply = () => {
      if (!this.video) return;
      try {
        if (Number.isFinite(this.video.duration)) this.video.currentTime = Math.min(target, Math.max(0, this.video.duration - 0.05));
        else this.video.currentTime = target;
      } catch {
        // Metadata may not be available yet; the next sync will correct drift.
      }
    };
    if (this.video.readyState >= 1) apply();
    else this.video.addEventListener("loadedmetadata", apply, { once: true });
    if (film.playing) void this.video.play().catch(() => undefined);
    else this.video.pause();
  }

  private getFilmTime(film = this.filmState) {
    if (!film.playing || !film.startedAt) return film.offset;
    const elapsed = (Date.now() + this.clockSkew - new Date(film.startedAt).getTime()) / 1000;
    return Math.max(0, film.offset + elapsed);
  }

  private syncFilm() {
    if (!this.video || !this.filmState.playing || this.video.readyState < 1) return;
    const target = this.getFilmTime();
    if (Math.abs(this.video.currentTime - target) > 0.85) {
      try {
        this.video.currentTime = target;
      } catch {
        // Some streams only become seekable after enough data has arrived.
      }
    }
  }

  getFilmTimecode() {
    return this.video?.currentTime ?? this.getFilmTime();
  }

  setFilmMuted(muted: boolean) {
    if (!this.video) return;
    this.video.muted = muted;
    if (!muted && this.filmState.playing) void this.video.play().catch(() => undefined);
  }

  getFilmMuted() {
    return this.video?.muted ?? true;
  }

  setMobileMove(x: number, y: number) {
    this.mobileMove.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
    if (this.seatedSeat && Math.hypot(x, y) > 0.25) this.stand();
  }

  interact() {
    if (this.paused || !this.interaction) return;
    switch (this.interaction.type) {
      case "art":
        this.callbacks.onViewArtwork(this.interaction.index);
        break;
      case "bench":
        this.sit(this.interaction.seat);
        break;
      case "film":
        this.callbacks.onFilmRequest();
        break;
      case "dedication":
        this.callbacks.onViewDedication();
        break;
      case "stand":
        this.stand();
        break;
    }
  }

  private sit(seat: Seat) {
    const occupied = [...this.avatars.values()].some((avatar) => avatar.target.seated && avatar.target.seatId === seat.id);
    if (occupied) {
      this.callbacks.onPrompt("This seat is occupied");
      return;
    }
    this.seatedSeat = seat;
    this.velocity.set(0, 0, 0);
    this.yaw = seat.yaw;
    this.pitch = 0;
    this.callbacks.onSeatChange(seat.id);
  }

  stand() {
    if (!this.seatedSeat) return;
    const seat = this.seatedSeat;
    this.seatedSeat = null;
    this.camera.position.set(
      THREE.MathUtils.clamp(seat.x - Math.sin(seat.yaw) * 1.05, ROOM_BOUNDS.minX, ROOM_BOUNDS.maxX),
      1.65,
      THREE.MathUtils.clamp(seat.z - Math.cos(seat.yaw) * 1.05, ROOM_BOUNDS.minZ, ROOM_BOUNDS.maxZ),
    );
    this.callbacks.onSeatChange(null);
  }

  rejectSeat() {
    if (!this.seatedSeat) return;
    this.seatedSeat = null;
    this.camera.position.y = 1.65;
    this.callbacks.onSeatChange(null);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.keys.clear();
    this.mobileMove.set(0, 0);
    if (paused && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  getPresence() {
    return {
      x: this.camera.position.x,
      y: this.seatedSeat ? 0.5 : 0,
      z: this.camera.position.z,
      yaw: this.yaw,
      seated: Boolean(this.seatedSeat),
      seatId: this.seatedSeat?.id ?? null,
    };
  }

  getPosition() {
    return { x: this.camera.position.x, z: this.camera.position.z };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.renderer.domElement.removeEventListener("click", this.onCanvasClick);
    this.renderer.domElement.removeEventListener("pointerdown", this.onTouchStart);
    this.renderer.domElement.removeEventListener("pointermove", this.onTouchMove);
    this.renderer.domElement.removeEventListener("pointerup", this.onTouchEnd);
    this.renderer.domElement.removeEventListener("pointercancel", this.onTouchEnd);
    this.video?.pause();
    if (this.video) this.video.src = "";
    this.videoTexture?.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          const withMap = material as THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null };
          withMap.map?.dispose();
          withMap.emissiveMap?.dispose();
          material.dispose();
        });
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
