"""Vendor a small, licensed methods-illustration collection.

Usage: python scripts/vendor-methods.py [download-cache-directory]
Then regenerate normalized.json with scripts/check-browser.cjs.
"""
import copy
import hashlib
import json
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
REV = 'd29e766ea7580b8063c4f47b29e872db40a4d979'
BASE = f'https://raw.githubusercontent.com/duerrsimon/bioicons/{REV}/static/icons/cc-by-4.0/'
ITEMS = [
    ('Centrifuge', 'Microbiology', 'Andi-Wilson', '台式微量离心机', 'centrifuge pellet supernatant 离心 沉淀 上清'),
    ('shaker', 'Lab_apparatus', 'DBCLS', '实验室摇床（通用示意）', 'shaker shaking recovery 摇床 振荡 复苏'),
    ('DNA_monochrome', 'Nucleic_acids', 'DBCLS', 'DNA 双螺旋（黑白）', 'DNA double helix 双螺旋 核酸'),
]

def retrieve(url, filename):
    if CACHE and (CACHE / filename).exists():
        return (CACHE / filename).read_bytes()
    request = urllib.request.Request(url, headers={'User-Agent': 'BioCanvas/0.3 asset importer'})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000 or b'<svg' not in data:
        raise ValueError('Invalid SVG: ' + filename)
    return data

catalog_path = ROOT / 'dist/assets/catalog.json'
catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
added = []
for name, category, author, label, words in ITEMS:
    source = BASE + f'{category}/{author}/{name}.svg'
    data = retrieve(source, name + '.svg')
    asset_id = 'bioicons-' + name
    # Keep the stable asset ID; avoid a filename collision with Servier's centrifuge.svg on Windows.
    src = 'assets/' + ('bioicons-benchtop-centrifuge' if name == 'Centrifuge' else asset_id) + '.svg'
    (ROOT / 'dist' / src).write_bytes(data)
    added.append(dict(id=asset_id, name=name, category=category, author=author,
        label=label, src=src, source=source, sourceRevision=REV,
        sha256=hashlib.sha256(data).hexdigest(), license='cc-by-4.0',
        licenseUrl='https://creativecommons.org/licenses/by/4.0/',
        modules=['genetics'], keywords=words.split(),
        scopeNote='Generic illustrative asset; not an exact instrument model or measured result.'))

source = 'https://upload.wikimedia.org/wikipedia/commons/5/53/Qiagen_Mini_Spin_Column.svg'
source_page = 'https://commons.wikimedia.org/wiki/File:Qiagen_Mini_Spin_Column.svg'
data = retrieve(source, 'Qiagen_Mini_Spin_Column.svg')
root = ET.fromstring(data)
ns = '{http://www.w3.org/2000/svg}'
layer = root.find(ns + 'g')
# Keep only the tube/column drawing; remove the chemistry inset and its callout.
keep = {'g7969', 'path6101', 'path6105', 'path6113', 'path6121', 'path7981',
        'path7983', 'path7985', 'ellipse7987', 'path7989', 'path7991', 'path6135'}
if not keep.issubset({e.get('id') for e in layer}):
    raise ValueError('Upstream SVG changed: expected column objects missing')
for child in list(layer):
    if child.get('id') not in keep:
        layer.remove(child)
root.set('viewBox', '210 10 65 150')
root.set('width', '65')
root.set('height', '150')
ET.register_namespace('', 'http://www.w3.org/2000/svg')
adapted = ET.tostring(root, encoding='utf-8', xml_declaration=True)
src = 'assets/commons-spin-column.svg'
(ROOT / 'dist' / src).write_bytes(adapted)
added.append(dict(id='commons-spin-column', name='Spin column and collection tube',
    category='Lab_apparatus', author='Squidonius', label='离心柱与收集管（通用示意）',
    src=src, source=source_page, downloadUrl=source,
    sourceRevision='Commons file revision 2012-12-07T18:02:00Z',
    sourceSha256=hashlib.sha256(data).hexdigest(), sha256=hashlib.sha256(adapted).hexdigest(),
    license='public-domain', licenseUrl=source_page + '#Licensing',
    modules=['genetics'], keywords=['spin', 'column', 'cleanup', 'elution', '离心柱', '洗脱', '纯化'],
    modifications='Chemistry inset and callout removed; viewBox cropped to column and collection tube.',
    scopeNote='Adapted from a Qiagen column illustration. Generic column diagram, not a Promega SV product drawing.'))
new_ids = {a['id'] for a in added}
catalog = [a for a in catalog if a['id'] not in new_ids] + added
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Vendored {len(added)} methods assets; catalog now has {len(catalog)} assets.')
