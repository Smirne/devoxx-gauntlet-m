"""Cross-panel check: eye height / visor height in every Voxxy panel that
shows a lit two-eye visor. Tests the 'wrong panel' hypothesis for the 43%."""
import numpy as np, seglib, voxlib
A=seglib.load('voxxy')
PANELS={ 'r0c0 FRONT':(0,0,550,768), 'r0c1 3/4-L':(550,0,1101,768),
         'r0c3 3/4-R':(1651,0,2202,768), 'r1c3 3/4-front':(1651,768,2202,1536),
         'r1c4 closeup-tilt':(2202,768,2752,1536) }
for name,(x0,y0,x1,y1) in PANELS.items():
    a=A[y0:y1,x0:x1]
    try:
        VM,vb=voxlib.visor(a,100)
    except IndexError:
        print(name,'no visor'); continue
    VW,VH=vb[2]-vb[0],vb[3]-vb[1]
    out=[]
    for f in (0.10,0.20,0.30,0.40,0.50,0.60):
        cs,em=voxlib.eyes(a,VM,f)
        if cs is None: out.append((f,None)); continue
        hs=[c['bbox'][3]-c['bbox'][1] for c in cs]; ws=[c['bbox'][2]-c['bbox'][0] for c in cs]
        out.append((f,(np.mean(hs)/VH, np.mean(ws)/VW)))
    print('%-20s visor %3dx%-3d ' % (name,VW,VH),
          ' '.join('f%.1f h/H %.3f w/W %.3f'%(f,v[0],v[1]) if v else 'f%.1f -'%f for f,v in out))
