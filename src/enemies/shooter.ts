import { direction } from '../combat.ts';
import { distance, type Point } from '../physics.ts';
import { ENEMY_STATS } from '../stats.ts';
import { predictPosition } from './targeting.ts';
import { stopped, type Enemy, type EnemyContext, type Intent } from './types.ts';
export const SHOOTER_LEAD = { chances: [0, 0, .1, .2, .3, .38, 0], time: .28, maxDistance: 1.7 } as const;
export function updateShooter(enemy: Enemy, player: Point, dt: number, visible: boolean, context?: EnemyContext): Intent {
    const stats = ENEMY_STATS.shooter;
    enemy.timer = Math.max(0, enemy.timer - dt);
    const target = enemy.state === 'aim' && enemy.lead && context ? predictPosition(player, context.playerVelocity, SHOOTER_LEAD.time, SHOOTER_LEAD.maxDistance) : player;
    enemy.aim = direction(enemy, target);
    if (enemy.state === 'recovery') {
        if (enemy.timer <= 0)
            enemy.state = 'chase';
        return stopped();
    }
    if (enemy.state === 'aim') {
        if (enemy.timer > 0)
            return stopped();
        enemy.state = 'recovery';
        enemy.timer = stats.recovery;
        return { velocity: { x: 0, z: 0 }, fire: visible, fireTarget: { ...target } };
    }
    const d = distance(enemy, player);
    if (d >= stats.near && d <= stats.far && visible) {
        const chance = SHOOTER_LEAD.chances[context?.sector ?? 0] ?? 0;
        enemy.lead = chance > 0 && (context?.random() ?? 1) < chance;
        enemy.state = 'aim';
        enemy.timer = stats.aim;
        return stopped();
    }
    const sign = d < stats.near ? -1 : 1;
    return { velocity: { x: enemy.aim.x * stats.speed * sign, z: enemy.aim.z * stats.speed * sign } };
}
