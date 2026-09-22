"""Biggy: the full ratio table with both sweeps (silhouette D, orangeness ob),
plus every plausible denominator for the belly width."""
import numpy as np, json, seglib
ROI=(150,558,780,1012)
A=seglib.load('biggy')[ROI[1]:ROI[3],ROI[0]:ROI[2]]
lum=A.mean(axis=2)
O=A[:,:,0].astype(np.float32)-A[:,:,2].astype(np.float32)
def runs(row,minw=4):
    out=[];s=None
    for i,v in enumerate(row):
        if v and s is None:s=i
        elif not v and s is not None:out.append((s,i));s=None
    if s is not None:out.append((s,len(row)))
    return [r for r in out if r[1]-r[0]>=minw]

recs=[]
for D in (38,46,60,75,90):
  FIG=seglib.figure_mask(A,D)
  bb=seglib.bbox(FIG); cnt=seglib.rowcounts(FIG)
  body_top=int(np.argmax(cnt>=20)); bot=bb[3]
  TW,TWy=seglib.maxspan(FIG,body_top,bot); TH=bot-body_top
  for ob in (15,25,35,45,55):
    bm=FIG&(O>ob)
    c=sorted(seglib.components(bm,500),key=lambda c:-c['area'])[0]
    m1=seglib.blob_mask(bm,c); x0,y0,x1,y1=c['bbox']
    BW,BWy=seglib.maxspan(m1,y0,y1); BH=y1-y0
    # denominators
    row_span=seglib.rowspan(FIG,BWy); row_w=row_span[1]-row_span[0]
    dm=FIG.copy(); dm[y0:]=False
    DW,_=seglib.maxspan(dm,0,y0); DH=y0-body_top
    # dome height measured to the bottom of the armour dome at centre instead
    # visor slot: dark band inside the dome x-range, at the dome's lower edge
    recs.append(dict(D=D,ob=ob,TW=TW,TH=TH,BW=BW,BWy=BWy,BH=BH,rowW=row_w,DW=DW,DH=DH,
                     belly_top=y0,body_top=body_top,bot=bot))
for r in recs[:5]+recs[-5:]:
    print(r)
def s(n,f):
    v=[f(r) for r in recs]; print('%-28s min %.4f max %.4f mid %.4f'%(n,min(v),max(v),float(np.median(v))))
print()
s('belly_w/total_w', lambda r:r['BW']/r['TW'])
s('belly_w/dome_w', lambda r:r['BW']/r['DW'])
s('belly_w/rowspan_at_belly', lambda r:r['BW']/r['rowW'])
s('belly_h/total_h', lambda r:r['BH']/r['TH'])
s('dome_w/total_w', lambda r:r['DW']/r['TW'])
s('dome_h/total_h', lambda r:r['DH']/r['TH'])
s('dome_w/dome_h', lambda r:r['DW']/r['DH'])
s('total_w/total_h', lambda r:r['TW']/r['TH'])

# ---- visor slot + dome lens bezels ---------------------------------------
FIG=seglib.figure_mask(A,60)
bb=seglib.bbox(FIG); cnt=seglib.rowcounts(FIG); body_top=int(np.argmax(cnt>=20)); bot=bb[3]
TW,_=seglib.maxspan(FIG,body_top,bot); TH=bot-body_top
bm=FIG&(O>35); c=sorted(seglib.components(bm,500),key=lambda c:-c['area'])[0]
BT=c['bbox'][1]
dm=FIG.copy(); dm[BT:]=False
DW,_=seglib.maxspan(dm,0,BT); DH=BT-body_top
print('\nDOME  w %d h %d  (body_top %d belly_top %d) total %dx%d'%(DW,DH,body_top,BT,TW,TH))
print('\nvisor-slot sweep (dark band inside dome, measured on the dome''s own column range):')
x0d,x1d = seglib.rowspan(dm, BT-6)
for Ts in (30,40,55,70,85,100):
    band=[y for y in range(body_top,BT+8) if (lum[y,x0d:x1d][FIG[y,x0d:x1d]]<Ts).mean()>0.6]
    if not band: print('  Ts %3d  no band'%Ts); continue
    # longest consecutive run
    best=[];cur=[band[0]]
    for y in band[1:]:
        if y==cur[-1]+1: cur.append(y)
        else:
            if len(cur)>len(best): best=cur
            cur=[y]
    if len(cur)>len(best): best=cur
    h=len(best)
    wid=[]
    for y in best:
        r=runs(FIG[y]&(lum[y]<Ts))
        if r: wid.append(max(rr[1] for rr in r)-min(rr[0] for rr in r))
    print('  Ts %3d  slot y %d..%d  h %2d  h/domeH %.3f  h/totalH %.4f  maxw %s  w/domeW %s'
          %(Ts,best[0],best[-1],h,h/DH,h/TH,max(wid) if wid else '-', ('%.3f'%(max(wid)/DW)) if wid else '-'))

print('\ndome lens bezels (dark rings on the dome, above the slot):')
for Tb in (60,75,90,110):
    reg=np.zeros(lum.shape,bool); reg[body_top:body_top+int(0.75*DH)]=True
    bz=FIG&reg&(lum<Tb)
    cs=[c for c in seglib.components(bz,60)]
    cs=sorted(cs,key=lambda c:-c['area'])[:2]
    if len(cs)<2: print('  Tb %3d -> %d blob(s)'%(Tb,len(cs))); continue
    cs=sorted(cs,key=lambda c:c['cx'])
    ds=[(c['bbox'][2]-c['bbox'][0]) for c in cs]; hs=[(c['bbox'][3]-c['bbox'][1]) for c in cs]
    sp=cs[1]['cx']-cs[0]['cx']
    print('  Tb %3d  d %s h %s  spacing %.1f  d/domeW %.3f  spacing/domeW %.3f'
          %(Tb,ds,hs,sp,np.mean(ds)/DW,sp/DW))

print('\nstance (outer edge of the two feet) at several D:')
for D in (46,60,75,90):
    F=seglib.figure_mask(A,D)
    bb2=seglib.bbox(F); b2=bb2[3]
    best=None
    for y in range(b2-40,b2-10):
        r=runs(F[y],minw=8)
        if len(r)==2 and (r[0][1]-r[0][0])>20 and (r[1][1]-r[1][0])>20:
            w=r[1][1]-r[0][0]
            if best is None or w>best[0]: best=(w,y,r)
    print('  D %2d stance %s  /total_w %.3f'%(D,best,best[0]/TW if best else 0))
