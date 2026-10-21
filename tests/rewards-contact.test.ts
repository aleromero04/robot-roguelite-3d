import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.ts';
import { createEnemy } from '../src/enemies/enemies.ts';
import { createBoss, BOSS_STATS } from '../src/boss.ts';
import { createProjectile } from '../src/projectiles.ts';
import { rewardPosition, REWARD } from '../src/rewards.ts';
import { ROOM_LAYOUTS, ROOM_CENTERS, createWorldObstacles, roomBounds } from '../src/layout.ts';
import { distance, intersects } from '../src/physics.ts';
import { walkToReward } from './helpers.ts';
import { stopAtBodies, separateBody } from '../src/contact.ts';
import { applyUpgrade } from '../src/upgrades.ts';
const dt = 1 / 60, still = { x: 0, z: 0 };
function lastShooter() {
    const sim = new Simulation(); sim.progression.phase = 'combat'; sim.player.shotCooldown = 100;
    const shooter = createEnemy(500, 'shooter', { x: 4, z: 3.7 }); shooter.hp = 1; shooter.state = 'recovery'; shooter.timer = 10;
    sim.enemies = [shooter]; sim.projectiles = [createProjectile(600, shooter, shooter, false, 1, 0, 1)];
    return sim;
}
export function contactFixture(boss = false, charge = false): Simulation {
    const sim = new Simulation(); sim.progression.phase = 'combat'; sim.player.shotCooldown = 100;
    if (boss) {
        sim.progression.wave = 6; sim.player.x = 216; sim.player.z = 3;
        sim.boss = createBoss(900, { x: 214.4, z: 3 }); sim.boss.state = charge ? 'charge' : 'recovery';
        sim.boss.timer = charge ? .65 : 100; sim.boss.dir = { x: 1, z: 0 };
    } else {
        const enemy = createEnemy(500, 'shooter', { x: .85, z: 3.7 }); enemy.state = 'recovery'; enemy.timer = 100;
        sim.enemies = [enemy];
    }
    return sim;
}
test('clear -> physical reward -> cards -> selection -> door; residual bullets remain dangerous before pickup', () => {
    const sim = lastShooter();
    const bullet = createProjectile(601, { x: 1.5, z: 3.7 }, sim.player, true, 10, 9, 4);
    sim.projectiles.push(bullet); const velocity = { ...bullet.velocity };
    sim.update(dt, still);
    assert.equal(sim.progression.phase, 'cleared'); assert.ok(sim.reward);
    assert.equal(sim.offeredUpgrades.length, 0); assert.equal(sim.enemies.length, 0); assert.equal(sim.pendingSpawns, 0);
    assert.ok(sim.projectiles.includes(bullet)); assert.equal(bullet.life, 4 - dt); assert.deepEqual(bullet.velocity, velocity);
    assert.equal(sim.selectUpgrade('power'), false); assert.equal(sim.gates[0].unlocked, false);
    for (let i = 0; i < 12; i++) sim.update(dt, still);
    assert.equal(sim.player.hp, 70); assert.equal(sim.progression.phase, 'cleared');
    walkToReward(sim);
    assert.equal(sim.progression.phase, 'upgrade'); assert.equal(sim.reward, undefined);
    assert.equal(sim.offeredUpgrades.length, 3); assert.equal(sim.gates[0].unlocked, false);
    assert.equal(sim.events.filter(e => e.type === 'reward-pickup').length, 1);
    assert.ok(sim.selectUpgrade(sim.offeredUpgrades[0])); assert.equal(sim.progression.phase, 'travel'); assert.ok(sim.gates[0].unlocked);
});
test('pickup protection begins in its own frame; surviving bullets keep travelling during cards', () => {
    const sim = lastShooter(); sim.update(dt, still);
    sim.player.x = sim.reward!.x; sim.player.z = sim.reward!.z; sim.player.invulnerable = 0;
    const bullet = createProjectile(700, { x: sim.player.x + .1, z: sim.player.z }, sim.player, true, 10, 9, 4);
    sim.projectiles = [bullet]; const hp = sim.player.hp;
    sim.update(dt, { x: 1, z: 0 }); assert.equal(sim.progression.phase, 'upgrade'); assert.equal(sim.player.hp, hp);
    const x = bullet.x, px = sim.player.x; sim.update(.1, { x: 1, z: 0 });
    assert.ok(bullet.x < x); assert.equal(sim.player.x, px); assert.equal(sim.player.hp, hp); assert.ok(sim.projectiles.includes(bullet));
});
test('all reward anchors avoid geometry/walls/player and every normal arena has a walkable pickup', () => {
    const obstacles = createWorldObstacles();
    for (let wave = 0; wave < 6; wave++) {
        const center = ROOM_CENTERS[wave], bounds = roomBounds(wave);
        for (let x = -12; x <= 12; x += 3) for (let z = -8; z <= 8; z += 2) {
            const player = { x: center + x, z }, reward = rewardPosition(wave, player, obstacles);
            assert.ok(distance(player, reward) >= REWARD.playerClearance);
            assert.ok(!obstacles.some(o => intersects(reward, REWARD.footprint, o)));
            assert.ok(reward.x >= bounds.minX + 2 && reward.x <= bounds.maxX - 2 && reward.z >= bounds.minZ + 2 && reward.z <= bounds.maxZ - 2);
        }
        for (const anchor of ROOM_LAYOUTS[wave].rewardPoints) {
            const sim = new Simulation(); sim.progression.wave = wave; sim.progression.phase = 'cleared';
            sim.player.x = center - 12; sim.player.z = 0; sim.reward = { x: center + anchor.x, z: anchor.z };
            const step = walkToReward(sim); assert.ok(step <= sim.player.stats.speed * dt + 1e-8);
        }
    }
});
test('Shooter contact is 10 HP, applies normal i-frames and cannot hit each frame', () => {
    const sim = contactFixture(); sim.update(dt, still);
    assert.equal(sim.player.hp, 70); assert.equal(sim.player.invulnerable, .85);
    for (let i = 0; i < 40; i++) { sim.player.x = 0; sim.update(dt, { x: 1, z: 0 }); }
    assert.equal(sim.player.hp, 70); assert.equal(sim.events.filter(e => e.type === 'player-hit').length, 1);
    sim.player.invulnerable = 0; sim.player.x = 0; sim.update(dt, { x: 1, z: 0 }); assert.equal(sim.player.hp, 60);
});
test('Boss normal contact is 16 HP, while Charge hits for 28 without an additional body hit', () => {
    for (const charge of [false, true]) {
        const sim = contactFixture(true, charge); sim.update(dt, still);
        assert.equal(sim.player.hp, charge ? 52 : 64);
        assert.equal(sim.events.filter(e => e.type === 'player-hit').length, 1);
        for (let i = 0; i < 20; i++) sim.update(dt, still);
        assert.equal(sim.player.hp, charge ? 52 : 64);
    }
});
test('body contacts respect dash invulnerability and Shield', () => {
    for (const boss of [false, true]) for (const shield of [false, true]) {
        const sim = contactFixture(boss);
        if (shield) applyUpgrade(sim.player, 'shield'); else sim.dash();
        sim.update(dt, still); assert.equal(sim.player.hp, 80);
        assert.equal(sim.events.filter(e => e.type === 'shield-break').length, shield ? 1 : 0);
    }
});
test('swept body stopping blocks a dash through the center; overlap separation is bounded and wall safe', () => {
    const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, body = { id: 1, x: 0, z: 0, radius: 1.25 };
    const player = { x: 4, z: 0 }, hits = stopAtBodies({ x: -4, z: 0 }, player, [body], [], bounds);
    assert.ok(hits.has(1)); assert.ok(player.x < -1.73);
    for (let i = 0; i < 120; i++) {
        const before = { ...player }; player.x += .1;
        stopAtBodies(before, player, [body], [], bounds); separateBody(player, body, dt, [], bounds);
        assert.ok(player.x < -1.72); assert.ok(distance(before, player) < .14);
    }
    const overlap = { x: 0, z: 0 }, wall = { x: 0, z: .8, halfX: 3, halfZ: .2 };
    const before = { ...overlap }; separateBody(overlap, body, dt, [wall], bounds);
    assert.ok(distance(before, overlap) <= 8 * dt + 1e-8); assert.ok(!intersects(overlap, .48, wall));
});
test('Boss ending has no reward, cancels future attacks and allows harmless residual visuals before Victory', () => {
    const sim = contactFixture(true); sim.player.x = 220; sim.boss!.hp = 1;
    const boss = sim.boss!, bullet = createProjectile(800, sim.player, sim.player, true, BOSS_STATS.projectileDamage, 1, 4);
    sim.projectiles = [createProjectile(801, boss, boss, false, 1, 0, 1), bullet];
    sim.update(dt, still);
    assert.equal(sim.progression.phase, 'ending'); assert.equal(sim.reward, undefined); assert.equal(sim.offeredUpgrades.length, 0);
    assert.equal(sim.player.hp, 80); assert.equal(boss.state, 'dead'); assert.equal(boss.timer, 0);
    assert.ok(sim.projectiles.includes(bullet)); const pos = { ...sim.player };
    sim.update(.5, { x: 1, z: 0 }); assert.equal(sim.progression.phase, 'ending'); assert.equal(sim.player.x, pos.x);
    sim.update(.4, still); assert.equal(sim.progression.phase, 'complete'); assert.equal(sim.player.hp, 80);
});
