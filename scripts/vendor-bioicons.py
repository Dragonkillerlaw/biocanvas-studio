"""Vendor a curated CC0 Bioicons set; preserve provenance for each SVG."""
import json, pathlib, urllib.request, urllib.parse, concurrent.futures
root=pathlib.Path(__file__).resolve().parents[1]
base='https://raw.githubusercontent.com/duerrsimon/bioicons/main/static/icons/'
all_icons=json.load(urllib.request.urlopen(base+'icons.json'))
tree=json.load(urllib.request.urlopen('https://api.github.com/repos/duerrsimon/bioicons/git/trees/main?recursive=1'))['tree']
names=['Pipette','erlenmeyer_filled','incubator','qpcr_machine','vortex_mixer','water_bath','microscope-cartoon','simple-syringe-cartoon','round-bottomed-flask-cartoon','chromatography','Yeast','Bacteria_Swimming','Phage','96-well-plate-2d','agarose-gel','generic-bacterium','plasmid-3','plasmid-4','DNA_double_helix','DNA','chromatin-histones','ssDNA-single-stranded','plasmid-2','restriction_enzyme','CRISPR_Cas9_vector','atp','adp','T75_flask','bioreactor','isolation','inverted_microscope','sonicator']
labels=['移液器','锥形瓶','培养箱','PCR 仪','涡旋混合器','水浴锅','显微镜','注射器','圆底烧瓶','层析柱','酵母','游动细菌','噬菌体','96 孔板','琼脂糖凝胶','细菌','质粒 03','质粒 04','DNA 双螺旋','DNA','染色质','单链 DNA','质粒 02','限制性内切酶','CRISPR / Cas9','ATP','ADP','培养瓶','生物反应器','分离培养','倒置显微镜','超声仪']
labelmap=dict(zip(names,labels))
selected=[i for n in names for i in all_icons if i['name']==n and i['license']=='cc-0']
def get(item):
 i=dict(item); path='/'.join([i['license'],i['category'],i['author'],i['name']+'.svg']);url=base+urllib.parse.quote(path)
 matches=[x['path'] for x in tree if x['path'].startswith('static/icons/cc-0/'+i['category']+'/') and x['path'].endswith('/'+i['name']+'.svg')]
 if not matches: raise ValueError('No source for '+i['name'])
 url='https://raw.githubusercontent.com/duerrsimon/bioicons/main/'+urllib.parse.quote(matches[0])
 target='assets/'+i['name']+'.svg'
 if not (root/'dist'/target).exists():
  data=urllib.request.urlopen(url,timeout=40).read(); (root/'dist'/target).write_bytes(data)
 i.update(id=i['name'],label=labelmap[i['name']],src=target,source=url,licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/')
 return i
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: icons=list(pool.map(get,selected))
(root/'dist/assets/catalog.json').write_text(json.dumps(icons,ensure_ascii=False,indent=2))
print(f'Vendored {len(icons)} CC0 icons.')
