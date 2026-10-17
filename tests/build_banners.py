# Сборка hero-фото и рекламных SVG-баннеров (источники: /tmp/wm — фото Wikimedia Commons, см. rules.html#credits)
from PIL import Image, ImageEnhance
import base64, io, os
A='/home/box/agent-data/agents/4c936a2d-01e4-4298-a793-a146f126d26b/assets/'
from PIL import ImageOps
wide=ImageOps.mirror(Image.open('/tmp/wm/meije.jpg').convert('RGB'))
tall=wide
work=Image.open('/tmp/wm/mech.jpg').convert('RGB')
emb=Image.open('/tmp/wm/wheelie.jpg').convert('RGB')
pana=Image.open('/workspace/velopark/velopark_panasonic_landing/assets/01-overall-left.jpg').convert('RGB')
H='hero/'
def save(im,base,q=78):
    im.save(base+'.webp','WEBP',quality=q,method=6); im.save(base+'.jpg','JPEG',quality=q-2,optimize=True,progressive=True)
    print(base, os.path.getsize(base+'.webp')//1024, os.path.getsize(base+'.jpg')//1024,'KB')
save(wide.resize((1600,900),Image.LANCZOS),H+'hero-1600',72)
save(wide.resize((1024,576),Image.LANCZOS),H+'hero-1024',74)
# mobile: portrait crop around rider (x~505)
m=tall.crop((1207-430,0,1207+380,1080)).resize((720,960),Image.LANCZOS)
save(m,H+'hero-m-720')
def b64(im,q=80):
    b=io.BytesIO(); im.save(b,'JPEG',quality=q,optimize=True,progressive=True); return base64.b64encode(b.getvalue()).decode()
def cover(im,w,h,cx=.5,cy=.5):
    s=max(w/im.width,h/im.height); im2=im.resize((round(im.width*s),round(im.height*s)),Image.LANCZOS)
    x=round((im2.width-w)*cx); y=round((im2.height-h)*cy); return im2.crop((x,y,x+w,y+h))
F='font-family="Arial,Helvetica,sans-serif"'
def svg(w,h,img,body,grad):
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{grad}</defs><rect width="{w}" height="{h}" fill="#0d1f1a"/>{img}{body}</svg>'
LG='<linearGradient id="o" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06140f" stop-opacity=".95"/><stop offset=".45" stop-color="#06140f" stop-opacity=".82"/><stop offset=".72" stop-color="#06140f" stop-opacity=".15"/><stop offset="1" stop-color="#06140f" stop-opacity="0"/></linearGradient>'
def wr(name,s):
    open('ads/'+name,'w').write(s); print(name, os.path.getsize('ads/'+name)//1024,'KB')
# Velopark wide 1200x240: photo on the right
ph=pana.crop((0,360,960,872)).resize((450,240),Image.LANCZOS)
ph=ImageEnhance.Contrast(ph).enhance(1.05)
img=f'<image x="750" y="0" width="450" height="240" xlink:href="data:image/jpeg;base64,{b64(ph,82)}"/><rect x="750" width="140" height="240" fill="url(#f)"/>'
g='<linearGradient id="f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1030"/><stop offset="1" stop-color="#1b1030" stop-opacity="0"/></linearGradient><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a0f3d"/><stop offset="1" stop-color="#1b1030"/></linearGradient>'
body=f'<rect width="890" height="240" fill="url(#bg)" /><rect x="0" width="890" height="240" fill="none"/>'
body=body.replace('fill="url(#bg)" />','fill="url(#bg)"/>')
txt=(f'<text x="56" y="86" {F} font-weight="800" font-size="58" fill="#fff">Velopark.kz</text>'
     f'<text x="56" y="136" {F} font-size="33" fill="#fff" opacity=".92">японские электровелосипеды Panasonic</text>'
     f'<rect x="56" y="160" width="220" height="54" rx="27" fill="#c8f560"/><text x="166" y="196" {F} font-weight="800" font-size="27" fill="#1b1030" text-anchor="middle">Смотреть →</text>')
# order: bg rect, image, fade, text
wr('velopark-wide.svg', svg(1200,240,'',body+img+txt,g))
# Checklist inline
ph=work.crop((300,600,1500,1240)).resize((450,240),Image.LANCZOS)
g2='<linearGradient id="f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a2a22"/><stop offset="1" stop-color="#0a2a22" stop-opacity="0"/></linearGradient><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3d31"/><stop offset="1" stop-color="#0a2a22"/></linearGradient>'
img=f'<rect width="890" height="240" fill="url(#bg)"/><image x="750" y="0" width="450" height="240" xlink:href="data:image/jpeg;base64,{b64(ph,82)}"/><rect x="750" width="160" height="240" fill="url(#f)"/>'
txt=(f'<text x="56" y="80" {F} font-weight="800" font-size="50" fill="#fff">Чек-лист покупки</text>'
     f'<text x="56" y="134" {F} font-weight="800" font-size="50" fill="#fff">б/у велосипеда</text>'
     f'<rect x="56" y="160" width="200" height="54" rx="27" fill="#c8f560"/><text x="156" y="196" {F} font-weight="800" font-size="28" fill="#10231c" text-anchor="middle">2 900 ₸</text>'
     f'<text x="276" y="196" {F} font-size="26" fill="#fff" opacity=".9">PDF · проверка перед покупкой</text>')
wr('checklist-inline.svg', svg(1200,240,'',img+txt,g2))
# Your ad wide
sc=emb.resize((round(emb.width*270/emb.height),270),Image.LANCZOS).crop((0,15,round(emb.width*270/emb.height),255))
cv=Image.new('RGB',(1200,240))
col=sc.crop((0,0,6,240)).resize((1,240),Image.BOX)
cv.paste(col.resize((1200,240)),(0,0))
m=Image.new('L',sc.size,255)
for x in range(160): 
    for_y=None
    m.paste(int(255*(x/160)**1.5),(x,0,x+1,sc.height))
cv.paste(sc,(1200-sc.width+20,0),m)
LG2='<linearGradient id="o" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06140f" stop-opacity=".85"/><stop offset=".5" stop-color="#06140f" stop-opacity=".55"/><stop offset=".68" stop-color="#06140f" stop-opacity="0"/></linearGradient>'
txt=(f'<text x="56" y="84" {F} font-weight="800" font-size="50" fill="#fff">Здесь может быть</text>'
     f'<text x="56" y="140" {F} font-weight="800" font-size="50" fill="#c8f560">ваша реклама</text>'
     f'<text x="56" y="196" {F} font-size="30" fill="#fff">пишите в Telegram <tspan font-weight="800">@GrifRift555</tspan></text>')
wr('your-ad-wide.svg', svg(1200,240,f'<image width="1200" height="240" xlink:href="data:image/jpeg;base64,{b64(cv,80)}"/><rect width="1200" height="240" fill="url(#o)"/>',txt,LG2))
# Your ad side 360x600
bg=cover(emb,360,600,.62,.5)
VG='<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06140f" stop-opacity=".92"/><stop offset=".45" stop-color="#06140f" stop-opacity=".6"/><stop offset=".75" stop-color="#06140f" stop-opacity=".1"/><stop offset="1" stop-color="#06140f" stop-opacity=".55"/></linearGradient>'
txt=(f'<text x="28" y="92" {F} font-weight="800" font-size="38" fill="#fff">Здесь может</text>'
     f'<text x="28" y="138" {F} font-weight="800" font-size="38" fill="#fff">быть ваша</text>'
     f'<text x="28" y="184" {F} font-weight="800" font-size="38" fill="#c8f560">реклама</text>'
     f'<text x="28" y="232" {F} font-size="20" fill="#fff" opacity=".9">Велосервисы, магазины, прокат</text>'
     f'<rect x="28" y="520" width="304" height="52" rx="26" fill="#c8f560"/><text x="180" y="554" {F} font-weight="800" font-size="22" fill="#10231c" text-anchor="middle">Пишите @GrifRift555</text>')
wr('your-ad-side.svg', svg(360,600,f'<image width="360" height="600" xlink:href="data:image/jpeg;base64,{b64(bg,78)}"/><rect width="360" height="600" fill="url(#v)"/>',txt,VG))
