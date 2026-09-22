"""Droid front elevation = panel r1c1 of droid-robot.png (5x2 grid, 1376x768),
panel bbox (275,384,550,768); ROI used is (300,400,530,768).

Segment boundaries from the row-run structure of the silhouette:
  neck   = row of minimum filled-pixel count between the head lobe and the
           shoulders;
  crotch = first row below the shoulders where the central run splits into two
           leg runs;
  head   = top..neck, torso = neck..crotch, legs = crotch..sole.
Shoulder span = widest row of the shoulder band (neck..neck+0.45*torso).
"""
import numpy as np, json, seglib
ROI=(300,400,530,768)
A=seglib.load('droid')[ROI[1]:ROI[3],ROI[0]:ROI[2]]
lum=A.mean(axis=2)
def runs(row,minw=4):
    out=[];s=None
    for i,v in enumerate(row):
        if v and s is None:s=i
        elif not v and s is not None:out.append((s,i));s=None
    if s is not None:out.append((s,len(row)))
    return [r for r in out if r[1]-r[0]>=minw]

res=[]
for D in (10,14,18,24,30,38,46):
    m=seglib.figure_mask(A,D)
    bb=seglib.bbox(m); y0,y1=bb[1],bb[3]
    cnt=seglib.rowcounts(m)
    lo=y0+int(0.08*(y1-y0)); hi=y0+int(0.30*(y1-y0))
    neck=lo+int(np.argmin(cnt[lo:hi]))
    def split(y):
        r=runs(m[y],minw=8)
        mid=[q for q in r if q[0]>bb[0]+0.22*(bb[2]-bb[0]) and q[1]<bb[2]-0.22*(bb[2]-bb[0])]
        return len(mid)>=2 and min(q[1]-q[0] for q in mid)>=15
    crotch=None
    for y in range(neck+int(0.25*(y1-neck)), y1-8):
        # require the split to PERSIST for 6 rows: single-row splits are
        # panel-line details inside the torso, not the crotch
        if all(split(yy) for yy in range(y,y+6)):
            crotch=y; break
    head_w,_=seglib.maxspan(m,y0,neck)
    # shoulder span = widest row in the UPPER HALF of the torso (below that the
    # hanging hands, not the shoulders, set the figure's width)
    sh_w,sh_y=seglib.maxspan(m,neck,neck+int(0.5*(crotch-neck)))
    rec=dict(D=D,bbox=list(bb),total_w=bb[2]-bb[0],total_h=y1-y0,neck=int(neck),crotch=int(crotch),
             head_h=int(neck-y0),torso_h=int(crotch-neck),leg_h=int(y1-crotch),
             head_w=int(head_w),shoulder_span=int(sh_w),shoulder_y=sh_y)
    res.append(rec); print(rec)
    if D in (14,24,46): seglib.save_mask(m,'mask-droid-front-D%d.png'%D)
json.dump(res,open('droid_figure.json','w'),indent=1)
def s(n,f):
    v=[f(r) for r in res]; print('%-24s min %.4f max %.4f mid %.4f'%(n,min(v),max(v),float(np.median(v))))
print()
for n,f in (('head_h/total_h',lambda r:r['head_h']/r['total_h']),
            ('torso_h/total_h',lambda r:r['torso_h']/r['total_h']),
            ('leg_h/total_h',lambda r:r['leg_h']/r['total_h']),
            ('head_w/total_w',lambda r:r['head_w']/r['total_w']),
            ('head_w/head_h',lambda r:r['head_w']/r['head_h']),
            ('shoulder_span/total_w',lambda r:r['shoulder_span']/r['total_w']),
            ('shoulder_span/total_h',lambda r:r['shoulder_span']/r['total_h']),
            ('head_w/shoulder_span',lambda r:r['head_w']/r['shoulder_span']),
            ('total_w/total_h',lambda r:r['total_w']/r['total_h'])): s(n,f)

# ---- eyes ------------------------------------------------------------------
print('\neyes (bright + warm inside the head):')
mref=seglib.figure_mask(A,24); bbr=seglib.bbox(mref)
NECK=[r for r in res if r['D']==24][0]['neck']; HW=[r for r in res if r['D']==24][0]['head_w']
head=np.zeros(lum.shape,bool); head[bbr[1]:NECK]=True
Y=np.clip(A[:,:,0].astype(np.float32)-A[:,:,2].astype(np.float32),0,None)  # warmth
Yp=float(np.percentile(Y[head&mref],99.9))
print('  head rows %d..%d head_w %d  warmth p99.9 %.1f'%(bbr[1],NECK,HW,Yp))
for f in (0.15,0.25,0.35,0.45,0.55,0.65,0.75,0.85):
    em=head&mref&(Y>f*Yp)
    cs=sorted(seglib.components(em,4),key=lambda c:-c['area'])[:2]
    if len(cs)<2: print('  f %.2f -> %d blob(s)'%(f,len(cs))); continue
    cs=sorted(cs,key=lambda c:c['cx'])
    d=[max(c['bbox'][2]-c['bbox'][0], c['bbox'][3]-c['bbox'][1]) for c in cs]
    w=[c['bbox'][2]-c['bbox'][0] for c in cs]; h=[c['bbox'][3]-c['bbox'][1] for c in cs]
    sp=cs[1]['cx']-cs[0]['cx']
    print('  f %.2f T %5.1f  w %s h %s  spacing %5.1f  d/headW %.4f  spacing/headW %.4f'
          %(f,f*Yp,w,h,sp,np.mean(d)/HW,sp/HW))
    if abs(f-0.45)<1e-9: seglib.save_mask(em,'mask-droid-eyes-f45.png')
