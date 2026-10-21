import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDS, moveCircle, segmentBox, segmentCircle, intersects } from '../src/physics.ts';
const cover = { x: 0, z: 0, halfX: 1, halfZ: 1 };
test('dash cannot tunnel through cover', () => {
    const p = moveCircle({ x: -4, z: 0 }, 10, 0, .5, [cover]);
    assert.ok(p.x <= -1.5);
    assert.ok(!intersects(p, .5, cover));
});
test('movement slides along a wall', () => {
    const p = moveCircle({ x: -1.5, z: 0 }, 1, 1, .5, [cover]);
    assert.equal(p.x, -1.5);
    assert.ok(p.z > .9);
});
test('arena confines the full circle', () => {
    const p = moveCircle({ x: 0, z: 0 }, 100, 100, .5, []);
    assert.equal(p.x, BOUNDS.x - .5);
    assert.equal(p.z, BOUNDS.z - .5);
});
test('projectiles detect cover and parallel misses', () => {
    assert.equal(segmentBox({ x: -5, z: 0 }, { x: 5, z: 0 }, cover), true);
    assert.equal(segmentBox({ x: -5, z: 2 }, { x: 5, z: 2 }, cover), false);
    assert.equal(segmentBox({ x: 0, z: 0 }, { x: 0, z: 0 }, cover), true);
    assert.equal(segmentBox({ x: 2, z: 0 }, { x: 2, z: 0 }, cover), false);
});
test('swept shots hit targets even when crossing in one frame', () => {
    assert.equal(segmentCircle({ x: -3, z: 0 }, { x: 3, z: 0 }, { x: 0, z: 0 }, .5), true);
    assert.equal(segmentCircle({ x: -3, z: 1 }, { x: 3, z: 1 }, { x: 0, z: 0 }, .5), false);
    assert.equal(segmentCircle({ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, .5), true);
});
