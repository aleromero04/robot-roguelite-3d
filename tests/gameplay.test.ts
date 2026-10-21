import { roomBounds as pilotBounds } from '../src/layout.ts';
import { avoidEnemyBodies, TestNavigator, bossPilotInput } from './pilot.ts';
import { seededRandom, walkToReward } from './helpers.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAutoAttack, direction, nearestEnemy } from '../src/combat.ts';
import { createEnemy, updateEnemy } from '../src/enemies/enemies.ts';
import { updateBasic } from '../src/enemies/basic.ts';
import { updateRunner } from '../src/enemies/runner.ts';
import { updateShooter } from '../src/enemies/shooter.ts';
import { createGates, createWorldObstacles, ENTRY_X, ROOM_CENTERS, fullyCrossed, gateObstacle, spawnPositions, updateGate, WORLD_BOUNDS } from '../src/layout.ts';
import { beginDash, createPlayer, hurtPlayer, movementInput, updatePlayer } from '../src/player.ts';
import { advanceProjectile, createProjectile } from '../src/projectiles.ts';
import { Simulation, SPAWN_DELAY } from '../src/simulation.ts';
import { ENEMY_STATS, PLAYER_STATS } from '../src/stats.ts';
import { applyUpgrade } from '../src/upgrades.ts';
import { Progression, WAVES, WAVE_GROUPS } from '../src/waves.ts';
import { distance, intersects, segmentBox } from '../src/physics.ts';
const dt = 1 / 60;
function materialize(sim: Simulation): void {
    for (let i = 0; i < 45 && sim.pendingSpawns; i++) sim.update(dt, { x: 0, z: 0 });
    assert.equal(sim.pendingSpawns, 0);
    sim.projectiles = [];
}
const travelDetours = new WeakMap<Simulation, { x: number; z: number }>();
function travelTarget(sim: Simulation): { x: number; z: number } {
    const center = ROOM_CENTERS[sim.progression.wave];
    if (sim.gates[sim.progression.wave].openness < .99) return { x: sim.player.x, z: sim.player.z };
    const target = (sim.player.x < center + 11.8 || Math.abs(sim.player.z) > .3) ? { x: center + 12, z: 0 } : { x: ENTRY_X[sim.progression.wave] + 1, z: 0 };
    const detour = travelDetours.get(sim);
    if (detour && distance(sim.player, detour) > .2) return detour;
    travelDetours.delete(sim);
    const blockers = sim.obstacles.filter(o => segmentBox(sim.player, target, o, .6));
    const blocker = blockers.sort((a,b) => distance(sim.player,a) - distance(sim.player,b))[0];
    if (!blocker) return target;
    const corners = [-1,1].flatMap(sx => [-1,1].map(sz => ({ x: blocker.x + sx * (blocker.halfX + .85), z: blocker.z + sz * (blocker.halfZ + .85) })));
    const next = corners.filter(p => Math.abs(p.z) < 9.6 && Math.abs(p.x - center) < 13.5 && distance(sim.player, p) > .2 && !sim.obstacles.some(o => segmentBox(sim.player,p,o,.5)))
        .sort((a,b) => distance(sim.player,a) + distance(a,target) - distance(sim.player,b) - distance(b,target))[0] ?? target;
    travelDetours.set(sim, next);
    return next;
}
test('autoaim chooses the closest living enemy in XZ, independent of order', () => {
    const enemies = [{ id: 1, x: 3, z: 4, hp: 10 }, { id: 2, x: 0, z: 0, hp: 0 }, { id: 3, x: 2, z: 1, hp: 10 }];
    assert.equal(nearestEnemy({ x: 0, z: 0 }, enemies)?.id, 3);
    assert.equal(nearestEnemy({ x: 0, z: 0 }, []), undefined);
});
test('moving, cooldown, selection and missing target all inhibit automatic fire', () => {
    assert.equal(canAutoAttack(true, 0, true, true), false);
    assert.equal(canAutoAttack(false, .1, true, true), false);
    assert.equal(canAutoAttack(false, 0, false, true), false);
    assert.equal(canAutoAttack(false, 0, true, false), false);
    assert.equal(canAutoAttack(false, 0, true, true), true);
});
test('diagonal motion has the same speed as cardinal movement', () => {
    assert.ok(Math.abs(Math.hypot(...Object.values(movementInput(1, 1))) - 1) < 1e-9);
    assert.ok(Math.abs(Math.hypot(...Object.values(movementInput(1, 0))) - 1) < 1e-9);
});
test('movement intent against cover prevents fire, and dash also counts as motion', () => {
    const player = createPlayer();
    player.x = -1.48;
    player.z = 0;
    updatePlayer(player, { x: 1, z: 0 }, dt, [{ x: 0, z: 0, halfX: 1, halfZ: 1 }], WORLD_BOUNDS);
    assert.equal(player.moving, true);
    assert.equal(player.walking, false);
    assert.equal(beginDash(player), true);
    assert.equal(beginDash(player), false);
    updatePlayer(player, { x: 0, z: 0 }, dt, [], WORLD_BOUNDS);
    assert.equal(player.moving, true);
});
test('simulation stops shooting immediately on movement and resumes when stationary', () => {
    const sim = new Simulation(seededRandom());
    sim.start();
    materialize(sim);
    sim.player.shotCooldown = 0;
    sim.update(dt, { x: 1, z: 0 });
    assert.equal(sim.projectiles.filter(p => !p.enemy).length, 0);
    sim.update(dt, { x: 0, z: 0 });
    assert.equal(sim.projectiles.filter(p => !p.enemy).length, 1);
    sim.events = [];
    for (let i = 0; i < 60; i++)
        sim.update(dt, { x: 0, z: 1 });
    assert.equal(sim.events.filter(e => e.type === 'shot' && !e.enemy).length, 0);
});
test('Basic windup is an actual attack event, can miss, then recovers without contact damage', () => {
    const e = createEnemy(1, 'basic', { x: 0, z: 0 });
    assert.equal(updateBasic(e, { x: 1, z: 0 }, dt, true).hit, undefined);
    assert.equal(e.state, 'windup');
    assert.equal(updateBasic(e, { x: 3, z: 0 }, ENEMY_STATS.basic.windup, true).hit, undefined);
    assert.equal(e.state, 'recovery');
    assert.equal(updateBasic(e, { x: 0, z: 0 }, .1, true).hit, undefined);
    updateBasic(e, { x: 1, z: 0 }, 1, true);
    updateBasic(e, { x: 1, z: 0 }, dt, true);
    assert.equal(updateBasic(e, { x: 1, z: 0 }, ENEMY_STATS.basic.windup, true).hit, 15);
    assert.equal(updateBasic(e, { x: 1, z: 0 }, dt, true).hit, undefined);
});
test('Basic cannot strike through cover', () => {
    const e = createEnemy(1, 'basic', { x: 0, z: 0 });
    e.state = 'windup';
    e.timer = 0;
    assert.equal(updateBasic(e, { x: 1, z: 0 }, dt, false).hit, undefined);
});
test('Runner advertises and holds one direction despite player movement, then recovers', () => {
    const e = createEnemy(1, 'runner', { x: 0, z: 0 });
    updateRunner(e, { x: 6, z: 0 }, dt, true);
    assert.equal(e.state, 'windup');
    assert.deepEqual(e.dir, { x: 1, z: 0 });
    updateRunner(e, { x: 0, z: 6 }, .75, true);
    assert.equal(e.state, 'dash');
    const intent = updateRunner(e, { x: -6, z: 0 }, .1, true);
    assert.deepEqual(intent.velocity, { x: ENEMY_STATS.runner.dashSpeed, z: 0 });
    assert.deepEqual(e.dir, { x: 1, z: 0 });
    updateRunner(e, { x: 0, z: 6 }, .6, true);
    assert.equal(e.state, 'recovery');
});
test('Runner dash may hit only once and cannot pass through a barrier', () => {
    const e = createEnemy(1, 'runner', { x: 0, z: 0 });
    e.state = 'dash';
    e.timer = .55;
    e.dir = { x: 1, z: 0 };
    const player = { x: .8, z: 0 };
    assert.equal(updateEnemy(e, player, [e], [], WORLD_BOUNDS, dt).hit, 20);
    assert.equal(updateEnemy(e, player, [e], [], WORLD_BOUNDS, dt).hit, undefined);
    const wall = { x: 2, z: 0, halfX: .2, halfZ: 3 };
    for (let i = 0; i < 25; i++)
        updateEnemy(e, { x: 10, z: 0 }, [e], [wall], WORLD_BOUNDS, dt);
    assert.ok(e.x <= 1.3 + 1e-9);
    assert.ok(!intersects(e, .5, wall));
});
test('Shooter approaches, retreats, aims and emits a single fire event before recovery', () => {
    const e = createEnemy(1, 'shooter', { x: 0, z: 0 });
    assert.ok(updateShooter(e, { x: 12, z: 0 }, dt, true).velocity.x > 0);
    assert.ok(updateShooter(e, { x: 2, z: 0 }, dt, true).velocity.x < 0);
    assert.equal(updateShooter(e, { x: 6, z: 0 }, dt, true).fire, undefined);
    assert.equal(e.state, 'aim');
    assert.equal(updateShooter(e, { x: 6, z: 0 }, .6, true).fire, true);
    assert.equal(e.state, 'recovery');
    assert.equal(updateShooter(e, { x: 6, z: 0 }, .1, true).fire, undefined);
});
test('projectile direction and lifetime do not depend on a shooter or target after launch', () => {
    const shooter = { x: 0, z: 0 }, target = { x: 10, z: 0 };
    const shot = createProjectile(1, shooter, target, true, 10, 9, 4);
    shooter.x = 100;
    target.z = 100;
    advanceProjectile(shot, .5);
    assert.equal(shot.x, 4.5);
    assert.equal(shot.z, 0);
    assert.equal(shot.life, 3.5);
    assert.equal('owner' in shot, false);
});
test('invulnerability blocks stacked hits for 850 ms and selection never receives damage', () => {
    const p = createPlayer();
    assert.equal(hurtPlayer(p, 10, true), true);
    assert.equal(p.hp, 70);
    assert.equal(hurtPlayer(p, 10, true), false);
    updatePlayer(p, { x: 0, z: 0 }, .84, [], WORLD_BOUNDS);
    assert.equal(hurtPlayer(p, 10, true), false);
    updatePlayer(p, { x: 0, z: 0 }, .02, [], WORLD_BOUNDS);
    assert.equal(hurtPlayer(p, 10, false), false);
    assert.equal(hurtPlayer(p, 10, true), true);
    assert.equal(p.hp, 60);
});
test('upgrade values stack multiplicatively, repair caps at max HP', () => {
    const p = createPlayer();
    applyUpgrade(p, 'power');
    applyUpgrade(p, 'power');
    assert.equal(p.stats.damage, 15.625);
    applyUpgrade(p, 'overclock');
    assert.ok(Math.abs(p.stats.attackCooldown - .2975) < 1e-9);
    p.hp = 70;
    applyUpgrade(p, 'repair');
    assert.equal(p.hp, 80);
    p.hp = 20;
    applyUpgrade(p, 'repair');
    assert.equal(p.hp, 50);
});
test('progression requires clear, one upgrade, then physical crossing; six normal waves then a boss', () => {
    const run = new Progression();
    assert.equal(run.finishCombat(0), false);
    assert.equal(run.crossExit(), false);
    assert.equal(run.start(), true);
    assert.equal(run.finishCombat(1), false);
    assert.equal(run.finishCombat(0), true);
    assert.equal(run.crossExit(), false);
    assert.equal(run.phase, 'cleared');
    assert.equal(run.chooseUpgrade(), false);
    assert.equal(run.collectReward(), true);
    assert.equal(run.chooseUpgrade(), true);
    assert.equal(run.chooseUpgrade(), false);
    assert.equal(run.crossExit(), true);
    assert.equal(run.wave, 1);
    assert.equal(run.phase, 'combat');
    for (let i = 0; i < 5; i++) {
        run.finishCombat(0);
        run.collectReward();
        run.chooseUpgrade();
        run.crossExit();
    }
    assert.equal(run.phase, 'combat');
    assert.equal(run.wave, 6);
    assert.equal(run.finishCombat(0), false);
    assert.equal(run.finishBoss(), true);
    assert.equal(run.phase, 'ending');
    assert.equal(run.crossExit(), false);
    assert.deepEqual(WAVES.map(w => w.length), [3, 4, 6, 6, 8, 10]);
});
test('every wave spawn is clear of player, obstacles and other hitboxes', () => {
    const obstacles = createWorldObstacles();
    for (let wave = 0; wave < WAVES.length; wave++) {
        const player = { x: wave === 0 ? 0 : ENTRY_X[wave - 1] + .5, z: wave === 0 ? 3.7 : 0 };
        const points = spawnPositions(wave, WAVE_GROUPS[wave][0].length, player, obstacles);
        assert.equal(points.length, WAVE_GROUPS[wave][0].length);
        points.forEach((p, i) => {
            assert.ok(distance(p, player) >= 6);
            assert.ok(!obstacles.some(o => intersects(p, .65, o)));
            points.slice(i + 1).forEach(q => assert.ok(distance(p, q) >= 2));
        });
    }
});
test('gate stays collidable until visually open; crossing checks the entire player body', () => {
    const gate = createGates()[0];
    assert.ok(gateObstacle(gate));
    gate.unlocked = true;
    updateGate(gate, .3);
    assert.ok(gateObstacle(gate));
    updateGate(gate, .5);
    assert.equal(gateObstacle(gate), undefined);
    assert.equal(fullyCrossed({ x: ENTRY_X[0] + .2, z: 0 }, .48, 0), false);
    assert.equal(fullyCrossed({ x: ENTRY_X[0] + .5, z: 4 }, .48, 0), true);
});
function clearWave(sim: Simulation): void {
    for (let tick = 0; tick < 600 && sim.progression.phase === 'combat'; tick++) {
        sim.enemies.forEach(e => {
            sim.projectiles.push(createProjectile(10000 + e.id, e, e, false, e.hp, 0, 1));
        });
        sim.update(dt, { x: 0, z: 0 });
    }
    assert.equal(sim.progression.phase, 'cleared');
    assert.equal(sim.enemies.length, 0);
}
test('last-shooter death preserves residual threat, including an impact in the kill frame', () => {
    const sim = new Simulation(seededRandom()); sim.start(); materialize(sim);
    sim.enemies = [createEnemy(500, 'shooter', { x: 3, z: 3.7 })]; sim.enemies[0].hp = 1;
    const surviving = createProjectile(602, { x: 10, z: 0 }, { x: 0, z: 0 }, true, 10, 9, 4);
    sim.projectiles = [createProjectile(600, sim.enemies[0], sim.enemies[0], false, 1, 0, 1),
        createProjectile(601, { x: .1, z: 3.7 }, sim.player, true, 10, 9, 4), surviving];
    const hp = sim.player.hp; sim.update(dt, { x: 0, z: 0 });
    assert.equal(sim.progression.phase, 'cleared'); assert.equal(sim.player.hp, hp - 10);
    assert.ok(sim.reward); assert.deepEqual(sim.offeredUpgrades, []); assert.ok(sim.projectiles.includes(surviving));
    const x = sim.player.x, bx = surviving.x;
    sim.update(dt, { x: 1, z: 0 }); assert.ok(sim.player.x > x); assert.ok(surviving.x < bx);
});
test('all seven sections are reachable by continuous movement, with no teleports or early doors', () => {
    const sim = new Simulation(seededRandom());
    sim.start();
    materialize(sim);
    let maxStep = 0;
    for (let wave = 0; wave < WAVES.length; wave++) {
        assert.equal(sim.progression.wave, wave);
        assert.equal(sim.enemies.length + sim.pendingSpawns, WAVES[wave].length);
        clearWave(sim);
        maxStep = Math.max(maxStep, walkToReward(sim));
        assert.equal(sim.gates[wave].unlocked, false);
        assert.ok(sim.selectUpgrade(sim.offeredUpgrades.includes('power') ? 'power' : sim.offeredUpgrades[0]));
        for (let tick = 0; tick < 1200 && sim.progression.phase === 'travel'; tick++) {
            const previous = { x: sim.player.x, z: sim.player.z };
            const center = ROOM_CENTERS[wave];
            const bypass = wave % 3 === 2 && sim.player.x < center + 3.5;
            const waypoint = bypass
                ? (Math.abs(sim.player.z - 3.5) > .12 ? { x: sim.player.x, z: 3.5 } : { x: center + 3.6, z: 3.5 })
                : (Math.abs(sim.player.z) > .12 ? { x: sim.player.x, z: 0 } : { x: ENTRY_X[wave] + 1, z: 0 });
            sim.update(dt, direction(sim.player, waypoint));
            maxStep = Math.max(maxStep, distance(previous, sim.player));
            sim.events = [];
        }
        assert.equal(sim.gates[wave].sealed, true, JSON.stringify({wave,player:sim.player}));
        assert.equal(sim.progression.phase, 'combat');
    }
    assert.equal(sim.kills, WAVES.flat().length);
    assert.ok(maxStep <= sim.player.stats.speed * dt + 1e-8);
    assert.ok(sim.player.x > ENTRY_X[5] + .48);
});
test('closed door blocks progression, and movement is not changed by the door state', () => {
    const sim = new Simulation(seededRandom());
    sim.start();
    materialize(sim);
    clearWave(sim);
    walkToReward(sim);
    sim.player.x = 17;
    sim.player.z = 0;
    const p = { x: sim.player.x, z: sim.player.z };
    sim.update(dt, { x: 1, z: 0 });
    assert.equal(sim.player.x, p.x);
    sim.selectUpgrade(sim.offeredUpgrades[0]);
    for (let i = 0; i < 5; i++)
        sim.update(dt, { x: 1, z: 0 });
    assert.ok(sim.player.x <= 17.27);
    assert.equal(sim.progression.wave, 0);
});

