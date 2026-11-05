import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRooms} from '../server/rooms.mjs';
import {sqliteAdapter,migrateLocal} from '../server/sqlite-adapter.mjs';
import {Game,dist} from '../public/game/engine.js';
import {applyCommand} from '../public/game/coop-command.js';
import {readMap} from './map-fixture.mjs';
const map=readMap();
function setup(){const db=sqliteAdapter();migrateLocal(db,'drizzle');const game=new Game(map);game.start();game.s.paused=true;const pack=()=>({state:JSON.parse(game.serialize()),shots:[],feedback:[]});return{db,game,pack,async call(body,origin='https://test.invalid'){const r=await handleRooms(new Request('https://test.invalid/api/coop',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}),db);return{status:r.status,...await r.json()};}};}
test('two room clients share one campaign, enforce squad ownership, deduplicate commands and restore after refresh',async()=>{
 const t=setup();try{
 const host=await t.call({op:'create',name:'房主',snapshot:t.pack()});assert.equal(host.status,200);assert.equal(host.role,1);
 const guest=await t.call({op:'join',name:'队友',code:host.code});assert.equal(guest.role,2);
 assert.equal((await t.call({op:'join',code:host.code})).status,409);
 assert.equal((await t.call({op:'sync',code:host.code,token:'A'.repeat(48)})).status,403);
 const target=t.game.buildings.find(b=>b.id!==t.game.hq.id&&dist(b,t.game.hq)>100&&dist(b,t.game.hq)<350&&t.game.nav.path(t.game.s.squads[1],b).length);
 const command={op:'command',code:host.code,token:guest.token,nonce:'test-command-0001',command:{type:'assign',squad:1,building:target.id}};
 assert.equal((await t.call(command)).status,200);await t.call(command);
 const sync=await t.call({op:'sync',code:host.code,token:host.token,seq:1,ack:0,snapshot:t.pack()});assert.equal(sync.commands.length,1);assert.equal(sync.commands[0].squad,2);
 assert.equal(applyCommand(t.game,sync.commands[0],2),null);assert.equal(t.game.s.squads[0].status,'idle');assert.equal(t.game.s.squads[1].status,'travel');
 t.game.s.paused=false;for(let i=0;i<800&&t.game.s.scavenges===0;i++)t.game.tick(.1);assert.equal(t.game.s.scavenges,1);
 const ack=sync.commands[0].id;await t.call({op:'sync',code:host.code,token:host.token,seq:2,ack,snapshot:t.pack()});
 const client=await t.call({op:'sync',code:host.code,token:guest.token});assert.deepEqual(client.snapshot.state.resources,t.game.s.resources);assert.equal(client.snapshot.state.scavenges,1);
 await t.call(command);const again=await t.call({op:'sync',code:host.code,token:host.token,seq:3,ack,snapshot:t.pack()});assert.equal(again.commands.length,0);
 const resumed=await t.call({op:'resume',code:host.code,token:host.token});assert.equal(resumed.ack,ack);assert.equal(resumed.snapshot.state.scavenges,1);
 assert.equal((await t.call({op:'sync',code:host.code,token:guest.token,seq:99,ack:0,snapshot:{state:{}}})).snapshot.state.scavenges,1,'guest cannot overwrite snapshot');
 assert.equal((await t.call({op:'command',code:host.code,token:guest.token,nonce:'test-command-0002',command:{type:'speed',speed:4}})).status,400);
 assert.equal((await t.call({op:'sync',code:host.code,token:host.token,seq:1,ack,snapshot:t.pack()})).status,409,'stale host snapshots must not roll back state');
 await t.call({op:'leave',code:host.code,token:guest.token});assert.equal((await t.call({op:'join',code:host.code,name:'接替玩家'})).role,2);
 await t.call({op:'leave',code:host.code,token:host.token});assert.equal((await t.call({op:'resume',code:host.code,token:guest.token})).status,404);
 }finally{t.db.sql.close();}
});
test('room relay rejects cross-origin writes, invalid coordinates and expired rooms',async()=>{
 const t=setup();try{assert.equal((await t.call({op:'create',snapshot:t.pack()},'https://evil.invalid')).status,403);const h=await t.call({op:'create',snapshot:t.pack()}),g=await t.call({op:'join',code:h.code});assert.equal((await t.call({op:'command',code:h.code,token:g.token,nonce:'test-bad-move-1',command:{type:'move',x:1e20,z:0}})).status,400);t.db.sql.prepare('UPDATE coop_rooms SET expires=0 WHERE code=?').run(h.code);assert.equal((await t.call({op:'resume',code:h.code,token:h.token})).status,404);}finally{t.db.sql.close();}
});
