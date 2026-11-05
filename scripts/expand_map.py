"""Build the expanded, screenshot-matched region from real OSM geometry.
Requires shapely/numpy for offline geometry processing only. The game stays dependency-free.
Usage: python expand_map.py --input /path/to/region.osm --legacy /path/to/nanshan-core-v1.json
"""
import argparse, json, math, re, xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union, polygonize, linemerge
from shapely import make_valid, contains_xy, prepare

ROOT=Path(__file__).resolve().parents[1]
BBOX=[113.75,22.48,114.04,22.71]
ORIGIN=[113.933,22.521]
SX=111320*math.cos(math.radians(ORIGIN[1]));SZ=111320
EXTENT=box(*BBOX)
def project(p):return [round((p[0]-ORIGIN[0])*SX,1),round((ORIGIN[1]-p[1])*SZ,1)]
def name(t):return t.get('name:zh-Hans',t.get('name:zh',t.get('name','')))
def polygons(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return [g]
 return [p for c in getattr(g,'geoms',[]) for p in polygons(c)]
def lines(g):
 if g.is_empty:return []
 if g.geom_type=='LineString':return [g]
 return [l for c in getattr(g,'geoms',[]) for l in lines(c)]
def closed(p):return len(p)>3 and p[0]==p[-1]
def poly(p):
 if not closed(p):return Polygon()
 return make_valid(Polygon(p)).intersection(EXTENT)
def coords(g):return [project(p) for p in g.exterior.coords]
def holes(g):return [[project(p) for p in ring.coords] for ring in g.interiors]
def area_m(g):return g.area*SX*SZ
parser=argparse.ArgumentParser();parser.add_argument('--input',nargs='+',required=True);parser.add_argument('--legacy',required=True);args=parser.parse_args()
nodes={};ways={};relations={};pois=[]
for filename in args.input:
 print('Reading',filename,flush=True)
 for _,e in ET.iterparse(filename,events=('end',)):
  if e.tag not in ['node','way','relation']:continue
  tags={t.get('k'):t.get('v') for t in e.findall('tag')};i=int(e.get('id'))
  if e.tag=='node':
   p=[float(e.get('lon')),float(e.get('lat'))];nodes[i]=p
   if name(tags) and (tags.get('natural')=='peak' or tags.get('railway')=='station' or tags.get('place') or tags.get('aeroway')=='aerodrome'):pois.append({'id':i,'tags':tags,'point':p})
  elif e.tag=='way':ways[i]={'tags':tags,'nodes':[int(n.get('ref')) for n in e.findall('nd')]}
  else:relations[i]={'tags':tags,'members':[(m.get('type'),int(m.get('ref')),m.get('role')) for m in e.findall('member')]}
  e.clear()
print('OSM objects',len(nodes),len(ways),len(relations),flush=True)
def points(w):return [nodes[n] for n in w['nodes'] if n in nodes]
def relation_polys(r):
 outer=[];inner=[]
 for typ,ref,role in r['members']:
  if typ!='way' or ref not in ways:continue
  p=points(ways[ref]);
  if len(p)>1:(inner if role=='inner' else outer).append(LineString(p))
 def join(ls):
  if not ls:return Polygon()
  return unary_union(list(polygonize(unary_union(ls))))
 return polygons(make_valid(join(outer).difference(join(inner))).intersection(EXTENT))
water_geo=[];parks=[];buildings={};roads=[];airfields=[];coasts=[];label_candidates=[]
WIDTHS={'motorway':12,'trunk':12,'primary':10,'secondary':9,'tertiary':7,'residential':6,'service':4,'pedestrian':4,'footway':2,'cycleway':2,'path':1.5}
def add_building(i,t,g):
 if area_m(g)<35 or area_m(g)>700000:return
 raw=t.get('height','').replace('米','').replace('m','').strip();explicit=False
 try:h=float(re.findall(r'[\d.]+',raw)[0]);explicit=True
 except (ValueError,IndexError):
  try:h=float(t.get('building:levels',''))*3.3;explicit=True
  except ValueError:h=12+(i%11)*3.3 if area_m(g)<2500 else 28+(i%7)*8
 n=name(t);kind='residential'
 if t.get('shop') or t.get('building') in ['retail','commercial','supermarket']:kind='shop'
 if t.get('amenity') in ['hospital','clinic','pharmacy'] or any(s in n for s in ['医院','药房','社康']):kind='medical'
 if t.get('building') in ['industrial','warehouse']:kind='industrial'
 buildings[i]={'id':i,'p':coords(g),'h':round(min(420,max(5,h)),1),'known':explicit,'name':n,'kind':kind}
 if n:label_candidates.append((n,g.centroid,t,'building'))
park_types=['park','garden','pitch','nature_reserve'];land_types=['grass','forest','meadow','recreation_ground']
def add_area(i,t,g):
 if t.get('natural')=='water' or t.get('water') or t.get('landuse')=='reservoir':water_geo.append(g)
 if t.get('leisure') in park_types or t.get('landuse') in land_types or t.get('natural') in ['wood','grassland'] or t.get('boundary')=='national_park':
  parks.append({'id':i,'p':coords(g),'holes':holes(g),'kind':t.get('leisure',t.get('landuse',t.get('natural'))),'name':name(t)})
  if name(t):label_candidates.append((name(t),g.representative_point(),t,'park'))
 if t.get('aeroway') in ['apron','aerodrome','terminal','runway','taxiway']:
  airfields.append({'id':i,'p':coords(g),'kind':t['aeroway'],'area':True,'name':name(t)})
  if name(t):label_candidates.append((name(t),g.centroid,t,'airport'))
for i,w in ways.items():
 t=w['tags'];p=points(w)
 if len(p)<2:continue
 if t.get('natural')=='coastline':coasts.append(LineString(p))
 if closed(p):
  for k,g in enumerate(polygons(poly(p))):
   if t.get('building') and t['building']!='no':add_building(i if k==0 else i+40000000000+k,t,g)
   add_area(i,t,g)
 hw=t.get('highway');aero=t.get('aeroway')
 if hw and hw not in ['proposed','construction','platform','steps'] and t.get('area')!='yes' and t.get('tunnel')!='yes':
  for k,g in enumerate(lines(LineString(p).intersection(EXTENT))):
   roads.append({'id':i if k==0 else i+50000000000+k,'p':[project(p) for p in g.coords],'kind':hw,'w':WIDTHS.get(hw,4),'name':name(t),'bridge':t.get('bridge') in ['yes','viaduct']})
 if aero in ['runway','taxiway'] and not closed(p):
  for g in lines(LineString(p).intersection(EXTENT)):
   try:width=float(t.get('width',45 if aero=='runway' else 20))
   except ValueError:width=45 if aero=='runway' else 20
   airfields.append({'id':i,'p':[project(p) for p in g.coords],'kind':aero,'w':width,'name':name(t),'ref':t.get('ref','')})
 if name(t) and any(s in name(t) for s in ['凤凰山','阳台山','羊台山','铁岗','西丽','机场北','南山公园','宝安中心','前海','华侨城','塘朗山','平峦山']):
  g=LineString(p);label_candidates.append((name(t),g.centroid,t,'way'))
for i,r in relations.items():
 t=r['tags']
 if t.get('type')!='multipolygon':continue
 for k,g in enumerate(relation_polys(r)):
  if t.get('building'):add_building(i+20000000000+k,t,g)
  add_area(i+20000000000+k,t,g)
  if name(t):label_candidates.append((name(t),g.representative_point(),t,'relation'))
# Polygonize the surveyed coast with the map boundary. OSM coast direction has land on its left.
coast_union=unary_union([l.intersection(EXTENT) for l in coasts]+[EXTENT.boundary])
faces=list(polygonize(coast_union));votes=[[0.,0.] for _ in faces]
for coast in coasts:
 pts=list(coast.coords)
 for a,b in zip(pts,pts[1:]):
  dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy)
  if length<1e-9:continue
  # Probe both sides within one centimetre: metre-scale offsets can jump across
  # thin piers and incorrectly turn the entire mainland face into ocean.
  for side,sign in enumerate([1,-1]):
   epsilon=min(1e-7,length/10)
   probe=Point((a[0]+b[0])/2+sign*dy/length*epsilon,(a[1]+b[1])/2-sign*dx/length*epsilon)
   if not EXTENT.contains(probe):continue
   for j,g in enumerate(faces):
    if g.contains(probe):votes[j][side]+=length;break
