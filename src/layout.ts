import { distance, intersects, type Bounds, type Obstacle, type Point } from './physics.ts';
import { WAVES, BOSS_SECTOR, SECTOR_COUNT } from './waves.ts';
export const ROOM_CENTERS = Array.from({ length: SECTOR_COUNT }, (_, i) => i * 36);
export const WORLD_BOUNDS: Bounds = { minX: -14.1, maxX: ROOM_CENTERS[ROOM_CENTERS.length - 1] + 14.1, minZ: -10.1, maxZ: 10.1 };
export interface Machinery extends Obstacle { tall: boolean }
export interface RoomLayout {
    machinery: readonly Machinery[];
    reactor: Obstacle;
    candidates: readonly Point[];
    rewardPoints: readonly Point[];
}
// Local coordinates: rendering and collisions consume the same footprints.
const BASE_LAYOUTS: readonly RoomLayout[] = [
    {
        rewardPoints: [{ x: -4, z: 4 }, { x: 6, z: -3 }, { x: -10, z: 4 }],
        machinery: [
            { x: -7, z: -2.8, halfX: 1.35, halfZ: 1.25, tall: true },
            { x: 7.5, z: 4.8, halfX: 1.8, halfZ: .85, tall: false },
        ],
        reactor: { x: 1.5, z: -7.7, halfX: 2.2, halfZ: 2.2 },
        candidates: [
            { x: -11, z: -7 }, { x: -6, z: -7.5 }, { x: -2, z: -4 }, { x: 5.5, z: -4 },
            { x: 10, z: -7 }, { x: 11, z: -2 }, { x: -11, z: 1 }, { x: -5, z: 2 },
            { x: 3, z: 1 }, { x: 10.5, z: 3 }, { x: -10, z: 7 }, { x: -5, z: 7.5 },
            { x: 0, z: 7.5 }, { x: 5, z: 8 }, { x: 11, z: 8 }, { x: -1, z: 0 },
        ],
    },
    {
        rewardPoints: [{ x: -7, z: 5 }, { x: 0, z: -6 }, { x: 8, z: 7 }],
        // Three broad east/west routes, with staggered ends to turn around.
        machinery: [
            { x: -3.8, z: -3.2, halfX: 3.1, halfZ: .85, tall: false },
            { x: 3.4, z: 3.4, halfX: 3.6, halfZ: .85, tall: false },
            { x: 9, z: -4.3, halfX: 1.1, halfZ: 1.15, tall: true },
        ],
        reactor: { x: -9, z: -7, halfX: 2.2, halfZ: 2.2 },
        candidates: [
            { x: -12, z: -2 }, { x: -9, z: 2 }, { x: -10, z: 7 }, { x: -5, z: 7.5 },
            { x: 0, z: 7.5 }, { x: 5, z: 7.5 }, { x: 10.5, z: 7 }, { x: 11.5, z: 2 },
            { x: -4, z: 0 }, { x: 1, z: 0 }, { x: 6, z: 0 }, { x: 11.5, z: -7.5 },
            { x: 5, z: -7.5 }, { x: 0, z: -7.5 }, { x: -4.5, z: -7 }, { x: 3, z: -3.5 },
        ],
    },
    {
        rewardPoints: [{ x: -6, z: 2 }, { x: 5, z: -7 }, { x: -5, z: 7 }],
        machinery: [
            { x: -7.5, z: -5.6, halfX: 1.5, halfZ: .85, tall: false },
            { x: 6.8, z: 5.6, halfX: 2, halfZ: .8, tall: false },
            { x: 9, z: -4.7, halfX: 1.1, halfZ: 1.15, tall: true },
        ],
        reactor: { x: 0, z: 0, halfX: 2.2, halfZ: 2.2 },
        candidates: [
            { x: -11, z: -8 }, { x: -3, z: -7.5 }, { x: 2, z: -7.5 }, { x: 6, z: -8 },
            { x: 11.5, z: -8 }, { x: -11, z: -2 }, { x: -6, z: 0 }, { x: 5.5, z: -2 },
            { x: 11.5, z: 0 }, { x: -10, z: 7 }, { x: -5, z: 7.5 }, { x: 0, z: 7.5 },
            { x: 3, z: 4 }, { x: 6, z: 8 }, { x: 11.5, z: 7.5 }, { x: -5, z: 3.5 },
        ],
    },
];
// Reuse three factories; the second pass mirrors X, including spawn candidates.
export const ROOM_LAYOUTS: readonly RoomLayout[] = ROOM_CENTERS.map((_, i) => {
    if (i === BOSS_SECTOR) return {
        machinery: [{ x: -12, z: -7.5, halfX: .65, halfZ: 1, tall: true }, { x: 12, z: -7.5, halfX: .65, halfZ: 1, tall: true }],
        reactor: { x: 0, z: -8.3, halfX: 2.2, halfZ: 2.2 },
        candidates: [], rewardPoints: [],
    };
    const base = BASE_LAYOUTS[i % BASE_LAYOUTS.length], sign = i < 3 ? 1 : -1;
    return {
        rewardPoints: base.rewardPoints.map(p => ({ ...p, x: p.x * sign })),
        machinery: base.machinery.map(o => ({ ...o, x: o.x * sign })),
        reactor: { ...base.reactor, x: base.reactor.x * sign },
        candidates: base.candidates.map(p => ({ ...p, x: p.x * sign })),
    };
});
/** Rendering keeps only nearby modules resident, independently of run length. */
export function residentRoomIndices(playerX: number): number[] {
    return ROOM_CENTERS.flatMap((center, i) => Math.abs(center - playerX) < 50 ? [i] : []);
}
export function roomBounds(wave: number): Bounds {
    const center = ROOM_CENTERS[wave];
    return { minX: center - 14.1, maxX: center + 14.1, minZ: -10.1, maxZ: 10.1 };
}
export const GATE_X = ROOM_CENTERS.slice(0, WAVES.length).map(x => x + 18);
export const ENTRY_X = ROOM_CENTERS.slice(0, WAVES.length).map(x => x + 22.5);
export interface Gate {
    x: number;
    openness: number;
    unlocked: boolean;
    sealed: boolean;
}
export function createGates(): Gate[] { return GATE_X.map(x => ({ x, openness: 0, unlocked: false, sealed: false })); }
export function updateGate(gate: Gate, dt: number): void {
    const target = gate.unlocked && !gate.sealed ? 1 : 0;
    gate.openness += Math.sign(target - gate.openness) * Math.min(Math.abs(target - gate.openness), dt * 1.5);
}
export function gateObstacle(gate: Gate): Obstacle | undefined {
    return gate.openness < .99 ? { x: gate.x, z: 0, halfX: .25, halfZ: 2.65 } : undefined;
}
export function fullyCrossed(player: Point, radius: number, exit: number): boolean {
    return player.x - radius > ENTRY_X[exit];
}
export function createWorldObstacles(): Obstacle[] {
    const result: Obstacle[] = [];
    for (const [index, center] of ROOM_CENTERS.entries()) {
        const layout = ROOM_LAYOUTS[index];
        result.push(...[...layout.machinery, layout.reactor].map(o => ({ ...o, x: o.x + center })));
        for (const side of [-1, 1]) {
            const x = center + side * 15.15;
            if (center === 0 && side === -1)
                continue; // bounded by WORLD_BOUNDS
            for (const z of [-6.9, 6.9])
                result.push({ x, z, halfX: .45, halfZ: 4.3 });
        }
        // Corridor walls also stop sideways escape into the space between rooms.
        if (index === BOSS_SECTOR) continue;
        const mid = center + 18;
        for (const z of [-3, 3])
            result.push({ x: mid, z, halfX: index === WAVES.length - 1 ? 5.1 : 3.65, halfZ: .4 });
    }
    return result;
}
export const SPAWN_CLEARANCE = .65;
export const SPAWN_PLAYER_DISTANCE = 6;
export const SPAWN_SEPARATION = 2;
export function safeSpawn(wave: number, p: Point, player: Point, obstacles: readonly Obstacle[], occupied: readonly Point[]): boolean {
    const bounds = roomBounds(wave), r = SPAWN_CLEARANCE;
    return p.x - r >= bounds.minX && p.x + r <= bounds.maxX && p.z - r >= bounds.minZ && p.z + r <= bounds.maxZ
        && distance(p, player) >= SPAWN_PLAYER_DISTANCE
        && !obstacles.some(o => intersects(p, r, o))
        && !occupied.some(other => distance(p, other) < SPAWN_SEPARATION);
}
export function spawnPositions(wave: number, count: number, player: Point, obstacles: readonly Obstacle[], random: () => number = Math.random, occupied: readonly Point[] = []): Point[] {
    const candidates = ROOM_LAYOUTS[wave].candidates.map(p => ({ x: p.x + ROOM_CENTERS[wave], z: p.z }));
    // Fisher-Yates: shuffle a copy; never mutate the room's candidate list.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const positions: Point[] = [];
    for (const p of candidates) {
        if (!safeSpawn(wave, p, player, obstacles, [...occupied, ...positions])) continue;
        positions.push(p);
        if (positions.length === count) break;
    }
    return positions;
}
