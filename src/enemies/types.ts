import type { Point } from '../physics.ts';
import type { ThermalZone } from '../hazards.ts';
import type { EnemyKind } from '../stats.ts';
export type EnemyState = 'chase' | 'windup' | 'dash' | 'aim' | 'recovery' | 'burrow-windup' | 'underground' | 'emergence';
export interface Enemy extends Point {
    id: number;
    kind: EnemyKind;
    hp: number;
    maxHp: number;
    state: EnemyState;
    timer: number;
    dir: Point;
    aim: Point;
    dashHit: boolean;
    walking: boolean;
    detour?: Point;
    destination?: Point;
    burrowOrigin?: Point;
    lead?: boolean;
}
export interface Intent {
    velocity: Point;
    hit?: number;
    fire?: boolean;
    fireTarget?: Point;
    grenade?: Point;
    burrow?: boolean;
    emerged?: boolean;
}
export const stopped = (): Intent => ({ velocity: { x: 0, z: 0 } });

export interface EnemyContext {
    playerVelocity: Point;
    sector: number;
    random: () => number;
    thermal: readonly ThermalZone[];
    grenadeAllowed?: boolean;
    locomotionMultiplier?: number;
}
export const isUnderground = (enemy: Enemy): boolean => enemy.kind === 'burrower' && (enemy.state === 'underground' || enemy.state === 'emergence');
