import type { EnemyKind } from './stats.ts';
/** Each row is one combat. Later rows contain a single reinforcement group. */
export const WAVE_GROUPS: readonly (readonly (readonly EnemyKind[])[])[] = [
    [['basic', 'basic', 'basic']],
    [['basic', 'basic', 'runner', 'runner']],
    [['basic', 'basic', 'runner', 'runner', 'shooter', 'shooter']],
    [['basic', 'basic', 'runner', 'shooter', 'shooter', 'grenadier']],
    [['basic', 'runner', 'shooter', 'grenadier', 'burrower'], ['burrower', 'runner', 'shooter']],
    [['basic', 'basic', 'runner', 'shooter', 'grenadier', 'burrower'], ['burrower', 'runner', 'shooter', 'grenadier']],
];
export const WAVES: readonly (readonly EnemyKind[])[] = WAVE_GROUPS.map(groups => groups.flat());
export const BOSS_SECTOR = WAVES.length;
export const SECTOR_COUNT = BOSS_SECTOR + 1;
export const REINFORCEMENTS = { remainingThreshold: 2, minimumCombatTime: 4, retryInterval: .25, maxActive: 7 } as const;
export const sectorNumber = (index: number): string => String(index + 1).padStart(2, '0');
export type Phase = 'ready' | 'combat' | 'cleared' | 'upgrade' | 'travel' | 'ending' | 'complete' | 'dead';
export class Progression {
    phase: Phase = 'ready';
    wave = 0;
    start(): boolean {
        if (this.phase !== 'ready') return false;
        this.phase = 'combat';
        return true;
    }
    finishCombat(remainingEnemies: number): boolean {
        if (this.phase !== 'combat' || this.wave >= BOSS_SECTOR || remainingEnemies !== 0) return false;
        this.phase = 'cleared';
        return true;
    }
    collectReward(): boolean {
        if (this.phase !== 'cleared') return false;
        this.phase = 'upgrade';
        return true;
    }
    chooseUpgrade(): boolean {
        if (this.phase !== 'upgrade') return false;
        this.phase = 'travel';
        return true;
    }
    finishBoss(): boolean {
        if (this.phase !== 'combat' || this.wave !== BOSS_SECTOR) return false;
        this.phase = 'ending';
        return true;
    }
    crossExit(): boolean {
        if (this.phase !== 'travel' || this.wave >= BOSS_SECTOR) return false;
        this.wave++; this.phase = 'combat';
        return true;
    }
}
