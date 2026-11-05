// A shared HTTP relay: the host runs the simulation, D1 persists snapshots and
// ordered partner commands. No in-memory room state is required in the Worker.
const MAX_BYTES=500_000, TTL=24*60*60*1000;
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>alphabet[v%32]).join('');
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
class RequestError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const fail=(message,status=400)=>{throw new RequestError(message,status);};
const result=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function snapshot(value){
 const s=value?.state;
 if(!s||s.mapId!=='nanshan-baoan-osm-v2'||s.version!==1||!Array.isArray(s.squads)||s.squads.length!==2||!Array.isArray(s.zombies)||s.zombies.length>2000||!Array.isArray(s.structures)||s.structures.length>300||!s.resources||!s.hq||!Number.isFinite(s.elapsed)||!Number.isFinite(s.hour)||s.hour<0||s.hour>=24)fail('战局快照无效');
 const raw=JSON.stringify(value);if(raw.length>MAX_BYTES-2000)fail('战局数据超过同步上限');return raw;
}
export function normalizeCommand(c){
 if(!c||typeof c!=='object')fail('无效指令');
 const finite=v=>Number.isFinite(v)&&Math.abs(v)<100000;
 switch(c.type){
  case'move':if(!finite(c.x)||!finite(c.z))fail('无效坐标');return{type:c.type,squad:2,x:c.x,z:c.z};
  case'assign':if(!Number.isSafeInteger(c.building))fail('无效建筑');return{type:c.type,squad:2,building:c.building};
  case'recall':case'heal':return{type:c.type,squad:2};
  case'build':if(!['wall','tower','farm','shelter','workshop','medical'].includes(c.kind)||!finite(c.x)||!finite(c.z)||!finite(c.rotation))fail('无效设施');return{type:c.type,kind:c.kind,x:c.x,z:c.z,rotation:c.rotation};
  case'repair':case'pause':return{type:c.type};
  default:fail('此操作由房主管理');
 }
}
export async function handleRooms(request,db){
 try{
  if(request.method!=='POST')return result({error:'请使用游戏内联机面板'},405);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)fail('不允许跨站请求',403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('需要 JSON 请求',415);
  if(Number(request.headers.get('content-length'))>MAX_BYTES)fail('请求过大',413);
  const reader=request.body?.getReader();if(!reader)fail('请求为空');let bytes=0,chunks=[];
  for(;;){const{done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_BYTES){await reader.cancel();fail('请求过大',413);}chunks.push(value);}
  const merged=new Uint8Array(bytes);let pos=0;for(const c of chunks){merged.set(c,pos);pos+=c.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(merged));}catch{fail('无法读取请求');}
  const now=Date.now(),name=String(body.name||'幸存者').trim().slice(0,18)||'幸存者';
  if(body.op==='create'){
   const state=snapshot(body.snapshot),code=random(8),token=random(48);
   await db.batch([db.prepare('DELETE FROM coop_commands WHERE room IN (SELECT code FROM coop_rooms WHERE expires < ?)').bind(now),db.prepare('DELETE FROM coop_rooms WHERE expires < ?').bind(now)]);
   await db.prepare('INSERT INTO coop_rooms (code, host_hash, host_name, snapshot, host_seen, expires) VALUES (?, ?, ?, ?, ?, ?)').bind(code,await hash(token),name,state,now,now+TTL).run();
   return result({code,token,role:1,ack:0,seq:0,partner:null,snapshot:body.snapshot});
  }
  const code=String(body.code||'').trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))fail('请输入 8 位房间码');
  let room=await db.prepare('SELECT * FROM coop_rooms WHERE code = ?').bind(code).first();
  if(!room||room.expires<now)fail('房间不存在或已结束',404);
  if(body.op==='join'){
   if(room.guest_hash)fail('房间已满，仅支持两位玩家',409);
   if(room.host_seen<now-60000)fail('房主暂时离线，请等待房主重连',409);
   const token=random(48);
   const updated=await db.prepare('UPDATE coop_rooms SET guest_hash=?, guest_name=?, guest_seen=? WHERE code=? AND guest_hash IS NULL').bind(await hash(token),name,now,code).run();
   if(!updated.meta.changes)fail('另一位玩家已加入，房间已满',409);
   return result({code,token,role:2,ack:room.ack,seq:room.seq,partner:room.host_name,partnerSeen:room.host_seen,snapshot:JSON.parse(room.snapshot)});
  }
  if(typeof body.token!=='string'||body.token.length!==48)fail('房间凭证失效，请重新加入',401);
  const digest=await hash(body.token),role=digest===room.host_hash?1:digest===room.guest_hash?2:0;
  if(!role)fail('你没有此房间的控制权',403);
  if(body.op==='leave'){
   if(role===1)await db.batch([db.prepare('DELETE FROM coop_commands WHERE room=?').bind(code),db.prepare('DELETE FROM coop_rooms WHERE code=?').bind(code)]);
   else await db.batch([db.prepare('UPDATE coop_rooms SET guest_hash=NULL, guest_name=NULL, guest_seen=0 WHERE code=?').bind(code),db.prepare('DELETE FROM coop_commands WHERE room=?').bind(code)]);
   return result({left:true});
  }
  if(body.op==='resume')return result({code,role,ack:room.ack,seq:room.seq,partner:role===1?room.guest_name:room.host_name,partnerSeen:role===1?room.guest_seen:room.host_seen,snapshot:JSON.parse(room.snapshot)});
  if(body.op==='command'){
   if(role!==2)fail('房主指令应在主机执行',403);
   if(room.host_seen<now-10000)fail('房主离线，指令暂不能发送',409);
   if(!/^[a-zA-Z0-9-]{10,80}$/.test(body.nonce||''))fail('指令编号无效');
   const command=normalizeCommand(body.command);
   const queued=await db.prepare('SELECT COUNT(*) AS count FROM coop_commands WHERE room=? AND id>(SELECT ack FROM coop_rooms WHERE code=?)').bind(code,code).first();if(queued.count>=40)fail('指令队列已满，请等待同步',429);
   await db.prepare('INSERT OR IGNORE INTO coop_commands (room, nonce, payload) VALUES (?, ?, ?)').bind(code,body.nonce,JSON.stringify(command)).run();
   return result({queued:true});
  }
  if(body.op!=='sync')fail('未知联机操作');
  if(role===1){
   const raw=snapshot(body.snapshot),ack=Number(body.ack),seq=Number(body.seq);
   if(!Number.isSafeInteger(ack)||ack<room.ack||!Number.isSafeInteger(seq)||seq<=room.seq)fail('战局已在另一个窗口更新，请重连',409);
   const max=await db.prepare('SELECT MAX(id) AS id FROM coop_commands WHERE room=?').bind(code).first();if(ack>Math.max(room.ack,max.id||0))fail('指令确认编号无效');
   const changed=await db.prepare('UPDATE coop_rooms SET snapshot=?, ack=?, seq=?, host_seen=?, expires=? WHERE code=? AND seq < ?').bind(raw,ack,seq,now,now+TTL,code,seq).run();
   if(!changed.meta.changes)fail('旧快照已忽略，请重连',409);
   // Keep acknowledged nonces until room expiry, so late request retries stay idempotent.
   const commands=await db.prepare('SELECT id, payload FROM coop_commands WHERE room=? AND id>? ORDER BY id LIMIT 20').bind(code,ack).all();
   room=await db.prepare('SELECT guest_name, guest_seen FROM coop_rooms WHERE code=?').bind(code).first();
   return result({seq,partner:room?.guest_name,partnerSeen:room?.guest_seen,commands:commands.results.map(c=>({id:c.id,...JSON.parse(c.payload)}))});
  }
  await db.prepare('UPDATE coop_rooms SET guest_seen=? WHERE code=?').bind(now,code).run();
  return result({seq:room.seq,partner:room.host_name,partnerSeen:room.host_seen,snapshot:JSON.parse(room.snapshot)});
 }catch(e){if(e instanceof RequestError)return result({error:e.message},e.status);console.error('Coop relay:',e);return result({error:'联机服务暂不可用，请重试'},503);}
}
