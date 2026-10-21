import * as T from 'three';
import { BOSS_SECTOR } from './waves';
import { createArena, type Arena } from './arena';
import { box, palette, ring } from './models';
import { GATE_X, ROOM_CENTERS, residentRoomIndices, type Gate } from './layout';
interface DoorView {
    root: T.Group;
    panels: T.Mesh[];
    lights: T.Mesh[];
}
export class World {
    readonly rooms = new Map<number, Arena>();
    private doors: DoorView[] = [];
    constructor(private scene: T.Scene) {
        this.syncRooms(0);
        GATE_X.forEach((x, index) => {
            const root = new T.Group();
            root.position.x = x;
            this.scene.add(root);
            const length = index === GATE_X.length - 1 ? 10 : 6.5;
            box(root, palette.dark, index === GATE_X.length - 1 ? 1.75 : 0, -.16, 0, length, .3, 5.9);
            for (const side of [-1, 1]) {
                box(root, palette.steel, index === GATE_X.length - 1 ? 1.75 : 0, .45, side * 3, length, .9, .4);
                box(root, palette.cyan, index === GATE_X.length - 1 ? 1.75 : 0, .93, side * 3, length, .035, .08);
                box(root, palette.edge, 0, 1.7, side * 2.8, .65, 3.4, .42);
                for (let n = -2; n <= 2; n++)
                    box(root, palette.cyan, n, .01, side * 2.3, .38, .02, .07);
            }
            box(root, palette.steel, 0, 3.4, 0, .65, .35, 6.05);
            const panels: T.Mesh[] = [], lights: T.Mesh[] = [];
            for (const side of [-1, 1]) {
                const panel = box(root, palette.dark, 0, 1.4, side * 1.3, .35, 2.8, 2.6);
                panels.push(panel);
                // Child geometry moves with its panel; scale accounts for its box transform.
                const stripe = box(panel, palette.orange, -.53, 0, -side * .43, .08, .65, .025);
                lights.push(stripe);
                box(panel, palette.steel, -.53, 0, 0, .06, .08, .7);
            }
            const marker = new T.Group();
            marker.position.set(0, .02, 0);
            root.add(marker);
            ring(marker, 0x62ddd4, 1.15, .04);
            this.doors.push({ root, panels, lights });
        });
    }
    private syncRooms(playerX: number): void {
        const needed = new Set(residentRoomIndices(playerX));
        for (const [index, arena] of this.rooms) {
            if (needed.has(index)) continue;
            arena.dispose();
            this.rooms.delete(index);
        }
        for (const index of needed) {
            if (this.rooms.has(index)) continue;
            const arena = createArena(this.scene, index);
            arena.root.position.x = ROOM_CENTERS[index];
            this.rooms.set(index, arena);
            const warm = new T.PointLight(0xff7037, index === BOSS_SECTOR ? 52 : 35, 16, 2);
            warm.position.set(-12, 3, -7);
            arena.root.add(warm);
            const cool = new T.PointLight(0x36b5ea, 25, 15, 2);
            cool.position.set(11, 4, 2);
            arena.root.add(cool);
        }
    }
    update(dt: number, time: number, gates: readonly Gate[], playerX: number): void {
        this.syncRooms(playerX);
        this.rooms.forEach((arena, index) => {
            arena.root.visible = Math.abs(ROOM_CENTERS[index] - playerX) < 45;
            arena.core.rotation.y += dt * .6;
            arena.core.rotation.z = Math.sin(time * .7) * .12;
            arena.fans.forEach(f => f.rotation.y += dt * 2);
        });
        this.doors.forEach((door, index) => {
            const gate = gates[index];
            door.root.visible = Math.abs(gate.x - playerX) < 45;
            door.panels.forEach((panel, i) => panel.position.z = (i === 0 ? -1 : 1) * (1.3 + gate.openness * 2.75));
            door.lights.forEach(light => light.material = gate.unlocked && !gate.sealed ? palette.cyan : palette.orange);
        });
    }
}
