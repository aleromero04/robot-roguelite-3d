import { distance, segmentBox, type Point, type Obstacle } from './physics.ts';
import { UPGRADE_VALUES } from './upgrades.ts';
/** Timers use real simulation seconds; only locomotion consumes the resulting multiplier. */
export function tickFrost(frost: Map<number, number>, dt: number, alive: ReadonlySet<number>): void {
    for (const [id, remaining] of frost) {
        const next = remaining - dt;
        if (!alive.has(id) || next <= 1e-9) frost.delete(id);
        else frost.set(id, next);
    }
}
interface ChainTarget extends Point { id: number; hp: number }
/** Two bounded, non-recursive hops. Each hop uses nearby live targets and respects cover. */
export function shockTargets<T extends ChainTarget>(origin: ChainTarget, targets: readonly T[], obstacles: readonly Obstacle[]): T[] {
    const result: T[] = [], visited = new Set([origin.id]);
    let from: Point = origin;
    while (result.length < UPGRADE_VALUES.shockTargets) {
        const next = targets.filter(t => t.hp > 0 && !visited.has(t.id) && distance(from, t) <= UPGRADE_VALUES.shockRange
            && !obstacles.some(o => segmentBox(from, t, o, .08)))
            .sort((a, b) => distance(from, a) - distance(from, b) || a.id - b.id)[0];
        if (!next) break;
        result.push(next); visited.add(next.id); from = next;
    }
    return result;
}
