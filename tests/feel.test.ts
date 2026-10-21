import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from './helpers.ts';
import { ENEMY_STATS, PLAYER_STATS } from '../src/stats.ts';
import { createWorldObstacles, ROOM_LAYOUTS, ROOM_CENTERS, roomBounds, spawnPositions, safeSpawn } from '../src/layout.ts';
import { Simulation, SPAWN_DELAY, SPAWN_FADE } from '../src/simulation.ts';
import { createEnemy, updateEnemy } from '../src/enemies/enemies.ts';
import { distance, intersects, segmentBox } from '../src/physics.ts';
import { createPlayer, updatePlayer } from '../src/player.ts';
import { createProjectile } from '../src/projectiles.ts';
const dt = 1 / 60;
test('movement increases preserve roles, damage, cooldown and moderate enemy HP', () => {
    assert.equal(PLAYER_STATS.speed, 7.182);
    assert.equal(PLAYER_STATS.damage, 10);
    assert.equal(PLAYER_STATS.attackCooldown, .35);
    assert.deepEqual([ENEMY_STATS.basic, ENEMY_STATS.runner, ENEMY_STATS.shooter].map(s => s.speed), [2.431, 3.888, 2.53]);
    assert.deepEqual([ENEMY_STATS.basic, ENEMY_STATS.runner, ENEMY_STATS.shooter].map(s => s.hp), [48, 42, 45]);
    assert.equal(ENEMY_STATS.runner.dashSpeed, 14.5);
    assert.equal(ENEMY_STATS.runner.windup, .75);
    for (const stats of Object.values(ENEMY_STATS)) {
        assert.ok(stats.speed < PLAYER_STATS.speed);
        assert.ok(stats.hp >= 30 * 1.4 && stats.hp <= 30 * 1.6);
    }
    const player = createPlayer();
    const before = { ...player };
    updatePlayer(player, { x: 1, z: 0 }, dt, [], roomBounds(0));
    assert.ok(Math.abs(distance(player, before) - 7.182 * dt) < 1e-9);
});
test('rooms share render/collision footprints but have distinct asymmetric layouts', () => {
    assert.equal(new Set(ROOM_LAYOUTS.slice(0, 6).map(r => JSON.stringify(r.machinery))).size, 6);
    assert.equal(ROOM_LAYOUTS[0].machinery.length + 1, 3);
    assert.ok(ROOM_LAYOUTS[1].machinery.filter(o => o.halfX >= 3).length >= 2);
    assert.deepEqual(ROOM_LAYOUTS[2].reactor, { x: 0, z: 0, halfX: 2.2, halfZ: 2.2 });
    const obstacles = createWorldObstacles();
    ROOM_LAYOUTS.slice(0, 6).forEach((room, wave) => {
        for (const local of [...room.machinery, room.reactor]) {
            assert.ok(obstacles.some(o => o.x === local.x + ROOM_CENTERS[wave] && o.z === local.z && o.halfX === local.halfX && o.halfZ === local.halfZ));
        }
    });
    assert.ok(segmentBox({ x: 67, z: 0 }, { x: 77, z: 0 }, { ...ROOM_LAYOUTS[2].reactor, x: 72 }, .1));
});
test('every candidate accommodates a hitbox, and shuffled selections remain safe across seeds and player positions', () => {
    const obstacles = createWorldObstacles();
    ROOM_LAYOUTS.slice(0, 6).forEach((room, wave) => {
        const center = ROOM_CENTERS[wave];
        for (const local of room.candidates) {
            assert.ok(safeSpawn(wave, { x: center + local.x, z: local.z }, { x: -1000, z: 0 }, obstacles, []), `room ${wave}: ${JSON.stringify(local)}`);
        }
        const variations = new Set<string>();
        for (let seed = 1; seed <= 80; seed++) {
            for (const local of [{ x: -13, z: 0 }, { x: 0, z: 3.7 }, { x: 10, z: 6 }]) {
                const player = { x: center + local.x, z: local.z };
                const points = spawnPositions(wave, 6, player, obstacles, seededRandom(seed));
                assert.equal(points.length, 6);
                for (const point of points) assert.ok(safeSpawn(wave, point, player, obstacles, points.filter(p => p !== point)));
                variations.add(JSON.stringify(points));
            }
        }
        assert.ok(variations.size > 20);
    });
});
test('650 ms simultaneous telegraphs precede enemies and fade completely after spawn', () => {
    const sim = new Simulation(seededRandom());
    assert.equal(sim.telegraphs.length, 0);
    sim.start();
    const positions = sim.telegraphs.map(t => ({ x: t.x, z: t.z }));
    assert.equal(sim.pendingSpawns, 3);
    for (let i = 0; i < 38; i++) sim.update(dt, { x: 0, z: 0 });
    assert.equal(sim.enemies.length, 0);
    assert.equal(sim.events.filter(e => e.type === 'spawn').length, 0);
    assert.equal(sim.progression.phase, 'combat');
    sim.update(dt, { x: 0, z: 0 });
    assert.equal(sim.enemies.length, 3);
    assert.equal(sim.pendingSpawns, 0);
    assert.deepEqual(sim.events.filter(e => e.type === 'spawn').map(e => e.position), positions);
    assert.ok(sim.telegraphs.every(t => t.spawned));
    for (let i = 0; i < 12; i++) sim.update(dt, { x: 0, z: 0 });
    assert.ok(sim.elapsed > SPAWN_DELAY + SPAWN_FADE);
    assert.equal(sim.telegraphs.length, 0);
});
test('entering a telegraph triggers a new full warning at a safe replacement position', () => {
    const sim = new Simulation(seededRandom()); sim.start();
    const marker = sim.telegraphs[0], original = { x: marker.x, z: marker.z };
    sim.player.x = marker.x; sim.player.z = marker.z;
    for (let i = 0; i < 39; i++) sim.update(dt, { x: 0, z: 0 });
    assert.equal(marker.spawned, false);
    assert.equal(marker.age, 0);
    assert.ok(distance(marker, original) >= 6);
    assert.equal(sim.enemies.some(e => e.id === marker.id), false);
    for (let i = 0; i < 38; i++) sim.update(dt, { x: 0, z: 0 });
    assert.equal(marker.spawned, false);
    sim.update(dt, { x: 0, z: 0 });
    assert.equal(marker.spawned, true);
});
test('pending enemies prevent premature upgrade and death clears warnings', () => {
    const sim = new Simulation(seededRandom()); sim.start();
    const e = createEnemy(1000, 'basic', { x: 3, z: 3.7 }); e.hp = 1; sim.enemies.push(e);
    sim.projectiles.push(createProjectile(1001, e, e, false, 1, 0, 1));
    sim.update(dt, { x: 0, z: 0 });
    assert.equal(sim.enemies.length, 0);
    assert.equal(sim.progression.phase, 'combat');
    sim.player.hp = 1;
    sim.projectiles.push(createProjectile(1002, sim.player, sim.player, true, 10, 0, 1));
    sim.update(dt, { x: 0, z: 0 });
    assert.equal(sim.progression.phase, 'dead');
    assert.equal(sim.telegraphs.length, 0);
});
test('Basic, Runner and Shooter can negotiate central cover without intersecting it', () => {
    const obstacles = createWorldObstacles(), bounds = roomBounds(2);
    for (const kind of ['basic', 'runner', 'shooter'] as const) {
        const e = createEnemy(1, kind, { x: 67, z: .3 });
        const player = { x: 79, z: 0 };
        let sawPlayer = false;
        for (let tick = 0; tick < 60 * 14; tick++) {
            updateEnemy(e, player, [e], obstacles, bounds, dt);
            assert.ok(!obstacles.some(o => intersects(e, .5, o)), kind);
            if (!obstacles.some(o => segmentBox(e, player, o, .1))) sawPlayer = true;
        }
        assert.ok(sawPlayer, `${kind} must find a line around the reactor`);
    }
});

test('all 288 room/candidate/archetype approaches reach an attack without crossing cover', () => {
    const obstacles = createWorldObstacles();
    ROOM_LAYOUTS.slice(0, 6).forEach((room, wave) => {
        const bounds = roomBounds(wave), center = ROOM_CENTERS[wave];
        const player = { x: center, z: wave % 3 === 2 ? 5 : 0 };
        for (const kind of ['basic', 'runner', 'shooter'] as const) for (const candidate of room.candidates) {
            const enemy = createEnemy(1, kind, { x: candidate.x + center, z: candidate.z });
            let attacked = false;
            for (let tick = 0; tick < 60 * 30; tick++) {
                const intent = updateEnemy(enemy, player, [enemy], obstacles, bounds, dt);
                attacked ||= !!intent.hit || !!intent.fire;
                assert.ok(!obstacles.some(o => intersects(enemy, .5, o)));
            }
            assert.ok(attacked, `room ${wave + 1}, ${kind}, start ${JSON.stringify(candidate)}`);
        }
    });
});