test('separation resolves coincident enemies without unbounded displacement', () => {
    const enemies = [createEnemy(1, 'basic', {x:0,z:0}), createEnemy(2, 'basic', {x:0,z:0})];
    for (let frame=0;frame<120;frame++) {
        const snapshot=enemies.map(e=>({...e}));
        for (const enemy of enemies) {
            const previous={x:enemy.x,z:enemy.z};
            updateEnemy(enemy,{x:13,z:0},snapshot,[],WORLD_BOUNDS,dt);
            assert.ok(distance(previous,enemy)<=(ENEMY_STATS.basic.speed+1)*dt+1e-8);
        }
    }
    assert.ok(distance(enemies[0],enemies[1])>1);
});
test('a fresh run restores health, stats, wave and closed gates', () => {
    const oldRun=new Simulation(seededRandom());oldRun.start();applyUpgrade(oldRun.player,'power');oldRun.player.hp=0;oldRun.progression.phase='dead';
    const fresh=new Simulation(seededRandom());fresh.start();
    assert.equal(fresh.player.hp,80);assert.equal(fresh.player.stats.damage,10);assert.equal(fresh.player.stats.attackCooldown,.35);
    assert.equal(fresh.kills,0);assert.equal(fresh.elapsed,0);assert.equal(fresh.progression.wave,0);
    assert.ok(fresh.gates.every(g=>!g.unlocked && !g.sealed && g.openness===0));assert.equal(fresh.enemies.length,0);assert.equal(fresh.pendingSpawns,3);
    assert.ok(fresh.telegraphs.every(t => t.age < SPAWN_DELAY));
});

