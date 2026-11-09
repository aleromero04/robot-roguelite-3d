import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, SPAWN_DELAY } from '../src/simulation.ts';
import { createEnemy, updateEnemy } from '../src/enemies/enemies.ts';
import { BOSS_ADDS, BOSS_STATS, createBoss, updateBoss } from '../src/boss.ts';
import { ENEMY_STATS } from '../src/stats.ts';
import { applyUpgrade, UPGRADE_VALUES } from '../src/upgrades.ts';
import { createProjectile } from '../src/projectiles.ts';
import { BOSS_SECTOR } from '../src/waves.ts';
import { ROOM_CENTERS, safeSpawn } from '../src/layout.ts';
import { distance } from '../src/physics.ts';
import { seededRandom } from './helpers.ts';

const dt = 1 / 60, still = { x: 0, z: 0 };
const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

for (const kind of ['basic', 'runner', 'shooter', 'grenadier', 'burrower'] as const) {
    test(`${kind}: S01 baseline, progressive S02–06 pursuit and unchanged HP/damage`, () => {
        const speeds = Array.from({ length: 6 }, (_, sector) => {
            const enemy = createEnemy(1, kind, still);
            // Beyond every attack range: measure pursuit independently of attack decisions.
            updateEnemy(enemy, { x: 60, z: 0 }, [enemy], [], bounds, dt, { sector });
            assert.equal(enemy.hp, ENEMY_STATS[kind].hp);
            return enemy.x / dt;
        });
        close(speeds[0], ENEMY_STATS[kind].speed);
        speeds.forEach((speed, i) => close(speed, speeds[0] * (1 + i * .03)));
        assert.ok(speeds[5] > speeds[2] && speeds[2] > speeds[0]);
    });
}

test('late-sector mobility composes with Frost; Runner retains its faster pursuit and fixed dash', () => {
    for (const kind of ['basic', 'runner', 'burrower'] as const) {
        const enemy = createEnemy(1, kind, still);
        updateEnemy(enemy, { x: 60, z: 0 }, [enemy], [], bounds, dt, { sector: 5, locomotionMultiplier: .8 });
        close(enemy.x / dt, ENEMY_STATS[kind].speed * 1.15 * .8);
    }
    assert.ok(ENEMY_STATS.runner.speed > ENEMY_STATS.basic.speed * 1.5);
    const runner = createEnemy(1, 'runner', still);
    runner.state = 'dash'; runner.timer = .5; runner.dir = { x: 1, z: 0 };
    updateEnemy(runner, { x: 60, z: 0 }, [runner], [], bounds, dt, { sector: 5, locomotionMultiplier: .8 });
    close(runner.x / dt, 14.5);
});

test('sector pressure leaves ranged retreat/ranges and Burrower underground timing unchanged', () => {
    for (const kind of ['shooter', 'grenadier'] as const) {
        const positions = [0, 5].map(sector => {
            const enemy = createEnemy(1, kind, still);
            if (kind === 'grenadier') { enemy.state = 'recovery'; enemy.timer = 1; }
            updateEnemy(enemy, { x: 2, z: 0 }, [enemy], [], bounds, dt, { sector });
            return enemy.x;
        });
        close(positions[0], -ENEMY_STATS[kind].speed * dt); close(positions[1], positions[0]);
    }
    for (const sector of [0, 5]) {
        const shooter = createEnemy(1, 'shooter', still);
        updateEnemy(shooter, { x: 6, z: 0 }, [shooter], [], bounds, dt, { sector });
        assert.equal(shooter.state, 'aim'); close(shooter.timer, .6); close(shooter.x, 0);
        const burrower = createEnemy(2, 'burrower', still);
        burrower.state = 'underground'; burrower.timer = .6;
        burrower.burrowOrigin = still; burrower.destination = { x: 10, z: 0 };
        updateEnemy(burrower, { x: 20, z: 0 }, [burrower], [], bounds, .3, { sector });
        close(burrower.x, 5); close(burrower.timer, .3);
    }
});

