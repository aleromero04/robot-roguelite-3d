import { direction } from '../combat.ts';
import { distance, type Bounds, type Obstacle, type Point } from '../physics.ts';
import { ENEMY_STATS } from '../stats.ts';
import { emergenceDestination } from './targeting.ts';
import { isUnderground, stopped, type Enemy, type EnemyContext, type Intent } from './types.ts';
export function updateBurrower(enemy: Enemy, player: Point, peers: readonly Enemy[], dt: number, context: EnemyContext, obstacles: Obstacle[], bounds: Bounds): Intent {
    const stats = ENEMY_STATS.burrower;
    enemy.timer = Math.max(0, enemy.timer - dt);
    enemy.aim = direction(enemy, player);
    if (enemy.state === 'burrow-windup') {
        if (enemy.timer > 0) return stopped();
        const target = emergenceDestination(player, context.playerVelocity, enemy,
            peers.filter(e => e.id !== enemy.id && e.hp > 0 && !isUnderground(e)), obstacles, bounds);
        if (!target) { enemy.state = 'chase'; enemy.timer = 1; return stopped(); }
        enemy.burrowOrigin = { x: enemy.x, z: enemy.z }; enemy.destination = target;
        enemy.state = 'underground'; enemy.timer = stats.underground;
        return { ...stopped(), burrow: true };
    }
    if (enemy.state === 'underground') {
        const t = 1 - enemy.timer / stats.underground, from = enemy.burrowOrigin!, to = enemy.destination!;
        enemy.x = from.x + (to.x - from.x) * t; enemy.z = from.z + (to.z - from.z) * t;
        if (enemy.timer <= 0) { enemy.state = 'emergence'; enemy.timer = stats.emergence; }
        return stopped();
    }
    if (enemy.state === 'emergence') {
        if (enemy.timer > 0) return stopped();
        enemy.state = 'chase'; enemy.timer = stats.active; enemy.destination = undefined;
        return { ...stopped(), emerged: true, hit: distance(enemy, player) <= stats.emergenceRadius ? stats.damage : undefined };
    }
    if (enemy.timer <= 0) { enemy.state = 'burrow-windup'; enemy.timer = stats.burrowWindup; return stopped(); }
    return { velocity: { x: enemy.aim.x * stats.speed, z: enemy.aim.z * stats.speed } };
}
