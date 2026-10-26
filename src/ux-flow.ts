import type { Phase } from './waves.ts';

export type Screen = 'menu' | 'playing' | 'pause' | 'how' | 'settings' | 'confirm' | 'gameover' | 'victory' | 'transition' | 'error';
export type Action = 'play' | 'how' | 'settings' | 'back' | 'continue' | 'restart' | 'menu' | 'accept' | 'cancel';
export const TRANSITION_HALF = .18;
interface Hooks { reset(): void; begin(): void; pause(value: boolean): void }
export function gameplayInput(screen: Screen, phase: Phase): boolean {
    return screen === 'playing' && ['combat', 'cleared', 'travel'].includes(phase);
}
/** Navigation owns no gameplay data. A run is replaced only under the transition veil. */
export class UXFlow {
    screen: Screen = 'menu';
    parent: 'menu' | 'pause' = 'menu';
    confirmation: 'restart' | 'menu' = 'restart';
    private destination: 'playing' | 'menu' = 'playing';
    private transitionTime = 0;
    private swapped = false;
    private pauseOnStart = false;
    private hooks: Hooks;
    constructor(hooks: Hooks) { this.hooks = hooks; }
    get ambient(): boolean {
        if (this.screen === 'transition') return this.swapped ? this.destination === 'menu' : this.parent === 'menu';
        return this.screen === 'menu' || (['how', 'settings'].includes(this.screen) && this.parent === 'menu');
    }
    get fade(): number {
        return this.screen === 'transition' ? Math.max(0, 1 - Math.abs(this.transitionTime / TRANSITION_HALF - 1)) : 0;
    }
    action(action: Action): void {
        const screen = this.screen;
        if (action === 'back' || action === 'cancel') {
            if (screen === 'settings' || screen === 'how') this.screen = this.parent;
            if (screen === 'confirm') this.screen = 'pause';
        } else if (action === 'settings' && (screen === 'menu' || screen === 'pause')) {
            this.parent = screen; this.screen = 'settings';
        } else if (action === 'how' && screen === 'menu') {
            this.parent = 'menu'; this.screen = 'how';
        } else if (action === 'continue' && screen === 'pause') {
            this.screen = 'playing'; this.hooks.pause(false);
        } else if (action === 'play' && ['menu', 'gameover', 'victory'].includes(screen)) {
            this.transition('playing');
        } else if ((action === 'restart' || action === 'menu') && screen === 'pause') {
            this.confirmation = action; this.screen = 'confirm';
        } else if (action === 'accept' && screen === 'confirm') {
            this.transition(this.confirmation === 'restart' ? 'playing' : 'menu');
        } else if (action === 'menu' && (screen === 'gameover' || screen === 'victory')) {
            this.transition('menu');
        }
    }
    escape(): void {
        if (this.screen === 'playing') this.pause();
        else if (this.screen === 'pause') this.action('continue');
        else this.action('back');
    }
    pause(): void {
        if (this.screen === 'transition') { this.pauseOnStart = true; return; }
        if (this.screen !== 'playing') return;
        this.screen = 'pause'; this.hooks.pause(true);
    }
    sync(phase: Phase): void {
        if (this.screen !== 'playing') return;
        if (phase === 'dead') this.screen = 'gameover';
        if (phase === 'complete') this.screen = 'victory';
    }
    fail(): void { this.screen = 'error'; this.hooks.pause(true); }
    private transition(destination: 'playing' | 'menu'): void {
        this.parent = this.screen === 'menu' ? 'menu' : 'pause';
        this.destination = destination; this.transitionTime = 0; this.swapped = false; this.pauseOnStart = false;
        this.screen = 'transition'; this.hooks.pause(true);
    }
    update(dt: number): void {
        if (this.screen !== 'transition') return;
        this.transitionTime += Math.max(0, dt);
        if (!this.swapped && this.transitionTime >= TRANSITION_HALF) {
            this.swapped = true; this.hooks.reset();
        }
        if (this.transitionTime + 1e-9 < TRANSITION_HALF * 2) return;
        this.screen = this.destination;
        if (this.destination === 'playing') {
            this.hooks.begin();
            if (this.pauseOnStart) this.pause();
            else this.hooks.pause(false);
        } else { this.parent = 'menu'; this.hooks.pause(false); }
    }
}
