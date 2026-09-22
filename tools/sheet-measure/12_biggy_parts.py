"""Biggy front elevation: dome vs belly (colour split), stance, lit-eye search.

Colour split: on this sheet the belly is warm (R-B large positive) and the
armour/dome is cool blue-grey (R-B <= 0). Threshold ob on ORANGENESS = R-B,
swept 10..60. The dome is the armour region above the belly's top row.
"""
import numpy as np, json, seglib
from PIL import Image
ROI=(150,558,780,1012)
A=seglib.load('biggy')[ROI[1]:ROI[3],ROI[0]:ROI[2]]
lum=A.mean(axis=2)
O=A[:,:,0].astype(np.float32)-A[:,:,2].astype(np.float32)

def runs(row,minw=3):
    out=[];s=None
    for i,v in enumerate(row):
        if v and s is None:s=i
        elif not v and s is not None:out.append((s,i));s=None
    if s is not None:out.append((s,len(row)))
    return [r for r in out if r[1]-r[0]>=minw]

FIG=seglib.figure_mask(A,60)
bb=seglib.bbox(FIG)
cnt=seglib.rowcounts(FIG)
body_top=int(np.argmax(cnt>=20))
bot=bb[3]
TOTAL_W,_=seglib.maxspan(FIG,body_top,bot)
TOTAL_H=bot-body_top
print('figure: bbox',bb,'body_top',body_top,'bot',bot,'TOTAL_W',TOTAL_W,'TOTAL_H',TOTAL_H)
seglib.save_mask(FIG,'mask-biggy-front-D60.png')

# ---- lit-eye search: bright AND saturated anywhere in the figure -----------
bright = FIG & (lum>150) & ((A.max(axis=2)-A.min(axis=2))>60)
cs=sorted(seglib.components(bright,40),key=lambda c:-c['area'])[:6]
print('bright+saturated blobs (candidate lit eyes):')
for c in cs: print('   area',c['area'],'bbox',c['bbox'],'mean rgb',A[c['bbox'][1]:c['bbox'][3],c['bbox'][0]:c['bbox'][2]].reshape(-1,3).mean(axis=0).round(0))
seglib.save_mask(bright,'mask-biggy-brightsat.png')

# ---- belly (orange) --------------------------------------------------------
rows=[]
for ob in (10,20,30,40,50,60):
    bm=FIG&(O>ob)
    c=sorted(seglib.components(bm,500),key=lambda c:-c['area'])[0]
    m1=seglib.blob_mask(bm,c)
    x0,y0,x1,y1=c['bbox']
    bw,bwy=seglib.maxspan(m1,y0,y1)
    rows.append(dict(ob=ob,bbox=[x0,y0,x1,y1],belly_w=bw,belly_wy=bwy,belly_h=y1-y0,area=c['area']))
    print('ob %2d belly bbox %s maxw %3d at y %3d  h %3d  /totalW %.4f'%(ob,(x0,y0,x1,y1),bw,bwy,y1-y0,bw/TOTAL_W))
    if ob==30: seglib.save_mask(m1,'mask-biggy-belly-ob30.png')

# ---- dome: armour above the belly top -------------------------------------
BELLY_TOP=rows[2]['bbox'][1]
dome_rows=[]
for ob in (10,20,30,40,50,60):
    bt=rows[[r['ob'] for r in rows].index(ob)]['bbox'][1]
    dm=FIG.copy(); dm[bt:]=False
    ys,xs=np.where(dm)
    dw,dwy=seglib.maxspan(dm,0,bt)
    dome_rows.append(dict(ob=ob,belly_top=int(bt),dome_w=dw,dome_h=int(bt-body_top),
                          dome_top=int(ys.min())))
    print('ob %2d belly_top %3d dome_w %3d dome_h %3d  dW/totW %.4f dH/totH %.4f'
          %(ob,bt,dw,bt-body_top,dw/TOTAL_W,(bt-body_top)/TOTAL_H))
json.dump(dict(total_w=TOTAL_W,total_h=TOTAL_H,body_top=body_top,bot=bot,
               belly=rows,dome=dome_rows),open('biggy_parts.json','w'),indent=1)

# ---- stance: outer span of the two feet ------------------------------------
print('\nlower rows run structure (D=60):')
for y in range(bot-60,bot):
    print('  y',y,runs(FIG[y],minw=5))
