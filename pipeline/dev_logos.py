"""Logo chủ đầu tư -> docs/logos/<id>.png (96x96, nền trong suốt, chỉ phần biểu tượng).
Nguồn: website chính thức của CĐT hoặc companieslogo.com (tải 19/11/2026). Chị đồng ý đưa logo lên repo (19/11/2026).
crop = (trái, trên, phải, dưới) theo tỉ lệ sau khi cắt viền trống; None = giữ cả logo."""
import io, os, sys, urllib.request
from PIL import Image
OUT = "docs/logos"
SRC = {
    "masterise": ("https://revamp-ldp.masterisehomes.com/uploads/Logo_MH_Doc_2_f4a0854497.png", (0.22, 0, 0.78, 0.74)),
    "vin": ("https://companieslogo.com/img/orig/VHM.VN-c16609e3.png", None),
    "khangdien": ("https://companieslogo.com/img/orig/KDH.VN-e223a28a.png", None),
    "phulong": ("https://phulong.com/wp-content/uploads/2024/10/cropped-logo-192x192.png", None),
    "namlong": ("https://www.namlongvn.com/wp-content/themes/namlong/images/logo.svg", (0.2, 0, 0.8, 0.66)),
    "sonkim": ("https://sonkimland.vn/images/logo.png", (0, 0, 0.27, 1)),
    "mik": ("https://mikgroup.vn/wp-content/uploads/2025/03/logo.png.webp", (0, 0, 0.36, 1)),
    "novaland": ("https://www.novaland.com.vn/Data/Sites/1/media/Default/logo-nvl.jpg", "green"),
    "hungthinh": ("https://hungthinhland.com/images/logo_land3.png", (0.25, 0, 0.75, 0.66)),
    "phatdat": ("https://www.phatdat.com.vn/wp-content/logo-footer.png", (0, 0, 0.4, 1)),
    "keppel": ("https://companieslogo.com/img/orig/BN4.SI-6646cc85.png", None),
    "capitaland": ("https://companieslogo.com/img/orig/C31.SI-8cbfec65.png", None),
    "hkland": ("https://companieslogo.com/img/orig/H78.SI-b719cbe2.png", None),
}
def get(u):
    data = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read()
    if u.endswith(".svg"):
        import cairosvg; data = cairosvg.svg2png(bytestring=data, output_width=800)
    return Image.open(io.BytesIO(data)).convert("RGBA")
def trim(im):
    px = im.load(); w, h = im.size
    # nền trắng (ảnh jpg) -> trong suốt
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r > 245 and g > 245 and b > 245: px[x, y] = (255, 255, 255, 0)
    return im.crop(im.getbbox())
os.makedirs(OUT, exist_ok=True)
for k, (u, crop) in SRC.items():
    im = trim(get(u))
    if crop == "green":  # Novaland: chỉ lấy khối Rubik xanh lá
        px = im.load(); w, h = im.size
        pts = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] and px[x, y][1] > px[x, y][0] + 40 and px[x, y][1] > px[x, y][2] + 25]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]; im = im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    elif crop:
        w, h = im.size; im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h))); im = im.crop(im.getbbox())
    f = 88 / max(im.size); im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
    c = Image.new("RGBA", (96, 96), (0, 0, 0, 0)); c.paste(im, ((96 - im.width) // 2, (96 - im.height) // 2), im)
    c.save(f"{OUT}/{k}.png", optimize=True); print(k, im.size)
