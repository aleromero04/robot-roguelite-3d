/** Test-only keyboard pilot. It uses normal input, damage, aiming and offered upgrades. */
import { direction } from '../src/combat.ts';
import { distance, intersects, segmentBox, segmentCircle, type Point, type Obstacle, type Bounds } from '../src/physics.ts';
import type { Simulation } from '../src/simulation.ts';
import { ROOM_CENTERS } from '../src/layout.ts';
import { BOSS_SECTOR } from '../src/waves.ts';
import { BOSS_STATS } from '../src/boss.ts';
export class TestNavigator {
    private path: Point[] = [];
    private goal: Point = { x: Infinity, z: Infinity };
    toward(p: Point, goal: Point, obstacles: Obstacle[], bounds: Bounds): Point {
        const clear = (a: Point, b: Point) => !obstacles.some(o => segmentBox(a, b, o, .55));
        if (clear(p, goal)) return direction(p, goal);
        if (distance(goal, this.goal) > .1 || !this.path.length) {
            this.goal = { ...goal };
            const grid = .65, cols = Math.floor((bounds.maxX - bounds.minX - 1.2) / grid) + 1;
            const rows = Math.floor((bounds.maxZ - bounds.minZ - 1.2) / grid) + 1;
            const point = (id: number) => ({ x: bounds.minX + .6 + id % cols * grid, z: bounds.minZ + .6 + Math.floor(id / cols) * grid });
            const valid = Array.from({ length: cols * rows }, (_, id) => !obstacles.some(o => intersects(point(id), .56, o)));
            const nearest = (target: Point) => valid.reduce((best, ok, id) => ok && distance(point(id), target) < distance(point(best), target) ? id : best, valid.indexOf(true));
            const start = nearest(p), end = nearest(goal), open = [start], costs = new Map([[start, 0]]), from = new Map<number, number>();
            while (open.length) {
                open.sort((a, b) => costs.get(a)! + distance(point(a), goal) - costs.get(b)! - distance(point(b), goal));
                const current = open.shift()!;
                if (current === end) {
                    let id = end; const reversed = [goal, point(id)];
                    while (from.has(id)) { id = from.get(id)!; reversed.push(point(id)); }
                    this.path = reversed.reverse(); break;
                }
                for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
                    const x = current % cols + dx, z = Math.floor(current / cols) + dz, id = z * cols + x;
                    if (x < 0 || x >= cols || z < 0 || z >= rows || !valid[id] || !clear(point(current), point(id))) continue;
                    const cost = costs.get(current)! + grid * Math.hypot(dx, dz);
                    if (cost >= (costs.get(id) ?? Infinity)) continue;
                    costs.set(id, cost); from.set(id, current); if (!open.includes(id)) open.push(id);
                }
            }
        }
        while (this.path.length > 1 && (distance(p, this.path[0]) < .25 || clear(p, this.path[1]))) this.path.shift();
        return direction(p, this.path[0] ?? goal);
    }
}
export function bossPilotInput(sim: Simulation): Point {
    const boss = sim.boss!, p = sim.player;
    const delta = distance(p, boss);
    const line = boss.state === 'windup' && boss.chargeIndex === 1 ? boss.aim : boss.dir;
    const charge = (boss.state === 'windup' && boss.pattern === 'charge' || boss.state === 'charge')
        && segmentCircle(boss, { x: boss.x + line.x * BOSS_STATS.chargeSpeed * BOSS_STATS.chargeDuration, z: boss.z + line.z * BOSS_STATS.chargeSpeed * BOSS_STATS.chargeDuration }, p, 2.2);
    const bullet = sim.projectiles.find(shot => shot.enemy && segmentCircle(shot,
        { x: shot.x + shot.velocity.x * .75, z: shot.z + shot.velocity.z * .75 }, p, .95));
    if (charge) {
        // Read the visible second warning, and choose a perpendicular escape with room to finish.
        const center = ROOM_CENTERS[BOSS_SECTOR];
        const options = [-1, 1].map(sign => ({ x: -line.z * sign, z: line.x * sign }));
        const score = (v: Point) => {
            const end = { x: p.x + v.x * 4, z: p.z + v.z * 4 };
            if (sim.obstacles.some(o => segmentBox(p, end, o, .5))) return -100;
            return Math.min(end.x - center + 13, center + 13 - end.x, end.z + 9, 9 - end.z);
        };
        options.sort((a, b) => score(b) - score(a));
        const escape = options[0];
        if ((boss.state === 'charge' || boss.timer < .3) && p.lastDir.x * escape.x + p.lastDir.z * escape.z > .9)
            sim.dash();
        return escape;
    }
    if (!charge && !bullet && delta > 4.4 && delta < 15) return { x: 0, z: 0 };
    // Choose an escape that remains clear over a short horizon, rather than bouncing
    // between artificial edge thresholds while a projectile keeps approaching.
    const center = ROOM_CENTERS[BOSS_SECTOR], away = direction(boss, p);
    let best = -Infinity, result = { x: 0, z: 0 };
    for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, v = { x: Math.cos(a), z: Math.sin(a) };
        let safety = 3, blocked = false;
        for (let step = 1; step <= 8; step++) {
            const t = step * .08, next = { x: p.x + v.x * p.stats.speed * t, z: p.z + v.z * p.stats.speed * t };
            if (Math.abs(next.x - center) > 13.5 || Math.abs(next.z) > 9.5 || sim.obstacles.some(o => segmentBox(p, next, o, .5))) { blocked = true; break; }
            safety = Math.min(safety, distance(next, boss) - boss.radius - .6);
            for (const shot of sim.projectiles) if (shot.enemy)
                safety = Math.min(safety, distance(next, { x: shot.x + shot.velocity.x * t, z: shot.z + shot.velocity.z * t }) - .75);
        }
        if (blocked) continue;
        const end = { x: p.x + v.x * p.stats.speed * .64, z: p.z + v.z * p.stats.speed * .64 };
        const range = distance(end, boss), inward = delta < 7 ? 1 : delta > 11 ? -1 : 0;
        const score = safety * 10 - Math.abs(range - 8) * .3 + (v.x * away.x + v.z * away.z) * inward
            + (v.x * p.lastDir.x + v.z * p.lastDir.z) * .2;
        if (score > best) { best = score; result = v; }
    }
    return result;
}

/** The keyboard pilot must go around solid enemies, just as it goes around cover. */
export function avoidEnemyBodies(sim: Simulation, input: Point): Point {
    if (Math.hypot(input.x, input.z) < .01) return input;
    const p = sim.player, probe = { x: p.x + input.x * 1.6, z: p.z + input.z * 1.6 };
    if (!sim.enemies.some(e => segmentCircle(p, probe, e, 1.15))) return input;
    let best = -Infinity, result = input;
    const heading = Math.atan2(input.z, input.x);
    for (let i = 0; i < 16; i++) {
        const angle = heading + i * Math.PI / 8, direction = { x: Math.cos(angle), z: Math.sin(angle) };
        const next = { x: p.x + direction.x * 1.2, z: p.z + direction.z * 1.2 };
        if (sim.obstacles.some(o => segmentBox(p, next, o, .5))) continue;
        if (sim.enemies.some(e => segmentCircle(p, next, e, 1.1) && distance(next, e) <= distance(p, e))) continue;
        const clearance = Math.min(3, ...sim.enemies.map(e => distance(next, e)));
        const score = clearance + (direction.x * input.x + direction.z * input.z) * .8;
        if (score > best) { best = score; result = direction; }
    }
    return result;
}
