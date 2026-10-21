import { bossPilotInput } from './pilot.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_PATTERNS, BOSS_STATS, createBoss, radialDirections, stopBoss, updateBoss } from '../src/boss.ts';
import { BOSS_SECTOR, SECTOR_COUNT } from '../src/waves.ts';
import { ROOM_CENTERS, GATE_X, createWorldObstacles, roomBounds } from '../src/layout.ts';
import { createProjectile, updateProjectiles, type Projectile } from '../src/projectiles.ts';
import { Simulation } from '../src/simulation.ts';
import { applyUpgrade, eligibleUpgrades } from '../src/upgrades.ts';
import { distance, intersects } from '../src/physics.ts';
const dt = 1 / 60, bounds = { minX: -30, maxX: 30, minZ: -20, maxZ: 20 };
const player = { x: 10, z: 4 };
function fixture() {
    const sim = new Simulation(); sim.progression.wave = BOSS_SECTOR;
    sim.player.x = ROOM_CENTERS[BOSS_SECTOR] - 12; sim.player.z = 0; sim.start();
    return sim;
}
test('seven arenas, six physical gates and no normal enemy group in the final arena', () => {
    const sim = fixture();
    assert.equal(SECTOR_COUNT, 7); assert.equal(GATE_X.length, 6);
    assert.equal(sim.progression.wave, 6); assert.equal(sim.progression.phase, 'combat');
    assert.equal(sim.enemies.length, 0); assert.equal(sim.pendingSpawns, 0);
    assert.equal(sim.boss!.hp, BOSS_STATS.hp);
    assert.ok(!sim.obstacles.some(o => intersects(sim.boss!, BOSS_STATS.radius, o)));
});
test('boss cycles all three patterns without immediate repetition and moves between them', () => {
    const boss = createBoss(1, { x: 0, z: 0 }), seen: string[] = [];
    let last: string | undefined, moved = false;
    for (let i = 0; i < 60 * 65; i++) {
        const previous = { x: boss.x, z: boss.z };
        updateBoss(boss, player, [], bounds, dt);
        if (boss.walking && distance(previous, boss) > 0) moved = true;
        if (boss.state === 'windup' && boss.lastPattern !== last) { last = boss.lastPattern; seen.push(last!); }
    }
    assert.ok(moved); assert.ok(seen.length >= 9);
    assert.deepEqual(seen.slice(0, 3), BOSS_PATTERNS);
    assert.ok(seen.every((pattern, i) => i === 0 || pattern !== seen[i - 1]));
});
test('Charge uses its telegraphed line despite player movement, hits only once, stops at walls', () => {
    const boss = createBoss(1, { x: 0, z: 0 }); boss.timer = 0;
    updateBoss(boss, { x: 10, z: 0 }, [], bounds, dt);
    assert.equal(boss.state, 'windup'); const dir = { ...boss.dir };
    let hits = 0;
    for (let i = 0; i < 150; i++) {
        const target = i < 60 ? { x: 0, z: 10 } : { x: 2.5, z: 0 };
        const intent = updateBoss(boss, target, [{ x: 5, z: 0, halfX: .1, halfZ: 10 }], bounds, dt);
        if (intent.hit) { hits++; assert.equal(intent.hit, 28); }
        if (boss.state === 'recovery') break;
        assert.deepEqual(boss.dir, dir); assert.ok(Math.abs(boss.z) < 1e-8);
    }
    assert.equal(hits, 1); assert.equal(boss.state, 'recovery'); assert.ok(boss.x <= 3.65);
});
test('Radial emits twelve evenly spaced directions and delayed ring rotates fifteen degrees', () => {
    const boss = createBoss(1, { x: 0, z: 0 }); boss.state = 'windup'; boss.pattern = 'radial'; boss.timer = 0; boss.radialRuns = 2;
    const first = updateBoss(boss, player, [], bounds, dt).shots;
    assert.equal(first.length, 12); assert.equal(boss.state, 'radial');
    for (let i = 1; i < 12; i++) {
        const a = first[i - 1].direction, b = first[i].direction;
        assert.ok(Math.abs(a.x * b.x + a.z * b.z - Math.cos(Math.PI / 6)) < 1e-9);
    }
    for (let i = 0; i < 26; i++) assert.equal(updateBoss(boss, player, [], bounds, dt).shots.length, 0);
    const second = updateBoss(boss, player, [], bounds, dt).shots;
    assert.equal(second.length, 12);
    assert.deepEqual(second.map(s => s.direction), radialDirections(Math.PI / 12));
    assert.ok(Math.abs(Math.atan2(second[0].direction.z, second[0].direction.x) - Math.PI / 12) < 1e-9);
});
test('Phase 2 has more frequent second rings and moderate movement/recovery/interval changes', () => {
    const doubleRings: number[] = [];
    for (const phase of [1, 2] as const) {
        let doubles = 0;
        const boss = createBoss(1, { x: 0, z: 0 }); boss.phase = phase;
        for (let i = 0; i < 6; i++) {
            boss.state = 'windup'; boss.pattern = 'radial'; boss.timer = 0;
            assert.equal(updateBoss(boss, player, [], bounds, dt).shots.length, 12);
            if (boss.secondRadial) doubles++;
        }
        doubleRings.push(doubles);
    }
    assert.deepEqual(doubleRings, [2, 6]);
    assert.ok(BOSS_STATS.phases[1].speed < 6.84);
    assert.ok(BOSS_STATS.phases[1].speed < BOSS_STATS.phases[0].speed * 1.3);
    assert.equal(BOSS_STATS.phases[1].recovery, .8);
    assert.equal(BOSS_STATS.phases[1].splitInterval, .19);
});
test('Split fires exactly three staggered parents and every parent produces only three fixed children', () => {
    for (const phase of [1, 2] as const) {
        const boss = createBoss(1, { x: 0, z: 0 }); boss.phase = phase; boss.pattern = 'split'; boss.state = 'windup'; boss.timer = 0;
        const fired: { frame: number; origin: { x: number; z: number }; direction: { x: number; z: number } }[] = [];
        for (let i = 0; i < 120; i++) {
            const result = updateBoss(boss, player, [], bounds, dt);
            for (const shot of result.shots) { assert.ok(shot.split); fired.push({ frame: i, ...shot }); }
            if (boss.state === 'recovery') break;
        }
        assert.equal(fired.length, 3);
        for (let i = 1; i < 3; i++) assert.ok(Math.abs((fired[i].frame - fired[i - 1].frame) * dt - BOSS_STATS.phases[phase - 1].splitInterval) <= dt);
        let nextId = 100, fragments = 0;
        const callbacks = { hurtPlayer: () => {}, hurtEnemy: () => {}, impact: () => {}, canDamagePlayer: () => false,
            nextId: () => nextId++, fragment: () => { fragments++; } };
        for (const firedShot of fired) {
            const parent = createProjectile(nextId++, { x: 0, z: 0 }, { x: 10, z: 0 }, true, 12, 7.5, 4); parent.splitAfter = .7;
            let shots: Projectile[] = [parent];
            shots = updateProjectiles(shots, .69, [], bounds, player, [], callbacks);
            assert.deepEqual(shots, [parent]); assert.ok(Math.abs(parent.x - 5.175) < 1e-9);
            shots = updateProjectiles(shots, .01, [], bounds, player, [], callbacks);
            assert.equal(shots.length, 3); assert.ok(!shots.includes(parent));
            assert.equal(new Set(shots.map(s => s.id)).size, 3);
            shots.forEach((s, i) => {
                assert.equal(s.splitAfter, undefined); assert.equal(s.homing, false); assert.equal(s.damage, 12);
                assert.ok(Math.abs(Math.atan2(s.velocity.z, s.velocity.x) - (i - 1) * Math.PI / 9) < 1e-9);
                assert.ok(Math.abs(s.x - 5.25) < 1e-9);
            });
            const velocities = shots.map(s => ({ ...s.velocity }));
            shots = updateProjectiles(shots, 1, [], bounds, player, [], callbacks);
            assert.equal(shots.length, 3); assert.deepEqual(shots.map(s => s.velocity), velocities);
        }
        assert.equal(fragments, 3);
    }
});
test('cover or impact before the split destroys parent without producing children', () => {
    let fragments = 0;
    const shot = createProjectile(1, { x: 0, z: 0 }, { x: 10, z: 0 }, true, 12, 7.5, 4); shot.splitAfter = .7;
    const shots = updateProjectiles([shot], 1, [{ x: 3, z: 0, halfX: .2, halfZ: 4 }], bounds, player, [], {
        hurtPlayer: () => {}, hurtEnemy: () => {}, impact: () => {}, canDamagePlayer: () => false,
        nextId: () => 5, fragment: () => fragments++,
    });
    assert.equal(shots.length, 0); assert.equal(fragments, 0);
});
test('Phase 2 triggers once at exactly half health and interrupts pending attacks', () => {
    const boss = createBoss(1, { x: 0, z: 0 }); boss.state = 'split'; boss.shotsLeft = 2; boss.timer = .1;
    boss.hp = boss.maxHp / 2;
    let phases = 0;
    for (let i = 0; i < 120; i++) {
        const intent = updateBoss(boss, player, [], bounds, dt);
        if (intent.phaseChanged) phases++;
        if (i === 0) { assert.equal(boss.state, 'phase-change'); assert.equal(boss.shotsLeft, 0); }
    }
    assert.equal(phases, 1); assert.equal(boss.phase, 2);
});
test('boss death cancels every attack state; Victory retains already-fired bullets until expiry', () => {
    for (const state of ['windup', 'charge', 'radial', 'split', 'phase-change'] as const) {
        const sim = fixture(), boss = sim.boss!;
        boss.state = state; boss.timer = 1; boss.shotsLeft = 3; boss.secondRadial = true;
        sim.player.shotCooldown = 100;
        const bullet = createProjectile(9000, { x: boss.x + 5, z: 3 }, { x: boss.x + 10, z: 3 }, true, 12, 7.5, 4);
        bullet.splitAfter = .7;
        sim.projectiles = [createProjectile(9001, boss, boss, false, boss.hp, 0, 1), bullet];
        sim.update(dt, { x: 0, z: 0 });
        assert.equal(sim.progression.phase, 'ending'); assert.equal(boss.hp, 0); assert.equal(boss.state, 'dead');
        assert.equal(boss.timer, 0); assert.equal(boss.shotsLeft, 0); assert.equal(boss.secondRadial, false);
        assert.equal(sim.offeredUpgrades.length, 0); assert.equal(sim.burstShots, 0);
        assert.ok(sim.projectiles.includes(bullet));
        const x = bullet.x, hp = sim.player.hp;
        sim.update(.1, { x: 1, z: 0 }); assert.ok(bullet.x > x); assert.equal(sim.player.hp, hp);
        for (let i = 0; i < 300; i++) sim.update(dt, { x: 0, z: 0 });
        assert.equal(sim.projectiles.length, 0); assert.equal(sim.progression.wave, 6);
        assert.equal(sim.events.filter(e => e.type === 'boss-death').length, 1);
        assert.equal(sim.events.filter(e => e.type === 'fragment').length, 1);
    }
});
test('Game Over cancels boss attacks and a fresh run resets boss, upgrades, stats, gates and timers', () => {
    const old = fixture(); applyUpgrade(old.player, 'rapid'); applyUpgrade(old.player, 'power');
    old.player.hp = 1; old.projectiles.push(createProjectile(9999, old.player, old.player, true, 12, 0, 1));
    old.update(dt, { x: 0, z: 0 }); assert.equal(old.progression.phase, 'dead'); assert.equal(old.boss!.state, 'dead');
    const fresh = new Simulation(); fresh.start();
    assert.equal(fresh.boss, undefined); assert.equal(fresh.progression.wave, 0); assert.equal(fresh.victoryTime, 0);
    assert.equal(fresh.player.hp, 80); assert.equal(fresh.player.stats.damage, 10); assert.equal(fresh.player.stats.attackCooldown, .35);
    assert.equal(fresh.player.acquired.size, 0); assert.equal(eligibleUpgrades(fresh.player).length, 17);
    assert.equal(fresh.projectiles.length, 0); assert.equal(fresh.burstShots, 0);
    assert.ok(fresh.gates.every(g => !g.sealed && !g.unlocked && g.openness === 0));
});
test('boss movement and charges stay collision-safe across the arena perimeter', () => {
    const center = ROOM_CENTERS[BOSS_SECTOR], obstacles = createWorldObstacles(), bounds = roomBounds(BOSS_SECTOR);
    const boss = createBoss(1, { x: center, z: 0 }); let moved = 0;
    for (let i = 0; i < 60 * 90; i++) {
        const a = i / 60 * .4, p = { x: center + Math.cos(a) * 12, z: Math.sin(a) * 8 };
        const old = { x: boss.x, z: boss.z }; updateBoss(boss, p, obstacles, bounds, dt); moved += distance(old, boss);
        assert.ok(!obstacles.some(o => intersects(boss, boss.radius - 1e-5, o)));
        assert.ok(boss.x >= bounds.minX + boss.radius - 1e-5 && boss.x <= bounds.maxX - boss.radius + 1e-5);
    }
    assert.ok(moved > 100);
    stopBoss(boss); assert.equal(updateBoss(boss, player, obstacles, bounds, 10).shots.length, 0);
});

test('mixed six-upgrade build can defeat the Boss with ordinary movement and autoattack', t => {
    const sim = fixture();
    for (const id of ['power', 'overclock', 'chassis', 'repair', 'turbo', 'ricochet'] as const) applyUpgrade(sim.player, id);
    for (let i = 0; i < 120 * 60 && sim.progression.phase === 'combat'; i++) {
        sim.update(dt, bossPilotInput(sim)); sim.events = [];
    }
    assert.equal(sim.progression.phase, 'ending');
    for (let i = 0; i < 60; i++) sim.update(dt, { x: 0, z: 0 });
    assert.equal(sim.progression.phase, 'complete'); assert.ok(sim.player.hp > 0);
    t.diagnostic(`Mixed build: ${sim.elapsed.toFixed(2)} s, remaining HP ${sim.player.hp}`);
});
