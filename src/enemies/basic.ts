import { direction } from '../combat.ts';
import { distance, type Point } from '../physics.ts';
import { ENEMY_STATS } from '../stats.ts';
import { stopped, type Enemy, type Intent } from './types.ts';
export function updateBasic(enemy: Enemy, player: Point, dt: number, visible: boolean): Intent {
    const stats = ENEMY_STATS.basic;
    enemy.timer = Math.max(0, enemy.timer - dt);
    enemy.aim = direction(enemy, player);
    if (enemy.state === 'recovery') {
        if (enemy.timer <= 0)
            enemy.state = 'chase';
        return stopped();
    }
    if (enemy.state === 'windup') {
        if (enemy.timer > 0)
            return stopped();
        enemy.state = 'recovery';
        enemy.timer = stats.recovery;
        return { velocity: { x: 0, z: 0 }, hit: visible && distance(enemy, player) <= stats.hitRange ? stats.damage : undefined };
    }
    if (visible && distance(enemy, player) <= stats.attackRange) {
        enemy.state = 'windup';
        enemy.timer = stats.windup;
        return stopped();
    }
    return { velocity: { x: enemy.aim.x * stats.speed, z: enemy.aim.z * stats.speed } };
}
