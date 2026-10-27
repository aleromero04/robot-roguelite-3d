import type { Simulation } from './simulation.ts';
import type { Point } from './physics.ts';

export const TUTORIAL_KEY = 'core07.tutorial.v1.completed';
/** Seconds of active gameplay; these timings never affect Simulation. */
export const TUTORIAL_TIMINGS = {
    completeFeedback: .35,
    betweenStepsDelay: .6,
    stopToAttackMinVisible: 1.2,
    dashMinVisible: .8,
} as const;
export type TutorialStep = 'inactive' | 'movement' | 'stopToAttack' | 'dash' | 'waitingForReward' | 'collectReward' | 'completed';
export interface TutorialStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
const NEXT = { movement: 'stopToAttack', stopToAttack: 'dash', dash: 'waitingForReward' } as const;

/** Observes facts from the current run. Never changes Simulation or consumes its events. */
export class TutorialController {
    step: TutorialStep = 'inactive';
    confirmed = false;
    separating = false;
    private completed = false;
    private storage?: TutorialStorage;
    private previous: Point = { x: 0, z: 0 };
    private walked = 0;
    private fired = false;
    private dashed = false;
    private collected = false;
    private feedbackTime = 0;
    private separationTime = 0;
    private visibleTime = 0;
    constructor(storage?: TutorialStorage) {
        this.storage = storage;
        try { this.completed = storage?.getItem(TUTORIAL_KEY) === 'true'; } catch { /* Session-only fallback. */ }
    }
    start(sim: Simulation): void {
        this.stop(); this.previous = { x: sim.player.x, z: sim.player.z };
        this.walked = 0; this.fired = false; this.dashed = false; this.collected = false;
        if (!this.completed && sim.progression.wave === 0) this.step = 'movement';
    }
    stop(): void {
        this.step = 'inactive'; this.confirmed = false; this.separating = false;
        this.feedbackTime = 0; this.separationTime = 0; this.visibleTime = 0;
    }
    repeat(): void {
        this.completed = false;
        try { this.storage?.removeItem(TUTORIAL_KEY); } catch { /* Replays still work in this session. */ }
    }
    update(sim: Simulation, input: Point, dt: number, paused = false): void {
        if (paused || this.step === 'inactive' || this.step === 'completed') return;
        if (sim.player.hp <= 0 || sim.progression.phase === 'dead' || sim.progression.wave !== 0) { this.stop(); return; }
        const p = sim.player;
        if (p.walking && p.dashTime === 0 && Math.hypot(input.x, input.z) > .001)
            this.walked += Math.hypot(p.x - this.previous.x, p.z - this.previous.z);
        this.previous = { x: p.x, z: p.z };
        const elapsed = Math.max(0, dt);
        const accepting = !this.confirmed && !this.separating;
        // Test elapsed visibility BEFORE this tick: never buffer an event from the reading window.
        for (const event of sim.events) {
            if (accepting && this.step === 'stopToAttack' && this.visibleTime >= TUTORIAL_TIMINGS.stopToAttackMinVisible
                && event.type === 'shot' && !event.enemy && !p.moving) this.fired = true;
            if (accepting && this.step === 'dash' && this.visibleTime >= TUTORIAL_TIMINGS.dashMinVisible
                && event.type === 'dash') this.dashed = true;
            if (event.type === 'reward-pickup') this.collected = true;
        }
        if (this.collected) {
            if (this.walked >= .6 && this.fired && this.dashed) {
                this.completed = true; this.step = 'completed'; this.confirmed = false; this.separating = false;
                try { this.storage?.setItem(TUTORIAL_KEY, 'true'); } catch { /* Keep completion in memory. */ }
            } else this.stop(); // Never obstruct cards/travel if a player skipped an action.
            return;
        }
        // The physical reward takes priority over a pending message animation.
        if (sim.reward && sim.progression.phase === 'cleared') {
            this.step = 'collectReward'; this.confirmed = false; this.separating = false; this.feedbackTime = 0; return;
        }
        if (this.confirmed) {
            this.feedbackTime -= elapsed;
            if (this.feedbackTime <= 0) {
                this.confirmed = false; this.separating = true;
                this.separationTime = TUTORIAL_TIMINGS.betweenStepsDelay;
            }
            return;
        }
        if (this.separating) {
            this.separationTime -= elapsed;
            if (this.separationTime <= 0 && this.step in NEXT) {
                this.step = NEXT[this.step as keyof typeof NEXT]; this.separating = false; this.visibleTime = 0;
            }
            return;
        }
        this.visibleTime += elapsed;
        const achieved = this.step === 'movement' && this.walked >= .6
            || this.step === 'stopToAttack' && this.fired || this.step === 'dash' && this.dashed;
        if (achieved) { this.confirmed = true; this.feedbackTime = TUTORIAL_TIMINGS.completeFeedback; }
    }
}
