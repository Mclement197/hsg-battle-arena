"""glTF skin nodes are scene roots; skeleton hierarchy/inverse bind matrices stay untouched.
Verified against Three.js world-space skinned positions, including rotated/scaled character roots.
"""
import struct,json
from pathlib import Path

def normalize(path):
 path=Path(path);raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+size]);tail=raw[20+size:]
 active=j['scenes'][j.get('scene',0)];j['scenes']=[active];j['scene']=0
 for i,node in enumerate(j['nodes']):
  if 'skin' not in node:continue
  assert not any(k in node for k in ['matrix','rotation','translation','scale']), 'Expected identity mesh bind transform'
  for parent in j['nodes']:
   if 'children' in parent:
    parent['children']=[c for c in parent['children'] if c!=i]
    if not parent['children']:del parent['children']
  if i not in active['nodes']:active['nodes'].append(i)
 encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail)

if __name__=='__main__':
 for path in (Path(__file__).resolve().parents[3]/'public'/'assets'/'characters').glob('*.glb'):normalize(path)
