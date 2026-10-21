import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnemy } from '../src/enemies/enemies.ts';
import { updateGrenadier } from '../src/enemies/grenadier.ts';
import { updateBurrower } from '../src/enemies/burrower.ts';
import { updateShooter, SHOOTER_LEAD } from '../src/enemies/shooter.ts';
import { isUnderground, type EnemyContext } from '../src/enemies/types.ts';
import { clearArea, emergenceDestination, grenadeDestination, predictPosition } from '../src/enemies/targeting.ts';
import { GRENADE, FLOOR_HAZARD, createGrenade, canThrowGrenade, updateThermalZones, createFloorHazards, updateFloorHazards } from '../src/hazards.ts';
import { Simulation } from '../src/simulation.ts';
import { CONTACT_DAMAGE } from '../src/contact.ts';
import { advanceProjectile, createProjectile } from '../src/projectiles.ts';
import { createWorldObstacles, ROOM_CENTERS, roomBounds } from '../src/layout.ts';
import { distance } from '../src/physics.ts';
import { refreshBurn } from '../src/burn.ts';
import { applyUpgrade } from '../src/upgrades.ts';
import { WAVES } from '../src/waves.ts';
import { seededRandom } from './helpers.ts';
const dt = 1 / 60, zero = { x: 0, z: 0 }, bounds = roomBounds(0);
const context = (extra: Partial<EnemyContext> = {}): EnemyContext => ({ playerVelocity: zero, sector: 3, random: () => .5, thermal: [], ...extra });
function isolated(): Simulation {
    const sim = new Simulation(seededRandom());
    sim.progression.phase = 'combat'; sim.player.x = 0; sim.player.z = 5;
    sim.player.shotCooldown = 100;
    return sim;
}
function steps(sim: Simulation, count: number): void { for (let i = 0; i < count; i++) sim.update(dt, zero); }

