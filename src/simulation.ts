import { tickFrost, shockTargets } from './status.ts';
import { createFloorHazards, createGrenade, updateFloorHazards, updateThermalZones, type FloorHazard, type ThermalZone } from './hazards.ts';
import { isUnderground } from './enemies/types.ts';
import { refreshBurn, tickBurns, type Burn } from './burn.ts';
import { CONTACT_DAMAGE, stopAtBodies, separateBodies } from './contact.ts';
import { REWARD, rewardPosition } from './rewards.ts';
import { BOSS_STATS, createBoss, stopBoss, updateBoss, type Boss } from './boss.ts';
import { canAutoAttack, direction, nearestEnemy } from './combat.ts';
import { createEnemy, updateEnemy, type Enemy } from './enemies/enemies.ts';
import { createGates, createWorldObstacles, fullyCrossed, gateObstacle, roomBounds, safeSpawn, spawnPositions, updateGate, WORLD_BOUNDS, ROOM_CENTERS } from './layout.ts';
import { beginDash, createPlayer, resolvePlayerHit, updatePlayer, updatePlayerFeedback } from './player.ts';
import { createProjectile, updateProjectiles, type Projectile } from './projectiles.ts';
import { ENEMY_STATS, PLAYER_STATS, type EnemyKind } from './stats.ts';
import { effectiveAttackStats, applyUpgrade, chooseUpgradeOptions, eligibleUpgrades, UPGRADE_VALUES, type UpgradeId } from './upgrades.ts';
import { Progression, WAVE_GROUPS, REINFORCEMENTS, BOSS_SECTOR } from './waves.ts';
import { distance, type Obstacle, type Point } from './physics.ts';
export type GameEvent = {
    type: 'spawn' | 'enemy-hit' | 'enemy-death' | 'player-hit' | 'player-death' | 'impact' | 'dash' | 'boss-hit' | 'boss-death' | 'boss-phase' | 'fragment' | 'reward-spawn' | 'reward-pickup' | 'burn' | 'grenade-throw' | 'explosion' | 'burrow' | 'emerge' | 'shield-ready' | 'flame-impact' | 'shield-break' | 'revive';
    position: Point;
    id?: number;
} | {
    type: 'shock'; position: Point; target: Point; id: number;
} | {
    type: 'shot';
    position: Point;
    id: number;
    enemy: boolean;
};
export const SPAWN_DELAY = .65;
export const SPAWN_FADE = .18;
export interface SpawnTelegraph extends Point {
    id: number;
    kind: EnemyKind;
    age: number;
    spawned: boolean;
}
/** Gameplay owns data; Three.js consumes snapshots and short-lived visual events. */
export class Simulation {
    player = createPlayer();
    thermal: ThermalZone[] = [];
    floorHazards: FloorHazard[] = [];
    playerVelocity: Point = { x: 0, z: 0 };
    reward?: Point;
    shockHits = 0;
    frost = new Map<number, number>();
    burns = new Map<number, Burn>();
    enemies: Enemy[] = [];
    boss?: Boss;
    victoryTime = 0;
    get targets() { const visible = this.enemies.filter(e => !isUnderground(e)); return this.boss && this.boss.hp > 0 ? [...visible, this.boss] : visible; }
    private get livingTargets() { return this.boss && this.boss.hp > 0 ? [...this.enemies, this.boss] : this.enemies; }
    telegraphs: SpawnTelegraph[] = [];
    projectiles: Projectile[] = [];
    progression = new Progression();
    gates = createGates();
    readonly staticObstacles = createWorldObstacles();
    events: GameEvent[] = [];
    elapsed = 0;
    kills = 0;
    offeredUpgrades: UpgradeId[] = [];
    burstShots = 0;
    private burstTimer = 0;
    private groups: EnemyKind[][] = [];
    private combatTime = 0;
    private spawnRetry = 0;
    private nextId = 1;
    private readonly random: () => number;
    constructor(random: () => number = Math.random) { this.random = random; }
    get queuedSpawns(): number { return this.groups.reduce((n, group) => n + group.length, 0); }
    get pendingSpawns(): number { return this.telegraphs.filter(t => !t.spawned).length + this.queuedSpawns; }
    get obstacles(): Obstacle[] {
        return [...this.staticObstacles, ...this.gates.map(gateObstacle).filter((o): o is Obstacle => !!o)];
    }
    start(): void { if (this.progression.start())
        this.spawnWave(); }
    dash(): void {
        if (['combat', 'cleared', 'travel'].includes(this.progression.phase) && beginDash(this.player)) {
            this.burstShots = 0;
            this.events.push({ type: 'dash', position: { ...this.player } });
        }
    }
    selectUpgrade(id: UpgradeId): boolean {
        if (!this.offeredUpgrades.includes(id) || !eligibleUpgrades(this.player).includes(id) || !this.progression.chooseUpgrade())
            return false;
        applyUpgrade(this.player, id);
        this.offeredUpgrades = [];
        this.gates[this.progression.wave].unlocked = true;
        return true;
    }
    private spawnWave(): void {
        if (this.progression.wave === 1) this.floorHazards = createFloorHazards(1);
        if (this.progression.wave === BOSS_SECTOR) {
            this.boss = createBoss(this.nextId++, { x: ROOM_CENTERS[BOSS_SECTOR], z: -1 });
            this.groups = []; this.telegraphs = []; this.burstShots = 0;
            this.player.shotCooldown = .25;
            return;
        }
        this.groups = WAVE_GROUPS[this.progression.wave].map(group => [...group]);
        this.combatTime = 0;
        this.spawnRetry = 0;
        this.burstShots = 0;
        this.scheduleGroup();
        this.player.shotCooldown = .25;
    }
    private scheduleGroup(): void {
        const kinds = this.groups[0];
        if (!kinds) return;
        const occupied = [...this.enemies, ...this.telegraphs.filter(t => !t.spawned)];
        if (occupied.length + kinds.length + this.thermal.length > REINFORCEMENTS.maxActive) return;
        const positions = spawnPositions(this.progression.wave, kinds.length, this.player, this.obstacles, this.random, occupied);
        if (positions.length !== kinds.length) return; // Retry later; never force an unsafe point.
        this.groups.shift();
        this.telegraphs.push(...kinds.map((kind, i) => ({ ...positions[i], id: this.nextId++, kind, age: 0, spawned: false })));
    }
    private updateSpawns(dt: number, obstacles: Obstacle[]): void {
        for (const marker of this.telegraphs) {
            marker.age += dt;
            if (marker.spawned || marker.age + 1e-9 < SPAWN_DELAY) continue;
            const occupied = [...this.enemies, ...this.telegraphs.filter(t => t.id !== marker.id && !t.spawned)];
            if (!safeSpawn(this.progression.wave, marker, this.player, obstacles, occupied)) {
                const replacement = spawnPositions(this.progression.wave, 1, this.player, obstacles, this.random, occupied)[0];
                if (replacement) {
                    marker.x = replacement.x;
                    marker.z = replacement.z;
                }
                // Always give a full warning again, even if all alternate points are occupied.
                marker.age = 0;
                continue;
            }
            marker.spawned = true;
            this.enemies.push(createEnemy(marker.id, marker.kind, { x: marker.x, z: marker.z }));
            this.events.push({ type: 'spawn', position: { x: marker.x, z: marker.z }, id: marker.id });
        }
        this.telegraphs = this.telegraphs.filter(t => !t.spawned || t.age < SPAWN_DELAY + SPAWN_FADE);
    }
    private shoot(origin: Point, aim: Point, enemy: boolean, id: number): void {
        const stats = enemy ? ENEMY_STATS.shooter : PLAYER_STATS;
        const forward = direction(origin, aim), right = enemy ? 0 : .62;
        const muzzle = { x: origin.x + forward.x * .9 + forward.z * right, z: origin.z + forward.z * .9 - forward.x * right };
        const central = direction(muzzle, aim), heading = Math.atan2(central.z, central.x);
        const angles = !enemy && this.player.acquired.has('triple') ? [-UPGRADE_VALUES.tripleAngle, 0, UPGRADE_VALUES.tripleAngle] : [0];
        for (const angle of angles) {
            const target = { x: muzzle.x + Math.cos(heading + angle), z: muzzle.z + Math.sin(heading + angle) };
            this.projectiles.push(createProjectile(this.nextId++, muzzle, target, enemy, enemy ? ENEMY_STATS.shooter.damage : effectiveAttackStats(this.player).damage, stats.projectileSpeed, stats.projectileLife, enemy ? {} : {
                piercing: this.player.acquired.has('piercing') ? UPGRADE_VALUES.piercing : 0,
                ricochet: this.player.acquired.has('ricochet') ? UPGRADE_VALUES.ricochet : 0,
                homing: this.player.acquired.has('homing'), flame: this.player.acquired.has('flame'), shock: this.player.acquired.has('shock'), frost: this.player.acquired.has('frost'),
            }));
        }
        this.events.push({ type: 'shot', position: muzzle, id, enemy });
    }
    private damagePlayer(damage: number, charge = false): void {
        const allowed = ['combat', 'cleared', 'travel'].includes(this.progression.phase);
        const result = resolvePlayerHit(this.player, damage, allowed, charge);
        if (result === 'ignored') return;
        if (result === 'shield') {
            this.events.push({ type: 'shield-break', position: { ...this.player } });
            return;
        }
        this.events.push({ type: 'player-hit', position: { ...this.player } });
        if (result === 'revive') this.events.push({ type: 'revive', position: { ...this.player } });
        if (this.player.hp === 0) {
            this.progression.phase = 'dead';
            this.reward = undefined; this.burns.clear(); this.frost.clear(); this.player.overdriveCharge = 0;
            if (this.boss) stopBoss(this.boss);
            this.telegraphs = [];
            this.groups = [];
            this.burstShots = 0;
            this.events.push({ type: 'player-death', position: { ...this.player } });
        }
    }
    private damageEnemy(id: number, damage: number, flame = false, periodic = false): void {
        const target = this.livingTargets.find(t => t.id === id && t.hp > 0);
        if (target && 'kind' in target && isUnderground(target) && !periodic) return;
        if (flame && target) {
            this.burns.set(id, refreshBurn(this.burns.get(id), damage));
            this.events.push({ type: 'flame-impact', position: { x: target.x, z: target.z }, id });
        }
        if (this.boss?.id === id) {
            const boss = this.boss;
            if (boss.hp <= 0 || this.progression.phase !== 'combat') return;
            boss.hp = Math.max(0, boss.hp - damage); boss.hitFlash = .15;
            this.events.push({ type: 'boss-hit', position: { x: boss.x, z: boss.z }, id });
            if (boss.hp === 0) {
                stopBoss(boss); this.burns.clear(); this.frost.clear(); this.player.overdriveCharge = 0; this.progression.finishBoss(); this.victoryTime = 0; this.kills++;
                this.burstShots = 0; this.burstTimer = 0; this.groups = []; this.telegraphs = [];
                this.player.moving = false; this.player.walking = false; this.player.dashTime = 0;
                this.events.push({ type: 'boss-death', position: { x: boss.x, z: boss.z }, id });
            }
            return;
        }
        const enemy = this.enemies.find(e => e.id === id);
        if (!enemy || enemy.hp <= 0)
            return;
        enemy.hp = Math.max(0, enemy.hp - damage);
        this.events.push({ type: 'enemy-hit', position: { x: enemy.x, z: enemy.z }, id });
        if (enemy.hp > 0)
            return;
        this.kills++; this.burns.delete(id); this.frost.delete(id);
        this.events.push({ type: 'enemy-death', position: { x: enemy.x, z: enemy.z }, id });
        if (this.progression.finishCombat(this.enemies.filter(e => e.hp > 0).length + this.pendingSpawns)) {
            this.reward = rewardPosition(this.progression.wave, this.player, this.obstacles);
            this.burstShots = 0;
            this.events.push({ type: 'reward-spawn', position: { ...this.reward } });
        }
    }
    private projectileHit(id: number, damage: number, flame = false, shot?: Projectile): void {
        const target = this.targets.find(t => t.id === id && t.hp > 0);
        if (!target || !this.inCombat()) return;
        if (shot?.frost) this.frost.set(id, UPGRADE_VALUES.frostDuration);
        const shock = shot?.shock && ++this.shockHits >= UPGRADE_VALUES.shockEvery;
        if (shock) this.shockHits = 0;
        // Keep the source position even when this hit kills it. Secondary hits bypass this method.
        const origin = { id, hp: target.hp, x: target.x, z: target.z };
        this.damageEnemy(id, damage, flame);
        if (!shock) return;
        let from: Point = origin;
        for (const next of shockTargets(origin, this.targets, this.obstacles)) {
            this.events.push({ type: 'shock', position: { x: from.x, z: from.z }, target: { x: next.x, z: next.z }, id: next.id });
            this.damageEnemy(next.id, damage * UPGRADE_VALUES.shockFraction);
            from = next;
        }
    }
    private collectReward(): void {
        if (!this.reward || distance(this.player, this.reward) > REWARD.pickupRadius || !this.progression.collectReward()) return;
        this.events.push({ type: 'reward-pickup', position: { ...this.reward } });
        this.reward = undefined;
        this.offeredUpgrades = chooseUpgradeOptions(this.player, this.random);
        this.player.overdriveCharge = 0;
        this.burstShots = 0; this.player.dashTime = 0; this.player.moving = false; this.player.walking = false;
    }

