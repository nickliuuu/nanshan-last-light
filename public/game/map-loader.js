export async function loadMap(onProgress=()=>{}) {
 const base=new URL('./data/',import.meta.url);
 const read=async path=>{const r=await fetch(new URL(path,base));if(!r.ok)throw new Error(`地图文件加载失败：${path} (${r.status})`);return r;};
 const map=await (await read('nanshan.json')).json();
 if(map.parts?.length){let next=0,done=0;const parts=new Array(map.parts.length);onProgress(`正在接入扩展区域 · 0 / ${parts.length}`);
  const worker=async()=>{while(next<parts.length){const i=next++;parts[i]=await (await read(map.parts[i])).json();onProgress(`正在接入扩展区域 · ${++done} / ${parts.length}`);}};
  await Promise.all(Array.from({length:4},worker));for(const p of parts)for(const k of ['buildings','roads','parks','airfields'])if(p[k])map[k].push(...p[k]);
 }
 if(map.nav){map.navBytes=new Uint8Array(await (await read(map.nav.file)).arrayBuffer());if(map.navBytes.length!==map.nav.width*map.nav.height)throw new Error('导航数据不完整，请重新加载');}
 return map;
}