test('actual Triple side hits preserve reduced Piercing/Ricochet, Flame, Shock and Frost damage', () => {
    for (const shotIndex of [0, 1, 2]) {
        const sim = new Simulation(); sim.progression.phase = 'combat';
        sim.staticObstacles.length = 0; sim.gates = [];
        sim.player.x = 0; sim.player.z = 8; sim.player.shotCooldown = 0;
        sim.enemies = [createEnemy(100, 'basic', { x: 12, z: 8 })];
        sim.enemies[0].state = 'recovery'; sim.enemies[0].timer = 100;
        for (const id of ['triple', 'power', 'trio', 'piercing', 'ricochet', 'flame', 'shock', 'frost'] as const) applyUpgrade(sim.player, id);
        sim.update(dt, still);
        const shot = sim.projectiles[shotIndex], damage = 15 * (shotIndex === 1 ? 1 : .65);
        close(shot.damage, damage);
        sim.player.shotCooldown = 100; sim.shockHits = 0;
        // Three targets on the same lane: penetrate first, rebound from second to third.
        sim.enemies = Array.from({ length: 3 }, (_, i) => {
            const enemy = createEnemy(200 + i, 'basic', { x: i * 2, z: 0 });
            enemy.hp = enemy.maxHp = 1000; enemy.state = 'recovery'; enemy.timer = 100; return enemy;
        });
        Object.assign(shot, { x: -1, z: 0, velocity: { x: 60, z: 0 } }); sim.projectiles = [shot];
        sim.update(.1, still);
        assert.equal(sim.projectiles.length, 0); assert.equal(shot.hitIds.size, 3);
        assert.equal(sim.events.filter(e => e.type === 'shock').length, 2);
        sim.enemies.forEach((enemy, i) => {
            close(enemy.hp, 1000 - damage * (i === 2 ? 1 : 1.4));
            close(sim.burns.get(enemy.id)!.damage, damage * .2);
            close(sim.frost.get(enemy.id)!, UPGRADE_VALUES.frostDuration);
        });
        const hp = sim.enemies.map(e => e.hp);
        for (let frame = 0; frame < 90; frame++) sim.update(dt, still);
        sim.enemies.forEach((enemy, i) => close(enemy.hp, hp[i] - damage * .2 * 3));
        assert.equal(sim.burns.size, 0);
    }
});

function bossFixture() {
    const sim = new Simulation(seededRandom()); sim.progression.wave = BOSS_SECTOR;
    sim.player.x = ROOM_CENTERS[BOSS_SECTOR] - 12; sim.player.z = 0; sim.start();
    sim.player.shotCooldown = 1000; sim.player.invulnerable = 1000;
    return sim;
}
function frames(sim: Simulation, count: number) {
    for (let i = 0; i < count; i++) {
        // Isolate the summon clock from combat movement/deaths while retaining real spawn checks.
        sim.boss!.state = 'recovery'; sim.boss!.timer = 1000;
        sim.enemies.forEach(e => { e.state = 'recovery'; e.timer = 1000; });
        sim.update(dt, still);
    }
}
function enterPhase2(sim: Simulation) { sim.boss!.hp = 950; sim.update(dt, still); }

test('Phase 1 never summons; Phase 2 warns Basic + Runner, with safe player/Boss separation', () => {
    const sim = bossFixture(); frames(sim, 60 * 25);
    assert.equal(sim.enemies.length, 0); assert.equal(sim.pendingSpawns, 0);
    enterPhase2(sim);
    assert.equal(sim.boss!.phase, 2); assert.equal(sim.enemies.length, 0);
    assert.deepEqual(sim.telegraphs.map(t => t.kind), ['basic', 'runner']);
    for (const marker of sim.telegraphs) {
        assert.ok(safeSpawn(6, marker, sim.player, sim.obstacles, [sim.boss!, ...sim.telegraphs.filter(t => t !== marker)]));
        assert.ok(distance(marker, sim.boss!) >= 2);
    }
    frames(sim, Math.round(SPAWN_DELAY / dt) - 1); assert.equal(sim.enemies.length, 0);
    frames(sim, 1); assert.deepEqual(sim.enemies.map(e => e.kind), ['basic', 'runner']);
});

