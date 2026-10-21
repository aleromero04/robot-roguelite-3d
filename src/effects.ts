import * as T from 'three';
interface Particle {
    p: T.Vector3;
    v: T.Vector3;
    life: number;
    maxLife: number;
    size: number;
    color: T.Color;
    debris: boolean;
    spin: number;
    rising: boolean;
    owner?: number;
    fade: number;
}
/** One instanced draw call for all sparks and falling fragments; fixed cap. */
export class Effects {
    private particles: Particle[] = [];
    private pool: Particle[] = [];
    private mesh: T.InstancedMesh;
    private dummy = new T.Object3D();
    constructor(scene: T.Scene) {
        this.mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ toneMapped: false }), 320);
        this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;
        scene.add(this.mesh);
    }
    private particle(): Particle {
        const particle = this.pool.pop() ?? { p: new T.Vector3(), v: new T.Vector3(), color: new T.Color(), life: 0, maxLife: 0, size: 0, debris: false, spin: 0, rising: false, fade: 1 };
        particle.owner = undefined; particle.rising = false; particle.fade = 1;
        this.particles.push(particle);
        return particle;
    }
    burst(position: T.Vector3, color: number, count = 12, debris = false): void {
        for (let i = 0; i < count && this.particles.length < 320; i++) {
            const angle = Math.random() * Math.PI * 2, speed = 1 + Math.random() * (debris ? 4 : 6), life = debris ? .8 + Math.random() * .7 : .18 + Math.random() * .33;
            const p = this.particle();
            p.p.copy(position); p.v.set(Math.sin(angle) * speed, 1 + Math.random() * 4, Math.cos(angle) * speed);
            p.life = p.maxLife = life; p.size = debris ? .14 + Math.random() * .2 : .045 + Math.random() * .045;
            p.color.setHex(color).multiplyScalar(debris ? .8 : 2); p.debris = debris; p.spin = Math.random() * 8;
        }
    }
    /** Flames share the existing capped instanced batch; only persistent embers belong to a live burn. */
    flame(position: T.Vector3, owner: number, boss: boolean, kind: 'impact' | 'tick' | 'embers', strength = 1, modelScale = 1): void {
        const scale = (boss ? 1.85 : 1.2) * modelScale;
        const count = kind === 'impact' ? (boss ? 22 : 14) : kind === 'tick' ? (boss ? 7 : 4) : (boss ? 4 : 2);
        for (let i = 0; i < count && this.particles.length < 320; i++) {
            const p = this.particle(), angle = Math.random() * Math.PI * 2, radius = (.18 + Math.random() * .35) * scale;
            const persistent = kind === 'embers', speed = kind === 'impact' ? 2.5 : .4;
            p.p.set(position.x + Math.sin(angle) * radius, position.y + (boss ? .2 : -.25) + Math.random() * .35, position.z + Math.cos(angle) * radius);
            p.v.set(Math.sin(angle) * speed, 1.4 + Math.random() * 1.5, Math.cos(angle) * speed);
            p.life = p.maxLife = persistent ? .65 + Math.random() * .25 : kind === 'impact' ? .36 : .22;
            p.size = strength * (persistent ? .15 : kind === 'impact' ? .16 : .09) * scale * (.8 + Math.random() * .4);
            p.color.setHex(i % 3 === 0 ? 0xff3c0b : 0xffa32d).multiplyScalar(2);
            p.debris = false; p.rising = true; p.spin = .5;
            p.owner = owner;
        }
    }
    retainBurns(active: ReadonlySet<number>, strength: (id: number) => number = () => 1): void {
        this.recycle(p => p.owner === undefined || active.has(p.owner));
        for (const p of this.particles) if (p.owner !== undefined) p.fade = strength(p.owner);
        this.mesh.count = 0; // update() repacks the surviving particles before rendering.
    }
    private recycle(keep: (p: Particle) => boolean): void {
        let write = 0;
        for (const p of this.particles) {
            if (keep(p)) this.particles[write++] = p;
            else this.pool.push(p);
        }
        this.particles.length = write;
    }
    clear(): void { this.recycle(() => false); this.mesh.count = 0; }
    update(dt: number): void {
        this.recycle(p => p.life > dt);
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.life -= dt;
            p.v.y -= dt * (p.rising ? -.6 : 12);
            p.p.addScaledVector(p.v, dt);
            if (p.p.y < .07) {
                p.p.y = .07;
                p.v.y *= -.32;
                p.v.x *= .8;
                p.v.z *= .8;
            }
            const size = p.size * p.fade * Math.min(1, p.life / .16);
            this.dummy.position.copy(p.p);
            this.dummy.rotation.set(p.life * p.spin, p.life * p.spin, 0);
            this.dummy.scale.set(size, p.debris ? size : size * 2.5, size);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
            this.mesh.setColorAt(i, p.color);
        }
        this.mesh.count = this.particles.length;
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor)
            this.mesh.instanceColor.needsUpdate = true;
    }
}
