import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { EnemyKind } from './stats';
export type Kind = 'player' | EnemyKind;
const boxGeometry = new T.BoxGeometry(1, 1, 1);
const armorGeometry = new RoundedBoxGeometry(1, 1, 1, 1, .1);
function chamfer(mesh: T.Mesh): T.Mesh { mesh.geometry = armorGeometry; return mesh; }
const cylinderGeometry = new T.CylinderGeometry(1, 1, 1, 12);
const sphereGeometry = new T.SphereGeometry(1, 12, 8);
export const sharedPrimitiveGeometries = new Set<T.BufferGeometry>([boxGeometry, armorGeometry, cylinderGeometry, sphereGeometry]);
export const mat = (color: number, metalness = .65, roughness = .45) => new T.MeshStandardMaterial({ color, metalness, roughness });
export const glow = (color: number, intensity = 2) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .35 });
export const palette = { dark: mat(0x111c26), steel: mat(0x374a58), edge: mat(0x788994), white: mat(0xb5cbd0), cyan: glow(0x5dece4, 2.4), orange: glow(0xff683d, 2), red: glow(0xff3e55, 2.2), amber: glow(0xffb049, 1.8), black: mat(0x080d14), armor: mat(0x5b3836) };
export function box(parent: T.Object3D, material: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): T.Mesh {
    const m = new T.Mesh(boxGeometry, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}
export function cylinder(parent: T.Object3D, material: T.Material, x: number, y: number, z: number, radius: number, height: number): T.Mesh {
    const m = new T.Mesh(cylinderGeometry, material);
    m.position.set(x, y, z);
    m.scale.set(radius, height, radius);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
}
export function sphere(parent: T.Object3D, material: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): T.Mesh {
    const m = new T.Mesh(sphereGeometry, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
}
export function ring(parent: T.Object3D, color: number, radius: number, width: number, y = .035): T.Mesh {
    const m = new T.Mesh(new T.RingGeometry(radius - width, radius, 48), new T.MeshBasicMaterial({ color, transparent: true, opacity: .7, side: T.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    parent.add(m);
    return m;
}
// Rigid armor is combined by material; the joints and gun remain animatable.
export function batchRigid(parent: T.Group, exclude?: T.Mesh): void {
    const batches = new Map<T.Material, T.Mesh[]>();
    for (const child of parent.children) {
        if (!(child instanceof T.Mesh) || child === exclude || Array.isArray(child.material))
            continue;
        const meshes = batches.get(child.material) ?? [];
        meshes.push(child);
        batches.set(child.material, meshes);
    }
    for (const [material, meshes] of batches) {
        if (meshes.length < 2)
            continue;
        const parts = meshes.map(mesh => {
            mesh.updateMatrix();
            return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
        });
        const merged = mergeGeometries(parts)!;
        parts.forEach(part => part.dispose());
        const result = new T.Mesh(merged, material);
        result.castShadow = true;
        result.receiveShadow = true;
        result.userData.generated = true;
        parent.add(result);
        meshes.forEach(mesh => {
            mesh.removeFromParent();
            if (mesh.geometry instanceof T.TorusGeometry)
                mesh.geometry.dispose();
        });
    }
}
export interface Robot {
    root: T.Group;
    base: T.Group;
    body: T.Group;
    legs: T.Group[];
    gun: T.Group;
    flash: T.Mesh;
    halo: T.Mesh;
    health: T.Group;
    fill: T.Mesh;
    kind: Kind;
    hit: number;
    recoil: number;
    statusMaterials: { material: T.MeshStandardMaterial; base: T.Color }[];
    burnMaterial?: T.MeshStandardMaterial;
    flashMaterials: { material: T.MeshStandardMaterial; color: T.Color; emissive: T.Color; intensity: number }[];
}
export function createRobot(kind: Kind): Robot {
    const root = new T.Group(), base = new T.Group(), body = new T.Group(), gun = new T.Group(), legs: T.Group[] = [];
    const player = kind === 'player', runner = kind === 'runner', shooter = kind === 'shooter', grenadier = kind === 'grenadier', burrower = kind === 'burrower';
    const light = player ? palette.cyan : runner ? palette.amber : shooter ? palette.red : palette.orange;
    const armor = player ? palette.white : runner ? palette.steel : palette.armor;
    root.add(body, base);
    body.position.y = .83;
    const halo = ring(root, player ? 0x62e6e7 : 0xff5a3b, player ? .8 : .62, .035);
    if (burrower) {
        // Low shell, four articulated claws and a forward drill distinguish the digger.
        sphere(body, armor, 0, .08, 0, .67, .3, .64);
        box(body, palette.dark, 0, .13, .5, .5, .16, .12);
        box(body, light, 0, .14, .57, .34, .055, .025);
        for (let i = 0; i < 4; i++) {
            const leg = new T.Group(), side = i % 2 ? 1 : -1;
            leg.position.set(side * .48, .35, i < 2 ? .32 : -.38);
            box(leg, palette.steel, side * .15, 0, .02, .4, .18, .22).rotation.z = side * -.35;
            box(leg, palette.edge, side * .32, -.14, .17, .12, .32, .45).rotation.x = -.4;
            base.add(leg); legs.push(leg);
        }
        for (let i = 0; i < 3; i++) {
            const drill = cylinder(body, palette.edge, 0, -.02, .61 + i * .15, .21 - i * .06, .16);
            drill.rotation.x = Math.PI / 2;
        }
        gun.position.set(0, 0, .41); gun.scale.setScalar(.1);
    }
    else if (shooter) {
        sphere(body, palette.dark, 0, .32, 0, .58, .46, .5);
        sphere(body, armor, 0, .45, .02, .49, .32, .38);
        sphere(body, light, 0, .32, .43, .24, .19, .1);
        const band = new T.Mesh(new T.TorusGeometry(.59, .055, 6, 28), palette.edge);
        band.rotation.x = Math.PI / 2;
        body.add(band);
        for (const side of [-1, 1]) {
            box(body, palette.dark, side * .68, .16, 0, .35, .25, .62);
            cylinder(body, palette.steel, side * .72, .1, 0, .19, .25);
            cylinder(body, light, side * .72, -.06, 0, .12, .07);
            box(body, armor, side * .55, .58, 0, .15, .44, .35).rotation.z = side * -.4;
        }
        cylinder(body, light, 0, -.19, 0, .2, .13);
        gun.position.set(0, .1, .4);
    }
    else {
        box(body, palette.dark, 0, .08, 0, .7, .42, .44);
        const chest = chamfer(box(body, armor, 0, .44, 0, runner ? .58 : .9, .55, .57));
        chest.rotation.x = -.12;
        box(body, palette.dark, 0, .45, .305, .45, .29, .07);
        box(body, light, 0, .46, .352, .27, .075, .035);
        box(body, palette.steel, 0, .38, -.38, .64, .46, .27);
        for (const side of [-1, 1]) {
            cylinder(body, palette.dark, side * .27, .29, -.43, .14, .38);
            cylinder(body, light, side * .27, .08, -.43, .075, .1);
            const shoulder = chamfer(box(body, armor, side * .64, .46, 0, .36, .38, .5));
            shoulder.rotation.z = side * -.2;
            sphere(body, palette.dark, side * .51, .34, 0, .15, .16, .17);
            box(body, light, side * .68, .47, .27, .17, .07, .03);
            box(body, palette.steel, side * .68, .05, .08, .23, .36, .26);
            if (!player)
                box(body, palette.edge, side * .68, -.12, .29, .12, .15, .43);
        }
        cylinder(body, palette.dark, 0, .78, 0, .15, .2);
        chamfer(box(body, armor, 0, .98, .035, runner ? .41 : .58, .38, .47));
        box(body, palette.dark, 0, 1.18, .015, .12, .015, .3);
        box(body, palette.black, 0, 1, .279, .48, .19, .04);
        box(body, light, 0, 1, .307, runner ? .21 : .4, .072, .025);
        box(body, palette.steel, .23, 1.25, -.08, .035, .26, .035);
        sphere(body, light, .23, 1.39, -.08, .05, .05, .05);
        const count = runner ? 4 : 2;
        for (let i = 0; i < count; i++) {
            const leg = new T.Group(), side = i % 2 === 0 ? -1 : 1;
            leg.position.set(side * (runner ? .47 : .27), .76, runner ? (i < 2 ? .27 : -.35) : 0);
            box(leg, palette.steel, 0, -.17, 0, .2, .36, .22).rotation.x = -.18;
            sphere(leg, palette.dark, 0, -.32, .04, .145, .12, .14);
            box(leg, armor, 0, -.48, .045, .27, .27, .29);
            box(leg, palette.dark, 0, -.65, .13, .32, .14, .46);
            box(leg, light, 0, -.46, .2, .12, .035, .025);
            base.add(leg);
            legs.push(leg);
        }
        gun.position.set(player ? .62 : 0, .12, .41);
        if (runner) {
            body.scale.set(.87, .75, 1.12);
            body.rotation.x = .15;
        }
    }
    if (grenadier) {
        body.scale.set(1.13, 1.04, 1.12);
        for (const side of [-1, 1]) {
            cylinder(body, palette.steel, side * .42, .65, -.56, .23, .9);
            cylinder(body, palette.orange, side * .42, .65, -.56, .24, .16);
        }
        // Shoulder mortar is separate from the humanoid rifle silhouette.
        gun.position.set(.62, .88, .41); gun.rotation.x = -.65;
        cylinder(body, palette.dark, .62, .8, .1, .29, .45);
    }
    body.add(gun);
    box(gun, palette.dark, 0, 0, .17, .26, .27, .5);
    const barrel = cylinder(gun, palette.steel, 0, 0, .48, .115, .36);
    barrel.rotation.x = Math.PI / 2;
    const muzzle = cylinder(gun, light, 0, 0, .68, .08, .045);
    muzzle.rotation.x = Math.PI / 2;
    const flash = sphere(gun, glow(0xb8ffff, 5), 0, 0, .82, .17, .17, .35);
    flash.visible = false;
    const health = new T.Group();
    health.position.y = burrower ? 1.35 : grenadier ? 2.65 : shooter ? 2.3 : 2.45;
    box(health, new T.MeshBasicMaterial({ color: 0x18252e }), 0, 0, 0, .86, .075, .025);
    const fill = box(health, new T.MeshBasicMaterial({ color: player ? 0x6affdb : 0xff7157 }), 0, 0, .02, .8, .045, .025);
    root.add(health);
    health.visible = false;
    batchRigid(body);
    batchRigid(gun, flash);
    legs.forEach(leg => batchRigid(leg));
    const burnMaterial = player ? undefined : armor.clone();
    if (burnMaterial) for (const part of [body, base]) part.traverse(object => {
        if (object instanceof T.Mesh && object.material === armor) object.material = burnMaterial;
    });
    const statusMaterials = burnMaterial ? [{ material: burnMaterial, base: burnMaterial.color.clone() }] : [];
    // Shooter's outer dark shell occludes most of its armor: tint the shell as well.
    if (shooter) {
        const shell = palette.dark.clone();
        body.traverse(object => { if (object instanceof T.Mesh && object.material === palette.dark) object.material = shell; });
        statusMaterials.push({ material: shell, base: shell.color.clone() });
    }
    const flashMaterials: Robot['flashMaterials'] = [];
    if (player) {
        const copies = new Map<T.MeshStandardMaterial, T.MeshStandardMaterial>();
        for (const part of [body, base]) part.traverse(object => {
            if (object === flash || !(object instanceof T.Mesh) || !(object.material instanceof T.MeshStandardMaterial)) return;
            const original = object.material;
            let copy = copies.get(original);
            if (!copy) {
                copy = original.clone(); copies.set(original, copy);
                flashMaterials.push({ material: copy, color: original.color.clone(), emissive: original.emissive.clone(), intensity: original.emissiveIntensity });
            }
            object.material = copy;
        });
    }
    return { root, base, body, legs, gun, flash, halo, health, fill, kind, hit: 0, recoil: 0, flashMaterials, burnMaterial, statusMaterials };
}
const impactColor = new T.Color(0xffe5de), impactEmissive = new T.Color(0xff5444);
export function flashPlayer(robot: Robot, amount: number, overdrive = false): void {
    for (const entry of robot.flashMaterials) {
        entry.material.color.copy(entry.color).lerp(impactColor, amount);
        entry.material.emissive.copy(entry.emissive).lerp(impactEmissive, amount);
        entry.material.emissiveIntensity = entry.intensity + amount * 2.5;
        if (overdrive && amount === 0) { entry.material.emissive.setHex(0x45dfef); entry.material.emissiveIntensity = entry.emissive.getHex() > 0 ? entry.intensity * 1.45 : .12; }
    }
}
export function animateRobot(robot: Robot, time: number, moving: number, dt: number, cadence = 1): void {
    robot.recoil = Math.max(0, robot.recoil - dt * 7);
    robot.hit = Math.max(0, robot.hit - dt);
    const hover = robot.kind === 'shooter';
    robot.body.position.y = (hover ? 1.05 : robot.kind === 'burrower' ? .48 : .83) + Math.sin(time * (hover ? 3 : 15 * cadence)) * (hover ? .12 : .055 * moving);
    robot.body.rotation.z = hover ? Math.sin(time * 2) * .07 : Math.cos(time * 7.5 * cadence) * .035 * moving;
    robot.body.scale.y = (robot.kind === 'runner' ? .75 : robot.kind === 'grenadier' ? 1.04 : 1) + robot.hit * .5;
    robot.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(time * 15 * cadence + (i % 2) * Math.PI + (i > 1 ? Math.PI : 0)) * .5 * moving; });
    robot.gun.position.z = .41 - robot.recoil * .22;
    robot.flash.visible = robot.recoil > .65;
    robot.halo.rotation.z += dt * .2;
}
/** Dispose only robot-owned resources; primitive geometries and palette are shared. */
export function disposeRobot(robot: Robot): void {
    robot.root.removeFromParent();
    robot.flashMaterials.forEach(entry => entry.material.dispose());
    robot.statusMaterials.forEach(entry => entry.material.dispose());
    robot.root.traverse(o => { if (o instanceof T.Mesh && o.userData.generated)
        o.geometry.dispose(); });
    robot.halo.geometry.dispose();
    (robot.halo.material as T.Material).dispose();
    (robot.flash.material as T.Material).dispose();
    robot.health.traverse(o => { if (o instanceof T.Mesh)
        (o.material as T.Material).dispose(); });
    robot.body.traverse(o => { if (o instanceof T.Mesh && o.geometry instanceof T.TorusGeometry)
        o.geometry.dispose(); });
}
