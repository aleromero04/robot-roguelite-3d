import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { GameAudio, SFX, MUSIC_FILES, DEFAULT_AUDIO, AUDIO_STORAGE_KEY, MAX_SFX_VOICES,
    audioSettings, type AudioBackend, type AudioSettings, type MusicTrack, type SfxId } from '../src/audio.ts';
import { AudioEvents } from '../src/audio-events.ts';
import { Simulation } from '../src/simulation.ts';
import { createBoss } from '../src/boss.ts';
import { createEnemy } from '../src/enemies/enemies.ts';
import { seededRandom } from './helpers.ts';
import { createProjectile, type ShotModifiers } from '../src/projectiles.ts';
import { applyUpgrade } from '../src/upgrades.ts';

class FakeAudio implements AudioBackend {
    unlocked = 0; disposed = 0; available = true; paused = false;
    settings = { ...DEFAULT_AUDIO };
    tracks: (MusicTrack | null)[] = []; level = 1;
    played: { id: SfxId; gain: number; rate: number; active: boolean; end: () => void }[] = [];
    unlock() { this.unlocked++; return true; }
    mix(settings: AudioSettings) { this.settings = { ...settings }; }
    music(track: MusicTrack | null, level: number) { this.tracks.push(track); this.level = level; }
    pause(paused: boolean) { this.paused = paused; }
    play(id: SfxId, gain: number, rate: number, ended: () => void) {
        if (!this.available) return null;
        const voice = { id, gain, rate, active: true, end: () => { voice.active = false; ended(); } };
        this.played.push(voice); return voice.end;
    }
    dispose() { this.disposed++; }
}
function fixture() {
    const backend = new FakeAudio(); let time = 0;
    const audio = new GameAudio(backend, undefined, () => time, () => .5);
    const events = new AudioEvents(audio), sim = new Simulation(seededRandom());
    return { audio, backend, events, sim, advance: (dt = 1) => { time += dt; } };
}

