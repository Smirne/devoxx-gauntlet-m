from PIL import Image
S={'voxxy':'/home/user/devoxx-gauntlet-m/robots/voxxy-robot.png',
   'droid':'/home/user/devoxx-gauntlet-m/robots/droid-robot.png',
   'biggy':'/home/user/devoxx-gauntlet-m/robots/biggy-robot.png'}
# uniform grids
GRID={'voxxy':(5,2),'droid':(5,2),'biggy':(3,3)}
for n,p in S.items():
    im=Image.open(p).convert('RGB'); W,H=im.size
    c,r=GRID[n]
    for j in range(r):
        for i in range(c):
            bx=(round(i*W/c),round(j*H/r),round((i+1)*W/c),round((j+1)*H/r))
            im.crop(bx).save('panel-%s-r%dc%d.png'%(n,j,i))
            print(n,j,i,bx)
