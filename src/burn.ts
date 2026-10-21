import { UPGRADE_VALUES } from './upgrades.ts';
export interface Burn { damage: number; ticks: number; nextTick: number }
export function refreshBurn(previous: Burn | undefined, projectileDamage: number): Burn {
    // Keep the running tick clock: repeated shots must not postpone burning forever.
    return { damage: projectileDamage * UPGRADE_VALUES.flameFraction,
        ticks: UPGRADE_VALUES.flameTicks, nextTick: previous?.nextTick ?? UPGRADE_VALUES.flameInterval };
}
export function tickBurns(burns: Map<number, Burn>, dt: number, living: (id: number) => boolean, hit: (id: number, damage: number) => void): void {
    for (const [id, burn] of burns) {
        if (!living(id)) { burns.delete(id); continue; }
        burn.nextTick -= dt;
        while (burn.nextTick <= 1e-9 && burn.ticks > 0 && living(id)) {
            burn.nextTick += UPGRADE_VALUES.flameInterval; burn.ticks--; hit(id, burn.damage);
        }
        if (burn.ticks === 0 || !living(id)) burns.delete(id);
    }
}
