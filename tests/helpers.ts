import type { Simulation } from '../src/simulation.ts';
import { TestNavigator } from './pilot.ts';
import { roomBounds } from '../src/layout.ts';
import { distance } from '../src/physics.ts';
export function seededRandom(seed = 12345): () => number {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

export function walkToReward(sim: Simulation): number {
    const nav = new TestNavigator(); let maxStep = 0;
    for (let i = 0; i < 1800 && sim.progression.phase === 'cleared' && sim.reward; i++) {
        const before = { x: sim.player.x, z: sim.player.z };
        sim.update(1 / 60, nav.toward(sim.player, sim.reward, sim.obstacles, roomBounds(sim.progression.wave)));
        maxStep = Math.max(maxStep, distance(before, sim.player));
    }
    if (sim.progression.phase !== 'upgrade') throw new Error(`Reward not collected: ${sim.progression.phase}`);
    return maxStep;
}
