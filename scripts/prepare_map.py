"""Build the distributable ODbL map from OSM XML tiles. No synthetic footprints."""
import glob, json, math, re, xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ORIGIN=[113.933,22.521]
SX=111320*math.cos(math.radians(ORIGIN[1])); SZ=111320
def project(p): return [round((p[0]-ORIGIN[0])*SX,1),round((ORIGIN[1]-p[1])*SZ,1)]
def tags(e):return {t.get('k'):t.get('v') for t in e.findall('tag')}
nodes={};ways={};relations={}
for f in glob.glob('/private/tmp/nanshan-osm-tiles/*.osm'):
    try:r=ET.parse(f).getroot()
    except ET.ParseError:continue
    for e in r.findall('node'):nodes[e.get('id')]=[float(e.get('lon')),float(e.get('lat'))]
    for e in r.findall('way'):ways[e.get('id')]=e
    for e in r.findall('relation'):relations[e.get('id')]=e
def points(w):return [project(nodes[n.get('ref')]) for n in w.findall('nd') if n.get('ref') in nodes]
def mean(p):return [sum(x[i] for x in p)/len(p) for i in (0,1)]
def area(p):return abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p)))/2)
bounds=[*project([113.91,22.55]),*project([113.97,22.49])]
def valid(p):
    if len(p)<3:return False
    x,z=mean(p)
    return bounds[0]-200<x<bounds[2]+200 and bounds[1]-200<z<bounds[3]+200
def rings(parts):
    parts=[p[:] for p in parts if len(p)>1];out=[]
    while parts:
        chain=parts.pop(0);changed=True
        while changed and chain[0]!=chain[-1]:
            changed=False
            for i,p in enumerate(parts):
                if chain[-1]==p[0]:chain+=p[1:]
                elif chain[-1]==p[-1]:chain+=p[-2::-1]
                elif chain[0]==p[-1]:chain=p[:-1]+chain
                elif chain[0]==p[0]:chain=p[:0:-1]+chain
                else:continue
                parts.pop(i);changed=True;break
        out.append(chain)
    return out
buildings=[];roads=[];water=[];parks=[];coasts=[];labels=[]
height_known=0
def building(i,t,p):
    global height_known
    if not valid(p) or area(p)<35 or area(p)>300000:return
    raw=t.get('height','').replace('米','').replace('m','').strip();levels=t.get('building:levels','')
    explicit=False
    try:h=float(re.findall(r'[\d.]+',raw)[0]);explicit=True
    except (ValueError,IndexError):
        try:h=float(levels)*3.3;explicit=True
        except ValueError:h=12+(i%11)*3.3 if area(p)<2500 else 28+(i%7)*8
    name=t.get('name:zh-Hans',t.get('name:zh',t.get('name','')))
    if name and re.match(r'^\d+栋$',name) and t.get('addr:housename'):name=t['addr:housename']+' '+name
    typ=t.get('building','yes');kind='residential'
    if t.get('shop') or typ in ['retail','commercial','supermarket']:kind='shop'
    if t.get('amenity') in ['hospital','clinic','pharmacy'] or any(s in name for s in ['医院','药房','社康']):kind='medical'
    if typ in ['industrial','warehouse']:kind='industrial'
    buildings.append({'id':int(i),'p':p,'h':round(min(420,max(5,h)),1),'known':explicit,'name':name,'kind':kind})
    height_known+=int(explicit)
for i,w in ways.items():
    t=tags(w);p=points(w)
    if len(p)<2:continue
    if t.get('building') and t['building']!='no':building(int(i),t,p)
    hw=t.get('highway')
    if hw and hw not in ['proposed','construction','platform','steps'] and t.get('area')!='yes' and t.get('tunnel')!='yes':
        widths={'motorway':12,'trunk':12,'primary':10,'secondary':9,'tertiary':7,'residential':6,'service':4,'pedestrian':4,'footway':2,'cycleway':2,'path':1.5}
        roads.append({'id':int(i),'p':p,'kind':hw,'w':widths.get(hw,4),'name':t.get('name:zh',t.get('name','')),'bridge':t.get('bridge')=='yes'})
    if t.get('natural')=='water' and valid(p) and p[0]==p[-1]:water.append(p)
    if t.get('natural')=='coastline':coasts.append(p)
    if t.get('leisure') in ['park','garden','pitch'] or t.get('landuse') in ['grass','forest','meadow','recreation_ground'] or t.get('natural') in ['wood','grassland']:
        if valid(p) and p[0]==p[-1]:parks.append({'p':p,'kind':t.get('leisure',t.get('landuse',t.get('natural'))),'name':t.get('name:zh',t.get('name',''))})
