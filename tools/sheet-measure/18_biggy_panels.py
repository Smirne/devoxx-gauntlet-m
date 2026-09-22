"""Biggy: the same belly/dome/total measurement in EVERY panel of the sheet,
to test whether another panel (the sheet has TWO panels labelled FRONT VIEW)
reproduces a belly target ~8% away from the r1c0 value."""
import numpy as np, seglib
A=seglib.load('biggy')
O=A[:,:,0].astype(np.float32)-A[:,:,2].astype(np.float32)
PAN={'r0c0 (top-left, 3/4)':(150,20,700,545),
     'r1c0 FRONT VIEW':(150,558,780,1012),
     'r1c1 BACK VIEW':(1150,558,1650,1012),
     'r2c1 FRONT VIEW':(1150,1035,1660,1505),
     'r0c1 LEFT PROFILE':(1140,55,1650,530),
     'r2c0 LEFT PROFILE':(220,1035,680,1505)}
for name,(x0,y0,x1,y1) in PAN.items():
    a=A[y0:y1,x0:x1]; o=O[y0:y1,x0:x1]
    out=[]
    for D in (46,60,75):
        F=seglib.figure_mask(a,D)
        bb=seglib.bbox(F); cnt=seglib.rowcounts(F)
        bt=int(np.argmax(cnt>=20))
        TW,_=seglib.maxspan(F,bt,bb[3]); TH=bb[3]-bt
        for ob in (25,35,45):
            bm=F&(o>ob)
            cs=sorted(seglib.components(bm,500),key=lambda c:-c['area'])
            if not cs: continue
            c=cs[0]; m1=seglib.blob_mask(bm,c)
            BW,_=seglib.maxspan(m1,c['bbox'][1],c['bbox'][3])
            dm=F.copy(); dm[c['bbox'][1]:]=False
            DW,_=seglib.maxspan(dm,0,c['bbox'][1])
            out.append((BW/TW, BW/DW if DW else 0, TW, BW, DW, TH))
    if not out: print('%-22s -'%name); continue
    bt_=[o[0] for o in out]; bd=[o[1] for o in out]
    print('%-22s belly/total %.4f [%.4f..%.4f]   belly/dome %.4f [%.4f..%.4f]  (TW %d BW %d DW %d TH %d)'
          %(name,float(np.median(bt_)),min(bt_),max(bt_),float(np.median(bd)),min(bd),max(bd),
            out[0][2],out[0][3],out[0][4],out[0][5]))
