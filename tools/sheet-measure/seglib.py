"""Shared segmentation helpers.

mask(rgb, t): a pixel belongs to the FIGURE if it is darker than threshold t
(luminance = mean of R,G,B) OR noticeably chromatic (max-min channel > sat_t).
The chroma term catches Voxxy's bright orange body and Biggy's orange belly,
which can be lighter than a pure-luminance threshold would allow.
Background in all three sheets is a near-neutral off-white gradient, so its
chroma is < ~8.
"""
import numpy as np
from PIL import Image

SHEETS = {
    'voxxy': '/home/user/devoxx-gauntlet-m/robots/voxxy-robot.png',
    'droid': '/home/user/devoxx-gauntlet-m/robots/droid-robot.png',
    'biggy': '/home/user/devoxx-gauntlet-m/robots/biggy-robot.png',
}

def load(name):
    return np.asarray(Image.open(SHEETS[name]).convert('RGB')).astype(np.int16)

def figmask(a, t, sat_t=18):
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    return (lum < t) | (sat > sat_t)

def bbox(m):
    ys, xs = np.where(m)
    if len(ys) == 0: return None
    return (int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1)

def largest_blob(m):
    """Iterative flood fill, returns mask of the largest 4-connected component."""
    from collections import deque
    lab = np.zeros(m.shape, np.int32)
    cur = 0; best = (0, 0)
    H, W = m.shape
    idx = np.argwhere(m)
    for y0, x0 in idx:
        if lab[y0, x0]: continue
        cur += 1; n = 0
        dq = deque([(y0, x0)]); lab[y0, x0] = cur
        while dq:
            y, x = dq.pop(); n += 1
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                yy, xx = y+dy, x+dx
                if 0 <= yy < H and 0 <= xx < W and m[yy,xx] and not lab[yy,xx]:
                    lab[yy,xx] = cur; dq.append((yy,xx))
        if n > best[1]: best = (cur, n)
    return lab == best[0]

def save_mask(m, path):
    Image.fromarray((m*255).astype(np.uint8)).save(path)

def bands(profile, minlen=3):
    """Runs of True in a boolean profile."""
    out=[]; s=None
    for i,v in enumerate(profile):
        if v and s is None: s=i
        elif not v and s is not None:
            if i-s>=minlen: out.append((s,i))
            s=None
    if s is not None and len(profile)-s>=minlen: out.append((s,len(profile)))
    return out

# ---------------------------------------------------------------- v2 helpers
from collections import deque

def components(m, minarea=1):
    """All 4-connected components: area, bbox (x0,y0,x1,y1), centroid (cx,cy)."""
    H, W = m.shape
    seen = np.zeros(m.shape, bool)
    out = []
    for y0, x0 in np.argwhere(m):
        if seen[y0, x0]: continue
        dq = deque([(y0, x0)]); seen[y0, x0] = True
        n = 0; sx = 0; sy = 0
        xmin = xmax = x0; ymin = ymax = y0
        while dq:
            y, x = dq.pop(); n += 1; sx += x; sy += y
            if x < xmin: xmin = x
            if x > xmax: xmax = x
            if y < ymin: ymin = y
            if y > ymax: ymax = y
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                yy, xx = y+dy, x+dx
                if 0 <= yy < H and 0 <= xx < W and m[yy,xx] and not seen[yy,xx]:
                    seen[yy,xx] = True; dq.append((yy,xx))
        if n >= minarea:
            out.append(dict(area=int(n), bbox=(int(xmin),int(ymin),int(xmax)+1,int(ymax)+1),
                            cx=sx/n, cy=sy/n, seed=(int(y0),int(x0))))
    out.sort(key=lambda c: -c['area'])
    return out

def blob_mask(m, comp):
    """Re-flood one component into its own mask."""
    H, W = m.shape
    out = np.zeros(m.shape, bool)
    y0, x0 = comp['seed']
    dq = deque([(y0,x0)]); out[y0,x0] = True
    while dq:
        y, x = dq.pop()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            yy, xx = y+dy, x+dx
            if 0 <= yy < H and 0 <= xx < W and m[yy,xx] and not out[yy,xx]:
                out[yy,xx] = True; dq.append((yy,xx))
    return out

def figure_mask(a_roi, D, sat_t=18, span_rej=0.92):
    """Figure silhouette inside an ROI.

    Row-local background = 90th percentile luminance of that row inside the
    ROI, which cancels the sheets' panel vignette. A pixel is figure when it is
    D below its row background OR chromatic (sat > sat_t). Rows whose flagged
    x-span covers more than span_rej of the ROI width are dropped: those are
    the sheets' horizontal floor/contact-shadow bands, never the robot.
    Returns the largest 4-connected component.
    """
    lum = a_roi.mean(axis=2)
    sat = a_roi.max(axis=2) - a_roi.min(axis=2)
    rowbg = np.percentile(lum, 90, axis=1)[:, None]
    m = ((rowbg - lum) > D) | (sat > sat_t)
    W = m.shape[1]
    for y in range(m.shape[0]):
        xs = np.where(m[y])[0]
        if len(xs) and (xs.max() - xs.min() + 1) > span_rej * W:
            m[y] = False
    cs = components(m, 50)
    if not cs: return m & False
    return blob_mask(m, cs[0])

def rowcounts(m):
    return m.sum(axis=1)

def rowspan(m, y):
    xs = np.where(m[y])[0]
    return (int(xs.min()), int(xs.max())+1) if len(xs) else None

def maxspan(m, y0=None, y1=None):
    y0 = 0 if y0 is None else y0; y1 = m.shape[0] if y1 is None else y1
    best = 0; besty = None
    for y in range(y0, y1):
        s = rowspan(m, y)
        if s and s[1]-s[0] > best: best = s[1]-s[0]; besty = y
    return best, besty
