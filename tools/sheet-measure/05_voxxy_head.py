"""Voxxy head detail: visor, eyes (glow profile), ear domes.

Head region is taken from 04's figure mask at D=18 (neck row 380, figure top
113). Visor = largest dark blob inside the head, threshold Tv swept.
Eyes = bright glow inside the visor, thresholded at a RELATIVE level f of the
peak-above-visor-floor, f swept 0.10..0.90 -- the eyes are a soft glow with no
hard edge, so f is the honest free parameter.
"""
import numpy as np, json
from PIL import Image, ImageDraw
import seglib

ROI = (0, 0, 550, 768)
a = seglib.load('voxxy')[ROI[1]:ROI[3], ROI[0]:ROI[2]]
lum = a.mean(axis=2)
NECK = 380
FIG_TOP, FIG_BOT = 113, 757
head = a[FIG_TOP:NECK]
hl = lum[FIG_TOP:NECK]

# ---- visor -----------------------------------------------------------------
visor = []
for Tv in (55, 70, 85, 100, 115, 130):
    dm = hl < Tv
    cs = seglib.components(dm, 200)
    c = cs[0]
    x0,y0,x1,y1 = c['bbox']
    visor.append(dict(Tv=Tv, bbox=[x0, y0+FIG_TOP, x1, y1+FIG_TOP], w=x1-x0, h=y1-y0, area=c['area']))
    print('visor Tv', Tv, visor[-1])
    if Tv == 85:
        seglib.save_mask(seglib.blob_mask(dm, c), 'mask-voxxy-visor-T85.png')
VB = visor[3]['bbox']          # Tv=100, midpoint of the sweep
print('visor bbox used for eyes:', VB)

# ---- eye glow --------------------------------------------------------------
vx0, vy0, vx1, vy1 = VB
V = lum[vy0:vy1, vx0:vx1]
Vr = a[vy0:vy1, vx0:vx1]
floor = np.percentile(V, 30)          # dark LED field inside the visor
peak  = V.max()
print('visor lum floor(p30) %.1f peak %.1f' % (floor, peak))

eyes = []
for f in (0.10,0.15,0.20,0.25,0.30,0.40,0.50,0.60,0.70,0.80,0.90):
    T = floor + f*(peak-floor)
    em = V > T
    cs = [c for c in seglib.components(em, 20)][:4]
    cs = sorted(cs, key=lambda c: -c['area'])[:2]
    if len(cs) < 2:
        eyes.append(dict(f=f, T=float(T), n=len(cs), note='not two blobs'))
        print('f %.2f T %.1f -> %d blob(s)' % (f, T, len(cs)))
        continue
    cs = sorted(cs, key=lambda c: c['cx'])
    L, R = cs
    rec = dict(f=f, T=float(T),
        Lbbox=[L['bbox'][0]+vx0, L['bbox'][1]+vy0, L['bbox'][2]+vx0, L['bbox'][3]+vy0],
        Rbbox=[R['bbox'][0]+vx0, R['bbox'][1]+vy0, R['bbox'][2]+vx0, R['bbox'][3]+vy0],
        Lw=L['bbox'][2]-L['bbox'][0], Lh=L['bbox'][3]-L['bbox'][1], Larea=L['area'],
        Rw=R['bbox'][2]-R['bbox'][0], Rh=R['bbox'][3]-R['bbox'][1], Rarea=R['area'],
        Lcx=L['cx']+vx0, Lcy=L['cy']+vy0, Rcx=R['cx']+vx0, Rcy=R['cy']+vy0,
        gap=(R['bbox'][0]-L['bbox'][2]))
    eyes.append(rec)
    print('f %.2f T %5.1f  Lw %3d Lh %3d ar %.2f | Rw %3d Rh %3d ar %.2f | gap %3d | area %d/%d'
          % (f, T, rec['Lw'], rec['Lh'], rec['Lw']/rec['Lh'], rec['Rw'], rec['Rh'],
             rec['Rw']/rec['Rh'], rec['gap'], rec['Larea'], rec['Rarea']))
    if abs(f-0.50) < 1e-9:
        full = np.zeros(lum.shape, bool); full[vy0:vy1, vx0:vx1] = em
        seglib.save_mask(full, 'mask-voxxy-eyes-f50.png')

json.dump(dict(visor=visor, eyes=eyes), open('voxxy_head.json','w'), indent=1)

# ---- glow falloff: horizontal & vertical profile through the left eye -------
mid = [e for e in eyes if e.get('f')==0.50][0]
cy = int(round(mid['Lcy'])); cx = int(round(mid['Lcx']))
hprof = lum[cy, vx0:vx1]
vprof = lum[vy0:vy1, cx]
np.savetxt('voxxy_eye_hprofile.txt', np.c_[np.arange(vx0,vx1), hprof], fmt='%d %.1f')
np.savetxt('voxxy_eye_vprofile.txt', np.c_[np.arange(vy0,vy1), vprof], fmt='%d %.1f')
print('left eye centre (x,y) =', cx, cy)
