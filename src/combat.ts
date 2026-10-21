import { distance, type Point } from './physics.ts';
export interface Target extends Point {
    id: number;
    hp: number;
}
/** Horizontal distance only. Cover affects projectiles, not target selection. */
export function nearestEnemy<T extends Target>(origin: Point, enemies: readonly T[]): T | undefined {
    let best: T | undefined, nearest = Infinity;
    for (const enemy of enemies) {
        const d = distance(origin, enemy);
        if (enemy.hp > 0 && d < nearest) {
            best = enemy;
            nearest = d;
        }
    }
    return best;
}
export function canAutoAttack(moving: boolean, cooldown: number, hasTarget: boolean, inCombat: boolean): boolean {
    return inCombat && !moving && cooldown <= 0 && hasTarget;
}
export function direction(from: Point, to: Point): Point {
    const d = distance(from, to);
    return d > 1e-8 ? { x: (to.x - from.x) / d, z: (to.z - from.z) / d } : { x: 0, z: 1 };
}
