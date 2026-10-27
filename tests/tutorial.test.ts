import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialController, TUTORIAL_KEY, TUTORIAL_TIMINGS, type TutorialStorage } from '../src/tutorial.ts';
import { Simulation } from '../src/simulation.ts';
import { createProjectile } from '../src/projectiles.ts';
import { TestNavigator } from './pilot.ts';
import { roomBounds } from '../src/layout.ts';
import { seededRandom } from './helpers.ts';

function fixture(initial?: string, supplied?: TutorialStorage) {
    const values = new Map<string, string>(initial ? [[TUTORIAL_KEY, initial]] : []);
    const storage = supplied ?? { getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
    const tutorial = new TutorialController(storage);
    let sim = new Simulation(seededRandom());
    const start = () => { sim = new Simulation(seededRandom()); sim.start(); sim.player.invulnerable = 999; tutorial.start(sim); };
    start();
    const tick = (input = { x: 0, z: 0 }, paused = false) => {
        if (!paused) sim.update(1 / 60, input);
        tutorial.update(sim, input, 1 / 60, paused);
        if (!paused) sim.events.length = 0;
    };
    const wait = (frames = 40) => { for (let i = 0; i < frames; i++) tick(); };
    const move = () => { for (let i = 0; i < 8; i++) tick({ x: 1, z: 0 }); };
    const attack = () => { for (let i = 0; i < 600 && tutorial.step !== 'dash' && tutorial.step !== 'waitingForReward'; i++) tick(); };
    const dash = () => { wait(50); sim.dash(); tick(); wait(60); };
    const clear = () => {
        let id = 10000;
        for (let i = 0; i < 2400 && sim.progression.phase === 'combat'; i++) {
            for (const e of sim.enemies) sim.projectiles.push(createProjectile(id++, e, e, false, 999, 0, 1));
            tick();
        }
        assert.equal(sim.progression.phase, 'cleared'); assert.ok(sim.reward);
    };
    const collect = () => {
        const nav = new TestNavigator();
        for (let i = 0; i < 1200 && sim.reward; i++) tick(nav.toward(sim.player, sim.reward, sim.obstacles, roomBounds(0)));
        assert.equal(sim.progression.phase, 'upgrade');
    };
    return { tutorial, values, storage, start, tick, wait, move, attack, dash, clear, collect, get sim() { return sim; } };
}

test('new player and existing audio preferences without tutorial flag start at movement', () => {
    const f = fixture(); f.values.set('protocol-zero.audio.v1', '{"muted":true}'); f.start();
    assert.equal(f.tutorial.step, 'movement'); assert.equal(f.values.has(TUTORIAL_KEY), false);
    assert.equal(fixture('false').tutorial.step, 'movement'); assert.equal(fixture('corrupt').tutorial.step, 'movement');
});
test('movement requires real displacement, not intent against a wall or elapsed time', () => {
    const f = fixture(); f.sim.player.walking = false;
    f.tutorial.update(f.sim, { x: 1, z: 0 }, 30); assert.equal(f.tutorial.confirmed, false);
    f.move(); assert.equal(f.tutorial.step, 'movement'); assert.equal(f.tutorial.confirmed, true);
    f.wait(60); assert.equal(f.tutorial.step, 'stopToAttack');
});
test('standing still without a target and enemy shots cannot complete auto-attack; a real player shot can', () => {
    const f = fixture(); f.move(); f.wait(60);
    assert.equal(f.tutorial.step, 'stopToAttack');
    f.sim.events.push({ type: 'shot', position: f.sim.player, enemy: true, id: 99 });
    f.tutorial.update(f.sim, { x: 0, z: 0 }, 10); f.sim.events.length = 0;
    assert.equal(f.tutorial.confirmed, false);
    f.attack(); assert.equal(f.tutorial.step, 'dash');
    assert.equal(f.values.has(TUTORIAL_KEY), false);
});
test('dash requires the actual successful event; a cooldown-rejected dash does not advance', () => {
    const f = fixture(); f.move(); f.attack(); f.sim.player.dashCooldown = 10;
    f.sim.dash(); f.tick(); assert.equal(f.tutorial.confirmed, false); assert.equal(f.tutorial.step, 'dash');
    f.sim.player.dashCooldown = 0; f.dash(); assert.equal(f.tutorial.step, 'waitingForReward');
});
test('actual reward spawn interrupts message transitions; real pickup persists full completion', () => {
    const f = fixture(); f.move(); f.attack(); f.dash(); f.clear();
    assert.equal(f.tutorial.step, 'collectReward'); f.wait(120); assert.equal(f.tutorial.step, 'collectReward');
    f.collect(); assert.equal(f.tutorial.step, 'completed'); assert.equal(f.values.get(TUTORIAL_KEY), 'true');
    f.start(); assert.equal(f.tutorial.step, 'inactive');
    const reloaded = new TutorialController(f.storage); reloaded.start(f.sim); assert.equal(reloaded.step, 'inactive');
});
test('automatic shots and dashes before their instructions do not skip later steps', () => {
    const f = fixture(); f.sim.player.stats.damage = 1; // Keep targets alive in this longer test scenario.
    f.wait(150); // Actual auto-fire while movement is still the instruction.
    f.sim.dash(); f.tick(); f.wait(30);
    f.move(); f.attack(); f.wait(50);
    assert.equal(f.tutorial.step, 'dash'); assert.equal(f.tutorial.confirmed, false);
    f.dash(); assert.equal(f.tutorial.step, 'waitingForReward');
});
test('a rapidly available physical core takes priority even during movement feedback', () => {
    const f = fixture(); f.move(); assert.equal(f.tutorial.confirmed, true);
    f.sim.reward = { x: -4, z: 4 }; f.sim.progression.phase = 'cleared';
    f.tick(); assert.equal(f.tutorial.step, 'collectReward'); assert.equal(f.tutorial.confirmed, false);
});
test('collecting a core without the required actions never saves completed or obstructs cards', () => {
    const f = fixture(); f.clear(); assert.equal(f.tutorial.step, 'collectReward');
    f.collect(); assert.equal(f.tutorial.step, 'inactive'); assert.equal(f.values.has(TUTORIAL_KEY), false);
    f.start(); assert.equal(f.tutorial.step, 'movement');
});
test('Repeat clears only the tutorial flag and activates the next run without starting one', () => {
    const f = fixture('true'); f.values.set('protocol-zero.audio.v1', 'keep');
    const phase = f.sim.progression.phase, elapsed = f.sim.elapsed;
    f.tutorial.repeat(); assert.equal(f.tutorial.step, 'inactive');
    assert.equal(f.values.has(TUTORIAL_KEY), false); assert.equal(f.values.get('protocol-zero.audio.v1'), 'keep');
    assert.equal(f.sim.progression.phase, phase); assert.equal(f.sim.elapsed, elapsed);
    f.start(); assert.equal(f.tutorial.step, 'movement');
});
test('real death before completion does not persist; Retry starts at movement', () => {
    const f = fixture(); f.move(); f.sim.player.invulnerable = 0;
    f.sim.projectiles.push(createProjectile(999, f.sim.player, { x: 0, z: 10 }, true, 100, 0, 1));
    f.tick(); assert.equal(f.sim.progression.phase, 'dead'); assert.equal(f.tutorial.step, 'inactive');
    assert.equal(f.values.has(TUTORIAL_KEY), false); f.start(); assert.equal(f.tutorial.step, 'movement');
});
test('Restart and Return to Menu discard incomplete progress; completed runs stay inactive', () => {
    for (const completed of [undefined, 'true']) {
        const f = fixture(completed); f.move(); f.tutorial.stop();
        assert.equal(f.tutorial.step, 'inactive'); assert.equal(f.values.get(TUTORIAL_KEY), completed);
        f.start(); assert.equal(f.tutorial.step, completed ? 'inactive' : 'movement');
    }
});
test('pause freezes instruction and completion feedback and ignores any queued facts', () => {
    const f = fixture(); f.move(); const before = JSON.stringify(f.tutorial);
    for (let i = 0; i < 600; i++) f.tick({ x: 1, z: 0 }, true);
    assert.equal(JSON.stringify(f.tutorial), before); f.wait(60); assert.equal(f.tutorial.step, 'stopToAttack');
});
test('leaving Sector 01 stops incomplete onboarding without saving it', () => {
    const f = fixture(); f.sim.progression.wave = 1; f.tick();
    assert.equal(f.tutorial.step, 'inactive'); assert.equal(f.values.has(TUTORIAL_KEY), false);
});
test('blocked storage never breaks completion or Repeat; completion survives within the session', () => {
    const denied = () => { throw Error('Storage denied'); };
    const f = fixture(undefined, { getItem: denied, setItem: denied, removeItem: denied });
    f.move(); f.attack(); f.dash(); f.clear(); f.collect();
    assert.equal(f.tutorial.step, 'completed'); f.start(); assert.equal(f.tutorial.step, 'inactive');
    assert.doesNotThrow(() => f.tutorial.repeat()); f.start(); assert.equal(f.tutorial.step, 'movement');
});
test('tutorial observation does not mutate gameplay data or consume shared events', () => {
    const f = fixture(); f.sim.update(1 / 60, { x: 1, z: 0 });
    const before = JSON.stringify(f.sim); f.tutorial.update(f.sim, { x: 1, z: 0 }, 1 / 60);
    assert.equal(JSON.stringify(f.sim), before);
});

// Controlled tutorial clock: no wall-clock sleeps and no weapon cooldown changes.
function instructionClock() {
    const f = fixture(); f.move(); f.tick();
    const advance = (seconds: number, event?: 'shot' | 'dash', paused = false) => {
        if (event === 'shot') f.sim.events.push({ type: 'shot', position: f.sim.player, enemy: false, id: 100 });
        if (event === 'dash') f.sim.events.push({ type: 'dash', position: f.sim.player });
        f.tutorial.update(f.sim, { x: 0, z: 0 }, seconds, paused);
        f.sim.events.length = 0;
    };
    advance(TUTORIAL_TIMINGS.completeFeedback); advance(TUTORIAL_TIMINGS.betweenStepsDelay);
    assert.equal(f.tutorial.step, 'stopToAttack');
    const reachDash = () => {
        advance(TUTORIAL_TIMINGS.stopToAttackMinVisible); advance(0, 'shot');
        assert.equal(f.tutorial.confirmed, true);
        advance(TUTORIAL_TIMINGS.completeFeedback); advance(TUTORIAL_TIMINGS.betweenStepsDelay);
        assert.equal(f.tutorial.step, 'dash');
    };
    return { ...f, advance, reachDash };
}

test('pacing: immediate auto-fire leaves the actual controller in stopToAttack', () => {
    const f = instructionClock(); f.advance(0, 'shot');
    assert.equal(f.tutorial.step, 'stopToAttack'); assert.equal(f.tutorial.confirmed, false);
});
test('pacing: shots inside the reading window are discarded, never replayed when it expires', () => {
    const f = instructionClock(); f.advance(.2, 'shot'); f.advance(1, 'shot');
    f.advance(1); // No new shot after the window, even though enough time has elapsed.
    assert.equal(f.tutorial.step, 'stopToAttack'); assert.equal(f.tutorial.confirmed, false);
});
test('pacing: a new stationary player shot after the reading window confirms auto-fire', () => {
    const f = instructionClock(); f.advance(TUTORIAL_TIMINGS.stopToAttackMinVisible);
    assert.equal(f.tutorial.confirmed, false);
    f.advance(0, 'shot'); assert.equal(f.tutorial.confirmed, true);
    assert.equal(f.tutorial.step, 'stopToAttack'); // Confirmation does not advance the instruction.
});
test('pacing: a dash during its reading window is discarded without deferred completion', () => {
    const f = instructionClock(); f.reachDash(); f.advance(.2, 'dash'); f.advance(1);
    assert.equal(f.tutorial.step, 'dash'); assert.equal(f.tutorial.confirmed, false);
});
test('pacing: a new dash after its minimum visibility confirms the current instruction', () => {
    const f = instructionClock(); f.reachDash(); f.advance(TUTORIAL_TIMINGS.dashMinVisible);
    f.advance(0, 'dash'); assert.equal(f.tutorial.step, 'dash'); assert.equal(f.tutorial.confirmed, true);
});
test('pacing: pause freezes reading, confirmation and separation clocks', () => {
    const f = instructionClock(); f.advance(.5);
    let before = JSON.stringify(f.tutorial); f.advance(10, undefined, true);
    assert.equal(JSON.stringify(f.tutorial), before);
    f.advance(0, 'shot'); assert.equal(f.tutorial.confirmed, false);
    f.advance(.7); f.advance(0, 'shot'); assert.equal(f.tutorial.confirmed, true);
    before = JSON.stringify(f.tutorial); f.advance(10, undefined, true);
    assert.equal(JSON.stringify(f.tutorial), before);
    f.advance(TUTORIAL_TIMINGS.completeFeedback); assert.equal(f.tutorial.separating, true);
    before = JSON.stringify(f.tutorial); f.advance(10, undefined, true);
    assert.equal(JSON.stringify(f.tutorial), before);
    f.advance(TUTORIAL_TIMINGS.betweenStepsDelay); assert.equal(f.tutorial.step, 'dash');
});
test('pacing: movement and auto-fire keep feedback then a full gap before the next instruction', () => {
    const f = fixture(); f.move();
    f.tutorial.update(f.sim, { x: 0, z: 0 }, .3);
    assert.equal(f.tutorial.confirmed, true); assert.equal(f.tutorial.step, 'movement');
    f.tutorial.update(f.sim, { x: 0, z: 0 }, .05);
    assert.equal(f.tutorial.confirmed, false); assert.equal(f.tutorial.separating, true);
    f.tutorial.update(f.sim, { x: 0, z: 0 }, .59);
    assert.equal(f.tutorial.step, 'movement'); assert.equal(f.tutorial.separating, true);
    f.tutorial.update(f.sim, { x: 0, z: 0 }, .02);
    assert.equal(f.tutorial.step, 'stopToAttack'); assert.equal(f.tutorial.separating, false);
    const a = instructionClock(); a.advance(1.2); a.advance(0, 'shot');
    a.advance(.34); assert.equal(a.tutorial.confirmed, true);
    a.advance(.02); assert.equal(a.tutorial.separating, true);
    a.advance(.59, 'dash'); assert.equal(a.tutorial.step, 'stopToAttack');
    a.advance(.02); assert.equal(a.tutorial.step, 'dash'); assert.equal(a.tutorial.confirmed, false);
});
test('pacing: simulated gameplay, early shots and dashes are identical with or without tutorial delays', () => {
    const observed = new Simulation(seededRandom()), control = new Simulation(seededRandom());
    observed.start(); control.start();
    const tutorial = new TutorialController(); tutorial.start(observed);
    let shots = 0, dashes = 0;
    for (let frame = 0; frame < 600; frame++) {
        const input = { x: frame < 8 ? 1 : 0, z: 0 };
        if ([30, 300, 450].includes(frame)) { observed.dash(); control.dash(); }
        observed.update(1 / 60, input); control.update(1 / 60, input);
        shots += observed.events.filter(e => e.type === 'shot' && !e.enemy).length;
        dashes += observed.events.filter(e => e.type === 'dash').length;
        tutorial.update(observed, input, 1 / 60);
        assert.equal(JSON.stringify(observed), JSON.stringify(control));
        observed.events.length = 0; control.events.length = 0;
    }
    assert.ok(shots > 0); assert.ok(dashes > 0);
});
