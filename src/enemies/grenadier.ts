import { direction } from '../combat.ts';
import { distance, type Bounds, type Obstacle, type Point } from '../physics.ts';
import { ENEMY_STATS } from '../stats.ts';
import { GRENADE, canThrowGrenade } from '../hazards.ts';
import { clearArea, grenadeDestination } from './targeting.ts';
import { stopped, type Enemy, type EnemyContext, type Intent } from './types.ts';
export function updateGrenadier(enemy: Enemy, player: Point, dt: number, _visible: boolean, context: EnemyContext, obstacles: Obstacle[], bounds: Bounds): Intent {
    const stats = ENEMY_STATS.grenadier;
    const d = distance(enemy, player);
    const reposition = (): Intent => {
        const dir = direction(enemy, player), sign = d < stats.near ? -1 : d > stats.far ? 1 : 0;
        return { velocity: { x: dir.x * stats.speed * sign, z: dir.z * stats.speed * sign } };
    };
    enemy.timer = Math.max(0, enemy.timer - dt);
    enemy.aim = direction(enemy, enemy.destination ?? player);
    if (enemy.state === 'recovery') {
        if (enemy.timer <= 0) { enemy.state = 'chase'; enemy.destination = undefined; }
        return reposition();
    }
    if (enemy.state === 'aim') {
        if (enemy.timer > 0) return stopped();
        enemy.state = 'recovery'; enemy.timer = stats.recovery;
        const target = enemy.destination;
        const valid = target && clearArea(target, GRENADE.radius, obstacles, bounds)
            && context.thermal.every(z => distance(z, target) >= GRENADE.radius * 2 + .5);
        return { velocity: { x: 0, z: 0 }, grenade: valid && (context.grenadeAllowed !== false && canThrowGrenade(enemy.id, context.thermal)) ? { ...target } : undefined };
    }
    // Lobbed artillery does not need a direct firing lane. The landing area is still validated.
    // Retreat during recovery, but always take a legal shot: never kite forever without firing.
    if (d <= stats.range && (context.grenadeAllowed !== false && canThrowGrenade(enemy.id, context.thermal))) {
        const target = grenadeDestination(player, context.playerVelocity, GRENADE.radius, context.thermal, obstacles, bounds);
        if (target) { enemy.destination = target; enemy.state = 'aim'; enemy.timer = stats.windup; return stopped(); }
    }
    return reposition();
}
