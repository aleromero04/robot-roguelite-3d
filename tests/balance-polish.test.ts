import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_STATS, ENEMY_STATS } from '../src/stats.ts';
import { CONTACT_DAMAGE } from '../src/contact.ts';
import { BOSS_STATS, createBoss, updateBoss, stopBoss } from '../src/boss.ts';
import { createEnemy, updateEnemy } from '../src/enemies/enemies.ts';
import { updateGrenadier } from '../src/enemies/grenadier.ts';
import { isUnderground, type EnemyContext } from '../src/enemies/types.ts';
import { clearArea } from '../src/enemies/targeting.ts';
import { FLOOR_POSITIONS, FLOOR_HAZARD, GRENADE, createFloorHazards, updateFloorHazards } from '../src/hazards.ts';
import { createWorldObstacles, roomBounds, ROOM_CENTERS } from '../src/layout.ts';
import { distance } from '../src/physics.ts';
import { Simulation } from '../src/simulation.ts';
import { updateProjectiles } from '../src/projectiles.ts';
import { applyUpgrade, UPGRADES, RARITY_WEIGHTS, UPGRADE_VALUES } from '../src/upgrades.ts';
import { WAVES, WAVE_GROUPS, REINFORCEMENTS } from '../src/waves.ts';
import { seededRandom } from './helpers.ts';

