"""Locate each robot figure on its sheet (panel bboxes).

1/4-scale luminance+chroma mask, 4-connected components, keep blobs with
area > 2000 (at 1/4 scale) -> these are the figures; text labels and stray
shadow wisps fall below. Bboxes are reported at FULL resolution.
"""
import numpy as np, json
from PIL import Image
import seglib
from collections import deque

def comps(m, minarea):
    lab=np.zeros(m.shape,np.int32); cur=0; out=[]
    H,W=m.shape
    for y0,x0 in np.argwhere(m):
        if lab[y0,x0]: continue
        cur+=1; n=0; xmin=xmax=x0; ymin=ymax=y0
        dq=deque([(y0,x0)]); lab[y0,x0]=cur
        while dq:
            y,x=dq.pop(); n+=1
            if x<xmin:xmin=x
            if x>xmax:xmax=x
            if y<ymin:ymin=y
            if y>ymax:ymax=y
            for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                yy,xx=y+dy,x+dx
                if 0<=yy<H and 0<=xx<W and m[yy,xx] and not lab[yy,xx]:
                    lab[yy,xx]=cur; dq.append((yy,xx))
        if n>=minarea: out.append(dict(area=int(n),bbox=[int(xmin),int(ymin),int(xmax+1),int(ymax+1)]))
    return out

res={}
for n in ('voxxy','droid','biggy'):
    a=seglib.load(n)
    im=Image.fromarray(a.astype(np.uint8))
    s=4
    small=np.asarray(im.resize((im.width//s,im.height//s), Image.LANCZOS)).astype(np.int16)
    lum=small.mean(axis=2); sat=small.max(axis=2)-small.min(axis=2)
    bg=np.percentile(lum,98)
    m=((bg-lum)>22)|(sat>18)
    cs=comps(m, 1500)
    cs.sort(key=lambda c:(c['bbox'][1]//40, c['bbox'][0]))
    res[n]=[{'area':c['area'],'bbox':[v*s for v in c['bbox']]} for c in cs]
    print('===',n,'bg',round(float(bg),1),'blobs',len(cs))
    for c in res[n]: print('   ',c['bbox'],'area~',c['area']*s*s)
json.dump(res,open('panels.json','w'),indent=1)
