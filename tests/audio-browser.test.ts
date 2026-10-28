import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserAudio } from '../src/audio-browser.ts';
import { DEFAULT_AUDIO, MUSIC_FILES, MUSIC_TRIM, SFX, GameAudio } from '../src/audio.ts';
import { MenuAudio } from '../src/audio-menu.ts';
import { AudioEvents } from '../src/audio-events.ts';
import { UXFlow, TRANSITION_HALF } from '../src/ux-flow.ts';
import { Simulation } from '../src/simulation.ts';
import { createBoss } from '../src/boss.ts';
import { BOSS_SECTOR } from '../src/waves.ts';

function browserFixture(t: Parameters<Parameters<typeof test>[1]>[0], publicBase = '/') {
    const saved = new Map<string, PropertyDescriptor | undefined>();
    function install(name: string, value: unknown) {
        saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    t.after(() => { for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    } });
    const requests: string[] = [], elements: FakeMedia[] = [], contexts: FakeContext[] = [];
    const param = () => ({ value: 1, cancelScheduledValues() {}, setValueAtTime(v: number) { this.value = v; },
        linearRampToValueAtTime(v: number) { this.value = v; } });
    const node = () => ({ connect() {}, disconnected: false, disconnect() { this.disconnected = true; } });
    class FakeMedia {
        src = ''; loop = false; preload = ''; paused = true; currentTime = 0;
        plays = 0; reject = false; history: string[] = [];
        constructor() { elements.push(this); }
        addEventListener() {}
        pause() { this.paused = true; }
        play() { this.plays++; this.history.push(this.src); this.paused = false;
            return this.reject ? Promise.reject(Object.assign(Error(), { name: 'NotAllowedError' })) : Promise.resolve(); }
        load() {}
        removeAttribute() { this.src = ''; }
    }
    class FakeContext {
        state = 'suspended'; currentTime = 0; destination = {};
        gains: ReturnType<FakeContext['createGain']>[] = [];
        sources: ReturnType<FakeContext['createBufferSource']>[] = [];
        decoded = 0; closed = 0;
        constructor() { contexts.push(this); }
        resume() { this.state = 'running'; return Promise.resolve(); }
        close() { this.closed++; this.state = 'closed'; return Promise.resolve(); }
        createGain() { const gain = { ...node(), gain: param() }; this.gains.push(gain); return gain; }
        createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
        createMediaElementSource() { return node(); }
        decodeAudioData() { this.decoded++; return Promise.resolve({ duration: .3 }); }
        createBufferSource() {
            const source = { ...node(), buffer: null, playbackRate: param(), onended: () => {}, stopped: false,
                start() {}, stop() { this.stopped = true; } };
            this.sources.push(source); return source;
        }
    }
    install('AudioContext', FakeContext); install('Audio', FakeMedia);
    install('fetch', async (url: string) => { requests.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; });
    const backend = new BrowserAudio(publicBase);
    t.after(() => backend.dispose());
    return { backend, requests, elements, contexts };
}

for (const publicBase of ['/', '/robot-roguelite-3d/']) {
    test(`music and SFX requests respect the public base ${publicBase}`, async t => {
        const { backend, requests, elements } = browserFixture(t, publicBase);
        backend.unlock(); await delay(0);
        assert.deepEqual(requests, [...new Set(Object.values(SFX).map(s => `${publicBase}audio/${s.file}`))]);
        for (const track of ['menu', 'normal', 'boss'] as const) {
            backend.music(null, 1);
            backend.music(track, 1);
            assert.equal(elements[0].src, `${publicBase}audio/${MUSIC_FILES[track]}`);
        }
        assert.equal(elements.length, 1);
    });
}

