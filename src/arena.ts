import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cylinder, glow, mat, palette, ring, sharedPrimitiveGeometries } from './models';
import { ROOM_LAYOUTS } from './layout';
import { sectorNumber, BOSS_SECTOR } from './waves';
const floorMat = mat(0x172732, .7, .66), seams = mat(0x080f17, .4, .8), caution = mat(0xb48644, .35, .67);
const reactorMaterial = glow(0x1a7e96, .7), crystalMaterial = glow(0x64fff0, 3.3);
const floorGeometry = new T.BoxGeometry(1.96, .12, 1.96), crystalGeometry = new T.OctahedronGeometry(.68);
const hoopGeometry = new T.TorusGeometry(1.12, .09, 8, 40);
const sharedMaterials = new Set<T.Material>([...Object.values(palette), floorMat, seams, caution, reactorMaterial, crystalMaterial]);
const sharedGeometries = new Set([...sharedPrimitiveGeometries, floorGeometry, crystalGeometry, hoopGeometry]);
function label(text: string, color = '#728a94', width = 512, height = 128): T.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = `bold ${height * .66}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const measured = ctx.measureText(text).width;
    if (measured > width * .94)
        ctx.font = `bold ${height * .66 * width * .94 / measured}px monospace`;
    ctx.fillText(text, width / 2, height / 2);
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
}
function decal(parent: T.Object3D, text: string, x: number, z: number, w: number, h: number, color?: string): void {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: label(text, color), transparent: true, depthWrite: false, opacity: .7 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, .024, z);
    parent.add(m);
}
export interface Arena {
    root: T.Group;
    core: T.Group;
    fans: T.Group[];
    dispose: () => void;
}
export function createArena(scene: T.Scene, section = 0): Arena {
    const layout = ROOM_LAYOUTS[section];
    const root = new T.Group();
    scene.add(root);
    box(root, seams, 0, -.3, 0, 30.5, .5, 23);
    const floor = new T.InstancedMesh(floorGeometry, floorMat, 165);
    const transform = new T.Object3D();
    let index = 0;
    const color = new T.Color();
    for (let x = -14; x <= 14; x += 2)
        for (let z = -10; z <= 10; z += 2) {
            transform.position.set(x, -.07, z);
            transform.updateMatrix();
            floor.setMatrixAt(index, transform.matrix);
            color.setHex((Math.abs(x) < 4) ? 0x8e9fa8 : 0x70838e);
            color.multiplyScalar(.82 + Math.sin(x * 19 + z * 13) * .075);
            floor.setColorAt(index++, color);
        }
    floor.receiveShadow = true;
    root.add(floor);
    // Recessed service channels frame the central combat lane.
    for (const side of [-1, 1]) {
        box(root, palette.black, side * 3.85, .006, 0, .36, .025, 19.8);
        for (let z = -9; z <= 9; z += 1.4)
            box(root, palette.cyan, side * 3.85, .022, z, .06, .016, .75);
        box(root, palette.steel, side * 4.05, .01, 0, .055, .018, 20);
        for (let z = -9; z < 10; z += 2.8) {
            box(root, palette.black, side * 12.5, .013, z, 1.1, .04, 1.5);
            for (let j = 0; j < 7; j++)
                box(root, palette.steel, side * 12.5, .045, z - .6 + j * .2, 1.0, .045, .045);
        }
    }
    const center = new T.Group();
    root.add(center);
    ring(center, 0x526f79, 3.15, .035);
    ring(center, 0x526f79, 2.9, .018);
    decal(root, sectorNumber(section), 0, layout.reactor.z === 0 ? 4.1 : -.5, 3.7, 2.2, '#587a88');
    decal(root, section === BOSS_SECTOR ? 'FINAL CONTAINMENT / BOSS' : 'ROBOTICS / FOUNDRY', 0, 8.8, 7.6, .75, '#83a1a9');
    decal(root, 'REACTOR ACCESS', 0, -5.4, 4.2, .45, '#92b0b9');
    if (section === BOSS_SECTOR) {
        ring(center, 0xab624b, 6.4, .035);
        for (const side of [-1, 1]) {
            box(root, palette.dark, side * 4.2, 2.6, -10.9, 1.2, 5.2, .7);
            box(root, palette.orange, side * 4.2, 2.8, -10.48, .12, 3.7, .04);
            box(root, palette.steel, side * 2.4, 5.1, -10.9, 4.5, .4, .8);
            for (let z = -4; z < 8; z += 2)
                box(root, palette.orange, side * 10.8, .04, z, .14, .02, .7);
        }
        decal(root, 'CORE / 07', 0, -4.8, 5, .6, '#ec9a72');
    }
    // Low front barrier preserves the view; tall rear buttresses establish depth.
    box(root, palette.dark, 0, .72, -11.4, 31, 1.65, .65);
    box(root, palette.dark, 0, .2, 11.4, 31, .55, .65);
    for (const side of [-1, 1]) {
        const portal = side === 1 ? section !== BOSS_SECTOR : section > 0;
        if (portal) {
            // Keep the original wall materials and leave a real 5.2-unit opening.
            for (const z of [-7.05, 7.05]) {
                box(root, palette.dark, side * 15.15, .58, z, .7, 1.4, 8.9);
                box(root, palette.edge, side * 15.15, 1.3, z, .72, .08, 8.9);
            }
        }
        else {
            box(root, palette.dark, side * 15.15, .58, 0, .7, 1.4, 23);
            box(root, palette.edge, side * 15.15, 1.3, 0, .72, .08, 23);
        }
        for (let z = -9.5; z <= 10; z += 4.8) {
            if (portal && Math.abs(z) < 2.6)
                continue;
            box(root, palette.steel, side * 15, 1.35, z, .85, 2.6, .65);
            box(root, palette.cyan, side * 14.54, 1.46, z, .045, .9, .18);
        }
        box(root, palette.cyan, side * 8.2, 1.62, -11.05, 11.2, .055, .04);
        for (let x = 4.5; x < 15; x += 3.2) {
            box(root, palette.steel, side * x, 2.1, -11.7, .65, 4.3, 1.1);
            box(root, palette.edge, side * x, 4.22, -11.7, 1.05, .12, 1.2);
            box(root, palette.dark, side * x, 2.1, -11.08, .28, 3.2, .12);
        }
    }
    const fans: T.Group[] = [];
    for (const footprint of layout.machinery) {
        // Footprints include the plinth and projecting trim.
        const o = { ...footprint, halfX: footprint.halfX - .125, halfZ: footprint.halfZ - .125 };
        const g = new T.Group();
        g.position.set(o.x, 0, o.z);
        root.add(g);
        const tall = o.tall, height = tall ? 2.2 : 1.12;
        box(g, palette.black, 0, .12, 0, o.halfX * 2 + .25, .24, o.halfZ * 2 + .25);
        box(g, palette.steel, 0, height / 2, 0, o.halfX * 2, height, o.halfZ * 2);
        box(g, palette.dark, 0, height + .02, 0, o.halfX * 2 + .12, .15, o.halfZ * 2 + .12);
        for (const side of [-1, 1]) {
            box(g, palette.edge, side * (o.halfX - .1), height / 2, o.halfZ + .01, .15, height, .1);
            box(g, palette.black, 0, height * .55, side * (o.halfZ + .03), o.halfX * 1.55, height * .55, .055);
            box(g, palette.cyan, 0, height * .77, side * (o.halfZ + .075), o.halfX * 1.3, .045, .025);
        }
        for (let j = 0; j < 6; j++) {
            const stripe = box(g, caution, -.75 + j * .29, height + .11, o.halfZ - .14, .14, .02, .2);
            stripe.rotation.y = -.5;
            box(g, palette.edge, -.6 + j * .24, height * .48, o.halfZ + .08, .08, .24, .04);
        }
        if (tall) {
            cylinder(g, palette.dark, 0, height + .14, 0, .78, .15);
            const fan = new T.Group();
            fan.position.y = height + .23;
            g.add(fan);
            fans.push(fan);
            for (let j = 0; j < 5; j++) {
                const blade = box(fan, palette.edge, 0, 0, 0, 1.3, .04, .17);
                blade.rotation.y = j * Math.PI / 5;
            }
            cylinder(g, palette.cyan, 0, height + .25, 0, .16, .1);
        }
        else {
            for (let x = -.8; x <= .8; x += .8)
                box(g, palette.steel, x, height + .14, 0, .5, .12, .85);
        }
    }
    // Reactor: layered machinery, containment hoops and floating luminous core.
    const reactor = new T.Group();
    reactor.position.set(layout.reactor.x, 0, layout.reactor.z);
    root.add(reactor);
    cylinder(reactor, palette.black, 0, .18, 0, 2.2, .36);
    cylinder(reactor, palette.steel, 0, .52, 0, 1.7, .7);
    cylinder(reactor, palette.dark, 0, 1.0, 0, 1.4, .3);
    cylinder(reactor, reactorMaterial, 0, 1.75, 0, .82, 1.3);
    const core = new T.Group();
    core.position.y = 1.8;
    reactor.add(core);
    const crystal = new T.Mesh(crystalGeometry, crystalMaterial);
    crystal.scale.y = 1.3;
    core.add(crystal);
    for (const y of [1.16, 2.48]) {
        const hoop = new T.Mesh(hoopGeometry, palette.cyan);
        hoop.position.y = y;
        hoop.rotation.x = Math.PI / 2;
        reactor.add(hoop);
        cylinder(reactor, palette.dark, 0, y + .14, 0, 1.34, .16);
    }
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4, x = Math.sin(a) * 1.4, z = Math.cos(a) * 1.4;
        box(reactor, palette.steel, x, 1.55, z, .34, 2.6, .34);
        box(reactor, palette.cyan, x, 1.55, z + .19, .08, 1.3, .035);
    }
    cylinder(reactor, palette.steel, 0, 2.92, 0, 1.7, .2);
    cylinder(reactor, palette.dark, 0, 3.08, 0, 1.05, .2);
    const reactorLight = new T.PointLight(0x39deed, 18, 10, 2);
    reactorLight.position.set(0, 3, -7);
    root.add(reactorLight);
    // Distant overhead conduits remain behind the play area.
    for (const x of [-2.8, 2.8]) {
        cylinder(root, palette.steel, x, 2, -11.6, .2, 4.5);
        const pipe = cylinder(root, palette.steel, x / 2, 4.2, -11.6, .2, Math.abs(x));
        pipe.rotation.z = Math.PI / 2;
        cylinder(root, palette.amber, x, 3.2, -11.6, .22, .13);
    }
    const backSign = new T.Mesh(new T.PlaneGeometry(4.5, 1.1), new T.MeshBasicMaterial({ map: label(`SECTOR ${sectorNumber(section)}`, '#91c6ce'), transparent: true }));
    backSign.position.set(0, 4.45, -11.45);
    root.add(backSign);
    // Bake static opaque machinery into a handful of material batches.
    // Moving parts, decals, lights and instanced floor tiles stay independent.
    root.updateMatrixWorld(true);
    const batches = new Map<T.Material, T.BufferGeometry[]>();
    const originals: T.Mesh[] = [];
    const moving = new Set<T.Object3D>([core, ...fans]);
    root.traverse(object => {
        if (!(object instanceof T.Mesh) || object instanceof T.InstancedMesh || Array.isArray(object.material) || object.material.transparent)
            return;
        let ancestor: T.Object3D | null = object;
        while (ancestor && !moving.has(ancestor))
            ancestor = ancestor.parent;
        if (ancestor)
            return;
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        const list = batches.get(object.material) ?? [];
        list.push(geometry);
        batches.set(object.material, list);
        originals.push(object);
    });
    for (const [material, geometries] of batches) {
        const geometry = mergeGeometries(geometries);
        if (!geometry)
            throw new Error('Static arena geometry could not be merged');
        const mesh = new T.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        geometries.forEach(g => g.dispose());
    }
    originals.forEach(mesh => mesh.removeFromParent());
    return { root, core, fans, dispose: () => {
        root.removeFromParent();
        const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
        root.traverse(object => {
            if (!(object instanceof T.Mesh)) return;
            if (object instanceof T.InstancedMesh) object.dispose();
            if (!sharedGeometries.has(object.geometry)) geometries.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (sharedMaterials.has(material)) continue;
                materials.add(material);
                if ('map' in material && material.map instanceof T.Texture) textures.add(material.map);
            }
        });
        geometries.forEach(g => g.dispose());
        materials.forEach(m => m.dispose());
        textures.forEach(t => t.dispose());
    } };

}
