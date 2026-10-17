"""Only needed for distro Blender lacking NumPy: scoped, hash-verified official PyPI wheel.
This tested host is Linux x86_64 / Python 3.14. No system/global Python installation changes.
"""
from pathlib import Path
import json,urllib.request,zipfile,io,hashlib,sys,platform
assert sys.version_info[:2]==(3,14) and platform.machine()=='x86_64'
base=Path(__file__).resolve().parent/'.tools';base.mkdir(exist_ok=True)
data=json.load(urllib.request.urlopen('https://pypi.org/pypi/numpy/2.5.4/json',timeout=30))
wheel=next(u for u in data['urls'] if 'cp314-cp314-manylinux' in u['filename'] and 'x86_64' in u['filename'])
raw=urllib.request.urlopen(wheel['url'],timeout=60).read();assert hashlib.sha256(raw).hexdigest()==wheel['digests']['sha256']
zipfile.ZipFile(io.BytesIO(raw)).extractall(base/'packages')
(base/'provenance.json').write_text(json.dumps({'version':'2.5.4','url':wheel['url'],'sha256':wheel['digests']['sha256']},indent=2))
print('Scoped NumPy 2.5.4 ready for native Blender exporter')