sea_faces={j for j,(right,left) in enumerate(votes) if right>left}
for j in sea_faces:water_geo.append(faces[j])
print('Coast faces',len(faces),'sea faces',len(sea_faces),flush=True)
if not sea_faces:raise RuntimeError('Coastline did not form ocean polygons; refusing an inaccurate water map')
water_shapes=polygons(make_valid(unary_union(water_geo)).intersection(EXTENT))
if any(g.covers(Point(113.933,22.521)) for g in water_shapes):
 raise RuntimeError('Headquarters is classified as water; refusing to replace playable map')
water=[coords(g) for g in water_shapes];water_holes=[holes(g) for g in water_shapes]
# Preserve all previous building IDs, heights and footprints so old campaigns remain meaningful.
legacy=json.loads(Path(args.legacy).read_text())
for b in legacy['buildings']:buildings[b['id']]=b
buildings=list(buildings.values());known=sum(b['known'] for b in buildings)
for p in pois:label_candidates.append((name(p['tags']),Point(p['point']),p['tags'],'node'))
labels=list(legacy['labels']);regions=[]
# Label anchors are selected from OSM features, never invented geographic coordinates.
specs=[('airport','深圳宝安国际机场',['深圳宝安国际机场','宝安国际机场'],'BAOAN AIRPORT',5000),('airport-north','机场北站',['机场北','深圳机场北站'],'AIRPORT NORTH',1800),('fenghuang','凤凰山',['凤凰山森林公园','凤凰山'],'FENGHUANG MOUNTAIN',6500),('yangtai','阳台山',['阳台山森林公园','羊台山森林公园','大羊台山','阳台山'],'YANGTAI MOUNTAIN',6500),('tiegang','铁岗水库',['铁岗水库'],'TIEGANG RESERVOIR',6200),('xili-lake','西丽湖',['西丽水库','西丽湖'],'XILI LAKE',5000),('baoan','宝安中心',['宝安中心'],'BAOAN CENTRE',2800),('qianhai','前海',['前海湾','前海石公园','前海'],'QIANHAI',3500),('xili','西丽',['西丽','西丽站'],'XILI',2800),('tanglang','塘朗山',['塘朗山郊野公园','塘朗山公园','塘朗山'],'TANGLANG MOUNTAIN',5200),('nanshan-park','南山公园',['南山公园','南山'],'NANSHAN PARK',3500),('oct','华侨城',['华侨城','华侨城生态广场'],'OCT',2800),('pingluan','平峦山',['平峦山公园','平峦山'],'PINGLUAN MOUNTAIN',3500)]
for key,title,names,en,zoom in specs:
 candidates=[c for c in label_candidates if c[0] in names and EXTENT.covers(c[1])]
 candidates.sort(key=lambda c:(names.index(c[0]),0 if c[3]=='node' else 1 if c[3]=='relation' else 2))
 if not candidates:print('Missing anchor',title,flush=True);continue
 n,p,t,typ=candidates[0];x,z=project([p.x,p.y]);entry={'id':key,'name':title,'en':en,'x':x,'z':z,'y':35,'zoom':zoom,'sourceName':n}
 labels.append(entry);regions.append(entry)
