import { BOSS_STATS } from './boss.ts';
import { direction } from './combat.ts';
import { clamp, distance, segmentBox, segmentBoxTime, segmentCircleTime, type Point, type Obstacle, type Bounds } from './physics.ts';
import { UPGRADE_VALUES } from './upgrades.ts';
export interface ShotModifiers { piercing?: number; ricochet?: number; homing?: boolean; flame?: boolean; shock?: boolean; frost?: boolean }
export interface Projectile extends Point {
    id: number;
    enemy: boolean;
    damage: number;
    velocity: Point;
    life: number;
    pierces: number;
    bounces: number;
    homing: boolean;
    flame: boolean;
    shock: boolean;
    frost: boolean;
    turnRemaining: number;
    targetId?: number;
    hitIds: Set<number>;
    splitAfter?: number;
    fragmentSpeed?: number;
    fragment?: boolean;
}
export interface ProjectileTarget extends Point { id: number; hp: number; radius?: number }
export function createProjectile(id: number, origin: Point, target: Point, enemy: boolean, damage: number, speed: number, life: number, modifiers: ShotModifiers = {}): Projectile {
    const dir = direction(origin, target), options = enemy ? {} : modifiers;
    return { id, x: origin.x, z: origin.z, enemy, damage, velocity: { x: dir.x * speed, z: dir.z * speed }, life,
        pierces: options.piercing ?? 0, bounces: options.ricochet ?? 0, homing: options.homing ?? false, flame: options.flame ?? false, shock: options.shock ?? false, frost: options.frost ?? false,
        turnRemaining: UPGRADE_VALUES.homingTotalTurn, hitIds: new Set() };
}
export function advanceProjectile(shot: Projectile, dt: number): Point {
    const previous = { x: shot.x, z: shot.z };
    shot.x += shot.velocity.x * dt; shot.z += shot.velocity.z * dt; shot.life -= dt;
    return previous;
}
function angleTo(shot: Projectile, target: Point): number {
    const heading = Math.atan2(shot.velocity.z, shot.velocity.x);
    const wanted = Math.atan2(target.z - shot.z, target.x - shot.x);
    return Math.atan2(Math.sin(wanted - heading), Math.cos(wanted - heading));
}
export function guideProjectile(shot: Projectile, enemies: readonly ProjectileTarget[], obstacles: readonly Obstacle[], dt: number): void {
    if (shot.enemy || !shot.homing || shot.turnRemaining <= 0) return;
    const valid = (e: ProjectileTarget): boolean => e.hp > 0 && !shot.hitIds.has(e.id)
        && distance(shot, e) <= UPGRADE_VALUES.homingRange
        && Math.abs(angleTo(shot, e)) <= UPGRADE_VALUES.homingCone
        && !obstacles.some(o => segmentBox(shot, e, o, .08));
    const target = enemies.find(e => e.id === shot.targetId && valid(e))
        ?? enemies.filter(valid).sort((a, b) => distance(shot, a) - distance(shot, b) || a.id - b.id)[0];
    shot.targetId = target?.id;
    if (!target) return; // Lost targets never cause an abrupt turn.
    const limit = Math.min(UPGRADE_VALUES.homingTurnRate * dt, shot.turnRemaining);
    const turn = clamp(angleTo(shot, target), -limit, limit);
    const heading = Math.atan2(shot.velocity.z, shot.velocity.x) + turn, speed = Math.hypot(shot.velocity.x, shot.velocity.z);
    shot.velocity = { x: Math.cos(heading) * speed, z: Math.sin(heading) * speed };
    shot.turnRemaining -= Math.abs(turn);
}
export interface ProjectileCallbacks {
    hurtPlayer: (damage: number) => void;
    hurtEnemy: (id: number, damage: number, flame?: boolean, shot?: Projectile) => void;
    impact: (position: Point) => void;
    canDamagePlayer: () => boolean;
    nextId?: () => number;
    fragment?: (position: Point) => void;
}
function advanceShots(shots: Projectile[], dt: number, obstacles: Obstacle[], bounds: Bounds, player: Point, enemies: readonly ProjectileTarget[], callbacks: ProjectileCallbacks): Projectile[] {
    return shots.filter(shot => {
        if (shot.life <= 0) return false;
        let remaining = Math.min(dt, shot.life);
        guideProjectile(shot, enemies, obstacles, remaining);
        shot.life -= dt;
        // At most three enemy hits (pierce + ricochet), then a final free segment.
        for (let contact = 0; contact < 4; contact++) {
            const start = { x: shot.x, z: shot.z };
            const end = { x: shot.x + shot.velocity.x * remaining, z: shot.z + shot.velocity.z * remaining };
            let wallTime = Infinity;
            for (const obstacle of obstacles) wallTime = Math.min(wallTime, segmentBoxTime(start, end, obstacle, .08) ?? Infinity);
            let hit: ProjectileTarget | undefined, hitTime = Infinity;
            if (shot.enemy) {
                if (callbacks.canDamagePlayer()) hitTime = segmentCircleTime(start, end, player, .52) ?? Infinity;
            } else {
                for (const enemy of enemies) {
                    if (enemy.hp <= 0 || shot.hitIds.has(enemy.id)) continue;
                    const t = segmentCircleTime(start, end, enemy, (enemy.radius ?? .5) + .1) ?? Infinity;
                    if (t < hitTime) { hitTime = t; hit = enemy; }
                }
            }
            const t = Math.min(1, wallTime, hitTime);
            shot.x = start.x + (end.x - start.x) * t; shot.z = start.z + (end.z - start.z) * t;
            if (wallTime <= hitTime && wallTime <= 1) { callbacks.impact({ x: shot.x, z: shot.z }); return false; }
            if (hitTime > 1) break;
            if (shot.enemy) { callbacks.hurtPlayer(shot.damage); return false; }
            if (!hit) break;
            shot.hitIds.add(hit.id);
            callbacks.hurtEnemy(hit.id, shot.damage, shot.flame, shot);
            remaining *= 1 - t;
            // Penetration takes priority. A later terminal impact may ricochet once.
            if (shot.pierces > 0) { shot.pierces--; shot.targetId = undefined; continue; }
            if (shot.bounces > 0) {
                const next = enemies.filter(e => e.hp > 0 && !shot.hitIds.has(e.id)
                    && distance(shot, e) <= UPGRADE_VALUES.ricochetRange
                    && !obstacles.some(o => segmentBox(shot, e, o, .08)))
                    .sort((a, b) => distance(shot, a) - distance(shot, b) || a.id - b.id)[0];
                if (next) {
                    const heading = direction(shot, next), speed = Math.hypot(shot.velocity.x, shot.velocity.z);
                    shot.bounces--; shot.targetId = next.id;
                    shot.velocity = { x: heading.x * speed, z: heading.z * speed };
                    continue;
                }
            }
            return false;
        }
        return shot.life > 0 && shot.x >= bounds.minX && shot.x <= bounds.maxX && shot.z >= bounds.minZ && shot.z <= bounds.maxZ;
    });
}