test('browser allocates no audio before unlock and decodes each shared SFX asset once', async t => {
    const { backend, elements, contexts, requests } = browserFixture(t);
    backend.music('normal', 1); assert.equal(contexts.length, 0); assert.equal(elements.length, 0);
    backend.unlock(); await delay(0);
    backend.unlock(); await delay(0);
    assert.equal(elements.length, 1); assert.equal(contexts.length, 1);
    assert.equal(requests.length, 18); assert.equal(new Set(requests).size, 18);
    assert.equal(contexts[0].decoded, 18); assert.equal(backend.diagnostics.loadedSfx, 18);
});
test('normal track keeps its playhead through sectors and volume changes; Boss uses the same element', async t => {
    const { backend, elements } = browserFixture(t);
    backend.music('normal', 1); backend.unlock();
    const media = elements[0]; media.currentTime = 37;
    for (let i = 0; i < 6; i++) backend.music('normal', 1);
    backend.music('normal', .65); backend.mix({ ...DEFAULT_AUDIO, musicVolume: .2 });
    assert.equal(media.currentTime, 37); assert.equal(media.plays, 1);
    backend.music('boss', 1);
    assert.ok(media.src.endsWith('brute_force_loop.mp3'));
    await delay(150);
    assert.equal(elements.length, 1); assert.ok(media.src.endsWith('fight_looped.m4a'));
    assert.equal(media.currentTime, 0); assert.equal(media.plays, 2);
});
test('reset during a pending Boss fade cannot resurrect an old track', async t => {
    const { backend, elements } = browserFixture(t);
    backend.music('normal', 1); backend.unlock(); backend.music('boss', 1);
    backend.music(null, 1); backend.music('normal', 1);
    await delay(150);
    assert.equal(backend.diagnostics.track, 'normal');
    assert.equal(elements[0].history.filter(src => src.includes('fight_looped')).length, 0);
    backend.music(null, 1); assert.equal(elements[0].paused, true); assert.equal(elements[0].src, '');
});
test('cancelling a pending transition restores the current track gain without restarting it', async t => {
    const { backend, contexts, elements } = browserFixture(t);
    backend.music('normal', 1); backend.unlock(); elements[0].currentTime = 19;
    backend.music('boss', 1); backend.music('normal', 1); await delay(150);
    assert.equal(contexts[0].gains[1].gain.value, DEFAULT_AUDIO.musicVolume * MUSIC_TRIM.normal);
    assert.equal(elements[0].currentTime, 19); assert.equal(elements[0].plays, 1);
});
test('pause preserves playhead and prevents a pending transition from playing in the background', async t => {
    const { backend, elements } = browserFixture(t);
    backend.music('normal', 1); backend.unlock(); elements[0].currentTime = 12;
    backend.pause(true); assert.equal(elements[0].paused, true);
    backend.pause(false); assert.equal(elements[0].currentTime, 12);
    backend.music('boss', 1); backend.pause(true); await delay(150);
    assert.equal(elements[0].paused, true); assert.equal(backend.diagnostics.track, 'boss');
    backend.pause(false); assert.equal(elements[0].paused, false);
});
test('mute is applied before the first playback and music/SFX gains remain independent', t => {
    const { backend, contexts } = browserFixture(t);
    backend.mix({ musicVolume: .2, sfxVolume: .8, muted: true }); backend.music('normal', 1); backend.unlock();
    const [master, music, sfx] = contexts[0].gains;
    assert.equal(master.gain.value, 0); assert.equal(music.gain.value, .2 * MUSIC_TRIM.normal); assert.equal(sfx.gain.value, .8);
    backend.mix({ musicVolume: 0, sfxVolume: .5, muted: false });
    assert.equal(master.gain.value, 1); assert.equal(music.gain.value, 0); assert.equal(sfx.gain.value, .5);
});
test('ended/stopped source nodes disconnect and disposal cleans media, context and pending fades', async t => {
    const { backend, contexts, elements } = browserFixture(t);
    backend.music('normal', 1); backend.unlock(); await delay(0);
    let ended = 0;
    const stop = backend.play('dash', .5, 1, () => ended++);
    assert.ok(stop); assert.equal(backend.diagnostics.voices, 1);
    stop(); stop(); assert.equal(ended, 1); assert.equal(backend.diagnostics.voices, 0);
    assert.equal(contexts[0].sources[0].disconnected, true);
    backend.play('playerShot', .2, 1, () => ended++);
    contexts[0].sources[1].onended(); assert.equal(backend.diagnostics.voices, 0);
    backend.music('boss', 1); backend.dispose(); backend.dispose(); await delay(150);
    assert.equal(elements[0].paused, true); assert.equal(elements[0].src, '');
    assert.equal(contexts[0].closed, 1); assert.equal(backend.diagnostics.loadedSfx, 0);
    assert.equal(backend.unlock(), false);
});
test('failed assets are bounded and missing audio cannot crash gameplay', async t => {
    const { backend } = browserFixture(t);
    t.mock.method(globalThis, 'fetch', async () => { throw Error('offline'); });
    const warnings: unknown[] = []; t.mock.method(console, 'warn', (...args) => warnings.push(args));
    backend.unlock(); await delay(0);
    assert.equal(warnings.length, 18);
    backend.unlock(); await delay(0); assert.equal(warnings.length, 18);
    assert.equal(backend.play('playerShot', .2, 1, () => {}), null);
    assert.equal(backend.diagnostics.loadedSfx, 0);
});
test('autoplay rejection is caught and a subsequent gesture retries without allocating another player', async t => {
    const { backend, elements } = browserFixture(t);
    const warnings: unknown[] = []; t.mock.method(console, 'warn', (...args) => warnings.push(args));
    backend.unlock(); elements[0].reject = true; backend.music('menu', 1); await delay(0);
    for (let i = 0; i < 60; i++) backend.music('menu', 1);
    backend.pause(true); backend.pause(false); await delay(0);
    assert.equal(elements[0].plays, 1); assert.deepEqual(warnings, []);
    assert.deepEqual(backend.diagnostics.failures, []);
    elements[0].reject = false; backend.unlock(); await delay(0);
    assert.equal(elements.length, 1); assert.equal(elements[0].plays, 2);
});

function menuFixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
    const browser = browserFixture(t), audio = new GameAudio(browser.backend);
    const menu = new MenuAudio(audio), events = new AudioEvents(audio);
    let sim = new Simulation(() => .4);
    const flow = new UXFlow({
        reset: () => { events.reset(); sim = new Simulation(() => .4); },
        begin: () => { sim.start(); events.update(sim, false); },
        pause: value => menu.pause(value, flow.screen),
    });
    const tick = (dt = TRANSITION_HALF) => { flow.update(dt); menu.update(flow); };
    menu.update(flow);
    return { ...browser, audio, menu, events, flow, tick, get sim() { return sim; } };
}

test('Airy waits for a gesture, loops through menu subpanels, then Play and Boss select the existing tracks', async t => {
    const f = menuFixture(t);
    for (let i = 0; i < 120; i++) f.tick();
    assert.equal(f.backend.diagnostics.desired, 'menu'); assert.equal(f.contexts.length, 0);
    f.audio.unlock(); const media = f.elements[0];
    assert.ok(media.src.endsWith('/airy.mp3')); assert.equal(media.loop, true);
    media.currentTime = 11;
    for (const action of ['how', 'back', 'settings', 'back'] as const) { f.flow.action(action); f.tick(); }
    assert.equal(media.currentTime, 11); assert.equal(media.plays, 1);
    f.flow.action('play');
    assert.equal(f.backend.diagnostics.desired, null); assert.equal(media.paused, false);
    await delay(150); assert.equal(media.src, ''); assert.equal(media.paused, true);
    f.tick(); assert.equal(media.src, ''); // Reset at black midpoint must not resurrect Airy.
    f.tick(); assert.ok(media.src.endsWith('/brute_force_loop.mp3'));
    f.sim.progression.wave = BOSS_SECTOR; f.sim.boss = createBoss(1, { x: 216, z: -5 });
    f.events.update(f.sim, false); await delay(150);
    assert.ok(media.src.endsWith('/fight_looped.m4a')); assert.equal(f.elements.length, 1);
});

