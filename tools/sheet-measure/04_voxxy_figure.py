"""Voxxy front elevation: silhouette, head/body split, threshold sweep."""
import numpy as np, json
from PIL import Image
import seglib

ROI = (0, 0, 550, 768)   # panel r0c0 of voxxy-robot.png (5x2 grid, 2752x1536)
a = seglib.load('voxxy')[ROI[1]:ROI[3], ROI[0]:ROI[2]]
Image.fromarray(a.astype(np.uint8)).save('crop-voxxy-front.png')

rows = []
for D in (6, 10, 14, 18, 24, 30, 38, 46):
    m = seglib.figure_mask(a, D)
    bb = seglib.bbox(m)
    cnt = seglib.rowcounts(m)
    # neck = row of minimum non-zero count between 30% and 65% of figure height
    y0, y1 = bb[1], bb[3]
    lo = y0 + int(0.30*(y1-y0)); hi = y0 + int(0.65*(y1-y0))
    neck = lo + int(np.argmin(cnt[lo:hi]))
    headmax = cnt[y0:neck].max()
    # oval top = first row in head with count > 50% of head max row count
    ovt = y0 + int(np.argmax(cnt[y0:neck] > 0.5*headmax))
    head_w, head_wy = seglib.maxspan(m, y0, neck)
    body_w, body_wy = seglib.maxspan(m, neck, y1)
    rec = dict(D=D, bbox=bb, total_w=bb[2]-bb[0], total_h=bb[3]-bb[1],
               neck=int(neck), oval_top=int(ovt), head_w=head_w, head_wy=head_wy,
               head_h=int(neck-y0), oval_h=int(neck-ovt),
               body_w=body_w, body_wy=body_wy, body_h=int(y1-neck))
    rows.append(rec)
    if D == 18:
        seglib.save_mask(m, 'mask-voxxy-front-D18.png')
    if D in (6, 46):
        seglib.save_mask(m, 'mask-voxxy-front-D%d.png' % D)
    print(rec)

json.dump(rows, open('voxxy_figure.json','w'), indent=1)
print()
def rng(k, den):
    vals = [r[k]/r[den] for r in rows]
    print('%-10s / %-8s  min %.4f  max %.4f  mid %.4f' % (k, den, min(vals), max(vals), np.median(vals)))
rng('head_w','total_w'); rng('head_h','total_h'); rng('oval_h','total_h')
rng('body_w','total_w'); rng('body_h','total_h')
print('body_w/head_w range', min(r['body_w']/r['head_w'] for r in rows), max(r['body_w']/r['head_w'] for r in rows))
