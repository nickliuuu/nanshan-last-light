import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const dir of ['public/game','server'])for(const file of readdirSync(dir).filter(f=>/\.m?js$/.test(f))){const result=spawnSync(process.execPath,['--check',dir+'/'+file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log('Game and relay modules passed syntax checks.');
