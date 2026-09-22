"""Voxxy eye glow falloff + low-threshold behaviour.

Same orangeness field as 06, but sweeping f down to 0.01 to find out whether
ANY threshold yields eyeH/visorH = 0.43, and to characterise the falloff.
"""
import numpy as np
from PIL import Image
import seglib, importlib.util
spec=importlib.util.spec_from_file_location('v6','06_voxxy_eyes.py')
# re-derive without executing the whole module: copy the small bits
ROI=(0,0,550,768)
a=seglib.load('voxxy')[ROI[1]:ROI[3],ROI[0]:ROI[2]]
lum=a.mean(axis=2); FIG_TOP,NECK=113,380
from collections import deque
def fill_holes(m):
    H,W=m.shape; out=~m; seen=np.zeros(m.shape,bool); dq=deque()
    for x in range(W):
        for y in (0,H-1):
            if out[y,x] and not seen[y,x]: seen[y,x]=True; dq.append((y,x))
    for y in range(H):
        for x in (0,W-1):
            if out[y,x] and not seen[y,x]: seen[y,x]=True; dq.append((y,x))
    while dq:
        y,x=dq.pop()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            yy,xx=y+dy,x+dx
            if 0<=yy<H and 0<=xx<W and out[yy,xx] and not seen[yy,xx]:
                seen[yy,xx]=True; dq.append((yy,xx))
    return m|(out&~seen)
hl=lum[FIG_TOP:NECK]; dm=hl<100
c=sorted(seglib.components(dm,200),key=lambda c:-c['area'])[0]
bm=fill_holes(seglib.blob_mask(dm,c))
VM=np.zeros(lum.shape,bool); VM[FIG_TOP:NECK]=bm
ys,xs=np.where(VM); vx0,vy0,vx1,vy1=int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1
VW,VH=vx1-vx0,vy1-vy0
def erode(m,k):
    out=m.copy()
    for _ in range(k):
        e=out.copy(); e[1:,:]&=out[:-1,:]; e[:-1,:]&=out[1:,:]; e[:,1:]&=out[:,:-1]; e[:,:-1]&=out[:,1:]; out=e
    return out
inner=erode(VM,8)
G=np.clip(a[:,:,0].astype(np.float32)-a[:,:,2].astype(np.float32),0,None)
Gi=np.where(inner,G,0)
Gp=float(np.percentile(G[inner],99.9))
print('visor %dx%d  Gp99.9 %.1f'%(VW,VH,Gp))
print(' f     T    Lw  Lh   Rw  Rh   eyeH/VH   eyeW/VW   nblob')
for f in (0.01,0.02,0.03,0.05,0.07,0.10,0.12,0.15,0.20,0.30,0.40,0.50,0.60,0.70,0.80,0.90,0.95):
    T=f*Gp; em=Gi>T
    cs=sorted(seglib.components(em,25),key=lambda c:-c['area'])[:2]
    if len(cs)<2:
        c0=cs[0] if cs else None
        print('%.2f %5.1f   -> %d blob(s) %s'%(f,T,len(cs), (c0['bbox'],) if c0 else ''))
        continue
    cs=sorted(cs,key=lambda c:c['cx']); L,R=cs
    Lw,Lh=L['bbox'][2]-L['bbox'][0],L['bbox'][3]-L['bbox'][1]
    Rw,Rh=R['bbox'][2]-R['bbox'][0],R['bbox'][3]-R['bbox'][1]
    print('%.2f %5.1f  %3d %3d  %3d %3d   %.3f     %.3f     2'%(f,T,Lw,Lh,Rw,Rh,(Lh+Rh)/2/VH,(Lw+Rw)/2/VW))