test('audio stays locked until a gesture and does not queue earlier effects', () => {
    const { audio, backend } = fixture();
    assert.equal(audio.play('playerShot'), false);
    assert.equal(backend.unlocked, 0); assert.equal(backend.played.length, 0);
    audio.unlock(); assert.equal(audio.play('playerShot'), true);
    assert.equal(backend.played.length, 1);
});
test('settings validate types, finite numbers and bounds; corrupt storage is harmless', () => {
    assert.deepEqual(audioSettings(null), DEFAULT_AUDIO);
    assert.deepEqual(audioSettings({ musicVolume: 4, sfxVolume: -2, muted: true }), { musicVolume: 1, sfxVolume: 0, muted: true });
    assert.deepEqual(audioSettings({ musicVolume: NaN, sfxVolume: '0.5', muted: 'false' }), DEFAULT_AUDIO);
    const backend = new FakeAudio();
    assert.deepEqual(new GameAudio(backend, { getItem: () => '{bad', setItem: () => {} }).settings, DEFAULT_AUDIO);
    assert.deepEqual(new GameAudio(backend, { getItem: () => { throw Error(); }, setItem: () => {} }).settings, DEFAULT_AUDIO);
});
test('music, SFX and mute persist independently; denied writes cannot interrupt gameplay', () => {
    const data = new Map<string, string>(), storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const audio = new GameAudio(new FakeAudio(), storage);
    audio.configure({ musicVolume: .2, sfxVolume: .8, muted: true });
    assert.ok(data.has(AUDIO_STORAGE_KEY));
    assert.deepEqual(new GameAudio(new FakeAudio(), storage).settings, { musicVolume: .2, sfxVolume: .8, muted: true });
    assert.doesNotThrow(() => new GameAudio(new FakeAudio(), { ...storage, setItem: () => { throw Error(); } }).configure({ muted: false }));
});
test('mute stops current SFX, drops new effects and retains independent volume values', () => {
    const { audio, backend } = fixture(); audio.unlock(); audio.play('dash');
    audio.configure({ muted: true });
    assert.equal(audio.activeVoices, 0); assert.equal(backend.played[0].active, false);
    assert.equal(audio.play('playerHurt'), false);
    audio.configure({ musicVolume: .12, sfxVolume: .81, muted: false });
    assert.equal(audio.play('playerHurt'), true);
    assert.deepEqual(backend.settings, { musicVolume: .12, sfxVolume: .81, muted: false });
    audio.configure({ sfxVolume: 0 }); assert.equal(audio.activeVoices, 0);
});
test('rapid shots, radial volleys and multi-hit effects have cooldowns and per-SFX voice caps', () => {
    const { audio, advance, backend } = fixture(); audio.unlock();
    assert.equal(audio.play('playerShot'), true);
    assert.equal(audio.play('playerShot'), false);
    advance(.09); assert.equal(audio.play('playerShot'), true);
    advance(.09); assert.equal(audio.play('playerShot'), true);
    advance(.09); assert.equal(audio.play('playerShot'), false);
    backend.played[0].end(); assert.equal(audio.play('playerShot'), true);
    for (let i = 0; i < 12; i++) audio.play('bossAttack');
    assert.equal(backend.played.filter(v => v.id === 'bossAttack').length, 1);
    for (let i = 0; i < 6; i++) audio.play('hitEnemy');
    assert.equal(backend.played.filter(v => v.id === 'hitEnemy').length, 1);
});
test('global SFX cap reserves space for important cues by evicting lower priority voices', () => {
    const { audio, backend, advance } = fixture(); audio.unlock();
    for (const id of ['playerShot', 'enemyShot', 'hitEnemy', 'enemyDeath', 'burrow', 'emerge'] as SfxId[]) {
        audio.play(id); advance(); audio.play(id); advance();
    }
    assert.equal(audio.activeVoices, MAX_SFX_VOICES);
    assert.equal(audio.play('playerShot'), false);
    assert.equal(audio.play('bossPhase'), true);
    assert.equal(audio.activeVoices, MAX_SFX_VOICES);
    assert.equal(backend.played[0].active, false);
});
test('repetitive effects vary pitch subtly and important cues keep their intended pitch', () => {
    for (const random of [() => 0, () => 1]) {
        const backend = new FakeAudio(), audio = new GameAudio(backend, undefined, () => 0, random);
        audio.unlock(); audio.play('playerShot'); audio.play('playerHurt');
        const [shot, hurt] = backend.played;
        assert.ok(shot.rate >= .975 && shot.rate <= 1.025);
        assert.ok(shot.gain <= SFX.playerShot.gain);
        assert.equal(hurt.rate, 1);
    }
});
test('loading misses are dropped without consuming a cooldown or creating a delayed queue', () => {
    const { audio, backend } = fixture(); audio.unlock(); backend.available = false;
    assert.equal(audio.play('dash'), false); assert.equal(audio.activeVoices, 0);
    backend.available = true; assert.equal(audio.play('dash'), true);
    assert.equal(backend.played.length, 1);
});
test('reset stops voices and music, clears cooldowns and preserves settings; dispose is idempotent', () => {
    const { audio, backend } = fixture(); audio.unlock(); audio.configure({ musicVolume: .1 });
    audio.setMusic('boss'); audio.play('bossPhase'); audio.setPaused(true); audio.reset();
    assert.equal(audio.activeVoices, 0); assert.equal(backend.tracks.at(-1), null); assert.equal(backend.paused, false);
    assert.equal(audio.settings.musicVolume, .1); assert.equal(audio.play('bossPhase'), true);
    audio.dispose(); audio.dispose(); audio.unlock();
    assert.equal(backend.disposed, 1); assert.equal(audio.play('dash'), false);
});
test('music continues through S01–06, rewards and travel; Boss starts only with the encounter', () => {
    const { audio, backend, events, sim } = fixture();
    events.update(sim, false); assert.deepEqual(backend.tracks, []);
    sim.start(); events.update(sim, false); audio.unlock();
    const normalStarts = backend.tracks.length;
    for (let wave = 0; wave < 6; wave++) {
        sim.progression.wave = wave;
        sim.progression.phase = 'combat'; events.update(sim, false);
        sim.progression.phase = 'cleared'; events.update(sim, false);
        sim.progression.phase = 'upgrade'; events.update(sim, false); assert.equal(backend.level, .65);
        sim.progression.phase = 'travel'; events.update(sim, false); assert.equal(backend.level, 1);
    }
    assert.ok(backend.tracks.slice(normalStarts).every(track => track === 'normal'));
    sim.progression.wave = 6; sim.progression.phase = 'combat'; events.update(sim, false);
    assert.equal(backend.tracks.at(-1), 'normal');
    sim.boss = createBoss(90, { x: 216, z: -1 }); events.update(sim, false);
    assert.equal(backend.tracks.at(-1), 'boss');
    const count = backend.tracks.length;
    for (let i = 0; i < 100; i++) events.update(sim, false);
    assert.equal(backend.tracks.length, count);
});
test('pause stops SFX and pauses the backend; resume does not restart the music track', () => {
    const { audio, backend, events, sim } = fixture();
    sim.start(); events.update(sim, false); audio.unlock(); audio.play('playerShot');
    const count = backend.tracks.length;
    events.update(sim, true); assert.equal(backend.paused, true); assert.equal(audio.activeVoices, 0);
    assert.equal(audio.play('dash'), false);
    events.update(sim, false); assert.equal(backend.paused, false); assert.equal(backend.tracks.length, count);
});
test('cards suppress residual combat sounds while allowing the reward cue', () => {
    const { audio, backend, events, sim } = fixture(); audio.unlock(); sim.start(); events.update(sim, false);
    sim.progression.phase = 'upgrade';
    sim.events = [{ type: 'explosion', position: sim.player }, { type: 'shot', position: sim.player, enemy: false, id: 0 },
        { type: 'reward-pickup', position: sim.player }];
    events.update(sim, false);
    assert.deepEqual(backend.played.map(v => v.id), ['reward']);
    events.upgrade(); assert.deepEqual(backend.played.slice(-2).map(v => v.id), ['upgrade', 'door']);
});
test('Game Over and Boss death stop music and combat; ending permits its one-shot tail', () => {
    for (const phase of ['dead', 'ending'] as const) {
        const { audio, backend, events, sim } = fixture(); sim.start(); audio.unlock(); events.update(sim, false);
        audio.play('enemyShot'); sim.progression.phase = phase;
        sim.events = [{ type: phase === 'dead' ? 'player-death' : 'boss-death', position: sim.player },
            { type: 'shot', position: sim.player, enemy: true, id: 9 }, { type: 'fragment', position: sim.player }];
        events.update(sim, false);
        assert.equal(backend.tracks.at(-1), null);
        assert.equal(backend.played[0].active, false); assert.equal(audio.activeVoices, 1);
        sim.events = [];
        if (phase === 'ending') sim.progression.phase = 'complete';
        events.update(sim, false); assert.equal(audio.activeVoices, phase === 'ending' ? 2 : 1);
        events.reset(); assert.equal(audio.activeVoices, 0);
        const next = new Simulation(); next.start(); events.update(next, false);
        assert.equal(backend.tracks.at(-1), 'normal');
    }
});
test('existing combat events map to SFX without changing the simulation or events', () => {
    const { audio, backend, events, sim, advance } = fixture(); sim.start(); audio.unlock();
    const cases = [
        ['player-hit','playerHurt'], ['dash','dash'], ['grenade-throw','grenadeThrow'], ['explosion','grenadeExplosion'],
        ['burrow','burrow'], ['emerge','emerge'], ['shield-break','shield'], ['enemy-death','enemyDeath'],
        ['enemy-hit','hitEnemy'], ['boss-phase','bossPhase'], ['revive','revive'],
    ] as const;
    for (const [type,id] of cases) {
        advance(); audio.clearSfx(); sim.events = [{ type, id: 10, position: { x: 0, z: 0 } }];
        const before = JSON.stringify(sim);
        events.update(sim, false);
        assert.equal(backend.played.at(-1)?.id, id);
        assert.equal(JSON.stringify(sim), before);
    }
});
test('real player shots and dash events produce one effect; Boss volleys coalesce', () => {
    const { audio, backend, events, sim, advance } = fixture(); audio.unlock(); sim.start();
    sim.enemies = [createEnemy(40, 'basic', { x: 4, z: 3 })]; sim.player.shotCooldown = 0;
    sim.update(1 / 60, { x: 0, z: 0 }); events.update(sim, false);
    assert.ok(backend.played.some(v => v.id === 'playerShot'));
    sim.events = []; sim.dash(); events.update(sim, false);
    assert.ok(backend.played.some(v => v.id === 'dash'));
    advance(); sim.boss = createBoss(90, { x: 216, z: -1 }); sim.progression.wave = 6;
    sim.events = Array.from({ length: 12 }, () => ({ type: 'shot' as const, position: sim.player, enemy: true, id: 90 }));
    events.update(sim, false); assert.equal(backend.played.filter(v => v.id === 'bossAttack').length, 1);
});
test('burn ticks and hidden burrower hits do not create a repeated hit soundtrack', () => {
    const { audio, backend, events, sim } = fixture(); audio.unlock(); sim.start();
    sim.enemies = [createEnemy(10, 'burrower', { x: 2, z: 1 })]; sim.enemies[0].state = 'underground';
    sim.events = [{ type: 'enemy-hit', id: 10, position: sim.player },
        { type: 'burn', id: 11, position: sim.player }, { type: 'enemy-hit', id: 11, position: sim.player }];
    events.update(sim, false); assert.equal(backend.played.length, 0);
});
test('Boss Charge warning sounds once per charge, including the second warning; no frame spam', () => {
    const { audio, backend, events, sim, advance } = fixture(); audio.unlock(); sim.start();
    sim.boss = createBoss(90, { x: 216, z: -1 }); sim.progression.wave = 6;
    sim.boss.state = 'windup'; sim.boss.pattern = 'charge'; events.update(sim, false);
    for (let i = 0; i < 60; i++) { advance(.02); events.update(sim, false); }
    assert.equal(backend.played.filter(v => v.id === 'bossCharge').length, 1);
    audio.clearSfx(); sim.boss.state = 'charge-pause'; events.update(sim, false);
    sim.boss.state = 'windup'; sim.boss.chargeIndex = 1; events.update(sim, false);
    assert.equal(backend.played.filter(v => v.id === 'bossCharge').length, 2);
});
test('audio manifest references only 18 compact SFX and two present music files', () => {
    const files = new Set(Object.values(SFX).map(spec => spec.file));
    assert.equal(files.size, 18);
    for (const file of files) {
        const path = new URL(`../public/audio/${file}`, import.meta.url);
        assert.equal(readFileSync(path).subarray(0, 4).toString(), 'OggS');
        assert.ok(statSync(path).size < 100_000);
    }
    let bytes = 0;
    for (const file of [...files, ...Object.values(MUSIC_FILES)]) bytes += statSync(new URL(`../public/audio/${file}`, import.meta.url)).size;
    assert.ok(bytes < 7_000_000);
});

