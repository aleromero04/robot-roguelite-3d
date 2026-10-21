import { ROOM_LAYOUTS, ROOM_CENTERS, roomBounds } from './layout.ts';
import { distance, intersects, type Point, type Obstacle } from './physics.ts';
export const REWARD = { pickupRadius: 1.15, playerClearance: 3, wallMargin: 2, footprint: .7 } as const;
export function rewardPosition(wave: number, player: Point, obstacles: readonly Obstacle[]): Point {
    const bounds = roomBounds(wave);
    const point = ROOM_LAYOUTS[wave].rewardPoints.map(p => ({ x: p.x + ROOM_CENTERS[wave], z: p.z }))
        .find(p => distance(p, player) >= REWARD.playerClearance
            && p.x >= bounds.minX + REWARD.wallMargin && p.x <= bounds.maxX - REWARD.wallMargin
            && p.z >= bounds.minZ + REWARD.wallMargin && p.z <= bounds.maxZ - REWARD.wallMargin
            && !obstacles.some(o => intersects(p, REWARD.footprint, o)));
    if (!point) throw new Error(`No safe reward anchor in sector ${wave + 1}`);
    return point;
}
