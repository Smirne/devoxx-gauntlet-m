"""Detect panel grid in each model sheet.

Method: convert to greyscale, compute per-column and per-row minimum luminance
(over the full image). Panel separators are strips where the sheet is pure
background for the entire column/row. We find runs of columns whose min
luminance is above SEP_MIN (i.e. nothing dark anywhere in that column) and
whose width is >= MIN_GAP, then take panel spans between them.
"""
import numpy as np
from PIL import Image
import json, sys

SHEETS = {
    'voxxy': '/home/user/devoxx-gauntlet-m/robots/voxxy-robot.png',
    'droid': '/home/user/devoxx-gauntlet-m/robots/droid-robot.png',
    'biggy': '/home/user/devoxx-gauntlet-m/robots/biggy-robot.png',
}

def runs(mask, minlen):
    out=[]; s=None
    for i,v in enumerate(mask):
        if v and s is None: s=i
        elif not v and s is not None:
            if i-s>=minlen: out.append((s,i))
            s=None
    if s is not None and len(mask)-s>=minlen: out.append((s,len(mask)))
    return out

for name,path in SHEETS.items():
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    lum = a.mean(axis=2)
    H,W = lum.shape
    colmin = lum.min(axis=0)
    rowmin = lum.min(axis=1)
    print('===',name,W,'x',H)
    print(' colmin percentiles', np.percentile(colmin,[0,5,50,95,100]).round(1))
    print(' rowmin percentiles', np.percentile(rowmin,[0,5,50,95,100]).round(1))
    for sep in (200,215,230):
        cgaps = runs(colmin>sep, max(5,W//200))
        rgaps = runs(rowmin>sep, max(5,H//200))
        print('  sep',sep,'col gaps',cgaps,'row gaps',rgaps)
