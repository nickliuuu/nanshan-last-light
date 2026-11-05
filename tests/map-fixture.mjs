import {readFileSync} from 'node:fs';
const root=new URL('../public/game/data/',import.meta.url);
export function readMap(){const map=JSON.parse(readFileSync(new URL('nanshan.json',root)));for(const file of map.parts||[]){const part=JSON.parse(readFileSync(new URL(file,root)));for(const key of ['buildings','roads','parks','airfields'])if(part[key])map[key].push(...part[key]);}if(map.nav)map.navBytes=new Uint8Array(readFileSync(new URL(map.nav.file,root)));return map;}
