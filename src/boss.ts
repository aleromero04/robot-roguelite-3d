import { direction } from './combat.ts';
import { clamp, distance, moveCircle, segmentBoxTime, segmentCircle, type Bounds, type Obstacle, type Point } from './physics.ts';

/** Boss-only balance: normal enemy and player stats remain independent. Units: seconds / world units. */
export const BOSS_STATS = {
    hp: 1600, radius: 1.25, chargeDamage: 28, projectileDamage: 16,
    chargeWindup: 1, chargeSpeed: 14, chargeDuration: .65,
    secondChargePause: .3, secondChargeWindup: .85, secondChargeHold: .25,
    radialWindup: .9, radialCount: 12, radialSpeed: 7, radialLife: 3.5,
    radialOffset: Math.PI / 12, splitWindup: .85, splitCount: 3,
    splitSpeed: 7.5, splitDelay: .7, splitAngle: Math.PI / 9, childSpeed: 8, childLife: 2.4,
    phaseReaction: .8,
    phases: [
        { speed: 2.4, approach: 2, recovery: 1.5, splitInterval: .32, secondRadialEvery: 3, radialDelay: .45, projectileMultiplier: 1 },
        { speed: 3, approach: 1.25, recovery: .8, splitInterval: .19, secondRadialEvery: 1, radialDelay: .38, projectileMultiplier: 1.08 },
    ],
} as const;
export const BOSS_PATTERNS = ['charge', 'radial', 'split'] as const;
export type BossPattern = typeof BOSS_PATTERNS[number];
export type BossState = 'approach' | 'windup' | 'charge' | 'charge-pause' | 'radial' | 'split' | 'recovery' | 'phase-change' | 'dead';
export interface Boss extends Point {
    id: number; hp: number; maxHp: number; radius: number; phase: 1 | 2;
    state: BossState; timer: number; pattern: BossPattern; lastPattern?: BossPattern;
    aim: Point; dir: Point; walking: boolean; chargeHit: boolean; shotsLeft: number;
    radialRuns: number; secondRadial: boolean; hitFlash: number; recoil: number;
    chargeIndex: 0 | 1;
}
export interface BossShot { origin: Point; direction: Point; split: boolean }
export interface BossIntent { shots: BossShot[]; hit: number; phaseChanged: boolean }
export function createBoss(id: number, position: Point): Boss {
    return { ...position, id, hp: BOSS_STATS.hp, maxHp: BOSS_STATS.hp, radius: BOSS_STATS.radius, phase: 1,
        state: 'approach', timer: BOSS_STATS.phases[0].approach, pattern: 'charge', aim: { x: -1, z: 0 },
        dir: { x: -1, z: 0 }, walking: false, chargeHit: false, shotsLeft: 0, radialRuns: 0,
        secondRadial: false, hitFlash: 0, recoil: 0, chargeIndex: 0 };
}
export function stopBoss(boss: Boss): void {
    boss.state = 'dead'; boss.timer = 0; boss.shotsLeft = 0;
    boss.secondRadial = false; boss.walking = false; boss.recoil = 0; boss.chargeIndex = 0;
}
export function radialDirections(offset = 0): Point[] {
    return Array.from({ length: BOSS_STATS.radialCount }, (_, i) => {
        const angle = i * 2 * Math.PI / BOSS_STATS.radialCount + offset;
        return { x: Math.cos(angle), z: Math.sin(angle) };
    });
}
export function updateBoss(boss: Boss, player: Point, obstacles: Obstacle[], bounds: Bounds, dt: number, locomotionMultiplier = 1): BossIntent {
    const intent: BossIntent = { shots: [], hit: 0, phaseChanged: false };
    if (boss.state === 'dead' || boss.hp <= 0) { stopBoss(boss); return intent; }
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    boss.recoil = Math.max(0, boss.recoil - dt * 5);
    boss.walking = false;
    if (boss.phase === 1 && boss.hp <= boss.maxHp / 2) {
        boss.phase = 2; boss.state = 'phase-change'; boss.timer = BOSS_STATS.phaseReaction;
        boss.shotsLeft = 0; boss.secondRadial = false; boss.chargeIndex = 0; intent.phaseChanged = true;
        return intent;
    }
    const tuning = BOSS_STATS.phases[boss.phase - 1];
    const recover = () => { boss.state = 'recovery'; boss.timer = tuning.recovery; boss.shotsLeft = 0; };
    const fire = (dir: Point, split = false) => {
        intent.shots.push({ origin: { x: boss.x + dir.x * 1.6, z: boss.z + dir.z * 1.6 }, direction: dir, split });
        boss.recoil = 1;
    };
    boss.timer -= dt;
    if (boss.state === 'approach') {
        boss.aim = direction(boss, player);
        // Keep positioning in the open fighting floor; rear machinery cannot trap the boss.
        const target = { x: clamp(player.x, bounds.minX + 3.5, bounds.maxX - 3.5), z: clamp(player.z, -4.3, 7.5) };
        if (distance(boss, target) > 2.6) {
            const dir = direction(boss, target), previous = { x: boss.x, z: boss.z };
            const next = moveCircle(boss, dir.x * tuning.speed * locomotionMultiplier * dt, dir.z * tuning.speed * locomotionMultiplier * dt, boss.radius, obstacles, bounds);
            boss.x = next.x; boss.z = next.z; boss.walking = distance(previous, boss) > .001;
        }
        if (boss.timer <= 1e-9) {
            const last = boss.lastPattern ? BOSS_PATTERNS.indexOf(boss.lastPattern) : -1;
            boss.pattern = BOSS_PATTERNS[(last + 1) % BOSS_PATTERNS.length];
            boss.lastPattern = boss.pattern; boss.state = 'windup'; boss.chargeIndex = 0;
            boss.dir = direction(boss, player); boss.aim = { ...boss.dir }; // Warning and charge share the same locked line.
            boss.timer = boss.pattern === 'charge' ? BOSS_STATS.chargeWindup : boss.pattern === 'radial' ? BOSS_STATS.radialWindup : BOSS_STATS.splitWindup;
        }
    } else if (boss.state === 'charge-pause' && boss.timer <= 1e-9) {
        boss.state = 'windup'; boss.timer = BOSS_STATS.secondChargeWindup;
        boss.aim = direction(boss, player);
    } else if (boss.state === 'windup') {
        // The second warning visibly tracks, then holds its line for the final 250ms.
        // Commit direction only on launch; charges themselves never home.
        if (boss.pattern === 'charge' && boss.chargeIndex === 1 && boss.timer > BOSS_STATS.secondChargeHold)
            boss.aim = direction(boss, player);
        if (boss.timer > 1e-9) return intent;
        boss.state = boss.pattern;
        if (boss.pattern === 'charge') {
            if (boss.chargeIndex === 1) boss.dir = { ...boss.aim };
            boss.timer = BOSS_STATS.chargeDuration; boss.chargeHit = false;
        }
        if (boss.pattern === 'radial') {
            radialDirections().forEach(dir => fire(dir)); boss.radialRuns++;
            boss.secondRadial = boss.radialRuns % tuning.secondRadialEvery === 0;
            if (boss.secondRadial) boss.timer = tuning.radialDelay;
            else recover();
        }
        if (boss.pattern === 'split') { boss.shotsLeft = BOSS_STATS.splitCount; boss.timer = 0; }
    } else if (boss.state === 'charge') {
        const start = { x: boss.x, z: boss.z };
        const step = Math.min(dt, Math.max(0, boss.timer + dt)) * BOSS_STATS.chargeSpeed;
        const end = { x: boss.x + boss.dir.x * step, z: boss.z + boss.dir.z * step };
        let fraction = 1;
        for (const obstacle of obstacles) fraction = Math.min(fraction, segmentBoxTime(start, end, obstacle, boss.radius) ?? 1);
        for (const [key, min, max] of [['x', bounds.minX, bounds.maxX], ['z', bounds.minZ, bounds.maxZ]] as const) {
            const delta = end[key] - start[key];
            if (delta > 0) fraction = Math.min(fraction, (max - boss.radius - start[key]) / delta);
            if (delta < 0) fraction = Math.min(fraction, (min + boss.radius - start[key]) / delta);
        }
        fraction = clamp(fraction, 0, 1);
        boss.x += (end.x - start.x) * Math.max(0, fraction - 1e-6);
        boss.z += (end.z - start.z) * Math.max(0, fraction - 1e-6);
        if (!boss.chargeHit && segmentCircle(start, boss, player, boss.radius + .48)) {
            intent.hit = BOSS_STATS.chargeDamage; boss.chargeHit = true;
        }
        boss.walking = true;
        if (fraction < 1 || boss.timer <= 1e-9) {
            if (boss.phase === 2 && boss.chargeIndex === 0) {
                boss.chargeIndex = 1; boss.state = 'charge-pause'; boss.timer = BOSS_STATS.secondChargePause;
                boss.walking = false;
            } else recover();
        }
    } else if (boss.state === 'radial' && boss.timer <= 1e-9) {
        radialDirections(BOSS_STATS.radialOffset).forEach(dir => fire(dir));
        boss.secondRadial = false; recover();
    } else if (boss.state === 'split' && boss.timer <= 1e-9) {
        boss.aim = direction(boss, player); fire(boss.aim, true);
        boss.shotsLeft--; boss.timer += tuning.splitInterval;
        if (!boss.shotsLeft) recover();
    } else if ((boss.state === 'recovery' || boss.state === 'phase-change') && boss.timer <= 1e-9) {
        boss.state = 'approach'; boss.timer = tuning.approach;
    }
    return intent;
}