for i,r in relations.items():
    t=tags(r)
    if t.get('type')!='multipolygon':continue
    parts=[points(ways[m.get('ref')]) for m in r.findall('member') if m.get('type')=='way' and m.get('role') in ['outer',''] and m.get('ref') in ways]
    for p in rings(parts):
        if len(p)<4 or p[0]!=p[-1] or not valid(p):continue
        if t.get('natural')=='water':water.append(p)
        if t.get('building'):building(int(i)+20000000000,t,p)
        if t.get('leisure') in ['park','garden'] or t.get('landuse') in ['grass','forest']:parks.append({'p':p,'kind':'park','name':t.get('name:zh',t.get('name',''))})
        if t.get('name')=='海岸城购物中心':
            for b in buildings:
                if b['id'] in [int(m.get('ref')) for m in r.findall('member') if m.get('type')=='way']:
                    b['name']='海岸城购物中心';b['kind']='shop'
# OSM's coast runs from the southern map edge toward the eastern map edge here.
# Close it outside the playable extent on the sea side; keep all surveyed vertices.
for p in rings(coasts):
    if p[0]==p[-1]:continue
    if len(p)>100:
        if p[0][1]<p[-1][1]:p=list(reversed(p))
        water.append(p+[[bounds[2]+5000,p[-1][1]],[bounds[2]+5000,bounds[3]+5000],[p[0][0],bounds[3]+5000],p[0]])
# A small set of labels drawn from mapped names, with bilingual display labels.
names=[('海岸城购物中心','COASTAL CITY'),('深圳保利剧院','POLY THEATRE'),('中国华润大厦','CHINA RESOURCES TOWER'),('深圳湾体育中心','SHENZHEN BAY SPORTS CENTER'),('深圳人才公园','TALENT PARK'),('深圳大学','SHENZHEN UNIVERSITY'),('深圳湾万象城','MIXC SHENZHEN BAY'),('深圳湾口岸','SHENZHEN BAY PORT')]
for name,en in names:
    candidate=None
    for i,w in ways.items():
        t=tags(w);n=t.get('name:zh',t.get('name',''))
        if n==name:
            p=points(w)
            if valid(p):candidate=(p,30)
    for b in buildings:
        if b['name']==name:candidate=(b['p'],b['h']+8)
    if candidate:
        p,h=candidate;x,z=mean(p);labels.append({'name':name,'en':en,'x':x,'z':z,'y':h})
if not any(p['name']=='海岸城购物中心' for p in labels):
    b=next((b for b in buildings if '海岸城' in b['name']),None)
    if b:x,z=mean(b['p']);labels.append({'name':'海岸城','en':'COASTAL CITY','x':x,'z':z,'y':b['h']+12})
hq=next(b for b in buildings if b['name']=='深圳保利剧院')
out={'id':'nanshan-houhai-osm-v1','name':'深圳南山 · 后海—深圳湾','origin':ORIGIN,'scale':[SX,SZ],'bounds':bounds,'hqId':hq['id'],'buildings':buildings,'roads':roads,'water':water,'parks':parks,'labels':labels,'meta':{'source':'OpenStreetMap API 0.6','downloadDate':'2026-11-04','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','boundsWGS84':[113.91,22.49,113.97,22.55],'heightKnown':height_known,'heightEstimated':len(buildings)-height_known,'notes':'Real OSM footprints and road geometry. Heights estimated where tags are absent. Gameplay loot, structures, vegetation and events are fictional. Multipolygon inner holes and building parts are simplified.'}}
(ROOT/'data-source/nanshan-core-v1.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'buildings':len(buildings),'roads':len(roads),'water':len(water),'parks':len(parks),'labels':labels,'hq':hq['id'],'heightKnown':height_known,'bytes':(ROOT/'data-source/nanshan-core-v1.json').stat().st_size},ensure_ascii=False,indent=2))
