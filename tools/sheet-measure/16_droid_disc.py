"""Droid shoulder disc.

The disc is EDGE-ON in the front elevation, so it cannot be measured there. It
is face-on in panel r1c0 (left profile, panel bbox (0,384,275,768); ROI used
(40,420,250,768)). Its diameter is measured there and converted to the front
panel's scale by the ratio of the two figures' total heights, which is the only
honest way to quote it against the front panel's shoulder span.
"""
import numpy as np, seglib
SIDE=(40,410,250,768)
A=seglib.load('droid')[SIDE[1]:SIDE[3],SIDE[0]:SIDE[2]]
lum=A.mean(axis=2)
m=seglib.figure_mask(A,24); bb=seglib.bbox(m)
SIDE_H=bb[3]-bb[1]
print('side figure bbox',bb,'height',SIDE_H)
FRONT_H=339; FRONT_SHOULDER=164   # from 15_droid.py, D=24
k=FRONT_H/SIDE_H
print('scale side->front = %.4f'%k)

# disc region: upper torso of the side view
y0,y1,x0,x1 = bb[1]+int(0.14*SIDE_H), bb[1]+int(0.38*SIDE_H), bb[0], bb[2]
print('search box (ROI coords)',(x0,y0,x1,y1))
for T in (95,110,125,140,155,170):
    sub=(lum[y0:y1,x0:x1]>T)&m[y0:y1,x0:x1]
    cs=sorted(seglib.components(sub,150),key=lambda c:-c['area'])[:1]
    if not cs: print('  T %3d none'%T); continue
    c=cs[0]; b=c['bbox']
    w,h=b[2]-b[0],b[3]-b[1]
    d=(w+h)/2
    print('  T %3d  disc bbox %s  w %2d h %2d  d %.1f  d*k %.1f  /shoulderSpan %.4f  aspect %.2f'
          %(T,(b[0]+x0,b[1]+y0,b[2]+x0,b[3]+y0),w,h,d,d*k,d*k/FRONT_SHOULDER,w/h))
    if T==125:
        full=np.zeros(lum.shape,bool); full[y0:y1,x0:x1]=seglib.blob_mask(sub,c)
        seglib.save_mask(full,'mask-droid-shoulderdisc-T125.png')
