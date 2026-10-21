import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom, walkToReward } from './helpers.ts';
import { Simulation } from '../src/simulation.ts';
import { WAVE_GROUPS, WAVES, REINFORCEMENTS, sectorNumber } from '../src/waves.ts';
import { ROOM_CENTERS, ROOM_LAYOUTS, residentRoomIndices, createWorldObstacles, safeSpawn } from '../src/layout.ts';
import { createEnemy } from '../src/enemies/enemies.ts';
import { ENEMY_STATS } from '../src/stats.ts';
import { createProjectile } from '../src/projectiles.ts';
import { UPGRADES, eligibleUpgrades } from '../src/upgrades.ts';
const dt = 1 / 60;
function killLiving(sim: Simulation): void {
    sim.enemies.forEach(e => sim.projectiles.push(createProjectile(10000 + e.id, e, e, false, e.hp, 0, 1)));
}
test('six normal sectors plus a boss arena, modular distinct neighbours and fixed archetype stats across all waves', () => {
    assert.equal(WAVES.length, 6); assert.equal(ROOM_LAYOUTS.length, 7); assert.equal(ROOM_CENTERS.length, 7);
    assert.deepEqual(WAVES.map((_, i) => sectorNumber(i)), ['01', '02', '03', '04', '05', '06']);
    assert.deepEqual(WAVES.map(w => ['basic', 'runner', 'shooter', 'grenadier', 'burrower'].map(kind => w.filter(k => k === kind).length)),
        [[3,0,0,0,0], [2,2,0,0,0], [2,2,2,0,0], [2,1,2,1,0], [1,2,2,1,2], [2,2,2,2,2]]);
    for (let i = 0; i < WAVES.length; i++) {
        if (i) assert.notDeepEqual(ROOM_LAYOUTS[i], ROOM_LAYOUTS[i - 1]);
        for (const kind of WAVES[i]) {
            assert.ok(kind in ENEMY_STATS);
            const e = createEnemy(1, kind, { x: ROOM_CENTERS[i], z: 5 });
            assert.equal(e.hp, ENEMY_STATS[kind].hp); assert.equal(e.maxHp, ENEMY_STATS[kind].hp);
        }
    }
});
test('only two or three nearby arenas need residency throughout the seven-sector route', () => {
    for (let x = 0; x <= 230; x += .25) {
        const residents = residentRoomIndices(x);
        assert.ok(residents.length >= 1 && residents.length <= 3);
        assert.ok(residents.every(i => Math.abs(ROOM_CENTERS[i] - x) < 50));
    }
    assert.deepEqual(residentRoomIndices(0), [0, 1]);
    assert.deepEqual(residentRoomIndices(180), [4, 5, 6]);
    assert.deepEqual(residentRoomIndices(0), [0, 1]); // Reset uses the same residency policy.
});
test('reinforcements stay in the same combat, have telegraphs, preserve stats and cap occupancy', () => {
    for (const wave of [4, 5]) for (const seed of [1, 8, 37]) {
        const sim = new Simulation(seededRandom(seed)); sim.progression.wave = wave;
        sim.player.x = ROOM_CENTERS[wave] - 12; sim.player.z = 0; sim.start();
        assert.equal(sim.pendingSpawns, WAVES[wave].length);
        assert.equal(sim.telegraphs.length, WAVE_GROUPS[wave][0].length);
        assert.equal(sim.queuedSpawns, WAVE_GROUPS[wave][1].length);
        const ids = new Set<number>(); let maxOccupancy = 0;
        for (let frame = 0; frame < 600 && sim.progression.phase === 'combat'; frame++) {
            const occupancy = sim.enemies.length + sim.telegraphs.filter(t => !t.spawned).length;
            maxOccupancy = Math.max(maxOccupancy, occupancy);
            for (const marker of sim.telegraphs) if (!marker.spawned && !ids.has(marker.id)) {
                assert.ok(safeSpawn(wave, marker, sim.player, sim.obstacles, sim.enemies));
                ids.add(marker.id);
            }
            // Keep one initial enemy alive to prove reinforcements can overlap a fight.
            if (sim.elapsed < 4 && sim.enemies.length > 1) {
                sim.enemies.slice(1).forEach(e => sim.projectiles.push(createProjectile(20000 + e.id, e, e, false, e.hp, 0, 1)));
            } else if (sim.elapsed >= 4.8) killLiving(sim);
            sim.player.shotCooldown = 100; // This test isolates reinforcement scheduling.
            sim.update(dt, { x: 0, z: 0 });
            if (sim.elapsed < REINFORCEMENTS.minimumCombatTime) assert.ok(sim.queuedSpawns > 0);
            if (sim.pendingSpawns > 0) assert.equal(sim.progression.phase, 'combat');
            assert.equal(sim.progression.wave, wave);
            for (const e of sim.enemies) assert.equal(e.maxHp, ENEMY_STATS[e.kind].hp);
        }
        assert.ok(maxOccupancy <= REINFORCEMENTS.maxActive);
        assert.equal(sim.kills, WAVES[wave].length);
        assert.equal(ids.size, WAVES[wave].length);
        assert.equal(sim.progression.phase, 'cleared');
        assert.ok(sim.reward);
        assert.equal(sim.offeredUpgrades.length, 0);
    }
});
test('offers are stable during selection; only one offered eligible upgrade can be acquired', () => {
    const sim = new Simulation(seededRandom()); sim.start();
    for (let i = 0; i < 120 && sim.progression.phase === 'combat'; i++) { killLiving(sim); sim.update(dt, { x: 0, z: 0 }); }
    assert.equal(sim.progression.phase, 'cleared');
    walkToReward(sim);
    assert.equal(sim.progression.phase, 'upgrade');
    const options = [...sim.offeredUpgrades];
    for (let i = 0; i < 60; i++) sim.update(dt, { x: 0, z: 0 });
    assert.deepEqual(sim.offeredUpgrades, options);
    const absent = UPGRADES.find(u => !options.includes(u.id))!.id;
    assert.equal(sim.selectUpgrade(absent), false);
    assert.equal(sim.progression.phase, 'upgrade'); assert.equal(sim.player.acquired.size, 0);
    assert.equal(sim.selectUpgrade(options[0]), true);
    assert.equal(sim.selectUpgrade(options[1]), false);
    assert.equal(sim.player.acquired.size, 1);
    assert.deepEqual(sim.offeredUpgrades, []); assert.equal(sim.gates[0].unlocked, true);
    const definition = UPGRADES.find(u => u.id === options[0])!;
    assert.equal(eligibleUpgrades(sim.player).includes(definition.id), !definition.unique);
});
test('initial groups have safe capacity in every sector for many random seeds', () => {
    const obstacles = createWorldObstacles();
    for (let wave = 0; wave < 6; wave++) for (let seed = 1; seed <= 40; seed++) {
        const sim = new Simulation(seededRandom(seed)); sim.progression.wave = wave;
        if (wave) { sim.player.x = ROOM_CENTERS[wave] - 12.9; sim.player.z = seed % 2 ? 1.8 : -1.8; }
        sim.start(); assert.equal(sim.telegraphs.length, WAVE_GROUPS[wave][0].length);
        for (const point of sim.telegraphs) assert.ok(safeSpawn(wave, point, sim.player, obstacles, sim.telegraphs.filter(p => p !== point)));
    }
});
