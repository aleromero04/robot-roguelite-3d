import { distance, moveCircle, segmentCircleTime, type Point, type Obstacle, type Bounds } from './physics.ts';
import { PLAYER_STATS } from './stats.ts';
export const CONTACT_DAMAGE = { basic: 10, runner: 10, shooter: 10, grenadier: 10, burrower: 10, boss: 16 } as const;
export interface ContactBody extends Point { id: number; radius: number }
/** Swept stop prevents walking/dashing through a stationary body; moving away is always allowed. */
export function stopAtBodies(previous: Point, player: Point, bodies: readonly ContactBody[], obstacles: Obstacle[], bounds: Bounds): Set<number> {
    const contacts: { id: number; time: number }[] = [];
    // An overlapping body may move into us. Allow escape/tangential motion, never movement deeper through its center.
    for (const body of bodies) {
        const d = distance(previous, body);
        if (d < 1e-6 || d >= PLAYER_STATS.radius + body.radius + 1e-6) continue;
        const nx = (previous.x - body.x) / d, nz = (previous.z - body.z) / d;
        const inward = (player.x - previous.x) * nx + (player.z - previous.z) * nz;
        if (inward < 0) Object.assign(player, moveCircle(previous,
            player.x - previous.x - inward * nx, player.z - previous.z - inward * nz, PLAYER_STATS.radius, obstacles, bounds));
    }
    let time = 1;
    for (const body of bodies) {
        const radius = PLAYER_STATS.radius + body.radius;
        const startDistance = distance(previous, body), endDistance = distance(player, body);
        const contact = segmentCircleTime(previous, player, body, radius);
        if (contact === undefined) continue;
        contacts.push({ id: body.id, time: contact });
        if (startDistance < radius + 1e-6) continue; // Penetration is resolved gently below; never trap an escape.
        if (endDistance < radius || contact > 0) time = Math.min(time, Math.max(0, contact - 1e-5));
    }
    if (time < 1) Object.assign(player, moveCircle(previous, (player.x - previous.x) * time, (player.z - previous.z) * time, PLAYER_STATS.radius, obstacles, bounds));
    // Bodies behind the first blocker were never reached by this movement.
    return new Set(contacts.filter(contact => contact.time <= time + 1.01e-5).map(contact => contact.id));
}
export function separateBody(player: Point, body: ContactBody, dt: number, obstacles: Obstacle[], bounds: Bounds): boolean {
    return separateBodies(player, [body], dt, obstacles, bounds).has(body.id);
}
/** One bounded correction for the whole crowd: opposing bodies cannot repeatedly bounce the player. */
export function separateBodies(player: Point, bodies: readonly ContactBody[], dt: number, obstacles: Obstacle[], bounds: Bounds): Set<number> {
    const contacts = new Set<number>();
    let dx = 0, dz = 0;
    for (const body of bodies) {
        const d = distance(player, body), radius = PLAYER_STATS.radius + body.radius;
        if (d > radius + .015) continue;
        contacts.add(body.id);
        const amount = Math.max(0, radius + .01 - d);
        dx += (d > 1e-6 ? (player.x - body.x) / d : 0) * amount;
        dz += (d > 1e-6 ? (player.z - body.z) / d : 1) * amount;
    }
    const length = Math.hypot(dx, dz), scale = length > 0 ? Math.min(1, 8 * dt / length) : 0;
    const candidate = moveCircle(player, dx * scale, dz * scale, PLAYER_STATS.radius, obstacles, bounds);
    const penetration = (p: Point) => bodies.reduce((sum, b) => sum + Math.max(0, PLAYER_STATS.radius + b.radius + .01 - distance(p, b)) ** 2, 0);
    if (penetration(candidate) < penetration(player)) Object.assign(player, candidate);
    return contacts;
}