regions.append({'id':'hq','name':'后海安全区','en':'HOUHAI SAFE ZONE','x':76.465,'z':174.59,'y':50,'zoom':1600})
bounds=[*project([BBOX[0],BBOX[3]]),*project([BBOX[2],BBOX[1]])]
# Anchor the expanded grid to the old grid so saved paths around the HQ stay aligned.
step=20;minX=legacy['bounds'][0]+math.floor((bounds[0]-legacy['bounds'][0])/step)*step;minZ=legacy['bounds'][1]+math.floor((bounds[1]-legacy['bounds'][1])/step)*step
width=math.ceil((bounds[2]-minX)/step);height=math.ceil((bounds[3]-minZ)/step);mask=np.zeros((height,width),dtype=np.uint8)
def raster(g,value):
 x0,z0,x1,z1=g.bounds;i0=max(0,math.floor((x0-minX)/step));i1=min(width,math.ceil((x1-minX)/step));j0=max(0,math.floor((z0-minZ)/step));j1=min(height,math.ceil((z1-minZ)/step))
 if i1<=i0 or j1<=j0:return
 xs=minX+(np.arange(i0,i1)+.5)*step;zs=minZ+(np.arange(j0,j1)+.5)*step
 prepare(g);inside=contains_xy(g,xs[None,:],zs[:,None]);view=mask[j0:j1,i0:i1];view[inside]=value
