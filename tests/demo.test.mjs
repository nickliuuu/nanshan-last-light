import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game,Navigation} from '../public/game/engine.js';
import {createNightDemo} from '../public/game/demo.js';
import {readMap} from './map-fixture.mjs';
const map=readMap();
const nav=new Navigation(map);
test('night training runs actual combat without mutating the existing campaign',()=>{
 const campaign=new Game(map,nav);campaign.start();campaign.s.hour=14.2;const original=campaign.serialize();
 const demo=createNightDemo(map,nav);assert.equal(demo.s.structures.length,3);assert.ok(demo.s.zombies.length>10);
 const ammo=demo.s.resources.ammo;for(let i=0;i<200;i++)demo.tick(.1);
 assert.ok(demo.s.kills>0);assert.ok(demo.s.resources.ammo<ammo);assert.equal(campaign.serialize(),original);
 assert.ok(demo.shots.length>0);assert.ok(demo.shots.some(s=>s.sourceType==='tower'&&s.y>25));
 assert.ok(demo.shots.every(s=>Number.isFinite(s.y)&&s.y>0&&Number.isFinite(s.sourceId)));
});
test('headquarters fires above its real roof and squads fire at shoulder level',()=>{
 const g=new Game(map,nav);g.s.zombies=[{id:999,x:g.hq.x+20,z:g.hq.z,hp:200}];
 g.shoot(g.hq,195,7,.1);g.shoot(g.s.squads[0],185,8,.1);
 assert.equal(g.shots.length,2);assert.ok(g.shots[0].y>g.byId.get(g.hq.id).h);
 assert.equal(g.shots[0].sourceType,'hq');assert.equal(g.shots[1].sourceType,'squad');assert.ok(g.shots[1].y<7);
});
