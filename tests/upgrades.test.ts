import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from './helpers.ts';
import { createPlayer, updatePlayer } from '../src/player.ts';
import { applyUpgrade, chooseUpgradeOptions, eligibleUpgrades, UPGRADES, UPGRADE_VALUES, RARITY_WEIGHTS } from '../src/upgrades.ts';
import { createProjectile, guideProjectile, updateProjectiles, type Projectile, type ProjectileTarget } from '../src/projectiles.ts';
import { Simulation } from '../src/simulation.ts';
import { createEnemy } from '../src/enemies/enemies.ts';
import { WORLD_BOUNDS } from '../src/layout.ts';
import { PLAYER_STATS } from '../src/stats.ts';
import type { Obstacle } from '../src/physics.ts';
const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, dt = 1 / 60;
const enemy = (id: number, x: number, z = 0): ProjectileTarget => ({ id, x, z, hp: 100 });
function step(shots: Projectile[], enemies: ProjectileTarget[], seconds: number, obstacles: Obstacle[] = []): { shots: Projectile[]; hits: number[] } {
    const hits: number[] = [];
    return { shots: updateProjectiles(shots, seconds, obstacles, bounds, { x: 50, z: 50 }, enemies, {
        hurtPlayer: () => {}, hurtEnemy: (id, damage) => { hits.push(id); enemies.find(e => e.id === id)!.hp -= damage; },
        impact: () => {}, canDamagePlayer: () => true,
    }), hits };
}
test('seventeen upgrades: five repeatable, twelve unique; three eligible distinct choices across seeds', () => {
    const player = createPlayer(), variations = new Set<string>();
    assert.equal(UPGRADES.length, 17);
    assert.equal(UPGRADES.filter(u => !u.unique).length, 5);
    for (let seed = 1; seed <= 100; seed++) {
        const options = chooseUpgradeOptions(player, seededRandom(seed));
        assert.equal(options.length, 3); assert.equal(new Set(options).size, 3);
        assert.ok(options.every(id => eligibleUpgrades(player).includes(id)));
        variations.add(options.join(','));
    }
    assert.ok(variations.size > 20);
    for (const upgrade of UPGRADES) {
        assert.ok(applyUpgrade(player, upgrade.id));
        assert.equal(eligibleUpgrades(player).includes(upgrade.id), !upgrade.unique);
        assert.equal(applyUpgrade(player, upgrade.id), !upgrade.unique);
    }
    assert.equal(eligibleUpgrades(player).length, 5);
    assert.equal(chooseUpgradeOptions(player).length, 3);
});
test('common upgrades stack and affect actual movement, maximum health and capped healing', () => {
    const p = createPlayer();
    applyUpgrade(p, 'power'); applyUpgrade(p, 'power'); assert.equal(p.stats.damage, 15.625);
    applyUpgrade(p, 'overclock'); assert.ok(Math.abs(p.stats.attackCooldown - .2975) < 1e-9);
    applyUpgrade(p, 'turbo'); applyUpgrade(p, 'turbo');
    assert.ok(Math.abs(p.stats.speed - PLAYER_STATS.speed * 1.21) < 1e-9);
    const x = p.x; updatePlayer(p, { x: 1, z: 0 }, dt, [], WORLD_BOUNDS);
    assert.ok(Math.abs(p.x - x - p.stats.speed * dt) < 1e-9);
    p.hp = 31; applyUpgrade(p, 'chassis'); assert.equal(p.stats.maxHp, 100); assert.equal(p.hp, 51);
    applyUpgrade(p, 'chassis'); assert.equal(p.stats.maxHp, 120); assert.equal(p.hp, 71);
    applyUpgrade(p, 'repair'); assert.equal(p.hp, 101);
    applyUpgrade(p, 'repair'); assert.equal(p.hp, 120);
});
test('Piercing crosses exactly one additional enemy, once per ID even across frames', () => {
    const enemies = [enemy(1, 1), enemy(2, 3), enemy(3, 5)];
    const shot = createProjectile(1, { x: 0, z: 0 }, { x: 10, z: 0 }, false, 10, 10, 2, { piercing: 1 });
    let result = step([shot], enemies, .1);
    assert.deepEqual(result.hits, [1]); assert.equal(result.shots.length, 1);
    result = step(result.shots, enemies, .1);
    assert.deepEqual(result.hits, []);
    result = step(result.shots, enemies, .4);
    assert.deepEqual(result.hits, [2]); assert.equal(result.shots.length, 0);
    assert.deepEqual(enemies.map(e => e.hp), [90, 90, 100]);
});
test('swept hits respect spatial order and cover, including several impacts in one step', () => {
    const enemies = [enemy(3, 8), enemy(2, 5), enemy(1, 2)];
    const shot = createProjectile(1, { x: 0, z: 0 }, { x: 10, z: 0 }, false, 10, 20, 2, { piercing: 1, ricochet: 1 });
    const result = step([shot], enemies, .5, [{ x: 6.5, z: 0, halfX: .2, halfZ: 2 }]);
    assert.deepEqual(result.hits, [1, 2]); assert.equal(result.shots.length, 0);
    assert.equal(enemies[0].hp, 100);
});
test('Ricochet redirects once to a living neighbour, with unchanged damage/speed/lifetime', () => {
    const enemies = [enemy(1, 2), enemy(2, 2, 3), enemy(3, 2, 5)];
    const shot = createProjectile(1, { x: 0, z: 0 }, enemies[0], false, 12.5, 10, 2, { ricochet: 1 });
    const first = step([shot], enemies, .15);
    assert.deepEqual(first.hits, [1]); assert.equal(shot.bounces, 0);
    assert.ok(shot.velocity.z > 9); assert.ok(Math.abs(Math.hypot(shot.velocity.x, shot.velocity.z) - 10) < 1e-9);
    assert.equal(shot.life, 1.85); assert.equal(shot.damage, 12.5);
    const second = step(first.shots, enemies, .6);
    assert.deepEqual(second.hits, [2]); assert.equal(second.shots.length, 0);
    assert.equal(enemies[2].hp, 100);
});
test('Ricochet stops without a valid neighbour: dead, already hit, distant or behind cover', () => {
    for (const mode of ['dead', 'hit', 'distant', 'cover']) {
        const enemies = [enemy(1, 2), enemy(2, 2, mode === 'distant' ? 8 : 3)];
        const shot = createProjectile(1, { x: 0, z: 0 }, enemies[0], false, 10, 10, 2, { ricochet: 1 });
        if (mode === 'dead') enemies[1].hp = 0;
        if (mode === 'hit') shot.hitIds.add(2);
        const cover = mode === 'cover' ? [{ x: 2, z: 1.5, halfX: 1, halfZ: .2 }] : [];
        const result = step([shot], enemies, .3, cover);
        assert.deepEqual(result.hits, [1]); assert.equal(result.shots.length, 0);
    }
});
test('Piercing takes priority; Ricochet occurs only on the next terminal impact', () => {
    const enemies = [enemy(1, 2), enemy(2, 4), enemy(3, 4, 3), enemy(4, 4, 5)];
    const shot = createProjectile(1, { x: 0, z: 0 }, enemies[0], false, 10, 10, 3, { piercing: 1, ricochet: 1 });
    let result = step([shot], enemies, .2);
    assert.deepEqual(result.hits, [1]); assert.equal(shot.pierces, 0); assert.equal(shot.bounces, 1); assert.equal(shot.velocity.z, 0);
    result = step(result.shots, enemies, .2);
    assert.deepEqual(result.hits, [2]); assert.equal(shot.bounces, 0); assert.ok(shot.velocity.z > 0);
    result = step(result.shots, enemies, .6);
    assert.deepEqual(result.hits, [3]); assert.equal(result.shots.length, 0); assert.equal(enemies[3].hp, 100);
});
test('Homing smoothly turns, preserves speed and cannot exceed 45 degrees of total correction', () => {
    const shot = createProjectile(1, { x: 0, z: 0 }, { x: 10, z: 0 }, false, 10, 25, 2, { homing: true });
    const enemies = [enemy(1, 6, 3)];
    guideProjectile(shot, enemies, [], dt);
    assert.ok(Math.abs(Math.atan2(shot.velocity.z, shot.velocity.x) - UPGRADE_VALUES.homingTurnRate * dt) < 1e-9);
    for (let i = 0; i < 180; i++) {
        const angle = Math.atan2(shot.velocity.z, shot.velocity.x) + .3;
        enemies[0].x = Math.cos(angle) * 6; enemies[0].z = Math.sin(angle) * 6;
        guideProjectile(shot, enemies, [], dt);
    }
    assert.ok(Math.abs(Math.hypot(shot.velocity.x, shot.velocity.z) - 25) < 1e-9);
    assert.ok(Math.atan2(shot.velocity.z, shot.velocity.x) <= Math.PI / 4 + 1e-8);
    assert.ok(shot.turnRemaining <= 1e-8);
});
test('Homing continues straight on target loss and ignores rear targets, hit IDs and cover', () => {
    const shot = createProjectile(1, { x: 0, z: 0 }, { x: 10, z: 0 }, false, 10, 25, 2, { homing: true });
    const enemies = [enemy(1, 5, 2)]; guideProjectile(shot, enemies, [], dt);
    const velocity = { ...shot.velocity }; enemies[0].hp = 0;
    guideProjectile(shot, enemies, [], .3); assert.deepEqual(shot.velocity, velocity);
    guideProjectile(shot, [enemy(2, -5)], [], .3); assert.deepEqual(shot.velocity, velocity);
    guideProjectile(shot, [enemy(3, 6, 2)], [{ x: 3, z: 0, halfX: 1, halfZ: 3 }], .3);
    assert.deepEqual(shot.velocity, velocity);
    shot.hitIds.add(4); guideProjectile(shot, [enemy(4, 6, 2)], [], .3); assert.deepEqual(shot.velocity, velocity);
});
test('Homing combines with Piercing and Ricochet while respecting their independent budgets', () => {
    for (const modifiers of [{ piercing: 1, homing: true }, { ricochet: 1, homing: true }]) {
        const enemies = [enemy(1, 2), enemy(2, 4, .2)];
        const shot = createProjectile(1, { x: 0, z: 0 }, enemies[0], false, 10, 10, 2, modifiers);
        let shots = [shot]; const hits: number[] = [];
        for (let i = 0; i < 60 && shots.length; i++) { const r = step(shots, enemies, dt); shots = r.shots; hits.push(...r.hits); }
        assert.deepEqual(hits, [1, 2]); assert.ok(shot.turnRemaining >= -1e-9);
    }
});
test('enemy bullets never inherit Player modifiers', () => {
    const shot = createProjectile(1, { x: 0, z: 0 }, { x: 1, z: 0 }, true, 10, 9, 4, { piercing: 1, ricochet: 1, homing: true });
    assert.equal(shot.pierces, 0); assert.equal(shot.bounces, 0); assert.equal(shot.homing, false);
});
function burstFixture(): Simulation {
    const sim = new Simulation(seededRandom()); sim.start();
    for (let i = 0; i < 40; i++) sim.update(dt, { x: 0, z: 0 });
    sim.telegraphs = []; sim.projectiles = []; sim.events = [];
    sim.enemies = [createEnemy(900, 'shooter', { x: 10, z: 3.7 })]; sim.enemies[0].hp = 1000;
    sim.player.shotCooldown = 0; applyUpgrade(sim.player, 'rapid');
    return sim;
}
test('Rapid emits exactly two shots 100 ms apart; power and overclock apply', () => {
    const sim = burstFixture(); applyUpgrade(sim.player, 'power'); applyUpgrade(sim.player, 'overclock');
    const times: number[] = [];
    for (let i = 0; i < 19; i++) {
        sim.events = []; sim.update(dt, { x: 0, z: 0 });
        for (const event of sim.events) if (event.type === 'shot' && !event.enemy) times.push(sim.elapsed);
    }
    assert.equal(times.length, 3); // Two shots, then the next attack after 297.5 ms.
    assert.ok(times[1] - times[0] >= .08 && times[1] - times[0] <= .11);
    assert.ok(times[2] - times[0] >= .2975 && times[2] - times[0] < .32);
    assert.ok(sim.projectiles.filter(p => !p.enemy).every(p => p.damage === 12.5));
});
test('movement or dash cancels queued Rapid shots; already-fired projectiles persist', () => {
    for (const dash of [false, true]) {
        const sim = burstFixture(); sim.update(dt, { x: 0, z: 0 });
        const bullet = sim.projectiles[0]; assert.equal(sim.burstShots, 1);
        if (dash) sim.dash(); sim.events = [];
        sim.update(dt, dash ? { x: 0, z: 0 } : { x: 0, z: 1 });
        assert.equal(sim.burstShots, 0); assert.ok(sim.projectiles.includes(bullet));
        assert.equal(sim.events.filter(e => e.type === 'shot' && !e.enemy).length, 0);
    }
});
test('new run clears all acquired upgrades, mutable stats, offers and pending bursts', () => {
    const old = burstFixture(); UPGRADES.forEach(u => applyUpgrade(old.player, u.id));
    const fresh = new Simulation(seededRandom());
    assert.equal(fresh.player.acquired.size, 0); assert.equal(fresh.player.stats.speed, 7.182);
    assert.equal(fresh.player.stats.damage, 10); assert.equal(fresh.player.stats.maxHp, 80);
    assert.equal(fresh.burstShots, 0); assert.deepEqual(fresh.offeredUpgrades, []);
    assert.equal(eligibleUpgrades(fresh.player).length, 17);
});

