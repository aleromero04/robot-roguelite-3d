import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Simulation } from '../src/simulation.ts';
import { createEnemy } from '../src/enemies/enemies.ts';
import { createBoss } from '../src/boss.ts';
import { createProjectile } from '../src/projectiles.ts';
import { applyUpgrade } from '../src/upgrades.ts';
import { resolvePlayerHit } from '../src/player.ts';
import { ENEMY_STATS, type EnemyKind } from '../src/stats.ts';
import { separateBodies, stopAtBodies } from '../src/contact.ts';
import { distance, intersects, moveCircle } from '../src/physics.ts';
import { ROOM_CENTERS, ENTRY_X, WORLD_BOUNDS } from '../src/layout.ts';
import { Effects } from '../src/effects.ts';
import { walkToReward } from './helpers.ts';
import { TestNavigator } from './pilot.ts';
const dt = 1 / 60, still = { x: 0, z: 0 };
function fixture(kind: EnemyKind) {
    const sim = new Simulation(() => 0); sim.progression.phase = 'combat'; sim.player.shotCooldown = 10000;
    const enemy = createEnemy(500, kind, { x: .85, z: 3.7 }); enemy.state = 'recovery'; enemy.timer = 10000;
    sim.enemies = [enemy]; return sim;
}
for (const kind of ['basic', 'runner', 'shooter'] as const) {
    test(`${kind} body contact deals 10 once, respects i-frames and blocks walking/dashing through`, () => {
        const sim = fixture(kind); sim.update(dt, still);
        assert.equal(sim.player.hp, 70); assert.equal(sim.player.invulnerable, .85);
        for (let i = 0; i < 35; i++) sim.update(dt, { x: 1, z: 0 });
        assert.equal(sim.player.hp, 70); assert.ok(sim.player.x < sim.enemies[0].x - .97);
        sim.player.lastDir = { x: 1, z: 0 }; sim.dash();
        for (let i = 0; i < 10; i++) sim.update(dt, still);
        assert.equal(sim.player.hp, 70); assert.ok(sim.player.x < sim.enemies[0].x - .97);
        assert.equal(sim.events.filter(e => e.type === 'player-hit').length, 1);
    });
}
test('Basic melee deals 15 HP and takes priority over 10 contact, including Shield absorption', () => {
    for (const shield of [false, true]) {
        const sim = fixture('basic'); sim.enemies[0].state = 'windup'; sim.enemies[0].timer = .001;
        if (shield) applyUpgrade(sim.player, 'shield');
        sim.update(dt, still);
        assert.equal(sim.player.hp, shield ? 80 : 65);
        assert.equal(sim.events.filter(e => e.type === (shield ? 'shield-break' : 'player-hit')).length, 1);
    }
});
test('Runner dash deals 20 HP with no contact during dash, including its last/first frame', () => {
    assert.equal(ENEMY_STATS.runner.damage, 20);
    const sim = fixture('runner'), enemy = sim.enemies[0];
    enemy.state = 'dash'; enemy.timer = .3; enemy.dir = { x: -1, z: 0 };
    sim.update(dt, still); assert.equal(sim.player.hp, 60); assert.ok(enemy.dashHit);
    sim.player.invulnerable = 0; enemy.x = sim.player.x + .6; enemy.timer = .001;
    sim.update(dt, still); assert.equal(enemy.state, 'recovery'); assert.equal(sim.player.hp, 60);
    enemy.x = sim.player.x + .6; enemy.state = 'windup'; enemy.timer = .001; enemy.dashHit = false;
    sim.update(dt, still); assert.equal(enemy.state, 'dash'); assert.equal(sim.player.hp, 40);
});
test('a crowd uses one bounded separation, is order-independent and does not move enemies', () => {
    const bodies = [{ id: 1, x: -.65, z: 0, radius: .5 }, { id: 2, x: .65, z: 0, radius: .5 }, { id: 3, x: 0, z: -.65, radius: .5 }];
    const before = structuredClone(bodies), a = { ...still }, b = { ...still };
    for (let frame = 0; frame < 120; frame++) {
        const previous = { ...a };
        separateBodies(a, bodies, dt, [], WORLD_BOUNDS); separateBodies(b, [...bodies].reverse(), dt, [], WORLD_BOUNDS);
        assert.ok(distance(previous, a) <= 8 * dt + 1e-8);
        assert.ok(distance(a, b) < 1e-8);
    }
    assert.deepEqual(bodies, before); assert.ok(a.z > .7);
});
test('overlap cannot be driven deeper; tangential escape works between a body and cover', () => {
    const body = { id: 1, x: 0, z: 0, radius: .5 }, wall = { x: 1.7, z: 0, halfX: .2, halfZ: 2 };
    let p = { x: .9, z: 0 };
    for (let i = 0; i < 60; i++) {
        const before = { ...p }; p = moveCircle(p, -.15, 0, .48, [wall], WORLD_BOUNDS);
        stopAtBodies(before, p, [body], [wall], WORLD_BOUNDS); separateBodies(p, [body], dt, [wall], WORLD_BOUNDS);
        assert.ok(p.x >= .9 - 1e-8); assert.ok(!intersects(p, .48, wall));
    }
    for (let i = 0; i < 120; i++) {
        const before = { ...p }; p = moveCircle(p, 0, .1, .48, [wall], WORLD_BOUNDS);
        stopAtBodies(before, p, [body], [wall], WORLD_BOUNDS); separateBodies(p, [body], dt, [wall], WORLD_BOUNDS);
        assert.ok(distance(before, p) < .24); assert.ok(!intersects(p, .48, wall));
    }
    assert.ok(p.z > 3);
});
test('Runner passing near the player during dash does not pull or teleport the player', () => {
    const sim = fixture('runner'), enemy = sim.enemies[0]; enemy.x = -2; enemy.z = sim.player.z - 1.05;
    enemy.state = 'dash'; enemy.timer = .55; enemy.dir = { x: 1, z: 0 };
    const initial = { x: sim.player.x, z: sim.player.z };
    for (let i = 0; i < 30; i++) sim.update(dt, still);
    assert.equal(sim.player.hp, 80); assert.ok(distance(initial, sim.player) < 1e-8);
});
function cross(sim: Simulation) {
    const wave = sim.progression.wave, nav = new TestNavigator(), center = ROOM_CENTERS[wave];
    for (let i = 0; i < 1800 && sim.progression.wave === wave; i++) {
        const goal = sim.player.x < center + 11.8 || Math.abs(sim.player.z) > .3 ? { x: center + 12, z: 0 } : { x: ENTRY_X[wave] + 1, z: 0 };
        sim.update(dt, nav.toward(sim.player, goal, sim.obstacles, WORLD_BOUNDS));
    }
    assert.equal(sim.progression.wave, wave + 1);
}
test('Shield stays spent through waiting, clear, reward, cards and gate; actual crossing rearms once', () => {
    const sim = fixture('shooter'), enemy = sim.enemies[0]; enemy.x = 5;
    applyUpgrade(sim.player, 'shield'); assert.equal(resolvePlayerHit(sim.player, 12, true), 'shield');
    for (let i = 0; i < 60 * 20; i++) sim.update(dt, still);
    assert.ok(sim.player.shieldSpent);
    sim.projectiles = [createProjectile(900, enemy, enemy, false, 100, 0, 1)]; sim.update(dt, still);
    assert.equal(sim.progression.phase, 'cleared'); assert.ok(sim.player.shieldSpent);
    walkToReward(sim); assert.equal(sim.progression.phase, 'upgrade'); assert.ok(sim.player.shieldSpent);
    sim.selectUpgrade(sim.offeredUpgrades[0]); assert.ok(sim.gates[0].unlocked); assert.ok(sim.player.shieldSpent);
    for (let i = 0; i < 60; i++) sim.update(dt, still);
    assert.ok(sim.gates[0].openness > .99); assert.ok(sim.player.shieldSpent);
    cross(sim); assert.equal(sim.player.shieldSpent, false);
    assert.equal(sim.events.filter(e => e.type === 'shield-ready').length, 1);
    sim.player.invulnerable = 0; assert.equal(resolvePlayerHit(sim.player, 12, true), 'shield');
    sim.update(dt, still); assert.ok(sim.player.shieldSpent);
    sim.player.invulnerable = 0; assert.equal(resolvePlayerHit(sim.player, 12, true), 'damage'); assert.equal(sim.player.hp, 68);
    assert.equal(sim.events.filter(e => e.type === 'shield-ready').length, 1);
});
test('Shield acquired at cards is immediately ready and never accumulates two charges at Boss entry', () => {
    const sim = new Simulation(); sim.progression.wave = 5; sim.progression.phase = 'upgrade';
    sim.player.x = ROOM_CENTERS[5] + 10; sim.player.z = 0; sim.offeredUpgrades = ['shield','repair','power'];
    assert.ok(sim.selectUpgrade('shield')); assert.equal(sim.player.shieldSpent, false);
    cross(sim); assert.ok(sim.boss); assert.equal(sim.player.shieldSpent, false);
    sim.player.invulnerable = 0; assert.equal(resolvePlayerHit(sim.player, 12, true), 'shield');
    sim.player.invulnerable = 0; assert.equal(resolvePlayerHit(sim.player, 12, true), 'damage');
    sim.boss!.state = 'recovery'; sim.boss!.timer = 10000; sim.player.shotCooldown = 10000;
    for (let i = 0; i < 60 * 180; i++) sim.update(dt, still);
    assert.equal(sim.progression.phase, 'combat'); assert.ok(sim.player.shieldSpent);
    const fresh = new Simulation(); assert.equal(fresh.player.shieldSpent, false); assert.ok(!fresh.player.acquired.has('shield'));
});
test('Shield absorbs Basic/Runner passive contact and Boss fragment with no HP loss', () => {
    for (const kind of ['basic','runner','fragment'] as const) {
        const sim = fixture(kind === 'fragment' ? 'shooter' : kind); applyUpgrade(sim.player,'shield');
        if (kind === 'fragment') {
            sim.enemies = []; sim.boss = createBoss(800, {x:216,z:0}); sim.progression.wave = 6; sim.player.x = 208;
            sim.boss.state = 'recovery'; sim.boss.timer = 100;
            const shot = createProjectile(900,sim.player,sim.player,true,12,0,1); shot.fragment = true; sim.projectiles = [shot];
        }
        sim.update(dt, still); assert.equal(sim.player.hp,80); assert.ok(sim.player.shieldSpent);
        assert.equal(sim.events.filter(e=>e.type==='shield-break').length,1);
    }
});
test('Flame emits a distinct impact event and smaller tick events without changing damage/lifecycle', () => {
    const sim = fixture('basic'), enemy = sim.enemies[0]; enemy.x = 5;
    sim.projectiles = [createProjectile(900,enemy,enemy,false,10,0,1,{flame:true})];
    sim.update(dt,still); assert.equal(enemy.hp,38); assert.equal(sim.events.filter(e=>e.type==='flame-impact').length,1);
    for(let i=0;i<90;i++) sim.update(dt,still);
    assert.equal(enemy.hp,32); assert.equal(sim.events.filter(e=>e.type==='burn').length,3); assert.equal(sim.burns.size,0);
});
test('Flame VFX uses the capped existing batch, cleans owner particles and reuses objects on reset', () => {
    const scene = new T.Scene(), effects = new Effects(scene), mesh = scene.children[0] as T.InstancedMesh;
    const point = new T.Vector3(0,1,0);
    effects.flame(point,1,false,'embers'); effects.flame(point,2,true,'embers'); effects.update(dt);
    assert.equal(scene.children.length,1); assert.equal(mesh.count,6);
    effects.retainBurns(new Set([2])); effects.update(dt); assert.equal(mesh.count,4);
    effects.retainBurns(new Set()); effects.update(dt); assert.equal(mesh.count,0);
    for(let i=0;i<100;i++) effects.flame(point,1,true,'impact'); effects.update(dt); assert.equal(mesh.count,320);
    effects.update(1); assert.equal(mesh.count,0);
    effects.flame(point,3,false,'tick'); effects.update(dt); assert.equal(mesh.count,4);
    effects.clear(); assert.equal(mesh.count,0); effects.update(dt); assert.equal(mesh.count,0);
});
test('swept contact only reports bodies reached before the first blocker', () => {
    const bodies = [{id:1,x:0,z:0,radius:.5},{id:2,x:2,z:0,radius:.5}], player = {x:4,z:0};
    assert.deepEqual([...stopAtBodies({x:-4,z:0},player,bodies,[],WORLD_BOUNDS)],[1]);
    assert.ok(player.x < -.98);
});