    private inCombat(): boolean { return this.progression.phase === 'combat'; }
    update(dt: number, input: Point): void {
        updatePlayerFeedback(this.player, dt);
        const phase = this.progression.phase;
        if (phase === 'ready' || phase === 'dead') return;
        if (phase === 'ending' || phase === 'complete') {
            this.victoryTime += dt;
            if (this.victoryTime >= .9) this.progression.phase = 'complete';
            this.advanceShots(dt);
            return;
        }
        this.elapsed += dt;
        this.gates.forEach(g => updateGate(g, dt));
        const obstacles = this.obstacles;
        const control = ['combat', 'cleared', 'travel'].includes(phase);
        const previousPlayer = { x: this.player.x, z: this.player.z };
        updatePlayer(this.player, control ? input : { x: 0, z: 0 }, dt, obstacles, WORLD_BOUNDS, control);
        tickFrost(this.frost, dt, new Set(this.livingTargets.filter(t => t.hp > 0).map(t => t.id)));
        const bodies = [
            ...this.enemies.filter(e => e.hp > 0 && !isUnderground(e)).map(e => ({ id: e.id, x: e.x, z: e.z, radius: ENEMY_STATS[e.kind].radius })),
            ...(this.boss && this.boss.hp > 0 ? [this.boss] : []),
        ];
        const touched = control ? stopAtBodies(previousPlayer, this.player, bodies, obstacles, WORLD_BOUNDS) : new Set<number>();
        this.playerVelocity = { x: (this.player.x - previousPlayer.x) / dt, z: (this.player.z - previousPlayer.z) / dt };
        this.collectReward(); // Selection safety begins at pickup, before projectile contacts in this step.
        if (this.progression.phase === 'combat') tickBurns(this.burns, dt,
            id => this.livingTargets.some(t => t.id === id && t.hp > 0), (id, damage) => {
                const target = this.livingTargets.find(t => t.id === id)!;
                this.events.push({ type: 'burn', position: { x: target.x, z: target.z }, id });
                this.damageEnemy(id, damage, false, true);
            });
        const attackPriority = new Set<number>();
        if (this.inCombat()) {
            this.combatTime += dt;
            this.spawnRetry -= dt;
            if (this.queuedSpawns && this.combatTime >= REINFORCEMENTS.minimumCombatTime
                && this.enemies.length + this.telegraphs.filter(t => !t.spawned).length <= REINFORCEMENTS.remainingThreshold
                && this.spawnRetry <= 0) {
                this.scheduleGroup();
                this.spawnRetry = REINFORCEMENTS.retryInterval;
            }
            this.updateSpawns(dt, obstacles);
            const target = nearestEnemy(this.player, this.targets);
            if (this.player.moving || !target) this.burstShots = 0;
            if (target && !this.player.moving) this.player.aim = direction(this.player, target);
            if (this.burstShots > 0 && target) {
                this.burstTimer -= dt;
                if (this.burstTimer <= 1e-9) {
                    this.shoot(this.player, target, false, 0);
                    this.burstShots--;
                    this.burstTimer += UPGRADE_VALUES.rapidInterval;
                }
            } else if (canAutoAttack(this.player.moving, this.player.shotCooldown, !!target, true) && target) {
                this.shoot(this.player, target, false, 0);
                this.player.shotCooldown = effectiveAttackStats(this.player).attackCooldown;
                if (this.player.acquired.has('rapid')) {
                    this.burstShots = UPGRADE_VALUES.rapidExtraShots;
                    this.burstTimer = UPGRADE_VALUES.rapidInterval;
                }
            }
            const enemyBounds = roomBounds(this.progression.wave);
            // Stable peer snapshot avoids order-dependent separation forces.
            const peers = this.enemies.map(e => ({ ...e }));
            for (const enemy of this.enemies) {
                if (enemy.hp <= 0)
                    continue;
                const wasDashing = enemy.kind === 'runner' && enemy.state === 'dash';
                const intent = updateEnemy(enemy, this.player, peers, obstacles, enemyBounds, dt, { locomotionMultiplier: this.frost.has(enemy.id) ? UPGRADE_VALUES.frostMultiplier : 1, playerVelocity: this.playerVelocity, sector: this.progression.wave, random: this.random, thermal: this.thermal, grenadeAllowed: this.enemies.length + this.telegraphs.filter(t => !t.spawned).length + this.thermal.length < REINFORCEMENTS.maxActive });
                if (intent.hit || intent.emerged || wasDashing || enemy.state === 'dash') attackPriority.add(enemy.id);
                if (intent.grenade) {
                    this.thermal.push(createGrenade(this.nextId++, enemy.id, this.progression.wave, enemy, intent.grenade));
                    this.events.push({ type: 'grenade-throw', position: { x: enemy.x, z: enemy.z }, id: enemy.id });
                }
                if (intent.burrow || intent.emerged) this.events.push({ type: intent.burrow ? 'burrow' : 'emerge', position: { x: enemy.x, z: enemy.z }, id: enemy.id });
                if (intent.hit)
                    this.damagePlayer(intent.hit);
                if (intent.fire && this.progression.phase !== 'dead')
                    this.shoot(enemy, intent.fireTarget ?? this.player, true, enemy.id);
                if (this.progression.phase === 'dead')
                    break;
            }
        }
        if (this.boss && this.progression.phase === 'combat') {
            const wasCharging = this.boss.state === 'charge';
            const intent = updateBoss(this.boss, this.player, obstacles, roomBounds(BOSS_SECTOR), dt, this.frost.has(this.boss.id) ? UPGRADE_VALUES.frostMultiplier : 1);
            if (intent.phaseChanged) this.events.push({ type: 'boss-phase', position: { x: this.boss.x, z: this.boss.z } });
            if (intent.hit) this.damagePlayer(intent.hit, true);
            if (wasCharging || this.boss.state === 'charge' || intent.hit) attackPriority.add(this.boss.id);
            if (this.progression.phase === 'combat') for (const shot of intent.shots) {
                const target = { x: shot.origin.x + shot.direction.x, z: shot.origin.z + shot.direction.z };
                const speedMultiplier = BOSS_STATS.phases[this.boss.phase - 1].projectileMultiplier;
                const projectile = createProjectile(this.nextId++, shot.origin, target, true, BOSS_STATS.projectileDamage,
                    (shot.split ? BOSS_STATS.splitSpeed : BOSS_STATS.radialSpeed) * speedMultiplier, BOSS_STATS.radialLife);
                if (shot.split) {
                    projectile.splitAfter = BOSS_STATS.splitDelay;
                    projectile.fragmentSpeed = BOSS_STATS.childSpeed * speedMultiplier;
                }
                this.projectiles.push(projectile);
                this.events.push({ type: 'shot', position: shot.origin, id: this.boss.id, enemy: true });
            }
        }
        if (this.inCombat()) {
            const bodiesNow = this.targets.filter(t => t.hp > 0).map(t => ({ ...t, radius: 'kind' in t ? ENEMY_STATS[t.kind].radius : t.radius }));
            const contacts = separateBodies(this.player, bodiesNow, dt, obstacles, WORLD_BOUNDS);
            // All specific attacks resolve before passive contact; active dashes never add body damage.
            for (const body of bodiesNow) if (!attackPriority.has(body.id) && (contacts.has(body.id) || touched.has(body.id)))
                this.damagePlayer(CONTACT_DAMAGE['kind' in body ? body.kind : 'boss']);
        }
        this.advanceShots(dt);
        this.thermal = updateThermalZones(this.thermal, dt, this.player, damage => this.damagePlayer(damage),
            zone => this.events.push({ type: 'explosion', position: { x: zone.x, z: zone.z } }));
        updateFloorHazards(this.floorHazards, dt, this.progression.phase === 'combat' && this.progression.wave === 1,
            this.player, damage => this.damagePlayer(damage), this.random);
        this.enemies = this.enemies.filter(e => e.hp > 0);
        if (phase !== 'combat') {
            this.telegraphs.forEach(t => t.age += dt);
            this.telegraphs = this.telegraphs.filter(t => t.age < SPAWN_DELAY + SPAWN_FADE);
        }
        // Never move the player to close a door; seal only after the entire body is inside.
        if (this.progression.phase === 'travel' && fullyCrossed(this.player, PLAYER_STATS.radius, this.progression.wave)) {
            const gate = this.gates[this.progression.wave];
            if (gate.openness >= .99) {
                gate.sealed = true;
                if (this.progression.crossExit()) {
                    if (this.player.acquired.has('shield')) {
                        this.player.shieldSpent = false;
                        this.player.shieldPulse = 0;
                        this.events.push({ type: 'shield-ready', position: { ...this.player } });
                    }
                    this.spawnWave();
                }
            }
        }
    }
    private advanceShots(dt: number): void {
        this.projectiles = updateProjectiles(this.projectiles, dt, this.obstacles, WORLD_BOUNDS, this.player, this.targets, {
            nextId: () => this.nextId++,
            fragment: position => this.events.push({ type: 'fragment', position }),
            hurtPlayer: damage => this.damagePlayer(damage), hurtEnemy: (id, damage, flame, shot) => this.projectileHit(id, damage, flame, shot),
            impact: position => this.events.push({ type: 'impact', position: { ...position } }),
            canDamagePlayer: () => ['combat', 'cleared', 'travel'].includes(this.progression.phase),
        });
    }
}
