import { clamp, distance, intersects, type Bounds, type Obstacle, type Point } from '../physics.ts';
/** A small capped lead, not an interception solution. Dash never creates an extreme prediction. */
export function predictPosition(player: Point, velocity: Point, seconds: number, limit: number): Point {
    const dx = velocity.x * seconds, dz = velocity.z * seconds, length = Math.hypot(dx, dz);
    const scale = length > limit ? limit / length : 1;
    return { x: player.x + dx * scale, z: player.z + dz * scale };
}
export function clearArea(p: Point, radius: number, obstacles: readonly Obstacle[], bounds: Bounds): boolean {
    return p.x - radius >= bounds.minX && p.x + radius <= bounds.maxX && p.z - radius >= bounds.minZ && p.z + radius <= bounds.maxZ
        && !obstacles.some(o => intersects(p, radius, o));
}
export function grenadeDestination(player: Point, velocity: Point, radius: number, occupied: readonly Point[], obstacles: readonly Obstacle[], bounds: Bounds): Point | undefined {
    const predicted = predictPosition(player, velocity, .3, 1.6);
    const center = { x: clamp(predicted.x, bounds.minX + radius, bounds.maxX - radius), z: clamp(predicted.z, bounds.minZ + radius, bounds.maxZ - radius) };
    const candidates = [center];
    for (const r of [1.8, 3]) for (let i = 0; i < 8; i++) candidates.push({ x: center.x + Math.cos(i * Math.PI / 4) * r, z: center.z + Math.sin(i * Math.PI / 4) * r });
    return candidates.find(p => clearArea(p, radius, obstacles, bounds) && occupied.every(o => distance(p, o) >= radius * 2 + .5));
}
export function emergenceDestination(player: Point, velocity: Point, origin: Point, occupied: readonly Point[], obstacles: readonly Obstacle[], bounds: Bounds): Point | undefined {
    const predicted = predictPosition(player, velocity, .2, 1.2);
    const heading = Math.hypot(velocity.x, velocity.z) > .1 ? Math.atan2(velocity.z, velocity.x) : Math.atan2(player.z - origin.z, player.x - origin.x);
    for (const r of [3, 4.5, 2.5]) for (const offset of [0, Math.PI / 3, -Math.PI / 3, 2 * Math.PI / 3, -2 * Math.PI / 3, Math.PI]) {
        const p = { x: predicted.x + Math.cos(heading + offset) * r, z: predicted.z + Math.sin(heading + offset) * r };
        if (distance(p, player) >= 2.2 && distance(p, player) <= 6 && clearArea(p, .65, obstacles, bounds)
            && occupied.every(o => distance(p, o) >= 1.5)) return p;
    }
    return undefined; // Retry while visible; never force an invalid emergence point.
}