/** Parent is removed before its three children are emitted; children have no split timer. */
export function fragmentProjectile(parent: Projectile, nextId: () => number): Projectile[] {
    const heading = Math.atan2(parent.velocity.z, parent.velocity.x);
    return [-BOSS_STATS.splitAngle, 0, BOSS_STATS.splitAngle].map(offset => {
        const angle = heading + offset;
        const child = createProjectile(nextId(), parent, { x: parent.x + Math.cos(angle), z: parent.z + Math.sin(angle) },
            true, parent.damage, parent.fragmentSpeed ?? BOSS_STATS.childSpeed, BOSS_STATS.childLife);
        child.fragment = true;
        return child;
    });
}
export function updateProjectiles(shots: Projectile[], dt: number, obstacles: Obstacle[], bounds: Bounds, player: Point, enemies: readonly ProjectileTarget[], callbacks: ProjectileCallbacks): Projectile[] {
    const result: Projectile[] = [];
    for (const shot of shots) {
        const step = shot.splitAfter === undefined ? dt : Math.min(dt, Math.max(0, shot.splitAfter));
        if (!advanceShots([shot], step, obstacles, bounds, player, enemies, callbacks).length) continue;
        if (shot.splitAfter === undefined) { result.push(shot); continue; }
        shot.splitAfter -= step;
        if (shot.splitAfter > 1e-9) { result.push(shot); continue; }
        if (!callbacks.nextId) throw new Error('Split projectiles require an ID allocator');
        const children = fragmentProjectile(shot, callbacks.nextId);
        callbacks.fragment?.({ x: shot.x, z: shot.z });
        // Consume the remainder of this step, so fragmentation never slows time.
        result.push(...advanceShots(children, Math.max(0, dt - step), obstacles, bounds, player, enemies, callbacks));
    }
    return result;
}
