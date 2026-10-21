import { moveCircle, type Obstacle, type Point, type Bounds } from './physics.ts';
import { UPGRADE_VALUES, type UpgradeId } from './upgrades.ts';
import { initialStats, PLAYER_STATS, type PlayerStats } from './stats.ts';
export const DAMAGE_FEEDBACK = { robot: .15, screen: .26, hud: .3, shake: .12, normalStrength: .12, chargeStrength: .2 } as const;
export interface Player extends Point {
    overdriveCharge: number;
    shieldSpent: boolean;
    shieldPulse: number;
    reviveUsed: boolean;
    revivePulse: number;
    damageFlash: number;
    damageScreen: number;
    damageHud: number;
    damageShake: number;
    damageStrength: number;
    hp: number;
    acquired: Set<UpgradeId>;
    stats: PlayerStats;
    shotCooldown: number;
    invulnerable: number;
    dashCooldown: number;
    dashTime: number;
    dashDir: Point;
    lastDir: Point;
    moving: boolean;
    walking: boolean;
    aim: Point;
}
export function createPlayer(): Player {
    return { overdriveCharge: 0, shieldSpent: false, shieldPulse: 0, reviveUsed: false, revivePulse: 0, damageFlash: 0, damageScreen: 0, damageHud: 0, damageShake: 0, damageStrength: 0, x: 0, z: 3.7, hp: PLAYER_STATS.maxHp, acquired: new Set(), stats: initialStats(), shotCooldown: .25,
        invulnerable: 0, dashCooldown: 0, dashTime: 0, dashDir: { x: 0, z: -1 }, lastDir: { x: 0, z: -1 },
        moving: false, walking: false, aim: { x: 0, z: -1 } };
}
export function movementInput(x: number, z: number): Point {
    const length = Math.hypot(x, z), yaw = Math.atan2(10, 18);
    if (!length)
        return { x: 0, z: 0 };
    return { x: (x * Math.cos(yaw) + z * Math.sin(yaw)) / length, z: (z * Math.cos(yaw) - x * Math.sin(yaw)) / length };
}
export function beginDash(player: Player): boolean {
    if (player.dashCooldown > 0 || player.hp <= 0)
        return false;
    player.overdriveCharge = 0;
    player.dashDir = { ...player.lastDir };
    player.dashTime = PLAYER_STATS.dashDuration;
    player.dashCooldown = PLAYER_STATS.dashCooldown;
    player.invulnerable = Math.max(player.invulnerable, PLAYER_STATS.dashInvulnerability);
    return true;
}
export function updatePlayer(player: Player, input: Point, dt: number, obstacles: Obstacle[], bounds: Bounds, allowOverdrive = true): void {
    player.shotCooldown = Math.max(0, player.shotCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    const intent = Math.hypot(input.x, input.z) > .001;
    if (intent)
        player.lastDir = { ...input };
    const dashing = player.dashTime > 0;
    const dir = dashing ? player.dashDir : input;
    const speed = dashing ? PLAYER_STATS.dashSpeed : player.stats.speed;
    const next = moveCircle(player, dir.x * speed * dt, dir.z * speed * dt, PLAYER_STATS.radius, obstacles, bounds);
    player.walking = Math.hypot(next.x - player.x, next.z - player.z) > .001;
    // Holding against a wall still counts as movement intent: never fire while trying to move.
    player.moving = intent || dashing || player.walking;
    player.overdriveCharge = allowOverdrive && player.acquired.has('overdrive') && !player.moving
        ? Math.min(UPGRADE_VALUES.overdriveCharge, player.overdriveCharge + dt) : 0;
    player.x = next.x;
    player.z = next.z;
    player.dashTime = Math.max(0, player.dashTime - dt);
    if (player.moving)
        player.aim = { ...dir };
}
export function hurtPlayer(player: Player, damage: number, damageAllowed: boolean): boolean {
    if (!damageAllowed || player.invulnerable > 0 || player.hp <= 0)
        return false;
    player.hp = Math.max(0, player.hp - damage);
    player.invulnerable = PLAYER_STATS.invulnerability;
    return true;
}

/** Visual feedback decays even after lethal damage / Victory; pause supplies no simulation steps. */
export function updatePlayerFeedback(player: Player, dt: number): void {
    for (const key of ['damageFlash', 'damageScreen', 'damageHud', 'damageShake', 'shieldPulse', 'revivePulse'] as const)
        player[key] = Math.max(0, player[key] - dt);
}
export type HitResult = 'ignored' | 'shield' | 'damage' | 'revive';
export function resolvePlayerHit(player: Player, damage: number, allowed: boolean, charge = false): HitResult {
    if (!allowed || damage <= 0 || player.hp <= 0 || player.invulnerable > 0) return 'ignored';
    if (player.acquired.has('shield') && !player.shieldSpent) {
        player.shieldSpent = true;
        player.shieldPulse = .3;
        // Absorbing an impact also grants normal i-frames: another source in this frame cannot take HP.
        player.invulnerable = PLAYER_STATS.invulnerability;
        return 'shield';
    }
    hurtPlayer(player, damage, true);
    player.damageFlash = DAMAGE_FEEDBACK.robot; player.damageScreen = DAMAGE_FEEDBACK.screen;
    player.damageHud = DAMAGE_FEEDBACK.hud; player.damageShake = DAMAGE_FEEDBACK.shake;
    player.damageStrength = charge ? DAMAGE_FEEDBACK.chargeStrength : DAMAGE_FEEDBACK.normalStrength;
    if (player.hp === 0 && player.acquired.has('revive') && !player.reviveUsed) {
        player.reviveUsed = true;
        player.hp = player.stats.maxHp * UPGRADE_VALUES.reviveFraction;
        player.invulnerable = UPGRADE_VALUES.reviveInvulnerability;
        player.revivePulse = .8;
        return 'revive';
    }
    return 'damage';
}
