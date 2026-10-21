import * as T from 'three';
import { box, cylinder, palette, ring, sharedPrimitiveGeometries } from './models';
/** A data core on a low pedestal, using the foundry's existing materials. */
export class RewardView {
    readonly root = new T.Group();
    private core: T.Mesh;
    private halo = ring(this.root, 0x8dffda, 1.05, .045);
    private beamMaterial = new T.MeshBasicMaterial({ color: 0x8affdb, transparent: true, opacity: .16, depthWrite: false, toneMapped: false });
    constructor() {
        cylinder(this.root, palette.dark, 0, .12, 0, .55, .24);
        cylinder(this.root, palette.steel, 0, .28, 0, .4, .12);
        cylinder(this.root, palette.cyan, 0, .36, 0, .25, .035);
        for (const side of [-1, 1]) {
            box(this.root, palette.edge, side * .4, .35, 0, .1, .4, .2);
            box(this.root, palette.cyan, side * .4, .58, 0, .08, .06, .16);
        }
        this.core = new T.Mesh(new T.OctahedronGeometry(.36), palette.cyan);
        this.root.add(this.core);
        const beam = new T.Mesh(new T.CylinderGeometry(.06, .2, 2.6, 12, 1, true), this.beamMaterial);
        beam.position.y = 1.65; this.root.add(beam);
    }
    update(time: number): void {
        this.core.position.y = 1.05 + Math.sin(time * 2.8) * .12;
        this.core.rotation.set(.2, time, Math.sin(time * 1.5) * .15);
        this.halo.scale.setScalar(1 + Math.sin(time * 3) * .07);
        this.beamMaterial.opacity = .12 + Math.sin(time * 3) * .035;
    }
    dispose(): void {
        this.root.removeFromParent();
        this.root.traverse(o => {
            if (o instanceof T.Mesh && !sharedPrimitiveGeometries.has(o.geometry)) o.geometry.dispose();
        });
        (this.halo.material as T.Material).dispose(); this.beamMaterial.dispose();
    }
}
