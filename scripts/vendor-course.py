"""Download a bounded BIO 251 collection from a pinned Bioicons revision.

Usage: python scripts/vendor-course.py ../downloads
The input directory contains bioicons-catalog.json, bioicons-tree.json and
bioicons-commit.json, retrieved from the official Bioicons GitHub repository.
"""
import concurrent.futures, hashlib, json, pathlib, sys, urllib.parse, urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
cache = pathlib.Path(sys.argv[1])
revision = json.loads((cache/'bioicons-commit.json').read_text())['sha']
tree = json.loads((cache/'bioicons-tree.json').read_text())['tree']
upstream = json.loads((cache/'bioicons-catalog.json').read_text())
catalog_path = root/'dist/assets/catalog.json'
catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
# Exact upstream names, with deliberately bounded choices and honest scope notes.
choices = [
 ('Celegans','cc-0','秀丽隐杆线虫',['movement'],'C. elegans worm 线虫 unc GFP'),
 ('ArabidopsisSeedlings','cc-0','拟南芥幼苗',['transcription'],'Arabidopsis seedling 拟南芥 幼苗 LUC'),
 ('ArabidopsisTopView','cc-0','拟南芥莲座叶',['transcription'],'Arabidopsis plant 拟南芥 植物'),
 ('Leaf','cc-0','叶片（通用示意）',['photosynthesis'],'leaf 菠菜 spinach Hill 叶片'),
 ('Bacteria_colonies','cc-0','细菌菌落（通用示意）',['genetics'],'colonies screening 菌落 筛选 Serratia'),
 ('bacteria_culture_loop','cc-0','接种环',['genetics'],'inoculation loop 接种'),
 ('plasmid_library','cc-0','质粒文库（通用示意）',['genetics'],'plasmid library 质粒 文库'),
 ('centrifuge','cc-by-3.0','离心机',['genetics','transcription','photosynthesis'],'centrifuge 离心 提取'),
 ('spectrophotometer','cc-by-3.0','分光光度计',['basics','transcription','photosynthesis'],'spectrophotometer absorbance 分光 光度 吸光度 Bradford Hill'),
 ('cuvette','cc-by-3.0','比色皿',['transcription','photosynthesis'],'cuvette 比色皿 DCIP'),
 ('microtube-open-translucent','cc-by-3.0','微量离心管（打开）',['basics','genetics','transcription'],'microtube eppendorf 离心管'),
 ('microtube-closed-translucent','cc-by-3.0','微量离心管（闭合）',['basics','genetics','transcription'],'microtube eppendorf 离心管'),
 ('petri-dish-top-gray','cc-by-3.0','培养皿（通用示意）',['genetics','transport','movement'],'petri dish plate 培养皿 平板'),
 ('electrophoresis-chamber','cc-by-3.0','电泳槽',['genetics'],'gel electrophoresis DNA 电泳槽'),
 ('membrane-2d-bluelight','cc-by-3.0','脂质双层（通用示意）',['transport','photosynthesis'],'membrane lipid 膜运输 脂质双层'),
 ('carrier-protein-membrane-3','cc-by-3.0','膜载体（非特定 OAT 结构）',['transport'],'carrier transport organic anion OAT 膜运输 有机阴离子'),
 ('sodium-potassium-pump-membrane-ions','cc-by-3.0','钠钾泵（通用示意）',['transport'],'sodium potassium pump 钠钾泵 离子'),
 ('actin-myosin','cc-by-3.0','肌动蛋白与肌球蛋白',['movement'],'actin myosin muscle 肌动蛋白 肌球蛋白 肌肉'),
 ('microscope-stereo','cc-by-4.0','体视显微镜',['transport','movement'],'stereo dissecting microscope 体视 解剖 显微镜'),
 ('pipette-tip-box','cc-by-4.0','移液枪头盒',['basics','genetics','transcription'],'pipette tip 移液 枪头'),
 ('tube-rack','cc-by-4.0','试管架',['basics','genetics','transcription'],'tube rack 试管架'),
 ('c-elegans-dumpy_mutant','cc-by-4.0','线虫 Dumpy 表型（非指定 unc 基因）',['movement'],'C. elegans dumpy phenotype 线虫 表型'),
 ('F-actin','cc-by-4.0','丝状肌动蛋白',['movement'],'F actin phalloidin 肌动蛋白 鬼笔环肽'),
]
licenses = {'cc-0':'https://creativecommons.org/publicdomain/zero/1.0/',
 'cc-by-3.0':'https://creativecommons.org/licenses/by/3.0/',
 'cc-by-4.0':'https://creativecommons.org/licenses/by/4.0/'}

def retrieve(choice):
 name, license, label, modules, words = choice
 candidates = [a for a in upstream if a['name']==name and a['license']==license]
 if len(candidates)!=1: raise ValueError(f'Ambiguous metadata: {name}')
 item = dict(candidates[0])
 paths = [x['path'] for x in tree if x['path'].startswith(f'static/icons/{license}/{item["category"]}/') and x['path'].endswith('/'+name+'.svg')]
 if len(paths)!=1: raise ValueError(f'Ambiguous path: {name}')
 source = f'https://raw.githubusercontent.com/duerrsimon/bioicons/{revision}/'+urllib.parse.quote(paths[0])
 with urllib.request.urlopen(source, timeout=45) as response: data=response.read(2_000_001)
 if len(data)>2_000_000 or b'<svg' not in data: raise ValueError(f'Invalid SVG: {name}')
 asset_id='bioicons-'+name
 src='assets/'+asset_id+'.svg'
 (root/'dist'/src).write_bytes(data)
 item.update(id=asset_id,label=label,src=src,source=source,licenseUrl=licenses[license],
             modules=modules,keywords=words.split(),course='BIO 251 Fall 2026',
             sourceRevision=revision,sha256=hashlib.sha256(data).hexdigest(),
             scopeNote='Illustrative asset; not a measured result or an organism/structure identification.')
 return item

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 additions=list(pool.map(retrieve, choices))
new_ids={a['id'] for a in additions}
catalog=[a for a in catalog if a['id'] not in new_ids]
existing_modules={
 'Pipette':['basics','genetics','transcription','photosynthesis'],
 '96-well-plate-2d':['basics','transcription'], 'vortex_mixer':['basics','genetics','transcription'],
 'generic-bacterium':['genetics'],'Bacteria_Swimming':['genetics'],
 'plasmid-3':['genetics'],'plasmid-4':['genetics'],'plasmid-2':['genetics'],
 'DNA_double_helix':['genetics'],'DNA':['genetics'],'ssDNA-single-stranded':['genetics'],
 'restriction_enzyme':['genetics'],'agarose-gel':['genetics'],'isolation':['genetics'],
 'erlenmeyer_filled':['genetics'],'incubator':['genetics'],
 'microscope-cartoon':['transport','movement'],'inverted_microscope':['transport','movement'],
 'atp':['transport','photosynthesis'],'adp':['transport','photosynthesis']}
for a in catalog:
 a['modules']=existing_modules.get(a['id'],[])
 if a['modules']: a['course']='BIO 251 Fall 2026'
catalog += additions
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Added {len(additions)} course assets; {len(catalog)} total. Revision {revision}')
