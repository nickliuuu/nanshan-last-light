"""Cache OSM API 0.6 tiles with bounded concurrency, retries and recursive size splitting."""
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import subprocess,json,time,xml.etree.ElementTree as ET
ROOT=Path('/private/tmp/nanshan-region-osm/tiles');ROOT.mkdir(parents=True,exist_ok=True)
BBOX=[113.75,22.48,114.04,22.71]
def fetch(b,depth=0):
 key='_'.join(f'{v:.5f}' for v in b);out=ROOT/(key+'.osm')
 if out.exists() and out.stat().st_size>80:
  try:ET.parse(out);return [str(out)]
  except ET.ParseError:pass
 for attempt in range(3):
  temp=ROOT/(key+'.part');url='https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(f'{v:.5f}' for v in b)
  r=subprocess.run(['curl','--compressed','-sS','-L','--max-time','65','-w','%{http_code}',url,'-o',str(temp)],capture_output=True,text=True)
  if r.returncode==0 and r.stdout=='200':
   try:ET.parse(temp)
   except ET.ParseError:continue
   temp.replace(out);return [str(out)]
  if r.stdout=='400' and depth<3:
   x0,y0,x1,y1=b;xm=(x0+x1)/2;ym=(y0+y1)/2
   return sum((fetch(bb,depth+1) for bb in [[x0,y0,xm,ym],[xm,y0,x1,ym],[x0,ym,xm,y1],[xm,ym,x1,y1]]),[])
  time.sleep(60*(attempt+1) if r.stdout=='429' else 2+attempt*3)
 raise RuntimeError(f'OSM tile failed: {key}; status={r.stdout}; {r.stderr[:180]}')
tiles=[]
for j in range(10):
 for i in range(12):
  x0=BBOX[0]+i*.025;y0=BBOX[1]+j*.025
  if x0>=BBOX[2] or y0>=BBOX[3]:continue
  tiles.append([x0,y0,min(x0+.025,BBOX[2]),min(y0+.025,BBOX[3])])
# Two requests maximum, so the public endpoint is not flooded.
files=[];errors=[]
with ThreadPoolExecutor(max_workers=2) as pool:
 futures={pool.submit(fetch,t):t for t in tiles}
 for n,f in enumerate(as_completed(futures),1):
  try:files.extend(f.result())
  except Exception as e:errors.append(str(e));print(str(e),flush=True)
  if n%10==0 or n==len(tiles):print(f'Completed {n}/{len(tiles)} tiles; {len(errors)} errors',flush=True)
(ROOT/'manifest.json').write_text(json.dumps({'bounds':BBOX,'files':files,'errors':errors},indent=2))
if errors:raise SystemExit(1)
print(f'Region complete: {len(files)} verified OSM tiles',flush=True)
