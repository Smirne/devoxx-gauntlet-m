"""Voxxy visor size vs head, Tv swept. Head dims from 09 (D=24): w395 h267 oval245."""
import numpy as np, json, seglib, voxlib
ROI=(0,0,550,768)
A=seglib.load('voxxy')[ROI[1]:ROI[3],ROI[0]:ROI[2]]
HEAD_W, HEAD_H, OVAL_H, TOTAL_H, TOTAL_W = 395, 267, 245, 644, 419
rows=[]
for Tv in (65,75,85,95,100,105,115,125):
    VM,vb=voxlib.visor(A,Tv,yband=(113,380))
    w,h=vb[2]-vb[0],vb[3]-vb[1]
    rows.append(dict(Tv=Tv,bbox=list(vb),w=w,h=h,area=int(VM.sum())))
    print('Tv %3d bbox %s w %3d h %3d area %6d  w/headW %.3f h/headH %.3f h/ovalH %.3f h/totalH %.3f'
          %(Tv,vb,w,h,int(VM.sum()),w/HEAD_W,h/HEAD_H,h/OVAL_H,h/TOTAL_H))
json.dump(rows,open('voxxy_visor.json','w'),indent=1)
sel=[r for r in rows if r['Tv']<=115]
def s(n,v): print('%-22s min %.4f max %.4f mid %.4f'%(n,min(v),max(v),float(np.median(v))))
print('\n(Tv 65..115)')
s('visorW/headW',[r['w']/HEAD_W for r in sel])
s('visorH/headH',[r['h']/HEAD_H for r in sel])
s('visorH/ovalH',[r['h']/OVAL_H for r in sel])
s('visorW/visorH',[r['w']/r['h'] for r in sel])
s('visorW/totalW',[r['w']/TOTAL_W for r in sel])
