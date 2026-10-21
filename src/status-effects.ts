import * as T from 'three';
import type { Point } from './physics';
import type { Simulation } from './simulation';
export const SHOCK_VFX = { duration: .15, capacity: 12, segments: 8 } as const;
const ARC_VERTICES = [[0,-1],[0,1],[1,1],[0,-1],[1,1],[1,-1]] as const;
interface Arc { life: number; from: Point; to: Point }
/** Fixed buffers: one draw for electric arcs, one instanced draw for small frost crystals. */
export class StatusEffects {
    private arcs: Arc[] = [];
    private free: Arc[] = [];
    private positions = new Float32Array(SHOCK_VFX.capacity * SHOCK_VFX.segments * 6 * 3);
    private colors = new Float32Array(this.positions.length);
    private geometry = new T.BufferGeometry();
    private lightning: T.Mesh;
    private ice: T.InstancedMesh;
    private dummy = new T.Object3D();
    constructor(scene: T.Scene) {
        this.geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3).setUsage(T.DynamicDrawUsage));
        this.geometry.setAttribute('color', new T.BufferAttribute(this.colors, 3).setUsage(T.DynamicDrawUsage));
        this.geometry.setDrawRange(0, 0);
        this.lightning = new T.Mesh(this.geometry, new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: .95, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
        this.lightning.frustumCulled = false;
        this.ice = new T.InstancedMesh(new T.OctahedronGeometry(.12), new T.MeshBasicMaterial({ color: 0x77deff, toneMapped: false }), 64);
        this.ice.count = 0; this.ice.frustumCulled = false;
        this.ice.instanceMatrix.setUsage(T.DynamicDrawUsage);
        scene.add(this.lightning, this.ice);
    }
    shock(from: Point, to: Point): void {
        if (this.arcs.length >= SHOCK_VFX.capacity) return;
        const arc = this.free.pop() ?? { life: 0, from: { x: 0, z: 0 }, to: { x: 0, z: 0 } };
        arc.life = SHOCK_VFX.duration; Object.assign(arc.from, from); Object.assign(arc.to, to); this.arcs.push(arc);
    }
    clear(): void { this.free.push(...this.arcs); this.arcs.length = 0; this.geometry.setDrawRange(0, 0); this.ice.count = 0; }
    update(dt: number, sim: Simulation, time: number): void {
        let write = 0, vertex = 0;
        for (const arc of this.arcs) {
            arc.life -= dt;
            if (arc.life <= 0) { this.free.push(arc); continue; }
            this.arcs[write++] = arc;
            const dx = arc.to.x - arc.from.x, dz = arc.to.z - arc.from.z, length = Math.hypot(dx, dz) || 1;
            // Thin ribbons keep arcs legible on WebGL implementations with one-pixel lines.
            for (let segment = 0; segment < SHOCK_VFX.segments; segment++) {
                for (const [end, side] of ARC_VERTICES) {
                    const k = segment + end, t = k / SHOCK_VFX.segments;
                    const offset = k === 0 || k === SHOCK_VFX.segments ? 0 : Math.sin(k * 17 + time * 65) * .22;
                    const lateral = offset + side * .045;
                    this.positions[vertex] = arc.from.x + dx * t - dz / length * lateral;
                    this.positions[vertex + 1] = 1.1 + offset;
                    this.positions[vertex + 2] = arc.from.z + dz * t + dx / length * lateral;
                    const brightness = Math.min(1, arc.life / .04);
                    this.colors[vertex] = .25 * brightness; this.colors[vertex + 1] = 2 * brightness; this.colors[vertex + 2] = 3 * brightness; vertex += 3;
                }
            }
        }
        this.arcs.length = write; this.geometry.setDrawRange(0, vertex / 3);
        this.geometry.attributes.position.needsUpdate = this.geometry.attributes.color.needsUpdate = true;
        let count = 0;
        for (const target of sim.targets) if (target.hp > 0 && sim.frost.has(target.id)) {
            const boss = target === sim.boss, radius = boss ? 1.5 : .7;
            for (let i = 0; i < 4 && count < 64; i++) {
                const a = i * Math.PI / 2 + time * .6;
                this.dummy.position.set(target.x + Math.cos(a) * radius, (boss ? .8 : .45) + Math.sin(time * 3 + i) * .1, target.z + Math.sin(a) * radius);
                this.dummy.scale.set(boss ? 1.5 : 1, boss ? 3 : 2, 1); this.dummy.rotation.set(0, a, .2);
                this.dummy.updateMatrix(); this.ice.setMatrixAt(count++, this.dummy.matrix);
            }
        }
        this.ice.count = count; this.ice.instanceMatrix.needsUpdate = true;
    }
}
