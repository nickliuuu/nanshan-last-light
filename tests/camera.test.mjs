import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/game/vendor/three.module.js';
import {dragPan} from '../public/game/camera.js';

test('dragged ground follows the mouse in both axes, at every camera heading and view', () => {
  for (const azimuth of [-2.8, -.25, 0, Math.PI / 2, 2.4]) {
    for (const elevation of [.55, .83, 1.48]) {
      for (const [dx, dy] of [[120, 0], [0, 90], [-85, -66]]) {
        const zoom = 1800, height = 900, width = 1440;
        const cam = new T.OrthographicCamera(-zoom*width/height/2, zoom*width/height/2, zoom/2, -zoom/2, 1, 22000);
        const target = new T.Vector3(60, 0, 200);
        const offset = new T.Vector3(Math.sin(azimuth)*Math.cos(elevation)*4500, Math.sin(elevation)*4500, Math.cos(azimuth)*Math.cos(elevation)*4500);
        const set = () => { cam.position.copy(target).add(offset); cam.lookAt(target); cam.updateMatrixWorld(); };
        const screen = p => { const v = p.clone().project(cam); return [(v.x+1)*width/2, (1-v.y)*height/2]; };
        set();
        const point = new T.Vector3(360, 0, 140), before = screen(point);
        const delta = dragPan(dx, dy, zoom, height, azimuth, elevation);
        target.x += delta.x; target.z += delta.z; set();
        const after = screen(point);
        assert.ok(Math.abs(after[0]-before[0]-dx)<1e-6, 'horizontal motion must match pointer');
        assert.ok(Math.abs(after[1]-before[1]-dy)<1e-6, 'vertical motion must match pointer');
      }
    }
  }
});
