export type Artwork = {
  id: string;
  title: string;
  position: number;
  url: string;
};

export type FilmState = {
  playing: boolean;
  startedAt: string | null;
  offset: number;
  revision: number;
  url: string | null;
};

export type GalleryInfo = {
  code: string;
  title: string;
  curator: string;
  dedication: string;
  createdAt: string;
  artworks: Artwork[];
  film: FilmState;
};

export type VisitorState = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  seated: boolean;
  seatId: string | null;
  visited: string[];
};

export type ChatMessage = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  mine?: boolean;
};

export type MuseumSnapshot = {
  gallery: GalleryInfo;
  visitors: VisitorState[];
  messages: ChatMessage[];
  serverTime: string;
};

export type PresencePayload = {
  token: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  seated: boolean;
  seatId: string | null;
  visited: string[];
};