test('Restart never inserts Airy; confirmed menu return starts it only after the transition', async t => {
    const f = menuFixture(t); f.audio.unlock(); f.flow.action('play'); await delay(150); f.tick(.36);
    const media = f.elements[0], airyPlays = () => media.history.filter(src => src.endsWith('/airy.mp3')).length;
    f.flow.pause(); f.flow.action('restart'); f.flow.action('accept');
    f.tick(); assert.equal(media.src, ''); f.tick();
    assert.ok(media.src.endsWith('/brute_force_loop.mp3')); assert.equal(airyPlays(), 1);
    f.sim.progression.wave = BOSS_SECTOR; f.sim.boss = createBoss(1, { x: 216, z: -5 });
    f.events.update(f.sim, false); await delay(150);
    f.flow.pause(); f.flow.action('menu'); f.flow.action('cancel');
    assert.ok(media.src.endsWith('/fight_looped.m4a')); assert.equal(media.paused, true);
    f.flow.action('menu'); f.flow.action('accept');
    f.tick(); assert.equal(media.src, ''); assert.equal(airyPlays(), 1);
    f.tick(); assert.ok(media.src.endsWith('/airy.mp3')); assert.equal(airyPlays(), 2);
    assert.equal(media.paused, false); assert.equal(f.elements.length, 1);
});

test('Game Over and Victory stay silent until an actual return to menu; Retry skips Airy', async t => {
    const f = menuFixture(t); f.audio.unlock(); f.flow.action('play'); await delay(150); f.tick(.36);
    for (const phase of ['dead', 'complete'] as const) {
        if (phase === 'complete') { f.sim.progression.phase = 'ending'; f.events.update(f.sim, false); }
        f.sim.progression.phase = phase; f.events.update(f.sim, false); f.flow.sync(phase);
        f.tick(10); assert.equal(f.backend.diagnostics.track, null);
        f.flow.action('play'); f.tick(); assert.equal(f.backend.diagnostics.track, null);
        f.tick(); assert.equal(f.backend.diagnostics.track, 'normal');
        f.sim.progression.phase = phase; f.events.update(f.sim, false); f.flow.sync(phase);
        f.flow.action('menu'); f.tick(); assert.equal(f.backend.diagnostics.track, null);
        f.tick(); assert.equal(f.backend.diagnostics.track, 'menu');
        f.flow.action('play'); await delay(150); f.tick(.36);
    }
});

test('all three tracks share Music Volume and mute; Airy trim equals Brute Force', async t => {
    const { backend, contexts, elements } = browserFixture(t);
    backend.music('menu', 1); backend.unlock();
    assert.equal(MUSIC_TRIM.menu, MUSIC_TRIM.normal);
    const [master, music, sfx] = contexts[0].gains;
    for (const track of ['menu', 'normal', 'boss'] as const) {
        backend.music(track, 1); await delay(150);
        backend.mix({ musicVolume: .5, sfxVolume: .7, muted: false });
        assert.equal(music.gain.value, .5 * MUSIC_TRIM[track]); assert.equal(master.gain.value, 1);
        backend.mix({ musicVolume: .5, sfxVolume: .7, muted: true }); assert.equal(master.gain.value, 0);
        backend.mix({ musicVolume: 0, sfxVolume: .7, muted: false }); assert.equal(music.gain.value, 0);
        assert.equal(sfx.gain.value, .7); assert.equal(elements.length, 1);
    }
});

test('gestures during a menu fade do not cancel its timer or restart the outgoing track', async t => {
    const { backend, elements } = browserFixture(t);
    backend.music('menu', 1); backend.unlock(); backend.music(null, 1, true);
    backend.unlock(); backend.music(null, 1);
    assert.ok(elements[0].src.endsWith('/airy.mp3')); assert.equal(elements[0].plays, 1);
    await delay(150); assert.equal(elements[0].src, '');
    backend.music('normal', 1); backend.music('menu', 1); backend.dispose();
    await delay(150); assert.equal(elements[0].src, ''); assert.equal(elements[0].paused, true);
});

test('browser-denied context resume is silent and only retried by a gesture', async t => {
    const { backend, contexts } = browserFixture(t);
    const warnings: unknown[] = []; t.mock.method(console, 'warn', (...args) => warnings.push(args));
    backend.unlock();
    let attempts = 0;
    t.mock.method(contexts[0], 'resume', () => { attempts++; return Promise.reject(Object.assign(Error(), { name: 'NotAllowedError' })); });
    backend.music('menu', 1); backend.unlock(); await delay(0);
    for (let i = 0; i < 60; i++) backend.music('menu', 1);
    assert.equal(attempts, 1); assert.deepEqual(warnings, []);
});
