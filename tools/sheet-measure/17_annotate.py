"""Annotated crops: every reported ratio drawn as the two bars that were divided.
Output: annot-<robot>-<topic>.png"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import seglib
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',15)
F2=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)

def bar_h(d,x0,x1,y,col,label,off=-18):
    d.line([(x0,y),(x1,y)],fill=col,width=3)
    for x in (x0,x1): d.line([(x,y-7),(x,y+7)],fill=col,width=3)
    d.text(((x0+x1)//2-len(label)*4, y+off), label, fill=col, font=F)
def bar_v(d,y0,y1,x,col,label,off=6):
    d.line([(x,y0),(x,y1)],fill=col,width=3)
    for y in (y0,y1): d.line([(x-7,y),(x+7,y)],fill=col,width=3)
    d.text((x+off, (y0+y1)//2-8), label, fill=col, font=F)

RED=(220,30,30); BLU=(20,80,230); GRN=(0,150,60); MAG=(190,0,190); ORA=(230,120,0)

# ---------- VOXXY overall ----------
im=Image.open('/home/user/devoxx-gauntlet-m/robots/voxxy-robot.png').crop((0,0,550,768)).convert('RGB')
d=ImageDraw.Draw(im)
# figure 113..757 ; head 113..380 ; oval top 135 ; ears 113..148 ; head_w 395 (x 78..473?)
m=seglib.figure_mask(np.asarray(im).astype(np.int16),24)
bb=seglib.bbox(m)
hs=seglib.maxspan(m,113,380)
# head widest row
hy=None;best=0
for y in range(113,380):
    s=seglib.rowspan(m,y)
    if s and s[1]-s[0]>best: best=s[1]-s[0]; hy=y
hsp=seglib.rowspan(m,hy)
bar_h(d,hsp[0],hsp[1],hy,RED,'head_w 395')
bar_v(d,113,380,bb[0]-14,BLU,'head_h 267',off=-96)
bar_v(d,113,757,bb[2]+30,GRN,'total_h 644')
bar_v(d,135,380,bb[0]+2,MAG,'oval_h 245',off=6)
bar_h(d,113+0,148,0,(0,0,0),'')
bar_h(d,bb[0],bb[2],750,ORA,'total_w / arm span 418')
# torso
ts=None
for y in range(380,700):
    row=m[y]; runs=[];s=None
    for i,v in enumerate(row):
        if v and s is None:s=i
        elif not v and s is not None:runs.append((s,i));s=None
    runs=[r for r in runs if r[1]-r[0]>=6]
    if len(runs)==3 and runs[1][1]-runs[1][0]==212: ts=(y,runs[1]); break
if ts: bar_h(d,ts[1][0],ts[1][1],ts[0],BLU,'torso_w 212')
im.save('annot-voxxy-figure.png')

# ---------- VOXXY head / visor / eyes ----------
im=Image.open('/home/user/devoxx-gauntlet-m/robots/voxxy-robot.png').crop((110,100,500,400)).convert('RGB')
im=im.resize((390*2,300*2),Image.LANCZOS)
d=ImageDraw.Draw(im)
def T(x,y): return ((x-110)*2,(y-100)*2)
# visor 146..464 x, 182..359 y ; eyes at f=0.40: from voxxy_eyes.json
import json
J=json.load(open('voxxy_eyes.json'))
e=[r for r in J['eyes'] if abs(r['f']-0.40)<1e-9][0]
vx0,vy0,vx1,vy1=J['visor']['bbox']
d.rectangle([T(vx0,vy0),T(vx1,vy1)],outline=RED,width=3)
d.text(T(vx0,vy0-26),'visor 318 x 177',fill=RED,font=F)
for tag,col in (('L',BLU),('R',GRN)):
    b=e[tag+'bbox']
    d.rectangle([T(b[0],b[1]),T(b[2],b[3])],outline=col,width=3)
d.text(T(vx0+10,vy1+6),'eye @f=0.40: 50x36 (w/W .159  h/H .201)',fill=BLU,font=F)
bl=e['Lbbox']; br=e['Rbbox']
y=(bl[1]+bl[3])//2
d.line([T(bl[2],y),T(br[0],y)],fill=MAG,width=3)
d.text(T((bl[2]+br[0])//2-40,y+8),'gap 80',fill=MAG,font=F)
d.line([T(int(e['Lcx']),bl[1]-8),T(int(e['Rcx']),bl[1]-8)],fill=ORA,width=3)
d.text(T(int(e['Lcx'])+20,bl[1]-30),'centre dist 134 (.417 of visor w)',fill=ORA,font=F)
im.save('annot-voxxy-visor-eyes.png')

# ---------- VOXXY ears ----------
im=Image.open('/home/user/devoxx-gauntlet-m/robots/voxxy-robot.png').crop((130,100,490,200)).convert('RGB')
im=im.resize((360*3,100*3),Image.LANCZOS)
d=ImageDraw.Draw(im)
def T2(x,y): return ((x-130)*3,(y-100)*3)
d.line([T2(154,148),T2(227,148)],fill=RED,width=4); d.text(T2(160,152),'ear 73',fill=RED,font=F)
d.line([T2(388,148),T2(461,148)],fill=RED,width=4); d.text(T2(394,152),'ear 73',fill=RED,font=F)
d.line([T2(190,120),T2(424,120)],fill=BLU,width=4); d.text(T2(250,96),'ear spacing 234 (0.593 of head_w 395)',fill=BLU,font=F)
im.save('annot-voxxy-ears.png')

# ---------- BIGGY ----------
im=Image.open('/home/user/devoxx-gauntlet-m/robots/biggy-robot.png').crop((150,558,780,1012)).convert('RGB')
d=ImageDraw.Draw(im)
bar_h(d,79,456,322,GRN,'total_w 377')
bar_h(d,119,418,230,RED,'belly_w 298  (0.788 of total_w, 1.193 of dome_w)')
bar_h(d,seglib.rowspan(seglib.figure_mask(np.asarray(im).astype(np.int16),60),40)[0],
        seglib.rowspan(seglib.figure_mask(np.asarray(im).astype(np.int16),60),40)[1],60,BLU,'')
bar_h(d,144,393,105,BLU,'dome_w 249 (0.660)')
bar_v(d,27,112,470,MAG,'dome_h 85 (0.207)')
bar_v(d,27,437,500,GRN,'total_h 410')
bar_h(d,179,366,412,ORA,'stance 187-191 (0.50)')
d.rectangle([(211,53),(237,73)],outline=(255,0,255),width=2)
d.rectangle([(300,52),(327,77)],outline=(255,0,255),width=2)
d.text((205,30),'dark lens bezels (NOT lit)',fill=(255,0,255),font=F2)
im.save('annot-biggy-figure.png')

# ---------- DROID ----------
im=Image.open('/home/user/devoxx-gauntlet-m/robots/droid-robot.png').crop((300,400,530,768)).convert('RGB')
im=im.resize((230*2,368*2),Image.LANCZOS)
d=ImageDraw.Draw(im)
def T3(x,y): return (x*2,y*2)
def bv(y0,y1,x,col,lab,off=6):
    d.line([T3(x,y0),T3(x,y1)],fill=col,width=3)
    for y in (y0,y1): d.line([T3(x-6,y),T3(x+6,y)],fill=col,width=3)
    d.text(T3(x+off,(y0+y1)//2-5),lab,fill=col,font=F2)
bv(16,71,20,RED,'head 55 (.162)',off=-18)
bv(71,204,20,BLU,'torso 133 (.392)',off=-18)
bv(204,355,20,GRN,'legs 151 (.445)',off=-18)
bv(16,355,213,MAG,'total 339',off=-70)
d.line([T3(36,133),T3(198,133)],fill=ORA,width=3)
d.text(T3(60,118),'shoulder span 164',fill=ORA,font=F2)
d.line([T3(92,46),T3(142,46)],fill=RED,width=3)
d.text(T3(84,30),'head_w 50',fill=RED,font=F2)
im.save('annot-droid-figure.png')

# droid eyes zoom
im=Image.open('/home/user/devoxx-gauntlet-m/robots/droid-robot.png').crop((380,415,460,475)).convert('RGB')
im=im.resize((80*8,60*8),Image.LANCZOS)
d=ImageDraw.Draw(im)
def T4(x,y): return ((x-80)*8,(y-15)*8)   # ROI(300,400)->crop(380,415) offset (80,15)
d.line([T4(105,44),T4(125,44)],fill=(255,0,255),width=3)
d.text(T4(100,46),'eye spacing 20 (0.40 of head_w 50)',fill=(255,0,255),font=F2)
im.save('annot-droid-eyes.png')

# droid shoulder disc
im=Image.open('/home/user/devoxx-gauntlet-m/robots/droid-robot.png').crop((100,460,200,540)).convert('RGB')
im=im.resize((100*6,80*6),Image.LANCZOS)
d=ImageDraw.Draw(im)
def T5(x,y): return ((x-100)*6,(y-460)*6)
d.line([T5(128,490),T5(181,490)],fill=RED,width=3)
d.text(T5(125,494),'disc 50-53 px (side panel)',fill=RED,font=F2)
im.save('annot-droid-shoulderdisc.png')
print('annotations written')
