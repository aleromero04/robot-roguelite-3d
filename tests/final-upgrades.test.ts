import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.ts';
import { createPlayer, resolvePlayerHit, updatePlayer, updatePlayerFeedback, DAMAGE_FEEDBACK } from '../src/player.ts';
import { applyUpgrade, eligibleUpgrades, UPGRADES } from '../src/upgrades.ts';
import { createEnemy } from '../src/enemies/enemies.ts';
import { createBoss } from '../src/boss.ts';
import { createProjectile } from '../src/projectiles.ts';
import { refreshBurn, tickBurns } from '../src/burn.ts';
import { WORLD_BOUNDS } from '../src/layout.ts';
const dt = 1 / 60, still = { x: 0, z: 0 };
function shotFixture() {
    const sim = new Simulation(); sim.progression.phase = 'combat'; sim.player.shotCooldown = 0;
    const enemy = createEnemy(800, 'shooter', { x: 10, z: 3.7 }); enemy.hp = 1000; enemy.state = 'recovery'; enemy.timer = 100;
    sim.enemies = [enemy]; return sim;
}
test('Power Trio independently multiplies all three stats and stacks with common upgrades', () => {
    const a = createPlayer(), b = createPlayer();
    for (const id of ['power', 'turbo', 'overclock', 'trio'] as const) applyUpgrade(a, id);
    for (const id of ['trio', 'overclock', 'turbo', 'power'] as const) applyUpgrade(b, id);
    assert.ok(Math.abs(a.stats.damage - 15) < 1e-9); assert.ok(Math.abs(a.stats.speed - 7.182 * 1.1 * 1.1) < 1e-9);
    assert.ok(Math.abs(a.stats.attackCooldown - .35 * .85 * .9) < 1e-9);
    for (const key of ['damage', 'speed', 'attackCooldown'] as const) assert.ok(Math.abs(a.stats[key] - b.stats[key]) < 1e-9);
    assert.equal(applyUpgrade(a, 'trio'), false);
    const p = createPlayer(); applyUpgrade(p, 'trio'); assert.deepEqual([...p.acquired], ['trio']);
});
test('Triple creates three simultaneous projectiles at -10/0/+10 degrees with ordinary damage', () => {
    const sim = shotFixture(); applyUpgrade(sim.player, 'triple'); sim.update(dt, still);
    assert.equal(sim.projectiles.length, 3); assert.equal(sim.events.filter(e => e.type === 'shot' && !e.enemy).length, 1);
    const angles = sim.projectiles.map(p => Math.atan2(p.velocity.z, p.velocity.x));
    assert.ok(Math.abs(angles[1] - angles[0] - Math.PI / 18) < 1e-9); assert.ok(Math.abs(angles[2] - angles[1] - Math.PI / 18) < 1e-9);
    assert.ok(sim.projectiles.every(p => p.damage === 10));
});
test('Rapid + Triple gives 3 + 3 at 100 ms; movement or dash cancels the entire second event', () => {
    for (const cancel of ['none', 'move', 'dash']) {
        const sim = shotFixture(); applyUpgrade(sim.player, 'rapid'); applyUpgrade(sim.player, 'triple');
        sim.update(dt, still); assert.equal(sim.projectiles.length, 3);
        const first = [...sim.projectiles], positions = first.map(p => ({ x: p.x, z: p.z }));
        if (cancel === 'dash') sim.dash();
        for (let i = 0; i < 5; i++) sim.update(dt, cancel === 'move' ? { x: 0, z: 1 } : still);
        assert.equal(sim.projectiles.length, 3);
        sim.update(dt, cancel === 'move' ? { x: 0, z: 1 } : still);
        assert.equal(sim.projectiles.length, cancel === 'none' ? 6 : 3);
        assert.ok(first.every((p, i) => sim.projectiles.includes(p) && Math.hypot(p.x - positions[i].x, p.z - positions[i].z) > 0));
    }
});
test('all Triple projectiles inherit Piercing, Ricochet, Homing and Flame without sharing budgets', () => {
    const sim = shotFixture();
    for (const id of ['triple', 'piercing', 'ricochet', 'homing', 'flame'] as const) applyUpgrade(sim.player, id);
    sim.update(dt, still); assert.equal(sim.projectiles.length, 3);
    for (const shot of sim.projectiles) { assert.equal(shot.pierces, 1); assert.equal(shot.bounces, 1); assert.ok(shot.homing && shot.flame); }
    sim.projectiles[0].hitIds.add(123); sim.projectiles[0].pierces--;
    assert.equal(sim.projectiles[1].hitIds.size, 0); assert.equal(sim.projectiles[1].pierces, 1);
    assert.equal(createProjectile(1, still, { x: 1, z: 0 }, true, 10, 9, 4, { flame: true }).flame, false);
});
test('Flame produces three 20-percent ticks spaced 500 ms apart and expires', () => {
    const burns = new Map([[1, refreshBurn(undefined, 12.5)]]), damage: number[] = [];
    tickBurns(burns, .49, () => true, (_, d) => damage.push(d)); assert.deepEqual(damage, []);
    tickBurns(burns, .01, () => true, (_, d) => damage.push(d)); assert.deepEqual(damage, [2.5]);
    tickBurns(burns, 1, () => true, (_, d) => damage.push(d)); assert.deepEqual(damage, [2.5, 2.5, 2.5]);
    assert.equal(burns.size, 0);
});
test('Flame refreshes one burn without stacking or starving ticks under rapid impacts', () => {
    const burns = new Map([[1, refreshBurn(undefined, 10)]]); let damage = 0;
    tickBurns(burns, .3, () => true, (_, d) => damage += d);
    burns.set(1, refreshBurn(burns.get(1), 20)); assert.equal(burns.size, 1); assert.equal(burns.get(1)!.ticks, 3);
    tickBurns(burns, .2, () => true, (_, d) => damage += d); assert.equal(damage, 4);
    for (let i = 0; i < 120; i++) { burns.set(1, refreshBurn(burns.get(1), 20)); tickBurns(burns, dt, () => true, (_, d) => damage += d); }
    assert.equal(damage, 20); assert.equal(burns.size, 1);
    tickBurns(burns, 2, () => true, (_, d) => damage += d); assert.equal(burns.size, 0);
});
test('Flame is applied through real projectile impacts and can kill normal enemies and Boss', () => {
    for (const boss of [false, true]) {
        const sim = shotFixture();
        if (boss) { sim.enemies = []; sim.progression.wave = 6; sim.player.x = 204; sim.player.z = 0; sim.boss = createBoss(800, { x: 216, z: 0 }); sim.boss.state = 'recovery'; sim.boss.timer = 100; }
        const target = sim.targets[0]; target.hp = 11;
        sim.player.shotCooldown = 100;
        sim.projectiles.push(createProjectile(900, target, target, false, 10, 0, 1, { flame: true }));
        sim.update(dt, still); assert.equal(target.hp, 1); assert.ok(sim.burns.has(target.id));
        for (let i = 0; i < 30; i++) sim.update(dt, still);
        assert.equal(target.hp, 0); assert.equal(sim.burns.size, 0);
        assert.equal(sim.progression.phase, boss ? 'ending' : 'cleared');
        assert.equal(sim.kills, 1); assert.equal(!!sim.reward, !boss);
    }
});
test('Shield blocks one eligible hit, grants normal i-frames and remains spent after waiting', () => {
    const p = createPlayer(); applyUpgrade(p, 'shield');
    assert.equal(resolvePlayerHit(p, 20, false), 'ignored'); assert.equal(p.shieldSpent, false);
    p.invulnerable = .2; assert.equal(resolvePlayerHit(p, 20, true), 'ignored'); assert.equal(p.shieldSpent, false);
    p.invulnerable = 0; assert.equal(resolvePlayerHit(p, 20, true, true), 'shield');
    assert.equal(p.hp, 80); assert.equal(p.shieldSpent, true); assert.equal(p.invulnerable, .85);
    assert.equal(resolvePlayerHit(p, 20, true), 'ignored'); assert.equal(p.damageFlash, 0);
    updatePlayer(p, still, 1, [], WORLD_BOUNDS); assert.equal(resolvePlayerHit(p, 10, true), 'damage'); assert.equal(p.hp, 70);
    updatePlayer(p, still, 180, [], WORLD_BOUNDS); assert.equal(p.shieldSpent, true);
    assert.equal(resolvePlayerHit(p, 20, true), 'damage'); assert.equal(p.hp, 50);
});
test('Shield covers melee, normal projectile, contact, Boss projectile and Charge through one resolver', () => {
    for (const source of ['basic', 'runner', 'shooter-contact', 'projectile', 'boss-projectile', 'boss-contact', 'boss-charge']) {
        const sim = new Simulation(); sim.progression.phase = 'combat'; sim.player.shotCooldown = 100; applyUpgrade(sim.player, 'shield');
        if (source.startsWith('boss')) {
            sim.progression.wave = 6; sim.player.x = 216; sim.player.z = 3;
            sim.boss = createBoss(1, { x: 214.4, z: 3 }); sim.boss.state = source === 'boss-charge' ? 'charge' : 'recovery';
            sim.boss.timer = 100; sim.boss.dir = { x: 1, z: 0 };
            if (source === 'boss-projectile') sim.boss.x = 208;
        } else if (source === 'basic' || source === 'runner' || source === 'shooter-contact') {
            const enemy = createEnemy(1, source === 'shooter-contact' ? 'shooter' : source, { x: .8, z: 3.7 });
            enemy.state = source === 'basic' ? 'windup' : source === 'runner' ? 'dash' : 'recovery';
            enemy.timer = source === 'basic' ? .001 : 1; enemy.dir = { x: -1, z: 0 }; sim.enemies = [enemy];
        }
        if (source === 'projectile' || source === 'boss-projectile') sim.projectiles = [createProjectile(500, sim.player, sim.player, true, source === 'projectile' ? 10 : 12, 0, 1)];
        sim.update(dt, still); assert.equal(sim.player.hp, 80, source);
        assert.equal(sim.events.filter(e => e.type === 'shield-break').length, 1, source);
        assert.equal(sim.events.filter(e => e.type === 'player-hit').length, 0, source);
    }
});
test('Revive consumes once, restores 40 percent of current max HP, and stays excluded after consumption', () => {
    const sim = shotFixture(); sim.enemies = []; applyUpgrade(sim.player, 'chassis'); applyUpgrade(sim.player, 'revive'); sim.player.hp = 1;
    sim.projectiles = [createProjectile(900, sim.player, sim.player, true, 20, 0, 1), createProjectile(901, sim.player, sim.player, true, 20, 0, 1)];
    sim.update(dt, still); assert.equal(sim.player.hp, 40); assert.equal(sim.player.invulnerable, 2);
    assert.ok(sim.player.reviveUsed); assert.equal(sim.progression.phase, 'combat'); assert.ok(!eligibleUpgrades(sim.player).includes('revive'));
    assert.equal(sim.events.filter(e => e.type === 'revive').length, 1);
    sim.player.invulnerable = 0; sim.projectiles = [createProjectile(902, sim.player, sim.player, true, 100, 0, 1)];
    sim.update(dt, still); assert.equal(sim.progression.phase, 'dead'); assert.equal(sim.player.hp, 0);
});
test('Shield takes precedence over lethal damage; blocked hits do not consume Revive', () => {
    const p = createPlayer(); applyUpgrade(p, 'shield'); applyUpgrade(p, 'revive'); p.hp = 1;
    assert.equal(resolvePlayerHit(p, 100, true), 'shield'); assert.equal(p.hp, 1); assert.equal(p.reviveUsed, false);
    p.invulnerable = 0; assert.equal(resolvePlayerHit(p, 100, true), 'revive'); assert.equal(p.hp, 32);
});
test('damage feedback lasts independently of i-frames; invalid hits do not retrigger it', () => {
    const p = createPlayer(); resolvePlayerHit(p, 12, true);
    assert.equal(p.damageFlash, .15); assert.equal(p.damageScreen, .26); assert.equal(p.damageHud, .3); assert.equal(p.damageShake, .12);
    updatePlayerFeedback(p, .16); assert.equal(p.damageFlash, 0); assert.equal(p.damageShake, 0); assert.ok(p.damageScreen > 0);
    const screen = p.damageScreen; assert.equal(resolvePlayerHit(p, 12, true), 'ignored'); assert.equal(p.damageScreen, screen);
    assert.equal(p.invulnerable, .85); updatePlayerFeedback(p, .2); assert.equal(p.damageScreen, 0); assert.equal(p.damageHud, 0);
    p.invulnerable = 0; resolvePlayerHit(p, 20, true, true); assert.equal(p.damageStrength, DAMAGE_FEEDBACK.chargeStrength);
    const sim = new Simulation(); sim.progression.phase = 'dead'; sim.player.damageScreen = .26; sim.update(.3, still); assert.equal(sim.player.damageScreen, 0);
});
test('fresh runs reset all defensive, burn, reward, burst and feedback states and restore every unique', () => {
    const old = shotFixture(); UPGRADES.forEach(u => applyUpgrade(old.player, u.id));
    resolvePlayerHit(old.player, 1000, true); old.player.invulnerable = 0; resolvePlayerHit(old.player, 1000, true);
    old.burns.set(800, refreshBurn(undefined, 12)); old.reward = { x: 0, z: 0 }; old.burstShots = 1;
    const fresh = new Simulation(); assert.equal(eligibleUpgrades(fresh.player).length, 17);
    assert.equal(fresh.player.reviveUsed, false); assert.equal(fresh.player.shieldSpent, false); assert.equal(fresh.player.revivePulse, 0);
    assert.equal(fresh.player.damageFlash, 0); assert.equal(fresh.burns.size, 0); assert.equal(fresh.reward, undefined);
    assert.equal(fresh.boss, undefined); assert.equal(fresh.burstShots, 0); assert.equal(fresh.player.hp, 80);
});
