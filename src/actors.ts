import { applyStatusMaterial } from './status-material';
import { overdriveActive, UPGRADE_VALUES } from './upgrades';
import type { BurnVisuals } from './burn-visuals';
import * as T from 'three';
import { HazardView } from './hazard-view';
import { isUnderground } from './enemies/types';
import { DAMAGE_FEEDBACK } from './player';
import { RewardView } from './reward-model';
import { BossView } from './boss-model';
import { animateRobot, flashPlayer, createRobot, disposeRobot, type Robot } from './models';
import { ENEMY_STATS } from './stats';
import { SPAWN_DELAY, SPAWN_FADE, type Simulation } from './simulation';
export class Actors {
    private overdrive = new T.Mesh(new T.RingGeometry(.95, 1.04, 64), new T.MeshBasicMaterial({ color: 0xffcb62, side: T.DoubleSide, transparent: true, opacity: .8, depthWrite: false, toneMapped: false }));
    private hazards: HazardView;
    private boss?: BossView;
    private reward?: RewardView;
    private shield = new T.Mesh(new T.IcosahedronGeometry(1.12, 1), new T.MeshBasicMaterial({ color: 0x73f6e6, wireframe: true, transparent: true, opacity: .24, depthWrite: false, toneMapped: false }));
    private reviveRing = new T.Mesh(new T.RingGeometry(.9, 1, 48), new T.MeshBasicMaterial({ color: 0xffdb87, transparent: true, opacity: .8, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
    private amber = new T.MeshBasicMaterial({ color: 0xffc765, toneMapped: false });
    readonly player = createRobot('player');
    readonly enemies = new Map<number, Robot>();
    private spawnMarkers = new Map<number, T.Mesh<T.RingGeometry, T.MeshBasicMaterial>>();
    private warnings = new Map<number, T.Mesh>();
    private shots = new Map<number, T.Mesh>();
    private shotGeometry = new T.CapsuleGeometry(.07, .45, 3, 6);
    private cyan = new T.MeshBasicMaterial({ color: 0x8ffff3, toneMapped: false });
    private red = new T.MeshBasicMaterial({ color: 0xff563f, toneMapped: false });
    constructor(private scene: T.Scene) {
        this.hazards = new HazardView(scene);
        scene.add(this.player.root, this.shield, this.reviveRing, this.overdrive);
        this.overdrive.rotation.x = -Math.PI / 2; this.overdrive.visible = false;
        this.shield.visible = false; this.reviveRing.visible = false; this.reviveRing.rotation.x = -Math.PI / 2;
    }
    reset(): void {
        this.hazards.reset(); this.overdrive.visible = false;
        this.reward?.dispose(); this.reward = undefined;
        this.shield.visible = false; this.reviveRing.visible = false; flashPlayer(this.player, 0);
        this.boss?.dispose(); this.boss = undefined;
        for (const marker of this.spawnMarkers.values()) {
            marker.removeFromParent();
            marker.geometry.dispose();
            marker.material.dispose();
        }
        this.spawnMarkers.clear();
        for (const robot of this.enemies.values())
            disposeRobot(robot);
        this.enemies.clear();
        for (const warning of this.warnings.values()) {
            warning.removeFromParent();
            warning.geometry.dispose();
            (warning.material as T.Material).dispose();
        }
        this.warnings.clear();
        for (const shot of this.shots.values())
            shot.removeFromParent();
        this.shots.clear();
        this.player.root.visible = true;
        this.player.hit = 0;
        this.player.recoil = 0;
        this.player.body.rotation.set(0, Math.PI, 0);
    }
    private face(robot: Robot, aim: {
        x: number;
        z: number;
    }, dt: number): void {
        const target = Math.atan2(aim.x, aim.z), current = robot.body.rotation.y;
        robot.body.rotation.y += Math.atan2(Math.sin(target - current), Math.cos(target - current)) * Math.min(1, dt * 15);
    }
    update(sim: Simulation, time: number, dt: number, camera: T.Camera, burnVisuals?: BurnVisuals): void {
        this.hazards.update(sim, time);
        if (sim.reward) {
            if (!this.reward) { this.reward = new RewardView(); this.scene.add(this.reward.root); }
            this.reward.root.position.set(sim.reward.x, 0, sim.reward.z); this.reward.update(time);
        } else if (this.reward) { this.reward.dispose(); this.reward = undefined; }
        if (sim.boss && sim.boss.hp > 0) {
            if (!this.boss) { this.boss = new BossView(); this.scene.add(this.boss.root); }
            const burn = sim.burns.get(sim.boss.id);
            this.boss.update(sim.boss, time, burnVisuals?.strength(sim.boss.id) ?? (burn ? 1 : 0), sim.frost.has(sim.boss.id), burn ? Math.max(0, (burn.nextTick - .38) / .12) : 0);
        } else if (this.boss) { this.boss.dispose(); this.boss = undefined; }
        const p = sim.player;
        this.player.root.visible = p.hp > 0;
        this.player.root.position.set(p.x, 0, p.z);
        this.face(this.player, p.aim, dt);
        this.player.base.rotation.y = Math.atan2(p.lastDir.x, p.lastDir.z);
        animateRobot(this.player, time, p.walking ? 1 : 0, dt, p.stats.speed / 5.7);
        flashPlayer(this.player, Math.min(1, p.damageFlash / DAMAGE_FEEDBACK.robot * 1.8), overdriveActive(p));
        this.overdrive.visible = p.hp > 0 && p.overdriveCharge > 0;
        this.overdrive.position.set(p.x, .065, p.z);
        this.overdrive.geometry.setDrawRange(0, Math.floor(64 * p.overdriveCharge / UPGRADE_VALUES.overdriveCharge) * 6);
        this.overdrive.material.color.setHex(overdriveActive(p) ? 0x7ffff4 : 0xffcb62);
        this.overdrive.material.opacity = overdriveActive(p) ? .75 + .2 * Math.sin(time * 12) : .65;
        this.shield.visible = p.hp > 0 && p.acquired.has('shield') && (!p.shieldSpent || p.shieldPulse > 0);
        this.shield.position.set(p.x, 1.1, p.z); this.shield.rotation.y = time * .65;
        const breaking = p.shieldPulse > 0;
        this.shield.scale.setScalar(breaking ? 1 + (1 - p.shieldPulse / .3) * .65 : 1);
        this.shield.material.opacity = breaking ? p.shieldPulse / .3 * .7 : .2 + Math.sin(time * 3) * .045;
        this.shield.material.color.setHex(breaking ? 0xd8ffff : 0x73f6e6);
        this.reviveRing.visible = p.revivePulse > 0;
        this.reviveRing.position.set(p.x, .09, p.z);
        this.reviveRing.scale.setScalar(1 + (1 - p.revivePulse / .8) * 3);
        this.reviveRing.material.opacity = p.revivePulse / .8;
        this.player.halo.visible = true;
        (this.player.halo.material as T.MeshBasicMaterial).opacity = p.invulnerable > 0 ? .4 + .35 * Math.sin(time * 24) : .7;
        this.player.halo.scale.setScalar(p.invulnerable > 0 ? 1.18 : 1);
        const activeMarkers = new Set(sim.telegraphs.map(t => t.id));
        for (const [id, marker] of this.spawnMarkers) {
            if (activeMarkers.has(id)) continue;
            marker.removeFromParent();
            marker.geometry.dispose();
            marker.material.dispose();
            this.spawnMarkers.delete(id);
        }
        for (const telegraph of sim.telegraphs) {
            let marker = this.spawnMarkers.get(telegraph.id);
            if (!marker) {
                marker = new T.Mesh(new T.RingGeometry(.81, .94, 48), new T.MeshBasicMaterial({
                    color: 0xff873b, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false,
                }));
                marker.rotation.x = -Math.PI / 2;
                this.scene.add(marker);
                this.spawnMarkers.set(telegraph.id, marker);
            }
            marker.position.set(telegraph.x, .055, telegraph.z);
            const pulse = .5 + .5 * Math.sin(telegraph.age * 26);
            marker.scale.setScalar(telegraph.spawned ? 1 + (telegraph.age - SPAWN_DELAY) * 1.5 : .94 + pulse * .12);
            marker.material.opacity = telegraph.spawned
                ? Math.max(0, 1 - (telegraph.age - SPAWN_DELAY) / SPAWN_FADE)
                : .4 + pulse * .5;
        }
        const alive = new Set(sim.enemies.map(e => e.id));
        for (const [id, robot] of this.enemies)
            if (!alive.has(id)) {
                disposeRobot(robot);
                this.enemies.delete(id);
                const warning = this.warnings.get(id)!;
                warning.removeFromParent();
                warning.geometry.dispose();
                (warning.material as T.Material).dispose();
                this.warnings.delete(id);
            }
        for (const e of sim.enemies) {
            let robot = this.enemies.get(e.id);
            if (!robot) {
                robot = createRobot(e.kind);
                this.scene.add(robot.root);
                this.enemies.set(e.id, robot);
                const warning = new T.Mesh(new T.PlaneGeometry(.6, ENEMY_STATS.runner.dashSpeed * ENEMY_STATS.runner.dashDuration), new T.MeshBasicMaterial({ color: 0xff873b, transparent: true, opacity: .28, side: T.DoubleSide, depthWrite: false }));
                this.scene.add(warning);
                this.warnings.set(e.id, warning);
            }
            robot.root.position.set(e.x, 0, e.z);
            this.face(robot, e.aim, dt);
            robot.base.rotation.y = robot.body.rotation.y;
            animateRobot(robot, time + e.id * .3, e.walking ? 1 : 0, dt, ENEMY_STATS[e.kind].speed / ({ basic: 1.7, runner: 2.7, shooter: 1.8, grenadier: 2, burrower: 2.6 }[e.kind]));
            robot.root.visible = !isUnderground(e);
            robot.health.visible = !isUnderground(e);
            if (e.state === 'burrow-windup') robot.body.position.y *= Math.max(.15, e.timer / ENEMY_STATS.burrower.burrowWindup);
            robot.health.quaternion.copy(camera.quaternion);
            robot.fill.scale.x = .8 * e.hp / e.maxHp;
            robot.fill.position.x = -.4 * (1 - e.hp / e.maxHp);
            robot.body.rotation.x = e.kind === 'runner' ? .15 : 0;
            const burn = sim.burns.get(e.id);
            const heat = burnVisuals?.strength(e.id) ?? (burn ? 1 : 0);
            for (const entry of robot.statusMaterials) applyStatusMaterial(entry.material, entry.base,
                heat * (e.kind === 'shooter' ? .65 : .75), sim.frost.has(e.id), burn ? Math.max(0, (burn.nextTick - .38) / .12) * .5 : 0);
            const telegraph = e.state === 'windup' || e.state === 'aim' || e.state === 'burrow-windup';
            (robot.halo.material as T.MeshBasicMaterial).color.setHex(sim.frost.has(e.id) ? 0x71dfff : heat > 0 ? 0xffb036 : 0xff5a3b);
            robot.halo.scale.setScalar(telegraph ? 1.25 + Math.sin(time * 18) * .12 : 1 + robot.hit * 3);
            if (e.kind === 'basic' && e.state === 'windup')
                robot.body.rotation.x = -.3 + (1 - e.timer / ENEMY_STATS.basic.windup) * .65;
            if (e.kind === 'runner' && e.state === 'windup')
                robot.body.rotation.x = .3;
            if (e.kind === 'shooter' && e.state === 'aim')
                robot.flash.visible = Math.sin(time * 18) > 0;
            const warning = this.warnings.get(e.id)!;
            warning.visible = e.kind === 'runner' && e.state === 'windup';
            const length = ENEMY_STATS.runner.dashSpeed * ENEMY_STATS.runner.dashDuration;
            warning.position.set(e.x + e.dir.x * length / 2, .06, e.z + e.dir.z * length / 2);
            warning.rotation.set(-Math.PI / 2, 0, Math.atan2(e.dir.x, e.dir.z));
            (warning.material as T.MeshBasicMaterial).opacity = .25 + Math.sin(time * 20) * .07;
        }
        const existing = new Set(sim.projectiles.map(s => s.id));
        for (const [id, mesh] of this.shots)
            if (!existing.has(id)) {
                mesh.removeFromParent();
                this.shots.delete(id);
            }
        for (const shot of sim.projectiles) {
            let mesh = this.shots.get(shot.id);
            if (!mesh) {
                mesh = new T.Mesh(this.shotGeometry, shot.splitAfter !== undefined || shot.flame ? this.amber : shot.enemy ? this.red : this.cyan);
                mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(shot.velocity.x, 0, shot.velocity.z).normalize());
                if (shot.enemy)
                    mesh.scale.set(1.8, 1.2, 1.8);
                if (shot.splitAfter !== undefined) mesh.scale.set(2.8, 1.8, 2.8);
                this.scene.add(mesh);
                this.shots.set(shot.id, mesh);
            }
            mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(shot.velocity.x, 0, shot.velocity.z).normalize());
            mesh.position.set(shot.x, 1.05, shot.z);
        }
    }
}