test('rarity mapping and centralized category weights include the three Legendary upgrades', () => {
    assert.deepEqual(RARITY_WEIGHTS, { COMMON: 60, RARE: 27, EPIC: 10, LEGENDARY: 3 });
    assert.deepEqual(Object.fromEntries(UPGRADES.map(u => [u.id, u.rarity])), {
        power: 'COMMON', overclock: 'COMMON', turbo: 'COMMON', chassis: 'COMMON', repair: 'COMMON',
        piercing: 'RARE', ricochet: 'RARE', rapid: 'RARE', homing: 'EPIC', flame: 'RARE', shield: 'EPIC', trio: 'EPIC', revive: 'LEGENDARY', triple: 'LEGENDARY', shock: 'RARE', frost: 'EPIC', overdrive: 'LEGENDARY',
    });
});
test('category-first weighted draw follows boundaries independently of category size', () => {
    const player = createPlayer();
    for (const [roll, rarity] of [[0, 'COMMON'], [.5999, 'COMMON'], [.6, 'RARE'], [.8699, 'RARE'], [.87, 'EPIC'], [.9699, 'EPIC'], [.97, 'LEGENDARY'], [.9999, 'LEGENDARY']] as const) {
        let call = 0;
        const result = chooseUpgradeOptions(player, () => call++ === 0 ? roll : .1);
        assert.equal(UPGRADES.find(u => u.id === result[0])!.rarity, rarity);
        assert.equal(new Set(result).size, 3);
    }
    const counts = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 }, random = seededRandom(173);
    for (let i = 0; i < 20000; i++) {
        const first = chooseUpgradeOptions(player, random)[0];
        counts[UPGRADES.find(u => u.id === first)!.rarity]++;
    }
    for (const rarity of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const)
        assert.ok(Math.abs(counts[rarity] / 20000 - RARITY_WEIGHTS[rarity] / 100) < .015);
});
test('empty rarity categories renormalize within an offer and after acquiring uniques', () => {
    const p = createPlayer();
    const choices = chooseUpgradeOptions(p, () => .9999);
    assert.deepEqual(choices, ['overdrive', 'triple', 'revive']);
    for (const upgrade of UPGRADES.filter(u => u.unique)) applyUpgrade(p, upgrade.id);
    const commonOnly = chooseUpgradeOptions(p, () => .9999);
    assert.equal(commonOnly.length, 3); assert.equal(new Set(commonOnly).size, 3);
    assert.ok(commonOnly.every(id => UPGRADES.find(u => u.id === id)!.rarity === 'COMMON'));
});
test('Rapid cannot overlap even when stacked Overclock makes cooldown shorter than burst', () => {
    const sim = burstFixture(); sim.player.stats.attackCooldown = .04;
    const frames: number[] = [];
    for (let i = 0; i < 30; i++) {
        sim.events = []; sim.update(dt, { x: 0, z: 0 });
        if (sim.events.some(e => e.type === 'shot' && !e.enemy)) frames.push(i);
        assert.ok(sim.burstShots <= 1);
    }
    for (let i = 0; i + 1 < frames.length; i += 2) assert.equal(frames[i + 1] - frames[i], 6);
});
