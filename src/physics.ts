/** Pure XZ-plane collision helpers, shared by movement, sight and projectiles. */
export interface Point {
    x: number;
    z: number;
}
export interface Obstacle extends Point {
    halfX: number;
    halfZ: number;
}
export interface Bounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}
export const BOUNDS = { x: 14.1, z: 10.1 };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function intersects(p: Point, radius: number, o: Obstacle): boolean {
    const x = clamp(p.x, o.x - o.halfX, o.x + o.halfX);
    const z = clamp(p.z, o.z - o.halfZ, o.z + o.halfZ);
    return Math.hypot(p.x - x, p.z - z) < radius;
}
export function moveCircle(p: Point, dx: number, dz: number, radius: number, obstacles: Obstacle[], bounds: Bounds = { minX: -BOUNDS.x, maxX: BOUNDS.x, minZ: -BOUNDS.z, maxZ: BOUNDS.z }): Point {
    const result = { ...p };
    // Substeps prevent fast dashes tunnelling through narrow cover.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * .5)));
    for (let i = 0; i < steps; i++) {
        const nx = clamp(result.x + dx / steps, bounds.minX + radius, bounds.maxX - radius);
        if (!obstacles.some(o => intersects({ x: nx, z: result.z }, radius, o)))
            result.x = nx;
        const nz = clamp(result.z + dz / steps, bounds.minZ + radius, bounds.maxZ - radius);
        if (!obstacles.some(o => intersects({ x: result.x, z: nz }, radius, o)))
            result.z = nz;
    }
    return result;
}
export function segmentBox(a: Point, b: Point, box: Obstacle, padding = 0): boolean {
    return segmentBoxTime(a, b, box, padding) !== undefined;
}
export function segmentCircle(a: Point, b: Point, center: Point, radius: number): boolean {
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? clamp(((center.x - a.x) * dx + (center.z - a.z) * dz) / length2, 0, 1) : 0;
    return Math.hypot(a.x + dx * t - center.x, a.z + dz * t - center.z) <= radius;
}

/** Earliest swept contact, for ordering cover and multiple projectile impacts. */
export function segmentBoxTime(a: Point, b: Point, box: Obstacle, padding = 0): number | undefined {
    let lo = 0, hi = 1;
    for (const key of ['x', 'z'] as const) {
        const half = (key === 'x' ? box.halfX : box.halfZ) + padding;
        const d = b[key] - a[key], min = box[key] - half, max = box[key] + half;
        if (Math.abs(d) < 1e-8) {
            if (a[key] < min || a[key] > max) return undefined;
        } else {
            const t1 = (min - a[key]) / d, t2 = (max - a[key]) / d;
            lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
            if (lo > hi) return undefined;
        }
    }
    return lo;
}
export function segmentCircleTime(a: Point, b: Point, center: Point, radius: number): number | undefined {
    const dx = b.x - a.x, dz = b.z - a.z, ox = a.x - center.x, oz = a.z - center.z;
    const c = ox * ox + oz * oz - radius * radius;
    if (c <= 0) return 0;
    const length2 = dx * dx + dz * dz;
    if (length2 < 1e-12) return undefined;
    const dot = ox * dx + oz * dz, discriminant = dot * dot - length2 * c;
    if (discriminant < 0) return undefined;
    const t = (-dot - Math.sqrt(discriminant)) / length2;
    return t >= 0 && t <= 1 ? t : undefined;
}
