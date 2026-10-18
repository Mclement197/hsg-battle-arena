from PIL import Image,ImageDraw
from pathlib import Path
import sys
p=Path(sys.argv[1])
ids=['luca-di-grazia','free-rider','tryhard','assessment-hoodie','trischli-warrior','bad-teacher']
for kind in ['views','poses','hands','hips']:
 cols=['front','side','threequarter'] if kind=='views' else ['idle','attack','special','hit','defend','heal','defeat']
 suffix='' if kind in ['views','poses'] else '-'+kind
 c=Image.new('RGB',(len(cols)*300,6*270),(20,30,25));d=ImageDraw.Draw(c)
 for row,cid in enumerate(ids):
  for col,clip in enumerate(cols):
   f=p/(cid+'-'+clip+suffix+'.png')
   if not f.exists():continue
   im=Image.open(f);im.thumbnail((300,245));x=col*300+(300-im.width)//2;y=row*270;c.paste(im,(x,y));d.text((col*300+4,y+248),cid+' '+clip,fill='white')
 c.save(p/(kind+'-sheet.png'))
