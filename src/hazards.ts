import { distance, intersects, type Point } from './physics.ts';
import { ROOM_CENTERS, ROOM_LAYOUTS, createWorldObstacles, roomBounds } from './layout.ts';
export const GRENADE = { flight: .95, radius: 1.7, damage: 15, fireDuration: 3.5, tick: .5, fireDamage: 5, perOwner: 1, global: 2 } as const;
export interface ThermalZone extends Point {
    id: number; owner: number; wave: number; origin: Point; age: number; exploded: boolean; nextTick: number;
}
export function canThrowGrenade(owner: number, zones: readonly ThermalZone[]): boolean {
    return zones.length < GRENADE.global && zones.filter(z => z.owner === owner).length < GRENADE.perOwner;
}
export function createGrenade(id: number, owner: number, wave: number, origin: Point, target: Point): ThermalZone {
    return { ...target, id, owner, wave, origin: { ...origin }, age: 0, exploded: false, nextTick: GRENADE.flight + GRENADE.tick };
}
export function updateThermalZones(zones: ThermalZone[], dt: number, player: Point, hurt: (damage: number) => void, explode: (zone: ThermalZone) => void): ThermalZone[] {
    for (const zone of zones) {
        zone.age += dt;
        if (!zone.exploded && zone.age + 1e-9 >= GRENADE.flight) {
            zone.exploded = true; explode(zone);
            if (distance(player, zone) <= GRENADE.radius) hurt(GRENADE.damage);
        }
        while (zone.nextTick <= Math.min(zone.age + 1e-9, GRENADE.flight + GRENADE.fireDuration + 1e-9)) {
            zone.nextTick += GRENADE.tick;
            if (distance(player, zone) <= GRENADE.radius) hurt(GRENADE.fireDamage);
        }
    }
    return zones.filter(z => z.age + 1e-9 < GRENADE.flight + GRENADE.fireDuration);
}
export const FLOOR_HAZARD = { radius: 1.35, warning: 1, active: 1.7, cooldown: 4.2, tick: .5, damage: 6 } as const;
// Reuse authored room points, with a full disc clearance and an extra entry/exit margin.
const floorBounds = roomBounds(1), floorObstacles = createWorldObstacles();
export const FLOOR_POSITIONS: readonly Point[] = ROOM_LAYOUTS[1].candidates
    .map(p => ({ x: p.x + ROOM_CENTERS[1], z: p.z }))
    .filter(p => p.x >= floorBounds.minX + 3 && p.x <= floorBounds.maxX - 3
        && p.z >= floorBounds.minZ + FLOOR_HAZARD.radius && p.z <= floorBounds.maxZ - FLOOR_HAZARD.radius
        && !floorObstacles.some(o => intersects(p, FLOOR_HAZARD.radius, o)));
export interface FloorHazard extends Point {
    id: number; state: 'inactive' | 'warning' | 'active' | 'cooldown'; timer: number; nextTick: number;
}
export function createFloorHazards(wave: number): FloorHazard[] {
    if (wave !== 1) return [];
    return [{ x: -5, z: 2.3 }, { x: 6, z: -1 }].map((p, i) => ({ x: p.x + ROOM_CENTERS[wave], z: p.z, id: i,
        state: 'inactive', timer: 2 + i * 3.45, nextTick: FLOOR_HAZARD.tick }));
}
export function updateFloorHazards(zones: FloorHazard[], dt: number, allowNew: boolean, player: Point, hurt: (damage: number) => void, random: () => number = Math.random): void {
    for (const zone of zones) {
        if (!allowNew && zone.state !== 'active') { zone.state = 'inactive'; continue; }
        if (zone.state === 'active') {
            zone.nextTick -= Math.min(dt, zone.timer);
            while (zone.nextTick <= 1e-9) {
                zone.nextTick += FLOOR_HAZARD.tick;
                if (distance(player, zone) <= FLOOR_HAZARD.radius) hurt(FLOOR_HAZARD.damage);
            }
        }
        zone.timer -= dt;
        if (zone.timer > 1e-9) continue;
        if (zone.state === 'inactive' || zone.state === 'cooldown') {
            const candidates = FLOOR_POSITIONS.filter(p => distance(p, zone) > .1
                && zones.every(other => other.id === zone.id || distance(p, other) >= FLOOR_HAZARD.radius * 2 + .8));
            if (!candidates.length) { zone.timer = .25; continue; }
            Object.assign(zone, candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length))]);
            // Relocation only starts a full warning; the first damage is another half-second after activation.
            zone.state = 'warning'; zone.timer = FLOOR_HAZARD.warning; zone.nextTick = FLOOR_HAZARD.tick;
        }
        else if (zone.state === 'warning') { zone.state = 'active'; zone.timer = FLOOR_HAZARD.active; zone.nextTick = FLOOR_HAZARD.tick; }
        else { zone.state = 'cooldown'; zone.timer = FLOOR_HAZARD.cooldown; }
    }
}