test('summon cooldown is 12 seconds, pending warnings count toward cap, and no backlog accumulates', () => {
    const sim = bossFixture(); enterPhase2(sim);
    frames(sim, 12 * 60 - 1);
    assert.equal(sim.enemies.length, 2); assert.equal(sim.pendingSpawns, 0);
    frames(sim, 1); assert.equal(sim.pendingSpawns, 2);
    frames(sim, 39); assert.equal(sim.enemies.length, 4);
    for (let i = 0; i < 60 * 50; i++) {
        frames(sim, 1); assert.ok(sim.enemies.length + sim.pendingSpawns <= BOSS_ADDS.maxAlive);
    }
    assert.equal(sim.events.filter(e => e.type === 'spawn').length, 4);
    assert.equal(sim.pendingSpawns, 0);
});

test('Boss moving over a summon marker forces a fresh safe warning before spawning', () => {
    const sim = bossFixture(); enterPhase2(sim);
    const marker = sim.telegraphs[0]; Object.assign(sim.boss!, { x: marker.x, z: marker.z });
    frames(sim, 39);
    assert.equal(marker.spawned, false); close(marker.age, 0);
    assert.ok(distance(marker, sim.boss!) >= 2);
    frames(sim, 38); assert.equal(marker.spawned, false);
    frames(sim, 1); assert.equal(marker.spawned, true);
});

test('blocked arena never forces unsafe adds or accumulates pending summon groups', () => {
    const sim = bossFixture();
    sim.staticObstacles.push({ x: ROOM_CENTERS[6], z: 0, halfX: 100, halfZ: 100 });
    enterPhase2(sim); frames(sim, 60 * 30);
    assert.equal(sim.enemies.length, 0); assert.equal(sim.pendingSpawns, 0);
    assert.equal(sim.queuedSpawns, 0);
});

test('adds are targetable and killable without rewards; killing Boss cleans living/pending adds and wins', () => {
    const sim = bossFixture(); enterPhase2(sim); frames(sim, 39);
    assert.ok(sim.enemies.every(e => sim.targets.includes(e)));
    sim.enemies.forEach((enemy, i) => sim.projectiles.push(createProjectile(9000 + i, enemy, enemy, false, enemy.hp, 0, 1)));
    frames(sim, 1);
    assert.equal(sim.enemies.length, 0); assert.equal(sim.kills, 2);
    assert.equal(sim.progression.phase, 'combat'); assert.equal(sim.reward, undefined);
    assert.equal(sim.events.filter(e => e.type === 'reward-spawn').length, 0);
    frames(sim, 60 * 12); assert.equal(sim.enemies.length, 2);
    frames(sim, 60 * 12 - 40); assert.equal(sim.pendingSpawns, 2);
    const add = sim.enemies[0]; sim.burns.set(add.id, { damage: 1, ticks: 3, nextTick: .5 }); sim.frost.set(add.id, 1);
    sim.projectiles.push(createProjectile(9999, sim.boss!, sim.boss!, false, sim.boss!.hp, 0, 1));
    frames(sim, 1);
    assert.equal(sim.progression.phase, 'ending'); assert.equal(sim.enemies.length, 0);
    assert.equal(sim.pendingSpawns, 0); assert.equal(sim.burns.size, 0); assert.equal(sim.frost.size, 0);
    assert.equal(sim.offeredUpgrades.length, 0); assert.equal(sim.kills, 3);
    const hp = sim.player.hp, spawns = sim.events.filter(e => e.type === 'spawn').length;
    for (let i = 0; i < 60 * 15; i++) sim.update(dt, still);
    assert.equal(sim.progression.phase, 'complete'); assert.equal(sim.player.hp, hp);
    assert.equal(sim.events.filter(e => e.type === 'spawn').length, spawns);
});

