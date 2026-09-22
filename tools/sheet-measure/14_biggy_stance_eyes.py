"""Biggy: foot stance (outer sole-to-sole) and the two dark lens bezels on the
dome -- the only 'eye-like' features on the front elevation (they are NOT lit).
Stance is taken on rows that contain exactly two leg runs of comparable width,
scanned upward from the sole so the contact shadow cannot contribute."""
import numpy as np, seglib
ROI=(150,558,780,1012)
A=seglib.load('biggy')[ROI[1]:ROI[3],ROI[0]:ROI[2]]
lum=A.mean(axis=2)
def runs(row,minw=4):
    out=[];s=None
    for i,v in enumerate(row):
        if v and s is None:s=i
        elif not v and s is not None:out.append((s,i));s=None
    if s is not None:out.append((s,len(row)))
    return [r for r in out if r[1]-r[0]>=minw]
print('stance:')
for D in (38,46,60,75,90):
    F=seglib.figure_mask(A,D)
    bb=seglib.bbox(F); cnt=seglib.rowcounts(F); body_top=int(np.argmax(cnt>=20))
    TW,_=seglib.maxspan(F,body_top,bb[3])
    cands=[]
    for y in range(body_top+int(0.80*(bb[3]-body_top)), bb[3]):
        r=runs(F[y],minw=15)
        if len(r)!=2: continue
        w0,w1=r[0][1]-r[0][0], r[1][1]-r[1][0]
        if not (25<=w0<=90 and 25<=w1<=90): continue
        if abs(w0-w1)>0.5*max(w0,w1): continue
        cands.append((r[1][1]-r[0][0], y, w0, w1))
    if not cands: print('  D',D,'none'); continue
    best=max(cands)
    print('  D %2d  stance %3d at y %3d (feet %d,%d)  /total_w %.3f  rows %d'
          %(D,best[0],best[1],best[2],best[3],best[0]/TW,len(cands)))

print('\ndome lens bezels (upper dome only, roundness-filtered):')
F=seglib.figure_mask(A,60)
bb=seglib.bbox(F); cnt=seglib.rowcounts(F); body_top=int(np.argmax(cnt>=20))
O=A[:,:,0].astype(np.float32)-A[:,:,2].astype(np.float32)
bm=F&(O>35); c=sorted(seglib.components(bm,500),key=lambda cc:-cc['area'])[0]
BT=c['bbox'][1]
dm=F.copy(); dm[BT:]=False
DW,_=seglib.maxspan(dm,0,BT); DH=BT-body_top
print('  dome w %d h %d rows %d..%d'%(DW,DH,body_top,BT))
for Tb in (60,70,80,90,100,115):
    reg=np.zeros(lum.shape,bool); reg[body_top+8:body_top+int(0.70*DH)]=True
    bz=F&reg&(lum<Tb)
    cs=[c for c in seglib.components(bz,80)
        if 0.55 <= (c['bbox'][2]-c['bbox'][0])/max(1,(c['bbox'][3]-c['bbox'][1])) <= 1.8]
    cs=sorted(cs,key=lambda c:-c['area'])[:2]
    if len(cs)<2: print('  Tb %3d -> %d round blob(s)'%(Tb,len(cs))); continue
    cs=sorted(cs,key=lambda c:c['cx'])
    d=[(c['bbox'][2]-c['bbox'][0]) for c in cs]; h=[(c['bbox'][3]-c['bbox'][1]) for c in cs]
    sp=cs[1]['cx']-cs[0]['cx']
    print('  Tb %3d  w %s h %s  spacing %5.1f  d/domeW %.3f  spacing/domeW %.3f  bbox %s'
          %(Tb,d,h,sp,np.mean(d)/DW,sp/DW,[c['bbox'] for c in cs]))
    if Tb==90: seglib.save_mask(bz,'mask-biggy-bezels-T90.png')