const dt = 1 / 60, zero = { x: 0, z: 0 };
const bounds = { minX: -60, maxX: 60, minZ: -40, maxZ: 40 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const ctx = (): EnemyContext => ({ playerVelocity: zero, sector: 3, random: () => .5, thermal: [] });

test('balance targets change walking speed and damage without changing HP, dash or i-frames', () => {
    close(PLAYER_STATS.speed, 6.84 * 1.05);
    const kinds = ['basic', 'runner', 'shooter', 'grenadier', 'burrower'] as const;
    const before = [2.21, 3.6, 2.3, 2, 2.6], multipliers = [1.1, 1.08, 1.1, 1.1, 1.15];
    kinds.forEach((kind, i) => close(ENEMY_STATS[kind].speed, before[i] * multipliers[i]));
    assert.deepEqual(kinds.map(k => ENEMY_STATS[k].hp), [48, 42, 45, 48, 44]);
    assert.deepEqual(kinds.map(k => ENEMY_STATS[k].damage), [15, 20, 13, 15, 18]);
    assert.deepEqual(Object.values(CONTACT_DAMAGE), [10, 10, 10, 10, 10, 16]);
    assert.equal(PLAYER_STATS.maxHp, 80); assert.equal(PLAYER_STATS.damage, 10);
    assert.equal(PLAYER_STATS.invulnerability, .85);
    assert.deepEqual([PLAYER_STATS.dashSpeed, PLAYER_STATS.dashDuration, PLAYER_STATS.dashCooldown, PLAYER_STATS.dashInvulnerability], [21, .18, 1.65, .28]);
    assert.equal(ENEMY_STATS.runner.dashSpeed, 14.5); assert.equal(BOSS_STATS.chargeSpeed, 14);
    assert.equal(BOSS_STATS.hp, 1600); assert.equal(BOSS_STATS.projectileDamage, 16); assert.equal(BOSS_STATS.chargeDamage, 28);
    assert.deepEqual([GRENADE.damage, GRENADE.fireDamage, FLOOR_HAZARD.damage], [15, 5, 6]);
});

test('walking multipliers never scale Runner dash or Boss Charge displacement', () => {
    const runner = createEnemy(1, 'runner', zero); runner.state = 'dash'; runner.timer = .5; runner.dir = { x: 1, z: 0 };
    updateEnemy(runner, { x: 50, z: 20 }, [runner], [], bounds, dt, { locomotionMultiplier: .8 });
    close(runner.x, 14.5 * dt);
    const boss = createBoss(2, zero); boss.phase = 2; boss.state = 'charge'; boss.timer = .5; boss.dir = { x: 1, z: 0 };
    updateBoss(boss, { x: 50, z: 20 }, [], bounds, dt, .8);
    close(boss.x, 14 * dt * (1 - 1e-6));
});

test('dynamic floor candidates fit full discs, keep exit margins and support two separated hazards', () => {
    const obstacles = createWorldObstacles(), b = roomBounds(1);
    assert.ok(FLOOR_POSITIONS.length >= 6);
    for (const p of FLOOR_POSITIONS) {
        assert.ok(clearArea(p, FLOOR_HAZARD.radius, obstacles, b));
        assert.ok(p.x >= b.minX + 3 && p.x <= b.maxX - 3);
    }
    for (const seed of [1, 8, 31]) {
        const random = seededRandom(seed), zones = createFloorHazards(1), seen = new Set<string>();
        for (let i = 0; i < 60 * 50; i++) {
            const previous = zones.map(z => ({ x: z.x, z: z.z, state: z.state }));
            updateFloorHazards(zones, dt, true, zero, () => assert.fail('player is in a different sector'), random);
            zones.forEach((z, n) => {
                if (z.state === 'warning' && previous[n].state !== 'warning') {
                    assert.ok(distance(z, previous[n]) > .1);
                    assert.ok(FLOOR_POSITIONS.some(p => distance(p, z) < 1e-9));
                    close(z.timer, 1); seen.add(`${z.x}:${z.z}`);
                }
            });
            assert.ok(distance(zones[0], zones[1]) >= FLOOR_HAZARD.radius * 2 + .8);
        }
        assert.ok(seen.size >= 4);
    }
});

test('floor selection is injectable, reproducible and varies with seed', () => {
    const sequence = (seed: number) => {
        const random = seededRandom(seed), zones = createFloorHazards(1), result: string[] = [];
        for (let i = 0; i < 1500; i++) {
            const previous = zones.map(z => z.state);
            updateFloorHazards(zones, dt, true, zero, () => {}, random);
            zones.forEach((z, n) => { if (z.state === 'warning' && previous[n] !== 'warning') result.push(`${z.id}:${z.x}:${z.z}`); });
        }
        return result;
    };
    assert.deepEqual(sequence(7), sequence(7)); assert.notDeepEqual(sequence(7), sequence(99));
});

test('relocating below a stationary player gives full warning and no immediate damage', () => {
    const zones = createFloorHazards(1), zone = zones[0]; zone.timer = 0;
    const next = FLOOR_POSITIONS.find(p => distance(p, zone) > .1 && distance(p, zones[1]) >= FLOOR_HAZARD.radius * 2 + .8)!;
    let hits = 0;
    const tick = () => updateFloorHazards(zones, dt, true, next, () => hits++, () => 0);
    tick(); close(distance(zone, next), 0); assert.equal(zone.state, 'warning'); assert.equal(hits, 0);
    for (let i = 0; i < 60; i++) tick();
    assert.equal(zone.state, 'active'); assert.equal(hits, 0);
    for (let i = 0; i < 29; i++) tick();
    assert.equal(hits, 0); tick(); assert.equal(hits, 1);
});

test('clear stops relocations and cards protect from an already active floor hazard', () => {
    const sim = new Simulation(seededRandom(3)); sim.progression.wave = 1; sim.progression.phase = 'upgrade';
    const zone = createFloorHazards(1)[0]; Object.assign(zone, { state: 'active', timer: 1.7, nextTick: 0 });
    sim.floorHazards = [zone]; Object.assign(sim.player, { x: zone.x, z: zone.z });
    const position = { x: zone.x, z: zone.z };
    for (let i = 0; i < 600; i++) sim.update(dt, zero);
    assert.equal(sim.player.hp, 80); assert.equal(zone.state, 'inactive'); close(distance(zone, position), 0);
});

test('Grenadier can acquire and lob beyond player projectile reach and across cover', () => {
    const e = createEnemy(1, 'grenadier', { x: -17, z: -5 }), p = { x: 16, z: 5 };
    assert.ok(distance(e, p) > PLAYER_STATS.projectileSpeed * PLAYER_STATS.projectileLife + 1);
    assert.equal(ENEMY_STATS.grenadier.range, 42);
    const cover = [{ x: 0, z: 0, halfX: 2, halfZ: 4 }];
    updateGrenadier(e, p, dt, false, ctx(), cover, bounds);
    assert.equal(e.state, 'aim'); const destination = { ...e.destination! };
    const result = updateGrenadier(e, { x: 10, z: -8 }, .55, false, ctx(), cover, bounds);
    assert.deepEqual(result.grenade, destination); assert.ok(clearArea(destination, GRENADE.radius, cover, bounds));
    assert.equal(GRENADE.flight, .95); assert.equal(e.state, 'recovery');
    const far = createEnemy(2, 'grenadier', zero);
    updateGrenadier(far, { x: 43, z: 0 }, dt, true, ctx(), [], bounds);
    assert.equal(far.state, 'chase'); assert.equal(far.destination, undefined);
});

test('Grenadier retreats during recovery, Frost slows retreat, and close pressure cannot prevent firing forever', () => {
    const p = { x: 5, z: 0 }, normal = createEnemy(1, 'grenadier', zero), frost = createEnemy(2, 'grenadier', zero);
    normal.state = frost.state = 'recovery'; normal.timer = frost.timer = 1;
    updateEnemy(normal, p, [normal], [], bounds, dt);
    updateEnemy(frost, p, [frost], [], bounds, dt, { locomotionMultiplier: .8 });
    assert.ok(normal.x < 0); close(frost.x, normal.x * .8); close(normal.timer, frost.timer);
    normal.state = 'chase';
    updateGrenadier(normal, p, dt, true, ctx(), [], bounds);
    assert.equal(normal.state, 'aim');
    assert.ok(updateGrenadier(normal, p, .55, true, ctx(), [], bounds).grenade);
});

test('Burrowers replace Basics in the two reinforcements without increasing total threats', () => {
    assert.deepEqual(WAVE_GROUPS[4], [['basic','runner','shooter','grenadier','burrower'], ['burrower','runner','shooter']]);
    assert.deepEqual(WAVE_GROUPS[5], [['basic','basic','runner','shooter','grenadier','burrower'], ['burrower','runner','shooter','grenadier']]);
    assert.deepEqual(WAVES.map(w => w.length), [3, 4, 6, 6, 8, 10]);
    assert.equal(REINFORCEMENTS.maxActive, 7);
    for (const wave of [4, 5]) assert.equal(WAVES[wave].filter(k => k === 'burrower').length, 2);
});

test('Burrower first burrow at 2s and later active windows last 3s, with original full warnings', () => {
    const e = createEnemy(1, 'burrower', { x: -8, z: 0 }), p = zero;
    for (let i = 0; i < 119; i++) updateEnemy(e, p, [e], [], bounds, dt);
    assert.equal(e.state, 'chase');
    for (let i = 0; i < 2; i++) updateEnemy(e, p, [e], [], bounds, dt);
    assert.equal(e.state, 'burrow-windup'); assert.equal(isUnderground(e), false);
    assert.deepEqual([ENEMY_STATS.burrower.burrowWindup, ENEMY_STATS.burrower.underground, ENEMY_STATS.burrower.emergence], [.45, .6, .9]);
    let emerged = false;
    for (let i = 0; i < 130; i++) {
        if (updateEnemy(e, p, [e], [], bounds, dt).emerged) { emerged = true; break; }
    }
    assert.ok(emerged); close(e.timer, 3);
    for (let i = 0; i < 179; i++) updateEnemy(e, p, [e], [], bounds, dt);
    assert.equal(e.state, 'chase');
});

test('Phase 2 keeps threshold and HP, but shortens downtime and moves 25% faster than Phase 1', () => {
    const boss = createBoss(1, zero);
    boss.hp = 801; assert.equal(updateBoss(boss, { x: 10, z: 0 }, [], bounds, dt).phaseChanged, false);
    boss.hp = 800; assert.equal(updateBoss(boss, { x: 10, z: 0 }, [], bounds, dt).phaseChanged, true);
    assert.equal(boss.state, 'phase-change'); close(boss.timer, .8);
    assert.deepEqual(BOSS_STATS.phases.map(p => p.speed), [2.4, 3]);
    assert.deepEqual(BOSS_STATS.phases.map(p => p.recovery), [1.5, .8]);
    assert.deepEqual(BOSS_STATS.phases.map(p => p.approach), [2, 1.25]);
});

test('double Charge only in Phase 2: pause, full visible warning, retarget, stable final line and no homing', () => {
    for (const phase of [1, 2] as const) {
        const boss = createBoss(1, zero); boss.phase = phase; boss.state = 'charge'; boss.timer = dt; boss.dir = { x: 1, z: 0 };
        const p = { x: 0, z: 10 };
        updateBoss(boss, p, [], bounds, dt);
        if (phase === 1) { assert.equal(boss.state, 'recovery'); continue; }
        assert.equal(boss.state, 'charge-pause'); close(boss.timer, .3);
        for (let i = 0; i < 17; i++) updateBoss(boss, p, [], bounds, dt);
        assert.equal(boss.state, 'charge-pause');
        updateBoss(boss, p, [], bounds, dt); assert.equal(boss.state, 'windup'); close(boss.timer, .85);
        const original = { ...boss.dir };
        for (let i = 0; i < 36; i++) updateBoss(boss, { x: -10, z: 0 }, [], bounds, dt);
        const held = { ...boss.aim }; assert.notDeepEqual(held, original);
        for (let i = 0; i < 14; i++) {
            updateBoss(boss, p, [], bounds, dt);
            assert.equal(boss.state, 'windup'); assert.deepEqual(boss.aim, held); assert.deepEqual(boss.dir, original);
        }
        updateBoss(boss, p, [], bounds, dt);
        assert.equal(boss.state, 'charge'); assert.deepEqual(boss.dir, held); assert.equal(boss.chargeHit, false);
        for (let i = 0; i < 40; i++) {
            updateBoss(boss, p, [], bounds, dt); assert.deepEqual(boss.dir, held);
            if (boss.state === 'recovery') break;
        }
        assert.equal(boss.state, 'recovery');
    }
});

test('second Charge shares swept wall collision and deals one 28 HP event without contact stacking', () => {
    for (const shield of [false, true]) {
        const sim = new Simulation(); sim.progression.wave = 6; sim.start(); sim.player.shotCooldown = 100;
        const boss = sim.boss!; boss.phase = 2; boss.state = 'charge'; boss.chargeIndex = 1; boss.timer = .65;
        boss.x = ROOM_CENTERS[6]; boss.z = 0; boss.dir = { x: 1, z: 0 };
        sim.player.x = boss.x + .8; sim.player.z = 0;
        if (shield) applyUpgrade(sim.player, 'shield');
        sim.update(dt, zero);
        assert.equal(sim.player.hp, shield ? 80 : 52);
        assert.equal(sim.events.filter(e => e.type === (shield ? 'shield-break' : 'player-hit')).length, 1);
        assert.equal(boss.chargeHit, true);
    }
    const boss = createBoss(1, zero); boss.phase = 2; boss.chargeIndex = 1; boss.state = 'charge'; boss.timer = .65; boss.dir = { x: 1, z: 0 };
    for (let i = 0; i < 60 && boss.state === 'charge'; i++) updateBoss(boss, { x: 30, z: 0 }, [{ x: 5, z: 0, halfX: .1, halfZ: 10 }], bounds, dt);
    assert.ok(boss.x <= 3.65); assert.equal(boss.state, 'recovery');
});

test('new second-charge states cancel on death and phase changes without orphan attacks', () => {
    for (const state of ['charge-pause', 'windup', 'charge'] as const) {
        const boss = createBoss(1, zero); boss.state = state; boss.chargeIndex = 1;
        stopBoss(boss);
        for (let i = 0; i < 120; i++) assert.deepEqual(updateBoss(boss, zero, [], bounds, dt), { shots: [], hit: 0, phaseChanged: false });
        assert.equal(boss.chargeIndex, 0);
    }
});

test('Phase 2 radial keeps 12+12 with 15-degree gaps and a 380ms inter-ring delay', () => {
    const boss = createBoss(1, zero); boss.phase = 2; boss.state = 'windup'; boss.pattern = 'radial'; boss.timer = 0;
    const first = updateBoss(boss, { x: 20, z: 0 }, [], bounds, dt).shots;
    assert.equal(first.length, 12);
    for (let i = 0; i < 22; i++) assert.equal(updateBoss(boss, zero, [], bounds, dt).shots.length, 0);
    const second = updateBoss(boss, zero, [], bounds, dt).shots;
    assert.equal(second.length, 12); close(Math.atan2(second[0].direction.z, second[0].direction.x), Math.PI / 12);
    assert.equal(boss.state, 'recovery');
});

test('actual Boss bullets snapshot phase speed and fragments preserve it after the parent disappears', () => {
    for (const phase of [1, 2] as const) for (const split of [false, true]) {
        const sim = new Simulation(); sim.progression.wave = 6; sim.start();
        sim.player.shotCooldown = 100;
        const boss = sim.boss!; boss.phase = phase; boss.pattern = split ? 'split' : 'radial'; boss.state = 'windup'; boss.timer = 0;
        sim.update(dt, zero); if (split) sim.update(dt, zero);
        const shot = sim.projectiles.find(p => p.enemy)!; assert.ok(shot);
        const multiplier = phase === 2 ? 1.08 : 1;
        close(Math.hypot(shot.velocity.x, shot.velocity.z), (split ? 7.5 : 7) * multiplier);
        assert.equal(shot.damage, 16); assert.equal(shot.homing, false);
        if (split) {
            Object.assign(shot, { x: 0, z: 0, splitAfter: .01 }); let id = 1000;
            const children = updateProjectiles([shot], .01, [], bounds, { x: 50, z: 30 }, [], {
                hurtPlayer: () => {}, hurtEnemy: () => {}, impact: () => {}, canDamagePlayer: () => false, nextId: () => id++,
            });
            assert.equal(children.length, 3);
            children.forEach(p => { close(Math.hypot(p.velocity.x, p.velocity.z), 8 * multiplier); assert.equal(p.damage, 16); assert.equal(p.splitAfter, undefined); });
        }
    }
    close(ENEMY_STATS.shooter.projectileSpeed, 9 * 1.08);
    assert.deepEqual(BOSS_STATS.phases.map(p => p.splitInterval), [.32, .19]);
});

test('upgrade count, rarity weights, Overdrive and Flame balance stay unchanged', () => {
    assert.equal(UPGRADES.length, 17);
    assert.deepEqual(Object.values(RARITY_WEIGHTS), [60, 27, 10, 3]);
    assert.deepEqual([UPGRADE_VALUES.overdriveCharge, UPGRADE_VALUES.overdriveDamage, UPGRADE_VALUES.overdriveInterval], [1, 1.25, .8]);
    assert.deepEqual([UPGRADE_VALUES.flameTicks, UPGRADE_VALUES.flameFraction, UPGRADE_VALUES.flameInterval], [3, .2, .5]);
});
