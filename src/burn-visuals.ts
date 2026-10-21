/** Presentation only: never feeds damage, targeting or status timers. */
export const BURN_FADE = .5;
export class BurnVisuals {
    private tails = new Map<number, number>();
    private active = new Set<number>();
    update(dt: number, burning: ReadonlyMap<number, unknown>, alive: ReadonlySet<number>): void {
        this.active = new Set([...burning.keys()].filter(id => alive.has(id)));
        for (const [id, remaining] of this.tails) {
            if (!alive.has(id) || (!this.active.has(id) && remaining - dt <= 1e-9)) this.tails.delete(id);
            else if (!this.active.has(id)) this.tails.set(id, remaining - dt);
        }
        for (const id of this.active) this.tails.set(id, BURN_FADE);
    }
    strength(id: number): number { return this.active.has(id) ? 1 : (this.tails.get(id) ?? 0) / BURN_FADE; }
    clear(): void { this.tails.clear(); this.active.clear(); }
}
