"""Biggy front elevation (panel r1c0, labelled FRONT VIEW).

Sheet is a 3x3 grid, 2752x1536, so r1c0 = (0,512,917,1024). The figure above it
(r0c0) hangs into that band, and the label text sits below, so the ROI is
tightened to (150,556,760,1010) -- verified visually in crop-biggy-front.png.
Antenna: a 2-3 px wire above the dome; heights are reported both with and
without it.
"""
import numpy as np, json, seglib
from PIL import Image
ROI=(150,558,780,1012)
A=seglib.load('biggy')[ROI[1]:ROI[3],ROI[0]:ROI[2]]
Image.fromarray(A.astype(np.uint8)).save('crop-biggy-front.png')

def runs(row,minw=3):
    out=[];s=None
    for i,v in enumerate(row):
        if v and s is None:s=i
        elif not v and s is not None:out.append((s,i));s=None
    if s is not None:out.append((s,len(row)))
    return [r for r in out if r[1]-r[0]>=minw]

res=[]
for D in (10,14,18,24,30,38,46):
    m=seglib.figure_mask(A,D)
    bb=seglib.bbox(m)
    cnt=seglib.rowcounts(m)
    y0,y1=bb[1],bb[3]
    # body top = first row with >= 20 px (skips the antenna wire)
    body_top=y0+int(np.argmax(cnt[y0:y1]>=20))
    w,ywmax=seglib.maxspan(m,body_top,y1)
    res.append(dict(D=D,bbox=list(bb),top=int(y0),body_top=int(body_top),bot=int(y1),
                    total_w=bb[2]-bb[0],h_with_antenna=int(y1-y0),h_body=int(y1-body_top),
                    max_w=w,max_w_y=ywmax))
    print(res[-1])
    if D in (10,24,46): seglib.save_mask(m,'mask-biggy-front-D%d.png'%D)
json.dump(res,open('biggy_figure.json','w'),indent=1)