test('Phase 2 Split locks five staggered lanes at -50/-25/0/+25/+50; Phase 1 still tracks each parent', () => {
    for (const phase of [1, 2] as const) {
        const boss = createBoss(1, still); boss.phase = phase; boss.lastPattern = 'radial'; boss.timer = 0;
        updateBoss(boss, { x: 20, z: 0 }, [], bounds, dt);
        assert.equal(boss.pattern, 'split'); assert.equal(boss.state, 'windup'); close(boss.timer, .85);
        const shots = [];
        for (let i = 0; i < 120; i++) {
            const player = { x: 0, z: 20 };
            const result = updateBoss(boss, player, [], bounds, dt);
            for (const shot of result.shots) shots.push(shot);
            if (boss.state === 'recovery') break;
        }
        assert.equal(shots.length, phase === 1 ? 3 : 5); assert.ok(shots.every(s => s.split));
        const phase1Heading = Math.atan2(20 - boss.z, -boss.x);
        shots.forEach((shot, i) => close(Math.atan2(shot.direction.z, shot.direction.x), phase === 1 ? phase1Heading : (i - 2) * 25 * Math.PI / 180));
        close(boss.timer, phase === 1 ? 1.5 : .7);
    }
    assert.equal(BOSS_STATS.hp, 1900); assert.equal(BOSS_STATS.chargeDamage, 28); assert.equal(BOSS_STATS.projectileDamage, 16);
});

test('three-ring Radial and five-parent Split finish sequentially with live adds, then Victory cleans them', () => {
    const sim = bossFixture(); enterPhase2(sim);
    const boss = sim.boss!;
    let attack: { pattern: string; shots: number } | undefined;
    const completed: { pattern: string; shots: number }[] = [];
    for (let frame = 0; frame < 60 * 35; frame++) {
        sim.events = [];
        sim.update(dt, still);
        if (boss.state === 'windup' && boss.pattern !== 'charge' && !attack)
            attack = { pattern: boss.pattern, shots: 0 };
        const shots = sim.events.filter(e => e.type === 'shot' && e.id === boss.id);
        if (shots.length) {
            assert.ok(attack); assert.equal(boss.pattern, attack.pattern);
            attack.shots += shots.length;
        }
        if (attack && boss.state === 'recovery') { completed.push(attack); attack = undefined; }
        assert.ok(sim.enemies.length + sim.pendingSpawns <= 4);
        assert.equal(sim.progression.phase, 'combat');
        assert.ok(Number.isFinite(boss.timer));
        assert.ok(boss.radialBurstsLeft >= 0 && boss.radialBurstsLeft <= 2);
    }
    assert.ok(completed.some(a => a.pattern === 'radial'));
    assert.ok(completed.some(a => a.pattern === 'split'));
    completed.forEach(a => assert.equal(a.shots, a.pattern === 'radial' ? 36 : 5));
    assert.ok(sim.enemies.length > 0);
    // The stationary fixture clusters adds against the Boss; let the finishing shot reach it.
    sim.projectiles.push(createProjectile(9999, boss, boss, false, boss.hp, 0, 1, { piercing: 4 }));
    sim.update(dt, still);
    assert.equal(sim.progression.phase, 'ending'); assert.equal(boss.state, 'dead');
    assert.equal(boss.shotsLeft, 0); assert.equal(boss.radialBurstsLeft, 0);
    assert.equal(sim.enemies.length, 0); assert.equal(sim.pendingSpawns, 0);
    for (let frame = 0; frame < 60 * 5; frame++) sim.update(dt, still);
    assert.equal(sim.progression.phase, 'complete'); assert.equal(sim.projectiles.length, 0);
    assert.equal(sim.enemies.length, 0); assert.equal(sim.pendingSpawns, 0);
});
