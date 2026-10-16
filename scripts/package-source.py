"""Create a redistributable source ZIP without Site identity or local state."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root=Path(__file__).resolve().parents[1]
destination=root/'dist/biocanvas-source.zip'
with ZipFile(destination,'w',ZIP_DEFLATED) as archive:
    for name in ['README.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','.gitignore','mcp-config.example.json']:
        archive.write(root/name,name)
    for folder in ['dist','scripts','tests','.github']:
        for file in sorted((root/folder).rglob('*')):
            if not file.is_file() or file==destination or '__pycache__' in file.parts: continue
            archive.write(file,file.relative_to(root))
print(f'Packaged {destination.stat().st_size} bytes')
