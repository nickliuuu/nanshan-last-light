import {Game,dist} from './engine.js';
// Disposable training scenario: constructed separately from the player's Game.
export function createNightDemo(map,nav){
  const game=new Game(map,nav);game.start();game.s.hour=21;game.s.speed=1;
  game.s.resources={food:160,wood:300,metal:200,ammo:900,medicine:50};
  for(const angle of [.7,2.8,4.6]){
    let placed=false;
    for(let r=190;r<=340&&!placed;r+=25)for(let offset=0;offset<.8&&!placed;offset+=.15){
      const x=Math.round((game.hq.x+Math.sin(angle+offset)*r)/8)*8,z=Math.round((game.hq.z+Math.cos(angle+offset)*r)/8)*8;
      if(!game.build('tower',x,z,0)){game.s.structures.at(-1).progress=1;placed=true;}
    }
  }
  game.s.day=2;game.spawnWave();
  for(const z of game.s.zombies){
    while(z.path.length>1&&dist(z,game.hq)>310){const p=z.path.shift();z.x=p.x;z.z=p.z;}
    z.hp=z.maxHp=90;z.speed=8;
  }
  game.log('夜战演练已开始。弹药、设施与感染者仅用于训练，进度不会写入存档。','good');
  return game;
}
