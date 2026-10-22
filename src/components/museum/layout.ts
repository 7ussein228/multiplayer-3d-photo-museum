export type ArtworkPlacement = {
  x: number;
  y: number;
  z: number;
  rotation: number;
  centrepiece: boolean;
};

export type Seat = {
  id: string;
  x: number;
  z: number;
  yaw: number;
  benchId: string;
};

export type Bench = {
  id: string;
  x: number;
  z: number;
  yaw: number;
  seats: Seat[];
};

const benchDefinitions = [
  { id: "nave", x: 0, z: 4, yaw: 0 },
  { id: "west", x: 4.5, z: -9, yaw: Math.PI / 2 },
  { id: "centre", x: 0, z: -26.5, yaw: 0 },
  { id: "cinema-a", x: -6.3, z: -20, yaw: Math.PI / 2 },
  { id: "cinema-b", x: -6.3, z: -24.2, yaw: Math.PI / 2 },
];

export const BENCHES: Bench[] = benchDefinitions.map((bench) => ({
  ...bench,
  seats: [-0.82, 0.82].map((offset, index) => ({
    id: `${bench.id}-${index + 1}`,
    benchId: bench.id,
    x: bench.x + Math.cos(bench.yaw) * offset,
    z: bench.z - Math.sin(bench.yaw) * offset,
    yaw: bench.yaw,
  })),
}));

export const SEATS = BENCHES.flatMap((bench) => bench.seats);

export function getArtworkPlacements(count: number): ArtworkPlacement[] {
  const placements: ArtworkPlacement[] = [
    { x: 0, y: 3.25, z: -31.02, rotation: 0, centrepiece: true },
  ];
  const candidates: ArtworkPlacement[] = [];

  for (const x of [-7.2, -3.8, 3.8, 7.2]) {
    candidates.push({ x, y: 3.05, z: 21.72, rotation: Math.PI, centrepiece: false });
  }
  for (let z = 17; z >= -28; z -= 2) {
    candidates.push({ x: 10.76, y: 3.05, z, rotation: -Math.PI / 2, centrepiece: false });
    if (Math.abs(z + 22) > 4.1) {
      candidates.push({ x: -10.76, y: 3.05, z, rotation: Math.PI / 2, centrepiece: false });
    }
  }
  candidates.sort((a, b) => b.z - a.z || a.x - b.x);
  return placements.concat(candidates.slice(0, Math.max(0, count - 1)));
}

export const ROOM_BOUNDS = { minX: -10.35, maxX: 10.35, minZ: -30.4, maxZ: 20.85 };
export const FILM_POSITION = { x: -10.64, y: 3.1, z: -22, rotation: Math.PI / 2 };
export const DEDICATION_POSITION = { x: 0, y: 3.05, z: 21.68, rotation: Math.PI };