function statusAudioFixture(count = 3) {
    const f = fixture(); f.audio.unlock();
    f.sim.progression.phase = 'combat'; f.sim.staticObstacles.length = 0; f.sim.gates = [];
    f.sim.player.x = 0; f.sim.player.z = 8; f.sim.player.shotCooldown = 1000;
    f.sim.enemies = Array.from({ length: count }, (_, i) => {
        const e = createEnemy(100 + i, 'basic', { x: i * 3, z: 0 });
        e.hp = e.maxHp = 1000; e.state = 'recovery'; e.timer = 1000; return e;
    });
    const step = () => { f.sim.update(1 / 60, { x: 0, z: 0 }); f.events.update(f.sim, false); f.sim.events = []; f.advance(1 / 60); };
    let id = 10000;
    const hit = (options: ShotModifiers) => {
        const e = f.sim.enemies[0];
        f.sim.projectiles.push(createProjectile(id++, e, e, false, 10, 0, .2, options)); step();
    };
    return { ...f, step, hit };
}
test('Shield consumes one real hit with one stronger cue; Revive retains its original mix', () => {
    const { sim, step, backend } = statusAudioFixture(); applyUpgrade(sim.player, 'shield');
    for (let i = 0; i < 2; i++) sim.projectiles.push(createProjectile(900 + i, sim.player, sim.player, true, 40, 0, .2));
    step();
    assert.equal(sim.player.hp, 80); assert.equal(sim.player.shieldSpent, true);
    assert.equal(backend.played.filter(v => v.id === 'shield').length, 1);
    assert.equal(backend.played.some(v => v.id === 'playerHurt'), false);
    assert.equal(SFX.shield.gain, .62); assert.equal(SFX.shield.rate, 1.1);
    assert.equal(SFX.revive.gain, .4); assert.equal(SFX.revive.rate, 1);
});
test('Shock sounds only on a real chain: two links produce one voice, ordinary impacts none', () => {
    const { sim, hit, backend, audio, advance } = statusAudioFixture();
    hit({ shock: true }); hit({ shock: true });
    assert.equal(backend.played.some(v => v.id === 'shock'), false);
    hit({ shock: true });
    assert.deepEqual(sim.enemies.map(e => e.hp), [970, 996, 996]);
    assert.equal(backend.played.filter(v => v.id === 'shock').length, 1);
    audio.clearSfx(); advance(.2);
    hit({ shock: true }); hit({ shock: true }); hit({ shock: true });
    assert.equal(backend.played.filter(v => v.id === 'shock').length, 2);
});
test('Shock without secondary targets remains silent even on its third impact', () => {
    const { sim, hit, backend } = statusAudioFixture(1);
    sim.shockHits = 2; hit({ shock: true });
    assert.equal(sim.shockHits, 0); assert.equal(backend.played.some(v => v.id === 'shock'), false);
});
test('Flame application and refresh sound; all three subsequent Burn ticks stay silent', () => {
    const { sim, hit, step, backend, audio, advance } = statusAudioFixture(1);
    hit({ flame: true }); assert.ok(sim.burns.has(100));
    assert.equal(backend.played.filter(v => v.id === 'flameImpact').length, 1);
    audio.clearSfx(); advance(.1); hit({ flame: true });
    assert.equal(backend.played.filter(v => v.id === 'flameImpact').length, 2);
    const count = backend.played.length;
    for (let i = 0; i < 91; i++) step();
    assert.equal(sim.enemies[0].hp, 974); assert.equal(sim.burns.size, 0);
    assert.equal(backend.played.length, count);
});
test('simultaneous Flame impacts coalesce and safe screens suppress Shock/Flame audio', () => {
    const { audio, backend, events, sim, advance } = fixture(); audio.unlock(); sim.start();
    sim.events = Array.from({ length: 6 }, (_, id) => ({ type: 'flame-impact' as const, id, position: sim.player }));
    events.update(sim, false); assert.equal(backend.played.filter(v => v.id === 'flameImpact').length, 1);
    for (const phase of ['upgrade', 'dead', 'complete'] as const) {
        advance(); audio.clearSfx(); sim.progression.phase = phase;
        sim.events.push({ type: 'shock', position: sim.player, target: sim.player, id: 9 });
        events.update(sim, false);
    }
    assert.equal(backend.played.filter(v => v.id === 'flameImpact').length, 1);
    assert.equal(backend.played.some(v => v.id === 'shock'), false);
});
test('lethal damage gets one destruction cue for Game Over, repeated frames never replay it', () => {
    const { sim, step, backend, audio, advance, events } = statusAudioFixture(1);
    sim.projectiles.push(createProjectile(900, sim.player, sim.player, true, 100, 0, .2)); step();
    assert.equal(sim.progression.phase, 'dead');
    assert.equal(backend.played.filter(v => v.id === 'playerDeath').length, 1);
    assert.equal(backend.played.some(v => v.id === 'playerHurt'), false);
    for (let i = 0; i < 120; i++) { audio.clearSfx(); advance(.1); step(); }
    assert.equal(backend.played.filter(v => v.id === 'playerDeath').length, 1);
    events.reset(); sim.progression.phase = 'combat'; events.update(sim, false);
    sim.progression.phase = 'dead'; events.update(sim, false);
    assert.equal(backend.played.filter(v => v.id === 'playerDeath').length, 2);
});
test('Victory sounds only after the existing ending delay, once, and works again after reset', () => {
    const { audio, backend, events, sim } = fixture(); audio.unlock(); sim.start(); events.update(sim, false);
    for (let run = 0; run < 2; run++) {
        sim.progression.phase = 'ending'; sim.victoryTime = 0;
        sim.events = [{ type: 'boss-death', position: sim.player }]; events.update(sim, false); sim.events = [];
        assert.equal(backend.played.filter(v => v.id === 'victory').length, run);
        sim.update(.89, { x: 0, z: 0 }); events.update(sim, false);
        assert.equal(backend.played.filter(v => v.id === 'victory').length, run);
        sim.update(.02, { x: 0, z: 0 }); events.update(sim, false);
        assert.equal(backend.played.filter(v => v.id === 'victory').length, run + 1);
        assert.ok(backend.played.some(v => v.id === 'bossDeath' && v.active));
        for (let i = 0; i < 120; i++) events.update(sim, false);
        assert.equal(backend.played.filter(v => v.id === 'victory').length, run + 1);
        events.reset(); sim.progression.phase = 'combat'; events.update(sim, false);
    }
});
