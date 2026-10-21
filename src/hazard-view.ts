import * as T from 'three';
import { FLOOR_HAZARD, GRENADE } from './hazards';
import { ENEMY_STATS } from './stats';
import { isUnderground } from './enemies/types';
import type { Simulation } from './simulation';
interface Marker { root: T.Group; rim: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>; fill: T.Mesh<T.CircleGeometry, T.MeshBasicMaterial>; core: T.Mesh<T.IcosahedronGeometry, T.MeshStandardMaterial> }
/** Ground bounds stay fixed; only the inner fill pulses, so the danger radius is honest. */
export class HazardView {
    private markers = new Map<string, Marker>();
    constructor(private scene: T.Scene) {}
    private remove(key: string, marker: Marker): void {
        marker.root.removeFromParent();
        for (const mesh of [marker.rim, marker.fill, marker.core]) { mesh.geometry.dispose(); mesh.material.dispose(); }
        this.markers.delete(key);
    }
    reset(): void { for (const [key, marker] of this.markers) this.remove(key, marker); }
    private marker(key: string, x: number, z: number, radius: number, color: number, opacity: number): Marker {
        let m = this.markers.get(key);
        if (!m) {
            const root = new T.Group();
            const material = () => new T.MeshBasicMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false });
            const rim = new T.Mesh(new T.RingGeometry(.95, 1, 48), material());
            const fill = new T.Mesh(new T.CircleGeometry(1, 48), material());
            const core = new T.Mesh(new T.IcosahedronGeometry(.18, 1), new T.MeshStandardMaterial({ color: 0x453a2b, emissive: 0xff7d25, emissiveIntensity: 1.8 }));
            rim.rotation.x = fill.rotation.x = -Math.PI / 2;
            rim.position.y = .07; fill.position.y = .055;
            root.add(rim, fill, core); this.scene.add(root);
            m = { root, rim, fill, core }; this.markers.set(key, m);
        }
        m.root.position.set(x, 0, z);
        m.rim.scale.setScalar(radius); m.fill.scale.setScalar(radius);
        m.rim.material.color.setHex(color); m.fill.material.color.setHex(color);
        m.rim.material.opacity = .8; m.fill.material.opacity = opacity;
        m.core.visible = false; m.core.scale.setScalar(1);
        return m;
    }
    update(sim: Simulation, time: number): void {
        const alive = new Set<string>();
        for (const zone of sim.thermal) {
            const key = `thermal-${zone.id}`; alive.add(key);
            const m = this.marker(key, zone.x, zone.z, GRENADE.radius, zone.exploded ? 0xff5324 : 0xffbe50, zone.exploded ? .25 + .07 * Math.sin(time * 12) : .07);
            m.core.visible = true;
            if (!zone.exploded) {
                const t = Math.min(1, zone.age / GRENADE.flight);
                m.core.position.set((zone.origin.x - zone.x) * (1 - t), 1.6 * (1 - t) + .15 + Math.sin(t * Math.PI) * 3.3, (zone.origin.z - zone.z) * (1 - t));
                m.core.rotation.set(time * 7, time * 9, 0); m.core.scale.setScalar(1.3);
                m.fill.scale.setScalar(GRENADE.radius * t); m.fill.material.opacity = .25;
                m.rim.material.opacity = .85 + .15 * Math.sin(time * 20);
            } else {
                m.core.position.set(0, .25, 0); m.core.scale.set(2.7, 1.8 + .7 * Math.sin(time * 15), 2.7);
                m.rim.material.opacity = Math.min(.85, (GRENADE.flight + GRENADE.fireDuration - zone.age) * 1.5);
            }
        }
        for (const zone of sim.floorHazards) {
            if (Math.abs(zone.x - sim.player.x) > 45) continue;
            const key = `floor-${zone.id}`; alive.add(key);
            const active = zone.state === 'active', warning = zone.state === 'warning';
            const m = this.marker(key, zone.x, zone.z, FLOOR_HAZARD.radius, active ? 0xff482a : warning ? 0xffba47 : 0x3c6b75, active ? .5 : warning ? .12 + .12 * (1 + Math.sin(time * 18)) : .08);
            if (warning) m.fill.scale.setScalar(FLOOR_HAZARD.radius * (1 - zone.timer / FLOOR_HAZARD.warning));
        }
        for (const e of sim.enemies) {
            if (!isUnderground(e)) continue;
            const key = `burrow-${e.id}`; alive.add(key);
            const emerging = e.state === 'emergence';
            const m = this.marker(key, e.x, e.z, emerging ? ENEMY_STATS.burrower.emergenceRadius : .58, emerging ? 0xffcc73 : 0xc2a27a, emerging ? .12 + .22 * (1 - e.timer / ENEMY_STATS.burrower.emergence) : .18);
            m.core.visible = true; m.core.position.set(0, .02, 0);
            m.core.scale.set(2.4, .7 + .25 * Math.sin(time * 22), 2.4);
            m.core.material.emissiveIntensity = emerging ? 2 : .35;
        }
        for (const [key, m] of this.markers) if (!alive.has(key)) this.remove(key, m);
    }
}
