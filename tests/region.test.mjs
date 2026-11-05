import test from 'node:test';
import assert from 'node:assert/strict';
import {readMap} from './map-fixture.mjs';
import {Game,Navigation} from '../public/game/engine.js';
const map=readMap(),nav=new Navigation(map);
const point=(lon,lat)=>({x:(lon-map.origin[0])*map.scale[0],z:(map.origin[1]-lat)*map.scale[1]});
test('expanded geographic data covers airport, mountain parks, reservoirs and the preserved safe zone',()=>{
 assert.deepEqual(map.meta.boundsWGS84,[113.75,22.48,114.04,22.71]);assert.equal(map.buildings.length,35825);assert.equal(map.roads.length,42054);assert.ok(map.meta.areaKm2>760);
 for(const id of ['airport','airport-north','fenghuang','yangtai','tiegang','xili-lake','baoan','qianhai','tanglang','nanshan-park','hq'])assert.ok(map.regions.find(r=>r.id===id),id);
 assert.ok(map.airfields.filter(a=>a.kind==='runway'&&!a.area).length>=2);
 for(const [lon,lat]of [[113.933,22.521],[113.810,22.640],[113.90,22.570]]){const p=point(lon,lat);assert.ok(nav.onLand(p.x,p.z),'mainland must remain land');}
 for(const [lon,lat]of [[113.78,22.55],[113.97,22.50]]){const p=point(lon,lat);assert.equal(nav.onLand(p.x,p.z),false,'ocean is not walkable');}
 const game=new Game(map,nav),old=JSON.parse(game.serialize());old.mapId='nanshan-houhai-osm-v1';old.resources.wood=321;game.restore(JSON.stringify(old));assert.equal(game.s.resources.wood,321);assert.equal(game.s.mapId,map.id);
});
