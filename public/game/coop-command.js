export function applyCommand(game,c,role){
 const id=role;
 switch(c.type){
  case'assign':return game.assign(id,c.building);
  case'move':return game.move(id,{x:c.x,z:c.z});
  case'recall':return game.recall(id);
  case'heal':return game.heal(id);
  case'build':return game.build(c.kind,c.x,c.z,c.rotation||0);
  case'repair':return game.repair();
  case'pause':game.s.paused=true;return null;
  case'resume':if(role!==1)return'只有房主可以继续战局';game.s.paused=false;return null;
  case'speed':if(role!==1)return'只有房主可以调整时间';if(![1,2,4].includes(c.speed))return'无效速度';game.s.speed=c.speed;return null;
  default:return'未知指令';
 }
}
