import { DEFAULT_AUDIO, MUSIC_FILES, MUSIC_TRIM, SFX, type AudioBackend, type AudioSettings, type MusicTrack, type SfxId } from './audio.ts';

/** One streaming music element; decoded, shared SFX buffers and short-lived source nodes. */
export class BrowserAudio implements AudioBackend {
    private context?: AudioContext;
    private musicElement?: HTMLAudioElement;
    private musicSource?: MediaElementAudioSourceNode;
    private master?: GainNode;
    private musicBus?: GainNode;
    private sfxBus?: GainNode;
    private compressor?: DynamicsCompressorNode;
    private buffers = new Map<string, AudioBuffer>();
    private loading = new Set<string>();
    private failed = new Set<string>();
    private sources = new Set<() => void>();
    private abort = new AbortController();
    private settings: AudioSettings = { ...DEFAULT_AUDIO };
    private desired: MusicTrack | null = null;
    private current: MusicTrack | null = null;
    private level = 1;
    private paused = false;
    private disposed = false;
    private switchTimer?: ReturnType<typeof setTimeout>;
    private needsPlay = false;
    private fadeOut = false;
    private base: string;
    constructor(base = '/audio/') { this.base = base; }
    unlock(): boolean {
        if (this.disposed) return false;
        try {
            if (!this.context) {
                this.context = new AudioContext();
                this.master = this.context.createGain();
                this.musicBus = this.context.createGain(); this.sfxBus = this.context.createGain();
                this.master.gain.value = this.settings.muted ? 0 : 1;
                this.musicBus.gain.value = 0; this.sfxBus.gain.value = this.settings.sfxVolume;
                this.compressor = this.context.createDynamicsCompressor();
                this.compressor.threshold.value = -8; this.compressor.knee.value = 12;
                this.compressor.ratio.value = 4; this.compressor.attack.value = .003; this.compressor.release.value = .15;
                this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
                this.master.connect(this.compressor); this.compressor.connect(this.context.destination);
                this.musicElement = new Audio(); this.musicElement.loop = true; this.musicElement.preload = 'auto';
                this.musicElement.addEventListener('error', () => this.warn(`music:${this.current}`));
                this.musicSource = this.context.createMediaElementSource(this.musicElement);
                this.musicSource.connect(this.musicBus);
                this.mix(this.settings);
                for (const file of new Set(Object.values(SFX).map(s => s.file))) void this.load(file);
            }
            // Repeated gestures can recover a browser-interrupted/suspended context.
            void this.context.resume().catch(error => { if (error?.name !== 'NotAllowedError') this.warn('resume'); });
            if (!this.switchTimer) this.syncMusic();
            if (!this.paused && this.current && this.needsPlay) this.playMusic();
            return true;
        } catch { this.warn('unavailable'); return false; }
    }
    private warn(key: string): void {
        if (this.failed.has(key) || this.disposed) return;
        this.failed.add(key);
        console.warn(`[Audio] No se pudo cargar o reproducir ${key}. El juego continúa sin ese audio.`);
    }
    private async load(file: string): Promise<void> {
        if (this.loading.has(file) || this.buffers.has(file) || this.disposed) return;
        this.loading.add(file);
        try {
            const response = await fetch(this.base + file, { signal: this.abort.signal });
            if (!response.ok) throw new Error(String(response.status));
            const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
            if (!this.disposed) this.buffers.set(file, buffer);
        } catch { if (!this.disposed) this.warn(file); }
        finally { this.loading.delete(file); }
    }
    private ramp(node: GainNode | undefined, value: number, seconds = .025): void {
        if (!node || !this.context) return;
        const now = this.context.currentTime;
        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.linearRampToValueAtTime(value, now + seconds);
    }
    private get musicGain(): number { return this.settings.musicVolume * this.level * (this.current ? MUSIC_TRIM[this.current] : 1); }
    mix(settings: AudioSettings): void {
        this.settings = { ...settings };
        this.ramp(this.master, settings.muted ? 0 : 1);
        this.ramp(this.sfxBus, settings.sfxVolume);
        this.ramp(this.musicBus, this.switchTimer ? 0 : this.musicGain);
    }
    music(track: MusicTrack | null, level: number, fadeOut = false): void {
        this.level = level;
        if (track === this.desired) {
            this.ramp(this.musicBus, this.switchTimer ? 0 : this.musicGain);
            return;
        }
        this.desired = track;
        this.fadeOut = fadeOut;
        this.syncMusic();
    }
    private syncMusic(): void {
        if (!this.musicElement || this.disposed) return;
        if (this.switchTimer) { clearTimeout(this.switchTimer); this.switchTimer = undefined; }
        if (this.current === this.desired) { this.ramp(this.musicBus, this.musicGain); return; }
        const switchTrack = () => {
            this.switchTimer = undefined;
            const element = this.musicElement!;
            element.pause(); element.currentTime = 0;
            this.current = this.desired;
            this.needsPlay = false;
            if (!this.current) {
                element.removeAttribute('src'); element.load();
                return;
            }
            element.src = this.base + MUSIC_FILES[this.current];
            this.musicBus!.gain.cancelScheduledValues(this.context!.currentTime);
            this.musicBus!.gain.setValueAtTime(0, this.context!.currentTime);
            this.ramp(this.musicBus, this.musicGain, .15);
            if (!this.paused) this.playMusic();
        };
        // Reset/end stop immediately; UX can request a short fade to silence before its reset.
        // A single element makes overlapping music impossible.
        if (this.current && (this.desired || this.fadeOut) && !this.paused) {
            this.ramp(this.musicBus, 0, .12);
            this.switchTimer = setTimeout(switchTrack, 125);
        } else switchTrack();
    }
    private playMusic(): void {
        if (!this.musicElement || this.paused || !this.current || this.disposed) return;
        this.needsPlay = false;
        const element = this.musicElement;
        const track = this.current;
        void element.play().catch(error => {
            if (this.disposed || this.current !== track || this.paused || error?.name === 'AbortError') return;
            this.needsPlay = true;
            // Browser policy is expected: retry only on a later user gesture, without warnings.
            if (error?.name !== 'NotAllowedError') this.warn('autoplay');
        });
    }
    pause(paused: boolean): void {
        if (this.paused === paused) return;
        this.paused = paused;
        if (paused) { this.musicElement?.pause(); for (const stop of this.sources) stop(); }
        else if (!this.needsPlay) this.playMusic();
    }
    play(id: SfxId, gain: number, rate: number, ended: () => void): (() => void) | null {
        const buffer = this.buffers.get(SFX[id].file), context = this.context;
        if (!buffer || !context || context.state !== 'running' || this.paused || this.disposed) return null;
        const source = context.createBufferSource(), volume = context.createGain();
        source.buffer = buffer; source.playbackRate.value = rate; volume.gain.value = gain;
        source.connect(volume); volume.connect(this.sfxBus!);
        let finished = false;
        const cleanup = () => {
            if (finished) return;
            finished = true; source.disconnect(); volume.disconnect(); this.sources.delete(stop); ended();
        };
        const stop = () => { if (!finished) { source.stop(); cleanup(); } };
        source.onended = cleanup; this.sources.add(stop); source.start();
        return stop;
    }
    get diagnostics() {
        return { context: this.context?.state ?? 'locked', track: this.current, desired: this.desired,
            musicPaused: this.musicElement?.paused ?? true, musicTime: this.musicElement?.currentTime ?? 0,
            loadedSfx: this.buffers.size, voices: this.sources.size, failures: [...this.failed] };
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.abort.abort();
        if (this.switchTimer) clearTimeout(this.switchTimer);
        for (const stop of this.sources) stop();
        this.musicElement?.pause(); this.musicElement?.removeAttribute('src'); this.musicElement?.load();
        this.musicSource?.disconnect(); this.musicBus?.disconnect(); this.sfxBus?.disconnect();
        this.master?.disconnect(); this.compressor?.disconnect(); this.buffers.clear();
        void this.context?.close().catch(() => {});
    }
}
