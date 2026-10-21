import { applyStatusMaterial } from './status-material';
import * as T from 'three';
import { BOSS_STATS, type Boss } from './boss';
import { batchRigid, box, cylinder, glow, palette, ring, sharedPrimitiveGeometries, sphere } from './models';

/** Heavy four-legged chassis with two rotary cannons, independent of normal robot variants. */
export class BossView {
    readonly root = new T.Group();
    private body = new T.Group();
    private legs: T.Group[] = [];
    private cannons: T.Group[] = [];
    private statusBase = new T.Color(0x5b3836);
    private armor = palette.armor.clone();
    private core = glow(0xff753b, 2.5);
    private halo = ring(this.root, 0xff7547, 1.65, .055);
    private pulse = ring(this.root, 0xffa64f, 1.7, .07, .08);
    private charge: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
    private radial = new T.Group();
    private split = new T.Group();
    constructor() {
        this.root.add(this.body, this.radial, this.split);
        box(this.body, palette.dark, 0, 1.65, 0, 1.9, 1, 1.4);
        box(this.body, this.armor, 0, 2.15, -.12, 2.05, .7, 1.35).rotation.x = -.15;
        box(this.body, palette.steel, 0, 1.3, .25, 1.55, .38, 1.5);
        box(this.body, palette.black, 0, 2.15, .64, .95, .5, .1);
        sphere(this.body, this.core, 0, 2.15, .73, .29, .29, .1);
        box(this.body, palette.dark, 0, 2.86, 0, 1.05, .5, .8);
        box(this.body, this.armor, 0, 3.13, -.08, 1.2, .18, .85);
        box(this.body, this.core, 0, 2.91, .42, .8, .1, .055);
        for (const side of [-1, 1]) {
            box(this.body, palette.steel, side * .7, 2.45, -.8, .4, .9, .42);
            cylinder(this.body, palette.dark, side * .7, 3, -.8, .18, .4);
            cylinder(this.body, this.core, side * .7, 3.22, -.8, .12, .05);
            box(this.body, this.armor, side * 1.2, 2.3, 0, .65, .72, 1.05).rotation.z = side * -.15;
            const cannon = new T.Group(); cannon.position.set(side * 1.18, 1.85, .35);
            this.body.add(cannon); this.cannons.push(cannon);
            cylinder(cannon, palette.dark, 0, 0, .15, .4, .65).rotation.x = Math.PI / 2;
            for (let i = 0; i < 3; i++) {
                const a = i * Math.PI * 2 / 3, x = Math.cos(a) * .21, y = Math.sin(a) * .21;
                cylinder(cannon, palette.steel, x, y, .58, .12, .8).rotation.x = Math.PI / 2;
                cylinder(cannon, this.core, x, y, 1, .085, .04).rotation.x = Math.PI / 2;
            }
            batchRigid(cannon);
            for (const front of [-1, 1]) {
                const leg = new T.Group(); leg.position.set(side * .88, 1.15, front * .62);
                box(leg, palette.steel, side * .15, -.2, 0, .42, .6, .45).rotation.z = side * -.3;
                sphere(leg, palette.dark, side * .22, -.46, .05, .28, .25, .28);
                box(leg, this.armor, side * .25, -.7, .12, .52, .48, .58);
                box(leg, palette.dark, side * .27, -1.03, .25, .65, .23, .92);
                box(leg, this.core, side * .25, -.7, .43, .26, .055, .035);
                batchRigid(leg); this.body.add(leg); this.legs.push(leg);
            }
        }
        batchRigid(this.body);
        const material = new T.MeshBasicMaterial({ color: 0xff723e, transparent: true, opacity: .22, side: T.DoubleSide, depthWrite: false, toneMapped: false });
        this.charge = new T.Mesh(new T.PlaneGeometry(BOSS_STATS.radius * 2, BOSS_STATS.chargeSpeed * BOSS_STATS.chargeDuration + BOSS_STATS.radius * 2), material);
        this.charge.rotation.x = -Math.PI / 2; this.root.add(this.charge);
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6;
            const marker = box(this.radial, material, Math.sin(a) * 2.5, .065, Math.cos(a) * 2.5, .1, .015, .9);
            marker.rotation.y = a;
        }
        for (const a of [-BOSS_STATS.splitAngle, 0, BOSS_STATS.splitAngle]) {
            const marker = box(this.split, material, Math.sin(a) * 3.3, .065, Math.cos(a) * 3.3, .09, .015, 3.1);
            marker.rotation.y = a;
        }
    }
    update(boss: Boss, time: number, burning = 0, frosted = false, burnPulse = 0): void {
        (this.halo.material as T.MeshBasicMaterial).color.setHex(burning ? 0xffb036 : 0xff7547);
        this.statusBase.setHex(boss.hitFlash > 0 ? 0xe3c3a5 : 0x5b3836);
        applyStatusMaterial(this.armor, this.statusBase, burning * 1.1, frosted, burnPulse * .6);
        this.root.position.set(boss.x, 0, boss.z);
        this.body.rotation.y = Math.atan2(boss.aim.x, boss.aim.z);
        this.body.position.y = Math.sin(time * 10) * (boss.walking ? .055 : .012);
        this.body.rotation.x = boss.state === 'charge' ? .12 : boss.state === 'phase-change' ? Math.sin(time * 25) * .12 : 0;
        this.legs.forEach((leg, i) => leg.rotation.x = boss.walking ? Math.sin(time * 10 + i * Math.PI / 2) * .25 : 0);
        this.cannons.forEach(cannon => { cannon.position.z = .35 - boss.recoil * .22; cannon.rotation.z = time * (boss.state === 'split' ? 8 : .7); });
        this.core.emissiveIntensity = (boss.phase === 2 ? 5 : 2.5) + boss.hitFlash * 16 + boss.recoil
            + (boss.state === 'phase-change' ? 3 * boss.timer / BOSS_STATS.phaseReaction : 0);
        this.core.color.setHex(boss.phase === 2 ? 0xff462d : 0xff753b);
        this.core.emissive.copy(this.core.color);
        const warning = boss.state === 'windup';
        this.halo.scale.setScalar(warning ? 1.06 + Math.sin(time * 18) * .07 : 1);
        this.halo.visible = boss.state !== 'dead';
        this.pulse.visible = boss.state === 'phase-change';
        this.pulse.scale.setScalar(1 + (1 - boss.timer / BOSS_STATS.phaseReaction) * 5);
        (this.pulse.material as T.MeshBasicMaterial).opacity = boss.timer / BOSS_STATS.phaseReaction;
        (this.pulse.material as T.MeshBasicMaterial).color.setHex(0xff6130);
        this.charge.visible = warning && boss.pattern === 'charge';
        const length = BOSS_STATS.chargeSpeed * BOSS_STATS.chargeDuration;
        const chargeDirection = warning && boss.chargeIndex === 1 ? boss.aim : boss.dir;
        this.charge.position.set(chargeDirection.x * length / 2, .065, chargeDirection.z * length / 2);
        this.charge.rotation.set(-Math.PI / 2, 0, Math.atan2(chargeDirection.x, chargeDirection.z));
        this.charge.material.opacity = (boss.phase === 2 ? .31 : .23) + Math.sin(time * 18) * .045;
        this.radial.visible = warning && boss.pattern === 'radial' || boss.state === 'radial';
        this.radial.rotation.y = boss.state === 'radial' ? -BOSS_STATS.radialOffset : 0;
        this.split.visible = warning && boss.pattern === 'split';
        this.split.rotation.y = Math.atan2(boss.aim.x, boss.aim.z);
    }
    dispose(): void {
        this.root.removeFromParent();
        const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
        const shared = new Set<T.Material>(Object.values(palette));
        this.root.traverse(object => {
            if (!(object instanceof T.Mesh)) return;
            if (!sharedPrimitiveGeometries.has(object.geometry)) geometries.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material])
                if (!shared.has(material)) materials.add(material);
        });
        geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    }
}
