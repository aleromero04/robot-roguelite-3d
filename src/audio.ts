/** Audio policy is independent of the browser and never mutates gameplay. */
export type MusicTrack = 'normal' | 'boss';
export const MUSIC_FILES: Record<MusicTrack, string> = {
    normal: 'music/brute_force_loop.mp3', boss: 'music/fight_looped.m4a',
};
// Source RMS differs by ~4 dB. These trims sit beneath the user's independent music slider.
export const MUSIC_TRIM: Record<MusicTrack, number> = { normal: .32, boss: .23 };
const sound = (file: string, gain: number, cooldown: number, voices: number, priority: number, variation = 0, rate = 1) =>
    ({ file: `sfx/${file}.ogg`, gain, cooldown, voices, priority, variation, rate });
export const SFX = {
    playerShot: sound('player_shot', .45, .035, 3, 0, .025),
    enemyShot: sound('enemy_shot', .55, .07, 2, 0, .02),
    hitEnemy: sound('hit_enemy', 1.1, .055, 2, 0, .025),
    playerHurt: sound('player_hurt', .9, .15, 1, 3),
    dash: sound('dash', .5, .12, 1, 2, .015),
    enemyDeath: sound('enemy_death', .26, .09, 2, 1, .02),
    grenadeThrow: sound('boss_attack', .25, .16, 1, 1, .01, .85),
    grenadeExplosion: sound('grenade_explosion', .5, .12, 2, 2),
    burrow: sound('burrow', .32, .12, 2, 1, .015, .9),
    emerge: sound('burrow', .48, .12, 2, 1, .015, 1.08),
    shield: sound('shield', .62, .18, 1, 4, 0, 1.1),
    revive: sound('shield', .4, .18, 1, 3),
    shock: sound('shock', .34, .12, 1, 2, 0, 1.3),
    flameImpact: sound('enemy_death', .2, .09, 2, 1, .015, 1.35),
    reward: sound('reward_pickup', .5, .2, 1, 3),
    upgrade: sound('upgrade_select', .4, .15, 1, 3),
    door: sound('door_open', .32, .3, 1, 1),
    ui: sound('ui_click', .3, .08, 1, 2),
    bossAttack: sound('boss_attack', .4, .14, 2, 1, .01),
    bossCharge: sound('boss_attack', .48, .25, 1, 2, 0, .75),
    bossPhase: sound('boss_phase2', .55, .5, 1, 4, 0, .85),
    bossDeath: sound('grenade_explosion', .8, .5, 1, 4, 0, .85),
    playerDeath: sound('player_death', .65, .5, 1, 4, 0, .9),
    victory: sound('victory', .65, .5, 1, 4, 0, .9),
} as const;
export type SfxId = keyof typeof SFX;
export interface AudioSettings { musicVolume: number; sfxVolume: number; muted: boolean }
export const DEFAULT_AUDIO: Readonly<AudioSettings> = { musicVolume: .35, sfxVolume: .7, muted: false };
export const AUDIO_STORAGE_KEY = 'protocol-zero.audio.v1';
export const MAX_SFX_VOICES = 12;
export interface AudioStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface AudioBackend {
    /** Called synchronously from a real click/key gesture, not from a frame or a fetch callback. */
    unlock(): boolean;
    mix(settings: AudioSettings): void;
    music(track: MusicTrack | null, level: number): void;
    pause(paused: boolean): void;
    play(id: SfxId, gain: number, rate: number, ended: () => void): (() => void) | null;
    dispose(): void;
}
const volume = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
export function audioSettings(value: unknown): AudioSettings {
    const v = value && typeof value === 'object' ? value as Partial<AudioSettings> : {};
    return { musicVolume: volume(v.musicVolume, DEFAULT_AUDIO.musicVolume),
        sfxVolume: volume(v.sfxVolume, DEFAULT_AUDIO.sfxVolume),
        muted: typeof v.muted === 'boolean' ? v.muted : DEFAULT_AUDIO.muted };
}
interface Voice { id: SfxId; priority: number; stop: () => void }
export class GameAudio {
    private backend: AudioBackend;
    private storage?: AudioStorage;
    private now: () => number;
    private random: () => number;
    private values: AudioSettings;
    private unlocked = false;
    private paused = false;
    private disposed = false;
    private track: MusicTrack | null = null;
    private level = 1;
    private voices = new Set<Voice>();
    private lastPlayed = new Map<SfxId, number>();
    constructor(backend: AudioBackend, storage?: AudioStorage, now = () => performance.now() / 1000, random = Math.random) {
        this.backend = backend; this.storage = storage; this.now = now; this.random = random;
        let saved: unknown;
        try { saved = JSON.parse(storage?.getItem(AUDIO_STORAGE_KEY) ?? 'null'); } catch { /* Storage is optional. */ }
        this.values = audioSettings(saved);
        backend.mix(this.values);
    }
    get settings(): Readonly<AudioSettings> { return { ...this.values }; }
    get activeVoices(): number { return this.voices.size; }
    unlock(): void {
        if (this.disposed) return;
        this.unlocked = this.backend.unlock();
        this.backend.pause(this.paused);
        this.backend.music(this.track, this.level);
    }
    configure(patch: Partial<AudioSettings>): void {
        if (this.disposed) return;
        this.values = audioSettings({ ...this.values, ...patch });
        if (this.values.muted || this.values.sfxVolume === 0) this.clearSfx();
        this.backend.mix(this.values);
        try { this.storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.values)); } catch { /* Private/full storage. */ }
    }
    setMusic(track: MusicTrack | null, level = 1): void {
        const safeLevel = volume(level, 1);
        if (this.disposed || this.track === track && this.level === safeLevel) return;
        this.track = track; this.level = safeLevel;
        this.backend.music(track, safeLevel);
    }
    setPaused(paused: boolean): void {
        if (this.disposed || this.paused === paused) return;
        this.paused = paused;
        if (paused) this.clearSfx();
        this.backend.pause(paused);
    }
    play(id: SfxId): boolean {
        if (this.disposed || !this.unlocked || this.paused || this.values.muted || this.values.sfxVolume === 0) return false;
        const spec = SFX[id], now = this.now();
        if (now - (this.lastPlayed.get(id) ?? -Infinity) < spec.cooldown) return false;
        if ([...this.voices].filter(v => v.id === id).length >= spec.voices) return false;
        if (this.voices.size >= MAX_SFX_VOICES) {
            const lowest = [...this.voices].sort((a, b) => a.priority - b.priority)[0];
            if (lowest.priority >= spec.priority) return false;
            this.voices.delete(lowest); lowest.stop();
        }
        const variation = (this.random() * 2 - 1) * spec.variation;
        const voice: Voice = { id, priority: spec.priority, stop: () => {} };
        const stop = this.backend.play(id, spec.gain * (1 - Math.abs(variation)), spec.rate * (1 + variation),
            () => this.voices.delete(voice));
        // Unloaded effects are dropped, never queued for a late burst.
        if (!stop) return false;
        voice.stop = stop; this.voices.add(voice); this.lastPlayed.set(id, now);
        return true;
    }
    clearSfx(): void {
        for (const voice of this.voices) voice.stop();
        this.voices.clear(); this.lastPlayed.clear();
    }
    reset(): void {
        this.clearSfx(); this.setMusic(null); this.setPaused(false);
    }
    dispose(): void {
        if (this.disposed) return;
        this.reset(); this.disposed = true; this.backend.dispose();
    }
}