test('a complete run is winnable with real movement, attacks, damage and upgrades', t => {
    const sim = new Simulation(seededRandom());
    sim.start();
    materialize(sim);
    const navigator = new TestNavigator();
    const selectedUpgrades: string[] = []; let bossStart = 0;
    let upgrades = 0, waypointIndex = 0, previousWave = -1, moveUntil = 0;
    let combatMoved = false, combatStopped = false;
    for (let frame = 0; frame < 60 * 360; frame++) {
        const run = sim.progression;
        if (run.phase === 'complete' || run.phase === 'dead') break;
        if (run.phase === 'upgrade') {
            const priority = sim.player.hp < 50 ? ['repair', 'chassis', 'revive', 'shield', 'triple', 'rapid', 'trio', 'shock', 'frost', 'overdrive', 'flame', 'power', 'ricochet', 'piercing', 'overclock', 'homing', 'turbo'] : ['triple', 'rapid', 'shock', 'flame', 'overdrive', 'frost', 'trio', 'shield', 'revive', 'power', 'ricochet', 'piercing', 'overclock', 'chassis', 'homing', 'turbo', 'repair'];
            const chosen = priority.find(id => sim.offeredUpgrades.includes(id as typeof sim.offeredUpgrades[number]))!;
            assert.ok(sim.selectUpgrade(chosen as typeof sim.offeredUpgrades[number]));
            upgrades++; selectedUpgrades.push(chosen);
        }
        let input = {x:0,z:0};
        if (run.phase === 'combat' && sim.boss) {
            if (!bossStart) bossStart = sim.elapsed;
            input = bossPilotInput(sim);
        } else if (run.phase === 'combat') {
            const center = ROOM_CENTERS[run.wave];
            if (previousWave !== run.wave) {
                previousWave = run.wave;
                waypointIndex = 0;
            }
            const waypoints = [
                { x: run.wave === 0 ? 0 : center - 12.5, z: 8.7 },
                { x: center + 12, z: 8.7 }, { x: center + 12, z: -8.7 },
                { x: center - 12.5, z: -8.7 }, { x: center - 12.5, z: 8.7 },
            ];
            if (distance(sim.player, waypoints[waypointIndex]) < .2) waypointIndex = waypointIndex % 4 + 1;
            const target = nearestEnemy(sim.player, sim.enemies);
            const danger = sim.enemies.some(e => distance(sim.player, e) < 4.5 || (e.kind === 'runner' && e.state === 'windup'));
            const blocked = target && sim.obstacles.some(o => segmentBox(sim.player, target, o, .1));
            if (danger || blocked) moveUntil = frame + 45;
            if (frame < moveUntil) {
                input = avoidEnemyBodies(sim, navigator.toward(sim.player, waypoints[waypointIndex], sim.obstacles, pilotBounds(run.wave)));
                combatMoved = true;
            } else combatStopped = true;
        } else if (run.phase === 'cleared' && sim.reward) {
            input = navigator.toward(sim.player, sim.reward, sim.obstacles, pilotBounds(run.wave));
        } else if (run.phase === 'travel') {
            const waypoint = travelTarget(sim);
            input = distance(sim.player, waypoint) < .01 ? { x: 0, z: 0 } : direction(sim.player,waypoint);
        }
        sim.update(dt,input);
        sim.events = [];
    }
    t.diagnostic(JSON.stringify({ upgrades: selectedUpgrades, seconds: Number(sim.elapsed.toFixed(2)), bossSeconds: Number((sim.elapsed - bossStart).toFixed(2)), hp: sim.player.hp }));
    assert.ok(combatMoved && combatStopped);
    assert.equal(sim.progression.phase,'complete', JSON.stringify({wave:sim.progression.wave,hp:sim.player.hp,kills:sim.kills,player:sim.player, enemies:sim.enemies}));
    assert.equal(sim.kills,WAVES.flat().length + 1);
    assert.equal(upgrades,6);
    assert.ok(sim.player.hp > 0);
    assert.equal(sim.player.moving,false);
    assert.equal(sim.player.walking,false);
});
