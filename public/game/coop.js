import {applyCommand} from './coop-command.js';
const KEY='last-light-coop-session-v1';
export class CoopSession{
 constructor({game,onState,onStatus,onError}){this.game=game;this.onState=onState;this.onStatus=onStatus;this.onError=onError;this.room=null;this.online=false;this.ack=0;this.seq=0;this.feedback=[];this.pendingShots=[];this.lastFeedback=0;this.busy=false;this.timer=null;}
 static saved(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
 get role(){return this.room?.role||0;}
 get active(){return !!this.room;}
 get ready(){return this.online&&!!this.partner&&Date.now()-this.partnerSeen<10000;}
 async request(body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const r=await fetch('/api/coop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...this.room,...body}),signal:controller.signal});let data;try{data=await r.json();}catch{throw Error('请用联机版启动器打开游戏，当前地址未连接联机服务。');}if(!r.ok)throw Object.assign(Error(data.error||'联机服务暂不可用'),{status:r.status});return data;}finally{clearTimeout(timer);}}
 pack(){return{state:this.game().s,shots:this.pendingShots.splice(0).slice(-160),feedback:this.feedback.slice(-12)};}
 async create(name){const data=await this.request({op:'create',name,snapshot:this.pack()});this.enter(data);return data;}
 async join(code,name){const data=await this.request({op:'join',code:code.replace(/[\s-]/g,'').toUpperCase(),name});this.enter(data);this.onState(data.snapshot,true);return data;}
 async resume(){const saved=CoopSession.saved();if(!saved)throw Error('没有可重连的房间');this.room=saved;try{const d=await this.request({op:'resume'});this.enter({...d,token:saved.token});this.onState(d.snapshot,true);return d;}catch(e){this.room=null;throw e;}}
 enter(d){this.stopped=false;this.room={code:d.code,token:d.token,role:d.role};this.ack=d.ack||0;this.seq=d.seq||0;this.partner=d.partner;this.partnerSeen=d.partnerSeen||0;this.online=true;this.game().s.paused=true;try{sessionStorage.setItem(KEY,JSON.stringify(this.room));}catch{}this.onStatus();clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),200);}
 capture(shots){if(this.role===1)this.pendingShots.push(...shots.map(s=>({...s})));if(this.pendingShots.length>160)this.pendingShots.splice(0,this.pendingShots.length-160);}
 async sync(){if(!this.active||this.busy)return;this.busy=true;const room=this.room;
  try{const d=await this.request({op:'sync',...(this.role===1?{snapshot:this.pack(),ack:this.ack,seq:++this.seq}:{})});if(this.room!==room)return;this.online=true;this.partner=d.partner;this.partnerSeen=d.partnerSeen||0;
   if(this.role===1){if(!this.ready)this.game().s.paused=true;for(const c of d.commands||[]){if(c.id<=this.ack)continue;const error=applyCommand(this.game(),c,2);this.feedback.push({id:c.id,error:error||null});this.ack=c.id;}this.feedback=this.feedback.slice(-12);}
   else if(d.seq!==this.seq){this.seq=d.seq;this.onState(d.snapshot,false);for(const f of d.snapshot.feedback||[])if(f.id>this.lastFeedback){this.lastFeedback=f.id;if(f.error)this.onError(f.error);}if(!this.ready)this.game().s.paused=true;}
   if(!this.ready)this.game().s.paused=true;
  }catch(e){if(this.room!==room)return;this.online=false;this.game().s.paused=true;this.lastError=e.message;if([401,403,404,409].includes(e.status)){this.onError(e.message);this.stopped=true;}}
  finally{this.busy=false;if(this.room===room){this.onStatus();if(!this.stopped)this.timer=setTimeout(()=>this.sync(),this.online?400:1800);}}
 }
 async command(c){if(!this.ready)throw Error('正在等待另一位玩家连接，战局已暂停');if(this.role===1){const error=applyCommand(this.game(),c,1);if(error)throw Error(error);return;}await this.request({op:'command',nonce:crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(20)),v=>v.toString(16).padStart(2,'0')).join(''),command:c});}
 async leave(){if(!this.active){try{sessionStorage.removeItem(KEY);}catch{}return;}const room=this.room;clearTimeout(this.timer);this.room=null;this.online=false;try{sessionStorage.removeItem(KEY);}catch{}this.onStatus();await this.request({...room,op:'leave'});}
}
