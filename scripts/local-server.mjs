import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {handleRooms} from '../server/rooms.mjs';
import {sqliteAdapter,migrateLocal} from '../server/sqlite-adapter.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.mkdir(path.join(root,'.local-coop'),{recursive:true});
const db=sqliteAdapter(path.join(root,'.local-coop/rooms.sqlite'));migrateLocal(db,path.join(root,'drizzle'));
const port=Number(process.env.PORT||4173),host=process.argv.includes('--lan')?'0.0.0.0':'127.0.0.1';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.bin':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/api/coop'){
  const request=new Request(url,{method:req.method,headers:req.headers,body:req.method==='POST'?req:undefined,duplex:'half'});
  const response=await handleRooms(request,db);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 let pathname=decodeURIComponent(url.pathname);if(pathname.startsWith('/game/'))pathname=pathname.slice(5);if(pathname==='/')pathname='/index.html';
 const publicRoot=path.join(root,'public/game'),file=path.resolve(publicRoot,'.'+pathname);if(!file.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end();return;}
 const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end('请求失败');}});
server.listen(port,host,()=>{console.log(`最后防线 · 双人合作版 http://127.0.0.1:${port}/`);if(process.argv.includes('--open')&&process.platform==='darwin')execFile('open',[`http://127.0.0.1:${port}/`]);if(host==='0.0.0.0')for(const list of Object.values(os.networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal)console.log(`同一 Wi-Fi 的队友打开：http://${n.address}:${port}/`);});
