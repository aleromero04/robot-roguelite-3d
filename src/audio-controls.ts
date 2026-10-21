import { GameAudio, type AudioStorage } from './audio.ts';

export function browserAudioStorage(): AudioStorage | undefined {
    try { return window.localStorage; } catch { return undefined; }
}
/** The panel owns its keyboard input; opening it pauses a live run. */
export function bindAudioControls(audio: GameAudio, pause: () => void, clearKeys: () => void): () => void {
    const panel = document.querySelector<HTMLDetailsElement>('#audio-controls')!;
    const mute = panel.querySelector<HTMLButtonElement>('#audio-mute')!;
    const music = panel.querySelector<HTMLInputElement>('#music-volume')!;
    const sfx = panel.querySelector<HTMLInputElement>('#sfx-volume')!;
    const abort = new AbortController(), options = { signal: abort.signal };
    const render = () => {
        const settings = audio.settings;
        mute.textContent = settings.muted ? 'ACTIVAR AUDIO' : 'SILENCIAR';
        mute.setAttribute('aria-pressed', String(settings.muted));
        music.value = String(Math.round(settings.musicVolume * 100));
        sfx.value = String(Math.round(settings.sfxVolume * 100));
        panel.querySelector('#music-value')!.textContent = `${music.value}%`;
        panel.querySelector('#sfx-value')!.textContent = `${sfx.value}%`;
        panel.querySelector('summary')!.textContent = settings.muted ? 'AUDIO · OFF' : 'AUDIO';
    };
    panel.addEventListener('pointerdown', () => { clearKeys(); audio.unlock(); }, options);
    panel.addEventListener('focusin', clearKeys, options);
    panel.addEventListener('keydown', event => {
        if (event.code === 'Escape') { panel.open = false; (document.activeElement as HTMLElement)?.blur(); }
        event.stopPropagation(); clearKeys(); audio.unlock();
    }, options);
    panel.addEventListener('keyup', event => { event.stopPropagation(); clearKeys(); }, options);
    panel.addEventListener('toggle', () => { if (panel.open) pause(); }, options);
    mute.addEventListener('click', () => { audio.configure({ muted: !audio.settings.muted }); render(); }, options);
    music.addEventListener('input', () => { audio.configure({ musicVolume: Number(music.value) / 100 }); render(); }, options);
    sfx.addEventListener('input', () => { audio.configure({ sfxVolume: Number(sfx.value) / 100 }); render(); }, options);
    render();
    return () => abort.abort();
}