for p,h in zip(water,water_holes):raster(Polygon(p,h),2)
for r in roads:
 if r['bridge']:raster(LineString(r['p']).buffer(max(15,r['w']/2)),0)
for b in buildings:raster(make_valid(Polygon(b['p'])),1)
mask[0,:]=mask[-1,:]=mask[:,0]=mask[:,-1]=2
nav_path=ROOT/'public/game/data/region-nav.bin';mask.tofile(nav_path)
# Partition geometry into bounded files. Browsers read these with four concurrent requests.
data_dir=ROOT/'public/game/data/region';data_dir.mkdir(exist_ok=True)
parts=[];features={'buildings':buildings,'roads':roads,'parks':parks,'airfields':airfields}
for kind,items in features.items():
 for start in range(0,len(items),1500):
  filename=f'{kind}-{start//1500:03d}.json';p=data_dir/filename;p.write_text(json.dumps({kind:items[start:start+1500]},ensure_ascii=False,separators=(',',':')));parts.append('region/'+filename)
out={'id':'nanshan-baoan-osm-v2','compatibleMapIds':[legacy['id']],'name':'深圳西部 · 南山—宝安','origin':ORIGIN,'scale':[SX,SZ],'bounds':bounds,'hqId':legacy['hqId'],'buildings':[],'roads':[],'parks':[],'airfields':[],'water':water,'waterHoles':water_holes,'labels':labels,'regions':regions,'parts':parts,'nav':{'file':'region-nav.bin','step':step,'minX':round(minX,1),'minZ':round(minZ,1),'width':width,'height':height},'meta':{'source':'OpenStreetMap API / Overpass','downloadDate':'2026-11-04','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','boundsWGS84':BBOX,'areaKm2':round((bounds[2]-bounds[0])*(bounds[3]-bounds[1])/1e6,1),'heightKnown':known,'heightEstimated':len(buildings)-known,'counts':{k:len(v) for k,v in features.items()},'notes':'Bounds inferred approximately from user screenshot landmarks, in WGS84. Real OSM footprints/roads/coastlines. Flat terrain; heights partly estimated. Saved core building geometry retained. Facades and gameplay are fictional.'}}
(ROOT/'public/game/data/nanshan.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
(ROOT/'public/game/data/region-provenance.json').write_text(json.dumps({'bounds':BBOX,'osmNodes':len(nodes),'osmWays':len(ways),'osmRelations':len(relations),'coastFaces':len(faces),'seaFaces':len(sea_faces),'labels':regions,'counts':out['meta']['counts'],'grid':[width,height]},ensure_ascii=False,indent=2))
print(json.dumps({'counts':out['meta']['counts'],'areaKm2':out['meta']['areaKm2'],'labels':len(regions),'parts':len(parts),'navBytes':nav_path.stat().st_size,'manifestBytes':(ROOT/'public/game/data/nanshan.json').stat().st_size},ensure_ascii=False,indent=2),flush=True)