test('Grenadier positions, winds up, fixes its target, throws once and recovers', () => {
    const e = createEnemy(1, 'grenadier', zero), p = { x: 8, z: 0 }, ctx = context({ playerVelocity: { x: 0, z: 2 } });
    e.state = 'recovery'; e.timer = 1;
    assert.ok(updateGrenadier(e, { x: 40, z: 0 }, dt, true, ctx, [], bounds).velocity.x > 0);
    assert.ok(updateGrenadier(e, { x: 2, z: 0 }, dt, true, ctx, [], bounds).velocity.x < 0);
    e.state = 'chase';
    updateGrenadier(e, p, dt, true, ctx, [], bounds);
    assert.equal(e.state, 'aim'); assert.equal(e.timer, .55);
    const target = { ...e.destination! }; assert.equal(target.z, .6);
    assert.equal(updateGrenadier(e, { x: -8, z: 5 }, .54, true, ctx, [], bounds).grenade, undefined);
    const intent = updateGrenadier(e, { x: -8, z: 5 }, .02, true, ctx, [], bounds);
    assert.deepEqual(intent.grenade, target); assert.equal(e.state, 'recovery'); assert.equal(e.timer, 3.6);
    assert.equal(updateGrenadier(e, p, 3.59, true, ctx, [], bounds).grenade, undefined);
    updateGrenadier(e, p, .02, true, ctx, [], bounds); assert.equal(e.state, 'chase');
});
test('grenade has 950ms warning, one explosion, seven half-second fire ticks and finite independent life', () => {
    const source = { x: 8, z: 0 }, target = { x: 0, z: 0 };
    let zones = [createGrenade(1, 7, 3, source, target)], explosions = 0;
    const hits: number[] = [], hurt = (d: number) => hits.push(d), explode = () => explosions++;
    source.x = 100; target.z = 100;
    zones = updateThermalZones(zones, .94, zero, hurt, explode);
    assert.deepEqual(hits, []); assert.equal(zones[0].origin.x, 8); assert.equal(zones[0].z, 0);
    zones = updateThermalZones(zones, .01, zero, hurt, explode); assert.deepEqual(hits, [15]);
    zones = updateThermalZones(zones, .49, zero, hurt, explode); assert.deepEqual(hits, [15]);
    zones = updateThermalZones(zones, .01, zero, hurt, explode); assert.deepEqual(hits, [15, 5]);
    zones = updateThermalZones(zones, 3, zero, hurt, explode);
    assert.deepEqual(hits, [15, 5, 5, 5, 5, 5, 5, 5]); assert.equal(explosions, 1); assert.equal(zones.length, 0);
});
test('grenade collision radius matches its warning and fire causes no frame damage', () => {
    for (const d of [1.7, 1.701]) {
        let zones = [createGrenade(1, 1, 3, zero, zero)]; const hits: number[] = [];
        for (let i = 0; i < 267; i++) zones = updateThermalZones(zones, dt, { x: d, z: 0 }, n => hits.push(n), () => {});
        assert.equal(hits.length, d === 1.7 ? 8 : 0);
    }
});
test('grenade limits cover flight and fire, revalidate at throw and reserve aggregate threat budget', () => {
    const one = createGrenade(10, 1, 3, zero, { x: -6, z: 0 });
    const two = createGrenade(11, 2, 3, zero, { x: -6, z: 5 });
    assert.equal(canThrowGrenade(1, [one]), false); assert.equal(canThrowGrenade(3, [one]), true);
    one.exploded = true; assert.equal(canThrowGrenade(1, [one]), false); assert.equal(canThrowGrenade(3, [one, two]), false);
    const e = createEnemy(3, 'grenadier', zero), p = { x: 8, z: 0 };
    updateGrenadier(e, p, dt, true, context(), [], bounds);
    assert.equal(updateGrenadier(e, p, .55, true, context({ thermal: [one, two] }), [], bounds).grenade, undefined);
    e.state = 'chase'; updateGrenadier(e, p, dt, true, context({ grenadeAllowed: false }), [], bounds);
    assert.equal(e.state, 'chase');
});
test('predictions are capped and hazard destinations fit all arena layouts without overlap or player emergence', () => {
    assert.ok(Math.abs(distance(predictPosition(zero, { x: 200, z: 200 }, .3, 1.6), zero) - 1.6) < 1e-9);
    const obstacles = createWorldObstacles(); let count = 0;
    for (let wave = 0; wave < 6; wave++) for (let x = -12; x <= 12; x += 3) for (let z = -8; z <= 8; z += 2) {
        const p = { x: ROOM_CENTERS[wave] + x, z }, b = roomBounds(wave);
        if (!clearArea(p, .5, obstacles, b)) continue;
        const origin = { x: ROOM_CENTERS[wave], z: 6 }, velocity = { x: 6.84, z: 0 };
        const target = emergenceDestination(p, velocity, origin, [], obstacles, b);
        if (target) { count++; assert.ok(clearArea(target, .65, obstacles, b)); assert.ok(distance(p, target) >= 2.2 && distance(p, target) <= 6); }
        const grenade = grenadeDestination(p, velocity, GRENADE.radius, [], obstacles, b);
        if (grenade) {
            assert.ok(clearArea(grenade, GRENADE.radius, obstacles, b));
            const next = grenadeDestination(p, velocity, GRENADE.radius, [grenade], obstacles, b);
            if (next) assert.ok(distance(next, grenade) >= 3.9);
        }
    }
    assert.ok(count > 300);
});
test('Burrower complete cycle has a visible windup, underground travel, full warning and 2s first burrow and 3s active window', () => {
    const e = createEnemy(1, 'burrower', { x: -8, z: 0 }), p = zero;
    const tick = (seconds: number, player = p) => updateBurrower(e, player, [e], seconds, context(), [], bounds);
    tick(1.99); assert.equal(e.state, 'chase'); tick(.02); assert.equal(e.state, 'burrow-windup'); assert.equal(isUnderground(e), false);
    assert.equal(tick(.45).burrow, true); assert.equal(e.state, 'underground'); const target = { ...e.destination! };
    tick(.6); assert.equal(e.state, 'emergence'); assert.equal(distance(e, target), 0);
    tick(.89, target); assert.equal(e.state, 'emergence');
    assert.equal(tick(.02, target).hit, 18); assert.equal(e.state, 'chase'); assert.equal(e.timer, 3);
    assert.equal(tick(.01, target).hit, undefined); tick(2.98); assert.equal(e.state, 'chase');
});
test('Burrower retries visibly when no legal destination exists', () => {
    const e = createEnemy(1, 'burrower', zero); e.state = 'burrow-windup'; e.timer = 0;
    updateBurrower(e, zero, [e], dt, context(), [{ ...zero, halfX: 20, halfZ: 20 }], bounds);
    assert.equal(e.state, 'chase'); assert.equal(isUnderground(e), false); assert.equal(e.destination, undefined);
});
test('underground and emergence exclude autoaim, normal hits, contact and body blocking', () => {
    for (const state of ['underground', 'emergence'] as const) {
        const sim = isolated(), e = createEnemy(1, 'burrower', { ...sim.player });
        e.state = state; e.timer = state === 'underground' ? .6 : .9; e.burrowOrigin = { ...e }; e.destination = { ...e };
        sim.enemies = [e]; sim.player.shotCooldown = 0;
        sim.projectiles = [createProjectile(20, e, e, false, 100, 0, 1, { homing: true, piercing: 1, ricochet: 1 })];
        assert.equal(sim.targets.length, 0);
        const before = sim.player.x; sim.update(dt, { x: 1, z: 0 });
        assert.equal(e.hp, 44); assert.equal(sim.player.hp, 80); assert.ok(sim.player.x > before);
        assert.equal(sim.events.some(event => event.type === 'shot'), false);
    }
});
for (const kind of ['grenadier', 'burrower'] as const) test(`${kind} active is targetable, blocks movement, deals 10 contact and respects i-frames`, () => {
    const sim = isolated(), e = createEnemy(1, kind, { x: .8, z: 5 }); e.state = 'recovery'; e.timer = 100;
    sim.enemies = [e]; assert.equal(sim.targets[0], e); assert.equal(CONTACT_DAMAGE[kind], 10);
    sim.update(dt, { x: 1, z: 0 }); assert.equal(sim.player.hp, 70); assert.ok(sim.player.x < .1);
    steps(sim, 10); assert.equal(sim.player.hp, 70);
});
test('emergence damage is one event with priority over contact, including Shield absorption', () => {
    for (const shield of [false, true]) {
        const sim = isolated(), e = createEnemy(1, 'burrower', { ...sim.player });
        sim.enemies = [e]; e.state = 'emergence'; e.timer = 0;
        if (shield) applyUpgrade(sim.player, 'shield');
        sim.update(dt, zero);
        assert.equal(sim.player.hp, shield ? 80 : 62); assert.equal(e.state, 'chase');
        assert.equal(sim.events.filter(ev => ev.type === 'emerge').length, 1);
        assert.equal(sim.events.filter(ev => ev.type === (shield ? 'shield-break' : 'player-hit')).length, 1);
        steps(sim, 10); assert.equal(sim.player.hp, shield ? 80 : 62);
        if (shield) assert.equal(sim.player.shieldSpent, true);
    }
});
test('an existing Flame burn continues underground; new normal hits cannot refresh it', () => {
    const sim = isolated(), e = createEnemy(1, 'burrower', { x: 4, z: 5 });
    e.state = 'emergence'; e.timer = .9; sim.enemies = [e];
    sim.burns.set(1, refreshBurn(undefined, 10));
    sim.projectiles = [createProjectile(2, e, e, false, 100, 0, 1, { flame: true })];
    steps(sim, 31); assert.equal(e.hp, 42); assert.equal(sim.burns.get(1)?.ticks, 2);
});
test('Shooter direct/lead chances follow sectors and emitted bullets never home', () => {
    assert.deepEqual(SHOOTER_LEAD.chances, [0, 0, .1, .2, .3, .38, 0]);
    for (let sector = 2; sector <= 5; sector++) for (const lead of [false, true]) {
        const e = createEnemy(1, 'shooter', zero), p = { x: 6, z: 0 };
        const ctx = context({ sector, random: () => lead ? 0 : .999, playerVelocity: { x: 0, z: 4 } });
        updateShooter(e, p, dt, true, ctx);
        const intent = updateShooter(e, p, .6, true, ctx);
        assert.equal(intent.fire, true); assert.equal(intent.fireTarget!.x, 6); assert.equal(intent.fireTarget!.z, lead ? 1.12 : 0);
        const shot = createProjectile(3, e, intent.fireTarget!, true, 10, 9, 4);
        const velocity = { ...shot.velocity }; p.z = -10; advanceProjectile(shot, .3);
        assert.deepEqual(shot.velocity, velocity); assert.equal(shot.homing, false);
    }
});
test('two staggered floor hazards exist only in Sector 02, outside geometry and away from entry/reward', () => {
    for (let wave = 0; wave < 7; wave++) assert.equal(createFloorHazards(wave).length, wave === 1 ? 2 : 0);
    const zones = createFloorHazards(1); assert.notEqual(zones[0].timer, zones[1].timer);
    for (const zone of zones) assert.ok(clearArea(zone, FLOOR_HAZARD.radius, createWorldObstacles(), roomBounds(1)));
    assert.ok(distance(zones[0], zones[1]) > FLOOR_HAZARD.radius * 2);
});
test('floor warning lasts 1s, active 1.7s yields three ticks, then cools for 4.2s', () => {
    const zones = createFloorHazards(1), z = zones[0], hits: number[] = [];
    const tick = (n: number, allow = true) => { for (let i = 0; i < n; i++) updateFloorHazards(zones, dt, allow, z, d => hits.push(d)); };
    tick(120); assert.equal(z.state, 'warning'); assert.equal(hits.length, 0);
    tick(59); assert.equal(z.state, 'warning'); tick(1); assert.equal(z.state, 'active');
    tick(102); assert.equal(z.state, 'cooldown'); assert.deepEqual(hits, [6, 6, 6]);
    tick(251); assert.equal(z.state, 'cooldown'); tick(1); assert.equal(z.state, 'warning');
});
test('clear cancels floor warnings, finishes active zones and never restarts a cycle', () => {
    const zones = createFloorHazards(1); zones[0].state = 'warning'; zones[1].state = 'active'; zones[1].timer = .6;
    let hits = 0;
    for (let i = 0; i < 600; i++) updateFloorHazards(zones, dt, false, zones[1], () => hits++);
    assert.ok(zones.every(z => z.state === 'inactive')); assert.equal(hits, 1);
});
for (const source of ['explosion', 'fire', 'floor', 'grenadier', 'burrower'] as const) test(`Shield blocks ${source} once, through the normal damage path`, () => {
    const sim = isolated(); applyUpgrade(sim.player, 'shield');
    if (source === 'grenadier' || source === 'burrower') {
        const e = createEnemy(2, source, { ...sim.player }); e.timer = 100; sim.enemies = [e];
    } else if (source === 'floor') {
        const z = createFloorHazards(1)[0]; Object.assign(z, { x: sim.player.x, z: sim.player.z, state: 'active', timer: 1.7, nextTick: 0 }); sim.floorHazards = [z];
    } else {
        const z = createGrenade(2, 1, 3, zero, sim.player); z.age = source === 'fire' ? 1.45 : .95; z.exploded = source === 'fire'; sim.thermal = [z];
    }
    sim.update(dt, zero); assert.equal(sim.player.hp, 80); assert.equal(sim.player.shieldSpent, true);
    assert.equal(sim.events.filter(e => e.type === 'shield-break').length, 1);
    steps(sim, 10); assert.equal(sim.player.hp, 80);
});
test('last Grenadier death leaves a live grenade and fire; reward pickup protects its exact frame and cards', () => {
    const sim = isolated(), e = createEnemy(1, 'grenadier', { x: 4, z: 5 }); sim.enemies = [e];
    sim.thermal = [createGrenade(3, e.id, 3, e, sim.player)];
    sim.projectiles = [createProjectile(4, e, e, false, 48, 0, 1)];
    sim.update(dt, zero); assert.equal(sim.progression.phase, 'cleared'); assert.ok(sim.reward); assert.equal(sim.offeredUpgrades.length, 0);
    steps(sim, 57); assert.equal(sim.player.hp, 65); assert.equal(sim.thermal.length, 1);
    // A second already-launched grenade lands on the pickup frame.
    sim.player.x = sim.reward!.x; sim.player.z = sim.reward!.z; sim.player.invulnerable = 0;
    const z = createGrenade(5, 10, 3, zero, sim.player); z.age = .95; sim.thermal.push(z);
    const hp = sim.player.hp; sim.update(dt, zero);
    assert.equal(sim.progression.phase, 'upgrade'); assert.equal(sim.player.hp, hp); assert.equal(sim.offeredUpgrades.length, 3);
    steps(sim, 300); assert.equal(sim.thermal.length, 0); assert.equal(sim.player.hp, hp);
    assert.equal(sim.selectUpgrade(sim.offeredUpgrades[0]), true); assert.equal(sim.gates[0].unlocked, true);
});
test('sector progression introduces exactly five types and counts hazards in the seven-threat cap', () => {
    assert.deepEqual([...new Set(WAVES.flat())].sort(), ['basic', 'burrower', 'grenadier', 'runner', 'shooter']);
    for (const wave of [3, 4, 5]) for (const seed of [1, 8, 37]) {
        const sim = new Simulation(seededRandom(seed)); sim.progression.wave = wave;
        sim.player.x = ROOM_CENTERS[wave]; sim.player.z = 7; sim.start();
        let throws = 0;
        for (let i = 0; i < 1800; i++) {
            // Scheduling/load test: survive, suppress auto-fire, kill down to reinforcement threshold later.
            sim.player.invulnerable = 1; sim.player.shotCooldown = 100;
            if (i > 600 && sim.queuedSpawns) sim.enemies.slice(2).forEach(e => sim.projectiles.push(createProjectile(10000 + e.id, e, e, false, 100, 0, 1)));
            sim.update(dt, zero);
            assert.ok(sim.enemies.length + sim.telegraphs.filter(t => !t.spawned).length + sim.thermal.length <= 7);
            assert.ok(sim.thermal.length <= 2);
            for (const z of sim.thermal) assert.equal(sim.thermal.filter(other => other.owner === z.owner).length, 1);
            throws += sim.events.filter(e => e.type === 'grenade-throw').length; sim.events = [];
        }
        assert.ok(throws > 0, `wave ${wave}, seed ${seed}`);
    }
});
test('death stops hazard advancement and a fresh run resets hazards', () => {
    const sim = isolated(); sim.thermal = [createGrenade(1, 2, 3, zero, zero)]; sim.floorHazards = createFloorHazards(1);
    sim.progression.phase = 'dead';
    const snapshot = JSON.stringify([sim.thermal, sim.floorHazards]);
    steps(sim, 120);
    assert.equal(JSON.stringify([sim.thermal, sim.floorHazards]), snapshot);
    const fresh = new Simulation(); assert.deepEqual(fresh.thermal, []); assert.deepEqual(fresh.floorHazards, []);
});
