/** Balance values use seconds and world units. No rendering dependencies. */
export const PLAYER_STATS = {
    maxHp: 80, damage: 10, attackCooldown: .35, speed: 7.182, radius: .48,
    invulnerability: .85, projectileSpeed: 25, projectileLife: 1.1,
    dashSpeed: 21, dashDuration: .18, dashCooldown: 1.65, dashInvulnerability: .28,
};
export const ENEMY_STATS = {
    basic: { hp: 48, damage: 15, speed: 2.431, radius: .5, attackRange: 1.4, hitRange: 1.65, windup: .45, recovery: .7 },
    runner: { hp: 42, damage: 20, speed: 3.888, radius: .5, triggerRange: 9, windup: .75, dashSpeed: 14.5, dashDuration: .55, recovery: 1.2 },
    shooter: { hp: 45, damage: 13, speed: 2.53, radius: .5, near: 5, far: 8, range: 14, aim: .6, recovery: 1.65, projectileSpeed: 9.72, projectileLife: 4 },
    grenadier: { hp: 48, damage: 15, speed: 2.2, radius: .55, near: 16, far: 36, range: 42, windup: .55, recovery: 3.6 },
    burrower: { hp: 44, damage: 18, speed: 2.99, radius: .5, firstBurrow: 2, active: 3, burrowWindup: .45, underground: .6, emergence: .9, emergenceRadius: 1.6 },
} as const;
export type EnemyKind = keyof typeof ENEMY_STATS;
export interface PlayerStats {
    speed: number;
    maxHp: number;
    damage: number;
    attackCooldown: number;
}
export function initialStats(): PlayerStats {
    return { speed: PLAYER_STATS.speed, maxHp: PLAYER_STATS.maxHp, damage: PLAYER_STATS.damage, attackCooldown: PLAYER_STATS.attackCooldown };
}
