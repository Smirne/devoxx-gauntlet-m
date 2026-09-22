"""Voxxy ear domes, head oval, torso vs arm span. Threshold D swept 14..46.

Row-run analysis on the figure mask:
  * ear band  = rows from the figure top down to the last row in which the two
                ear runs are still separate from the central head-oval run.
  * oval top  = first row in which a central (third) run appears.
  * neck      = row of minimum filled-pixel count in the middle of the figure.
  * torso     = width of the CENTRAL run in rows with exactly 3 runs
                (left arm | torso | right arm), restricted to the upper 60%
                of the body so the feet/floor rows cannot masquerade as torso.
  * arm span  = max row span below the neck.
"""
import numpy as np, json, seglib

ROI=(0,0,550,768)
A=seglib.load('voxxy')[ROI[1]:ROI[3],ROI[0]:ROI[2]]

def runs(row,minw=3):
    out=[];s=None
    for i,v in enumerate(row):
        if v and s is None:s=i
        elif not v and s is not None:out.append((s,i));s=None
    if s is not None:out.append((s,len(row)))
    return [r for r in out if r[1]-r[0]>=minw]

res=[]
for D in (14,18,24,30,38,46):
    m=seglib.figure_mask(A,D)
    bb=seglib.bbox(m); y0,y1=bb[1],bb[3]
    cnt=seglib.rowcounts(m)
    lo=y0+int(0.30*(y1-y0)); hi=y0+int(0.65*(y1-y0))
    neck=lo+int(np.argmin(cnt[lo:hi]))
    head_w0,_=seglib.maxspan(m,y0,neck)
    oval_top=None; ear_bot=None
    for y in range(y0,neck):
        r=runs(m[y])
        if oval_top is None and len(r)>=3: oval_top=y
        if len(r)<2: 
            if oval_top is not None: break
            continue
        # an ear run must stay narrow; once an outer run swallows the oval, stop
        if max(r[0][1]-r[0][0], r[-1][1]-r[-1][0]) > 0.35*head_w0: break
        ear_bot=y
    Lx=[];Rx=[]
    for y in range(y0,ear_bot+1):
        r=runs(m[y])
        if len(r)<2: continue
        if max(r[0][1]-r[0][0], r[-1][1]-r[-1][0]) > 0.35*head_w0: continue
        Lx.append(r[0]); Rx.append(r[-1])
    lw=max(x[1]-x[0] for x in Lx); rw=max(x[1]-x[0] for x in Rx)
    lcx=(min(x[0] for x in Lx)+max(x[1] for x in Lx))/2
    rcx=(min(x[0] for x in Rx)+max(x[1] for x in Rx))/2
    head_w,_=seglib.maxspan(m,y0,neck)
    torso=0;torso_y=None;arms=0
    ybody_end=neck+int(0.60*(y1-neck))
    for y in range(neck,y1):
        s=seglib.rowspan(m,y)
        if s and s[1]-s[0]>arms: arms=s[1]-s[0]
    for y in range(neck,ybody_end):
        r=runs(m[y],minw=6)
        if len(r)==3:
            w=r[1][1]-r[1][0]
            if w>torso: torso=w; torso_y=y
    rec=dict(D=D,total_w=bb[2]-bb[0],total_h=y1-y0,fig_top=int(y0),fig_bot=int(y1),neck=int(neck),
             oval_top=int(oval_top),ear_bot=int(ear_bot),
             ear_w=(lw+rw)/2,ear_w_L=lw,ear_w_R=rw,ear_spacing=float(rcx-lcx),ear_h=int(ear_bot-y0),
             head_w=int(head_w),head_h=int(neck-y0),oval_h=int(neck-oval_top),
             torso_w=int(torso),torso_y=torso_y,arm_span=int(arms),body_h=int(y1-neck))
    res.append(rec);print(rec)
json.dump(res,open('voxxy_parts.json','w'),indent=1)
def s(n,fn):
    v=[fn(r) for r in res];print('%-26s min %.4f max %.4f mid %.4f'%(n,min(v),max(v),float(np.median(v))))
print()
for n,fn in [('head_w/total_w',lambda r:r['head_w']/r['total_w']),
             ('head_h/total_h',lambda r:r['head_h']/r['total_h']),
             ('oval_h/total_h',lambda r:r['oval_h']/r['total_h']),
             ('head_w/head_h',lambda r:r['head_w']/r['head_h']),
             ('ear_diam/head_w',lambda r:r['ear_w']/r['head_w']),
             ('ear_spacing/head_w',lambda r:r['ear_spacing']/r['head_w']),
             ('ear_spacing/ear_diam',lambda r:r['ear_spacing']/r['ear_w']),
             ('ear_h/head_h',lambda r:r['ear_h']/r['head_h']),
             ('torso_w/head_w',lambda r:r['torso_w']/r['head_w']),
             ('armspan/head_w',lambda r:r['arm_span']/r['head_w']),
             ('armspan/total_w',lambda r:r['arm_span']/r['total_w']),
             ('torso_w/total_w',lambda r:r['torso_w']/r['total_w']),
             ('body_h/total_h',lambda r:r['body_h']/r['total_h']),
             ('total_w/total_h',lambda r:r['total_w']/r['total_h'])]:
    s(n,fn)
