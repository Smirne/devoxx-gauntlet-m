"""Reusable Voxxy head/eye extraction for ANY panel of the sheet."""
import numpy as np
from collections import deque
import seglib

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

def erode(m,k):
    out=m.copy()
    for _ in range(k):
        e=out.copy(); e[1:,:]&=out[:-1,:]; e[:-1,:]&=out[1:,:]; e[:,1:]&=out[:,:-1]; e[:,:-1]&=out[:,1:]; out=e
    return out

def visor(a, Tv=100, yband=None):
    """Largest dark (lum<Tv), hole-filled blob in the ROI -> visor mask+bbox."""
    lum=a.mean(axis=2)
    sub=lum if yband is None else lum[yband[0]:yband[1]]
    dm=sub<Tv
    c=sorted(seglib.components(dm,200),key=lambda c:-c['area'])[0]
    bm=fill_holes(seglib.blob_mask(dm,c))
    M=np.zeros(lum.shape,bool)
    if yband is None: M[:]=bm
    else: M[yband[0]:yband[1]]=bm
    ys,xs=np.where(M)
    return M,(int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1)

def eyes(a, VM, f, erode_k=8):
    inner=erode(VM,erode_k)
    G=np.clip(a[:,:,0].astype(np.float32)-a[:,:,2].astype(np.float32),0,None)
    Gi=np.where(inner,G,0)
    Gp=float(np.percentile(G[inner],99.9))
    em=Gi>f*Gp
    cs=sorted(seglib.components(em,25),key=lambda c:-c['area'])[:2]
    if len(cs)<2: return None,em
    cs=sorted(cs,key=lambda c:c['cx'])
    return cs,em
