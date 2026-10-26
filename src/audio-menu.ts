import { GameAudio } from './audio.ts';
import type { Screen, UXFlow } from './ux-flow.ts';

/** Menu music uses Audio v1; navigation and gameplay remain the owners of their states. */
export class MenuAudio {
    private audio: GameAudio;
    constructor(audio: GameAudio) { this.audio = audio; }
    update(ux: Pick<UXFlow, 'screen' | 'ambient'>): void {
        // Never play Airy under a run reset or before the return-to-menu transition finishes.
        if (ux.ambient && ux.screen !== 'transition') this.audio.setMusic('menu');
    }
    pause(value: boolean, screen: Screen): void {
        if (value && screen === 'transition') {
            this.audio.clearSfx();
            this.audio.setMusic(null, 1, true);
        } else this.audio.setPaused(value);
    }
}
