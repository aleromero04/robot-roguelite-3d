import { direction } from '../combat.ts';
import { distance, intersects, moveCircle, segmentBox, segmentCircle, type Point, type Obstacle, type Bounds } from '../physics.ts';
import { ENEMY_STATS, PLAYER_STATS, type EnemyKind } from '../stats.ts';
import { updateBasic } from './basic.ts';
import { updateRunner } from './runner.ts';
import { updateShooter } from './shooter.ts';
import { isUnderground, type Enemy, type EnemyContext, type Intent } from './types.ts';
import { updateGrenadier } from './grenadier.ts';
import { updateBurrower } from './burrower.ts';
export type { Enemy } from './types.ts';
export function createEnemy(id: number, kind: EnemyKind, position: Point): Enemy {
    const hp = ENEMY_STATS[kind].hp;
    return { id, kind, ...position, hp, maxHp: hp, state: 'chase', timer: kind === 'burrower' ? ENEMY_STATS.burrower.firstBurrow : 0, dir: { x: 0, z: 1 }, aim: { x: 0, z: 1 }, dashHit: false, walking: false };
}
function steer(enemy: Enemy, velocity: Point, player: Point, obstacles: Obstacle[], bounds: Bounds): Point {
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < .01)
        return velocity;
    const inBounds = (p: Point): boolean => p.x >= bounds.minX + .5 - 1e-8 && p.x <= bounds.maxX - .5 + 1e-8
        && p.z >= bounds.minZ + .5 - 1e-8 && p.z <= bounds.maxZ - .5 + 1e-8;
    // Keep a local corner target until reached; this avoids alternating left/right
    // in front of broad cover. Retreating Shooters keep their intended direction.
    const retreating = velocity.x * (player.x - enemy.x) + velocity.z * (player.z - enemy.z) < 0;
    const destination = retreating
        ? { x: enemy.x + velocity.x / speed * 8, z: enemy.z + velocity.z / speed * 8 }
        : player;
    const blocker = obstacles.filter(o => segmentBox(enemy, destination, o, .65))
        .sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
    if (!blocker) enemy.detour = undefined;
    else {
        if (enemy.detour && (distance(enemy, enemy.detour) < .2 || obstacles.some(o => segmentBox(enemy, enemy.detour!, o, .51))))
            enemy.detour = undefined;
        if (!enemy.detour) {
            const corners: Point[] = [];
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const corner = { x: blocker.x + sx * (blocker.halfX + .85), z: blocker.z + sz * (blocker.halfZ + .85) };
                if (!inBounds(corner) || distance(enemy, corner) < .2 || obstacles.some(o => segmentBox(enemy, corner, o, .51))) continue;
                corners.push(corner);
            }
            corners.sort((a, b) => distance(enemy, a) + distance(a, destination) - distance(enemy, b) - distance(b, destination));
            enemy.detour = corners[0];
        }
        if (enemy.detour) {
            const heading = direction(enemy, enemy.detour);
            return { x: heading.x * speed, z: heading.z * speed };
        }
    }
    const look = { x: enemy.x + velocity.x / speed, z: enemy.z + velocity.z / speed };
    if (inBounds(look) && !obstacles.some(o => intersects(look, .58, o)))
        return velocity;
    const base = Math.atan2(velocity.x, velocity.z), goal = { x: velocity.x / speed, z: velocity.z / speed };
    let best = -Infinity, result = { x: 0, z: 0 };
    for (const angle of [-Math.PI / 2, -1.1, -.7, .7, 1.1, Math.PI / 2, Math.PI]) {
        const dx = Math.sin(base + angle), dz = Math.cos(base + angle);
        const candidate = { x: enemy.x + dx * .95, z: enemy.z + dz * .95 };
        if (!inBounds(candidate) || obstacles.some(o => intersects(candidate, .58, o)))
            continue;
        const score = dx * goal.x + dz * goal.z;
        if (score > best) {
            best = score;
            result = { x: dx * speed, z: dz * speed };
        }
    }
    return result;
}
export function updateEnemy(enemy: Enemy, player: Point, peers: readonly Enemy[], obstacles: Obstacle[], bounds: Bounds, dt: number, options: Partial<EnemyContext> = {}): Intent {
    const visible = !obstacles.some(o => segmentBox(enemy, player, o, enemy.kind === 'runner' ? ENEMY_STATS.runner.radius : .1));
    const context: EnemyContext = { playerVelocity: { x: 0, z: 0 }, sector: 0, random: Math.random, thermal: [], ...options };
    const intent = enemy.kind === 'grenadier' ? updateGrenadier(enemy, player, dt, visible, context, obstacles, bounds)
        : enemy.kind === 'burrower' ? updateBurrower(enemy, player, peers, dt, context, obstacles, bounds)
        : enemy.kind === 'shooter' ? updateShooter(enemy, player, dt, visible, context)
        : enemy.kind === 'basic' ? updateBasic(enemy, player, dt, visible) : updateRunner(enemy, player, dt, visible);
    if (isUnderground(enemy) || intent.emerged) { enemy.walking = false; return intent; }
    let velocity = intent.velocity;
    if (enemy.state === 'chase' || (enemy.kind === 'grenadier' && enemy.state === 'recovery')) {
        velocity = steer(enemy, velocity, player, obstacles, bounds);
        let sx = 0, sz = 0;
        for (const other of peers)
            if (other.id !== enemy.id && other.hp > 0 && !isUnderground(other)) {
                const d = distance(enemy, other);
                if (d >= 1.4)
                    continue;
                const dir = d > .001 ? direction(other, enemy) : { x: enemy.id < other.id ? -1 : 1, z: 0 };
                sx += dir.x * (1.4 - d) * 2.1;
                sz += dir.z * (1.4 - d) * 2.1;
            }
        const separation = Math.hypot(sx, sz), cap = separation > 1 ? 1 / separation : 1;
        velocity = { x: velocity.x + sx * cap, z: velocity.z + sz * cap };
    }
    if (enemy.state === 'chase' || (enemy.kind === 'grenadier' && enemy.state === 'recovery')) {
        const multiplier = context.locomotionMultiplier ?? 1;
        velocity = { x: velocity.x * multiplier, z: velocity.z * multiplier };
    }
    const previous = { x: enemy.x, z: enemy.z };
    const next = moveCircle(enemy, velocity.x * dt, velocity.z * dt, ENEMY_STATS[enemy.kind].radius, obstacles, bounds);
    enemy.walking = distance(enemy, next) > .001;
    enemy.x = next.x;
    enemy.z = next.z;
    if (enemy.state === 'dash' && !enemy.dashHit && segmentCircle(previous, next, player, .5 + PLAYER_STATS.radius)) {
        enemy.dashHit = true;
        intent.hit = ENEMY_STATS.runner.damage;
    }
    return intent;
}
