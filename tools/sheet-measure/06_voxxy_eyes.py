"""Voxxy eyes.

The eye glow is ORANGE; the visor's specular band is NEUTRAL grey; so the eyes
are measured on orangeness G = R-B, not on luminance.  G is also high on the
head shell AROUND the visor, so the search is confined to the visor BLOB
(lum<Tv, largest dark component in the head) eroded by 8 px, which removes the
visor's orange rim.  Threshold at a relative level f of G's 99.9th percentile;
f is swept 0.10..0.90 because the glow has no hard edge.
"""
import numpy as np, json
from PIL import Image, ImageDraw
import seglib

ROI=(0,0,550,768)
a=seglib.load('voxxy')[ROI[1]:ROI[3],ROI[0]:ROI[2]]
lum=a.mean(axis=2)
FIG_TOP,NECK=113,380

def erode(m,k):
    out=m.copy()
    for _ in range(k):
        e=out.copy()
        e[1:,:]&=out[:-1,:]; e[:-1,:]&=out[1:,:]
        e[:,1:]&=out[:,:-1]; e[:,:-1]&=out[:,1:]
        out=e
    return out

def fill_holes(m):
    """Fill interior holes: flood the complement from the border."""
    from collections import deque
    H,W=m.shape
    out=~m
    seen=np.zeros(m.shape,bool)
    dq=deque()
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
    return m | (out & ~seen)

def visor_blob(Tv):
    hl=lum[FIG_TOP:NECK]
    dm=hl<Tv
    c=sorted(seglib.components(dm,200),key=lambda c:-c['area'])[0]
    bm=fill_holes(seglib.blob_mask(dm,c))
    full=np.zeros(lum.shape,bool); full[FIG_TOP:NECK]=bm
    ys,xs=np.where(full)
    return full, int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1  #

VM,vx0,vy0,vx1,vy1 = visor_blob(100)
VW,VH = vx1-vx0, vy1-vy0
seglib.save_mask(VM,'mask-voxxy-visor-T100.png')
print('visor blob bbox', (vx0,vy0,vx1,vy1), 'w',VW,'h',VH,'area',int(VM.sum()))

inner = erode(VM, 8)
G = np.clip(a[:,:,0].astype(np.float32)-a[:,:,2].astype(np.float32),0,None)
Gi = np.where(inner, G, 0)
Image.fromarray(np.clip(Gi[vy0:vy1,vx0:vx1],0,255).astype(np.uint8)).save('field-voxxy-eye-orangeness.png')
Gp=float(np.percentile(G[inner],99.9))
print('G inside visor: p50 %.1f p90 %.1f p99 %.1f p99.9 %.1f max %.1f'
      % tuple(list(np.percentile(G[inner],[50,90,99,99.9]))+[G[inner].max()]))

rows=[]
for f in (0.10,0.15,0.20,0.25,0.30,0.35,0.40,0.50,0.60,0.70,0.80,0.90):
    T=f*Gp
    em=Gi>T
    cs=sorted(seglib.components(em,25),key=lambda c:-c['area'])[:2]
    if len(cs)<2:
        print('f %.2f T %5.1f -> %d blob(s)'%(f,T,len(cs))); continue
    cs=sorted(cs,key=lambda c:c['cx'])
    L,R=cs
    d=dict(f=f,T=float(T))
    for tag,c in (('L',L),('R',R)):
        x0,y0,x1,y1=c['bbox']
        d[tag+'w']=x1-x0; d[tag+'h']=y1-y0; d[tag+'area']=c['area']; d[tag+'cx']=c['cx']; d[tag+'cy']=c['cy']
        d[tag+'bbox']=[x0,y0,x1,y1]
    d['gap']=R['bbox'][0]-L['bbox'][2]
    d['ctr']=R['cx']-L['cx']
    rows.append(d)
    print('f %.2f T %5.1f | L %3dx%-3d ar %.2f A %5d | R %3dx%-3d ar %.2f A %5d | gap %3d | ctrdist %5.1f'
      %(f,T,d['Lw'],d['Lh'],d['Lw']/d['Lh'],d['Larea'],d['Rw'],d['Rh'],d['Rw']/d['Rh'],d['Rarea'],d['gap'],d['ctr']))
    if f in (0.20,0.40,0.70): seglib.save_mask(em,'mask-voxxy-eyes-f%02d.png'%int(f*100))
json.dump(dict(visor=dict(bbox=[vx0,vy0,vx1,vy1],w=VW,h=VH,area=int(VM.sum())),eyes=rows),
          open('voxxy_eyes.json','w'),indent=1)

VA=float(VM.sum())
def summ(name,vals):
    print('%-24s min %.4f  max %.4f  mid %.4f'%(name,min(vals),max(vals),float(np.median(vals))))
for lo,hi,lbl in ((0.20,0.60,'f 0.20-0.60'),(0.10,0.90,'f 0.10-0.90')):
    sel=[d for d in rows if lo-1e-9<=d['f']<=hi+1e-9]
    print('---',lbl,'---')
    summ('eyeW/visorW',[d['Lw']/VW for d in sel]+[d['Rw']/VW for d in sel])
    summ('eyeH/visorH',[d['Lh']/VH for d in sel]+[d['Rh']/VH for d in sel])
    summ('eye aspect w/h',[d['Lw']/d['Lh'] for d in sel]+[d['Rw']/d['Rh'] for d in sel])
    summ('eyeArea/visorArea',[d['Larea']/VA for d in sel]+[d['Rarea']/VA for d in sel])
    summ('gap/visorW',[d['gap']/VW for d in sel])
    summ('gap/eyeW',[2*d['gap']/(d['Lw']+d['Rw']) for d in sel])
    summ('ctrdist/visorW',[d['ctr']/VW for d in sel])
    summ('|dx|/visorW',[abs(d['Lcx']-(vx0+vx1)/2)/VW for d in sel]+[abs(d['Rcx']-(vx0+vx1)/2)/VW for d in sel])
    summ('dy_from_top/visorH',[(d['Lcy']-vy0)/VH for d in sel]+[(d['Rcy']-vy0)/VH for d in sel])
