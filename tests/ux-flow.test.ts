import test from 'node:test';
import assert from 'node:assert/strict';
import { UXFlow, gameplayInput, TRANSITION_HALF, type Screen } from '../src/ux-flow.ts';
import { Simulation } from '../src/simulation.ts';
import { GameAudio, type AudioBackend, type AudioSettings, type MusicTrack, type SfxId } from '../src/audio.ts';
import { AudioEvents } from '../src/audio-events.ts';
import { createProjectile } from '../src/projectiles.ts';
import { createBoss } from '../src/boss.ts';
import { ROOM_CENTERS } from '../src/layout.ts';

function fixture() {
    let sim = new Simulation(() => .4), resets = 0, starts = 0, paused = false;
    const events: string[] = [], saved = new Map<string, string>();
    const backend: AudioBackend = {
        unlock: () => true, mix: (s: AudioSettings) => { events.push(`mix:${s.musicVolume}:${s.sfxVolume}:${s.muted}`); },
        music: (track: MusicTrack | null) => { events.push(`music:${track}`); },
        pause: value => { events.push(`pause:${value}`); },
        play: (id: SfxId) => { events.push(`sfx:${id}`); return () => { events.push(`stop:${id}`); }; }, dispose: () => {},
    };
    const audio = new GameAudio(backend, { getItem: k => saved.get(k) ?? null, setItem: (k, v) => { saved.set(k, v); } });
    audio.unlock();
    const adapter = new AudioEvents(audio);
    const flow = new UXFlow({
        reset: () => { resets++; sim = new Simulation(() => .4); adapter.reset(); },
        begin: () => { starts++; sim.start(); adapter.update(sim, false); },
        pause: value => { paused = value; audio.setPaused(value); },
    });
    const tick = (dt = 1 / 60) => {
        flow.update(dt);
        if (flow.screen !== 'playing') return;
        sim.update(dt, { x: 0, z: 0 }); adapter.update(sim, false); sim.events.length = 0; flow.sync(sim.progression.phase);
    };
    const play = () => { flow.action('play'); flow.update(TRANSITION_HALF * 2); };
    return { flow, audio, events, saved, tick, play, get sim() { return sim; }, get resets() { return resets; }, get starts() { return starts; }, get paused() { return paused; } };
}

