import { direction } from '../combat.ts';
import { distance, type Point } from '../physics.ts';
import { ENEMY_STATS } from '../stats.ts';
import { stopped, type Enemy, type Intent } from './types.ts';
export function updateRunner(enemy: Enemy, player: Point, dt: number, visible: boolean): Intent {
    const stats = ENEMY_STATS.runner;
    enemy.timer = Math.max(0, enemy.timer - dt);
    if (enemy.state === 'recovery') {
        if (enemy.timer <= 0)
            enemy.state = 'chase';
        return stopped();
    }
    if (enemy.state === 'windup') {
        enemy.aim = { ...enemy.dir };
        if (enemy.timer <= 0) {
            enemy.state = 'dash';
            enemy.timer = stats.dashDuration;
            enemy.dashHit = false;
        }
        return stopped();
    }
    if (enemy.state === 'dash') {
        enemy.aim = { ...enemy.dir };
        if (enemy.timer <= 0) {
            enemy.state = 'recovery';
            enemy.timer = stats.recovery;
            return stopped();
        }
        return { velocity: { x: enemy.dir.x * stats.dashSpeed, z: enemy.dir.z * stats.dashSpeed } };
    }
    enemy.aim = direction(enemy, player);
    if (visible && distance(enemy, player) <= stats.triggerRange) {
        // The advertised direction is kept through windup AND the entire dash.
        enemy.dir = { ...enemy.aim };
        enemy.state = 'windup';
        enemy.timer = stats.windup;
        return stopped();
    }
    return { velocity: { x: enemy.aim.x * stats.speed, z: enemy.aim.z * stats.speed } };
}