test('menu is ambient but never starts or advances an invisible run', () => {
    const f = fixture(); for (let i = 0; i < 600; i++) f.tick();
    assert.equal(f.flow.screen, 'menu'); assert.equal(f.flow.ambient, true);
    assert.equal(f.sim.elapsed, 0); assert.equal(f.sim.pendingSpawns, 0); assert.equal(f.starts, 0);
    assert.deepEqual(f.events.filter(e => e.startsWith('sfx:') || e === 'music:normal'), []);
});
test('Play resets under full dimming, then begins exactly one fresh sector 01', () => {
    const f = fixture(); f.flow.action('play'); f.flow.action('play');
    f.flow.update(TRANSITION_HALF / 2); assert.equal(f.resets, 0); assert.equal(f.flow.fade, .5);
    f.flow.update(TRANSITION_HALF / 2); assert.equal(f.resets, 1); assert.equal(f.flow.fade, 1);
    assert.equal(f.starts, 0); assert.equal(f.sim.progression.phase, 'ready'); assert.equal(f.flow.ambient, false);
    f.flow.update(TRANSITION_HALF); assert.equal(f.starts, 1); assert.equal(f.flow.screen, 'playing');
    assert.equal(f.sim.progression.phase, 'combat'); assert.equal(f.sim.progression.wave, 0); assert.equal(f.sim.player.hp, 80);
    assert.equal(f.events.filter(e => e === 'music:normal').length, 1);
});
test('Escape pause freezes HP, positions, enemies, projectiles and gameplay timers without replacing the run', () => {
    const f = fixture(); f.play(); for (let i = 0; i < 60; i++) f.tick();
    const run = f.sim; f.flow.escape();
    const before = JSON.stringify(run); for (let i = 0; i < 300; i++) f.tick();
    assert.equal(f.flow.screen, 'pause'); assert.equal(f.paused, true); assert.equal(JSON.stringify(run), before);
    f.flow.escape(); assert.equal(f.flow.screen, 'playing'); assert.equal(f.paused, false);
    f.tick(); assert.equal(f.sim, run); assert(f.sim.elapsed > JSON.parse(before).elapsed); assert.equal(f.resets, 1);
});
test('How to Play returns to menu; Escape from the menu does not start gameplay', () => {
    const f = fixture(); f.flow.action('how'); assert.equal(f.flow.screen, 'how');
    assert.equal(f.flow.ambient, true); f.flow.escape(); assert.equal(f.flow.screen, 'menu');
    f.flow.escape(); assert.equal(f.flow.screen, 'menu'); assert.equal(f.starts, 0);
});
test('Settings share Audio v1 preferences from menu and pause and return to their exact parent', () => {
    const f = fixture(); f.flow.action('settings'); f.audio.configure({ musicVolume: .19, sfxVolume: .41, muted: true });
    f.flow.escape(); assert.equal(f.flow.screen, 'menu'); f.play(); f.flow.escape(); f.flow.action('settings');
    assert.equal(f.flow.ambient, false); assert.equal(f.paused, true);
    assert.deepEqual(f.audio.settings, { musicVolume: .19, sfxVolume: .41, muted: true });
    assert.equal(f.saved.size, 1); f.flow.escape(); assert.equal(f.flow.screen, 'pause'); assert.equal(f.paused, true);
    f.flow.escape(); assert.equal(f.flow.screen, 'playing'); assert.equal(f.paused, false);
});
test('Restart confirmation and cancellation preserve the original run until acceptance', () => {
    const f = fixture(); f.play(); f.tick(); const run = f.sim; f.flow.pause(); f.flow.action('restart');
    assert.equal(f.flow.screen, 'confirm'); assert.equal(f.flow.confirmation, 'restart');
    f.flow.escape(); assert.equal(f.flow.screen, 'pause'); assert.equal(f.sim, run);
    f.flow.action('restart'); f.flow.action('accept'); assert.equal(f.sim, run);
    f.flow.update(.36); assert.notEqual(f.sim, run); assert.equal(f.starts, 2); assert.equal(f.sim.elapsed, 0);
    assert.equal(f.sim.player.acquired.size, 0); assert.equal(f.flow.screen, 'playing');
});
test('Return to menu requires confirmation, resets all combat data and stops the old music/voices', () => {
    const f = fixture(); f.play(); f.tick(); f.audio.play('playerShot'); f.flow.pause(); f.flow.action('menu');
    f.flow.action('cancel'); assert.equal(f.flow.screen, 'pause'); assert.equal(f.resets, 1);
    f.flow.action('menu'); f.flow.action('accept'); f.flow.update(.36);
    assert.equal(f.flow.screen, 'menu'); assert.equal(f.sim.progression.phase, 'ready'); assert.equal(f.sim.elapsed, 0);
    assert.equal(f.sim.enemies.length, 0); assert.equal(f.sim.projectiles.length, 0); assert.equal(f.sim.pendingSpawns, 0);
    assert.equal(f.audio.activeVoices, 0); assert(f.events.includes('music:null')); assert.equal(f.starts, 1);
});
test('actual lethal impact opens Game Over once; Retry creates a new run', () => {
    const f = fixture(); f.play();
    f.sim.projectiles.push(createProjectile(900, f.sim.player, { x: 0, z: 10 }, true, 100, 0, 1));
    f.tick(); assert.equal(f.flow.screen, 'gameover'); assert.equal(f.sim.player.hp, 0);
    for (let i = 0; i < 90; i++) f.tick();
    assert.equal(f.events.filter(e => e === 'sfx:playerDeath').length, 1);
    f.play(); assert.equal(f.sim.player.hp, 80); assert.equal(f.starts, 2); assert.equal(f.flow.screen, 'playing');
});
test('actual Boss destruction preserves ending delay and emits Victory once before New Run', () => {
    const f = fixture(); f.play(); const s = f.sim;
    s.enemies = []; s.telegraphs = []; s.progression.wave = 6;
    s.player.x = ROOM_CENTERS[6]; s.player.z = 6; s.player.shotCooldown = 100;
    s.boss = createBoss(900, { x: ROOM_CENTERS[6], z: 0 }); s.boss.hp = 1; s.boss.state = 'recovery'; s.boss.timer = 100;
    s.projectiles.push(createProjectile(901, s.boss, s.boss, false, 10, 0, 1));
    f.tick(); assert.equal(s.progression.phase, 'ending'); assert.equal(f.flow.screen, 'playing');
    for (let i = 0; i < 60; i++) f.tick(); assert.equal(f.flow.screen, 'victory');
    for (let i = 0; i < 90; i++) f.tick();
    assert.equal(f.events.filter(e => e === 'sfx:bossDeath').length, 1);
    assert.equal(f.events.filter(e => e === 'sfx:victory').length, 1);
    f.play(); assert.equal(f.sim.boss, undefined); assert.equal(f.sim.progression.wave, 0); assert.equal(f.starts, 2);
});
test('both end screens can return directly to a quiet menu without another confirmation', () => {
    for (const phase of ['dead', 'complete'] as const) {
        const f = fixture(); f.play(); f.flow.sync(phase); f.flow.action('menu');
        assert.equal(f.flow.screen, 'transition'); f.flow.update(.36); assert.equal(f.flow.screen, 'menu');
        assert.equal(f.starts, 1); assert.equal(f.sim.pendingSpawns, 0);
    }
});
test('every overlay blocks movement and dash; upgrade/ending also reject gameplay keys', () => {
    const screens: Screen[] = ['menu', 'pause', 'how', 'settings', 'confirm', 'gameover', 'victory', 'transition', 'error'];
    for (const screen of screens) assert.equal(gameplayInput(screen, 'combat'), false, screen);
    for (const phase of ['upgrade', 'ending', 'ready', 'dead', 'complete'] as const) assert.equal(gameplayInput('playing', phase), false);
    for (const phase of ['combat', 'cleared', 'travel'] as const) assert.equal(gameplayInput('playing', phase), true);
});
test('invalid/stale actions cannot restart gameplay from subpanels or skip confirmation', () => {
    const f = fixture(); f.flow.action('settings');
    for (const action of ['play', 'continue', 'restart', 'accept', 'menu'] as const) f.flow.action(action);
    assert.equal(f.flow.screen, 'settings'); assert.equal(f.starts, 0); f.flow.escape(); f.play(); f.flow.pause();
    f.flow.action('accept'); assert.equal(f.flow.screen, 'pause'); assert.equal(f.resets, 1);
});
test('focus loss during transition starts paused and requires explicit Continue', () => {
    const f = fixture(); f.flow.action('play'); f.flow.pause(); f.flow.update(.36);
    assert.equal(f.flow.screen, 'pause'); assert.equal(f.paused, true); assert.equal(f.sim.elapsed, 0);
    f.flow.action('continue'); f.tick(); assert(f.sim.elapsed > 0);
});
test('pausing ending freezes victory countdown and resumes the same sequence', () => {
    const f = fixture(); f.play(); f.sim.progression.phase = 'ending'; f.sim.victoryTime = .9;
    f.flow.pause(); for (let i = 0; i < 120; i++) f.tick(); assert.equal(f.sim.victoryTime, .9);
    f.flow.escape(); for (let i = 0; i < 60; i++) f.tick(); assert.equal(f.flow.screen, 'victory');
});
test('WebGL failure cannot be escaped into a running simulation', () => {
    const f = fixture(); f.play(); f.flow.fail(); f.flow.escape(); f.flow.action('play');
    assert.equal(f.flow.screen, 'error'); assert.equal(f.paused, true);
});

test('pause and settings during upgrade selection preserve the exact offered modules', () => {
    const f = fixture(); f.play(); f.sim.progression.phase = 'upgrade'; f.sim.offeredUpgrades = ['power', 'turbo', 'repair'];
    const run = f.sim; f.flow.pause(); f.flow.action('settings');
    for (let i = 0; i < 60; i++) f.tick();
    f.flow.escape(); f.flow.escape();
    assert.equal(f.sim, run); assert.equal(f.sim.progression.phase, 'upgrade');
    assert.deepEqual(f.sim.offeredUpgrades, ['power', 'turbo', 'repair']);
    assert.equal(gameplayInput(f.flow.screen, f.sim.progression.phase), false);
    assert.equal(f.sim.selectUpgrade('power'), true); assert.equal(f.sim.progression.phase, 'travel');
});
