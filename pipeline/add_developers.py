"""Thêm chủ đầu tư (Novaland, Hưng Thịnh, BLUEMARQ (Đất Xanh cũ), Phát Đạt, An Gia, Keppel Land, CapitaLand, Hongkong Land)
và dự án tại TP.HCM của họ vào docs/data/projects.json (chạy sau khi xuất projects.json từ bdsvietnam).
Toạ độ: điểm dự án cố định trên Chợ Tốt Nhà (mode toạ độ tin rao) nếu có, không thì Nominatim; lưu đệm data/dev_geo.json.
Chỉ chữ: tên, CĐT, địa chỉ, phân khúc, tình trạng. Không ảnh/logo."""
import json, os, re, time, unicodedata, urllib.parse, urllib.request
import pandas as pd

DEV = {
    "novaland": {"n": "Novaland", "c": "#1f6f8b", "s": "NVL", "web": "https://www.novaland.com.vn/"},
    "hungthinh": {"n": "Hưng Thịnh", "c": "#b8322a", "s": "HT", "web": "https://hungthinhcorp.com.vn/"},
    "datxanh": {"n": "BLUEMARQ", "c": "#1d4f91", "s": "BM", "web": "https://datxanh.vn/"},
    "phatdat": {"n": "Phát Đạt", "c": "#c99a2e", "s": "PĐ", "web": "https://www.phatdat.com.vn/"},
    "angia": {"n": "An Gia", "c": "#d0662b", "s": "AG", "web": "https://www.angia.com.vn/"},
    "keppel": {"n": "Keppel Land", "c": "#c2185b", "s": "KL", "web": "https://www.keppel.com/"},
    "capitaland": {"n": "CapitaLand", "c": "#24479a", "s": "CL", "web": "https://www.capitaland.com/vn/"},
    "hkland": {"n": "Hongkong Land", "c": "#5b6b7a", "s": "HKL", "web": "https://www.hkland.com/"},
}
CH, KDT, NP = "Căn hộ", "Khu đô thị", "Nhà phố – Biệt thự"
BG = [["Tình trạng", "Đã bàn giao"]]
# (CĐT, tên, phân khúc, địa chỉ, thông tin, tên trên Chợ Tốt nếu khác, truy vấn Nominatim nếu khác)
P = [
    ("novaland", "Sunrise City", CH, "Nguyễn Hữu Thọ, Quận 7 (cũ)", BG),
    ("novaland", "Sunrise CityView", CH, "Nguyễn Hữu Thọ, Quận 7 (cũ)", BG),
    ("novaland", "Sunrise Riverside", CH, "Nguyễn Hữu Thọ, Nhà Bè (cũ)", BG),
    ("novaland", "The Sun Avenue", CH, "28 Mai Chí Thọ, Quận 2 (cũ)", BG),
    ("novaland", "Lexington Residence", CH, "67 Mai Chí Thọ, Quận 2 (cũ)", BG),
    ("novaland", "Victoria Village", CH, "Đồng Văn Cống, Quận 2 (cũ)", []),
    ("novaland", "Lakeview City", NP, "Song Hành, An Phú, Quận 2 (cũ)", BG),
    ("novaland", "Orchard Park View", CH, "130–132 Hồng Hà, Phú Nhuận (cũ)", BG),
    ("novaland", "Golden Mansion", CH, "119 Phổ Quang, Phú Nhuận (cũ)", BG),
    ("novaland", "Kingston Residence", CH, "146 Nguyễn Văn Trỗi, Phú Nhuận (cũ)", BG),
    ("novaland", "Newton Residence", CH, "38 Trương Quốc Dung, Phú Nhuận (cũ)", BG),
    ("novaland", "The Botanica", CH, "104 Phổ Quang, Tân Bình (cũ)", BG),
    ("novaland", "Botanica Premier", CH, "108 Hồng Hà, Tân Bình (cũ)", BG),
    ("novaland", "Galaxy 9", CH, "9 Nguyễn Khoái, Quận 4 (cũ)", BG),
    ("novaland", "RiverGate Residence", CH, "151–155 Bến Vân Đồn, Quận 4 (cũ)", BG),
    ("novaland", "Saigon Royal Residence", CH, "34–35 Bến Vân Đồn, Quận 4 (cũ)", BG),
    ("novaland", "The Tresor", CH, "39 Bến Vân Đồn, Quận 4 (cũ)", BG),
    ("novaland", "Grand Manhattan", CH, "100 Cô Giang, Quận 1 (cũ)", []),
    ("novaland", "RichStar", CH, "Hòa Bình, Tân Phú (cũ)", BG, "Căn hộ RichStar"),
    ("novaland", "Wilton Tower", CH, "71/3 Nguyễn Văn Thương, Bình Thạnh (cũ)", BG),
    ("hungthinh", "Moonlight Park View", CH, "Đường số 7, Bình Tân (cũ)", BG),
    ("hungthinh", "Moonlight Boulevard", CH, "Kinh Dương Vương, Bình Tân (cũ)", BG),
    ("hungthinh", "Moonlight Residences", CH, "102 Đặng Văn Bi, Thủ Đức (cũ)", BG),
    ("hungthinh", "Q7 Saigon Riverside Complex", CH, "Đào Trí, Quận 7 (cũ)", BG, "Saigon Riverside Complex Q7"),
    ("hungthinh", "Q7 Boulevard", CH, "Nguyễn Lương Bằng, Quận 7 (cũ)", []),
    ("hungthinh", "Lavita Charm", CH, "Đường số 1, Trường Thọ, Thủ Đức (cũ)", BG),
    ("hungthinh", "Richmond City", CH, "207C Nguyễn Xí, Bình Thạnh (cũ)", BG),
    ("hungthinh", "Melody Residences", CH, "Âu Cơ, Tân Phú (cũ)", BG),
    ("hungthinh", "Saigon Gateway", CH, "Xa lộ Hà Nội, Quận 9 (cũ)", BG),
    ("datxanh", "Sunview Town", CH, "Gò Dưa, Thủ Đức (cũ)", BG),
    ("datxanh", "Opal Riverside", CH, "10 Phạm Văn Đồng, Thủ Đức (cũ)", BG),
    ("datxanh", "Opal Garden", CH, "Đường số 20, Hiệp Bình Chánh, Thủ Đức (cũ)", BG),
    ("datxanh", "LuxGarden", CH, "Quận 7 (cũ)", BG),
    ("datxanh", "The Privé", CH, "Khu dân cư Nam Rạch Chiếc, phường An Phú (Quận 2 cũ)", [["Quy mô", "Khoảng 6,7 ha, 12 tháp 33–34 tầng"], ["Tiến độ", "Đã cất nóc; dự kiến bàn giao từ quý III/2027"]]),
    ("phatdat", "The EverRich Infinity", CH, "290 An Dương Vương, Quận 5 (cũ)", BG),
    ("phatdat", "The EverRich 1", CH, "968 Đường 3 Tháng 2, Quận 11 (cũ)", BG),
    ("angia", "West Gate", CH, "Nguyễn Văn Linh nối dài, Bình Chánh (cũ)", BG),
    ("angia", "An Gia Garden", CH, "Tân Phú (cũ)", BG),
    ("angia", "An Gia Star", CH, "Bình Tân (cũ)", BG),
    ("angia", "An Gia Riverside", CH, "Đào Trí, Quận 7 (cũ)", BG),
    ("angia", "Sky 89", CH, "89 Hoàng Quốc Việt, Quận 7 (cũ)", BG),
    ("angia", "River Panorama", CH, "Quận 7 (cũ)", BG, "River Panorama (The Garden Bay)"),
    ("keppel", "Empire City", KDT, "Khu đô thị mới Thủ Thiêm", [["Tình trạng", "Đã bàn giao nhiều tháp, đang triển khai tiếp"]]),
    ("keppel", "The Estella", CH, "88 Song Hành, An Phú, Quận 2 (cũ)", BG),
    ("keppel", "Estella Heights", CH, "88 Song Hành, An Phú, Quận 2 (cũ)", BG),
    ("keppel", "Palm City", KDT, "Song Hành, An Phú, Quận 2 (cũ)", [["Ghi chú", "Gồm Palm Heights, Palm Residence"]]),
    ("keppel", "Riviera Point", CH, "Nguyễn Văn Tưởng, Quận 7 (cũ)", BG),
    ("keppel", "Celesta Rise", CH, "Nguyễn Hữu Thọ, Nhà Bè (cũ)", [["Ghi chú", "Liên doanh Keppel Land – Phú Long"]]),
    ("keppel", "Saigon Sports City", KDT, "An Phú, Quận 2 (cũ)", [["Tình trạng", "Đang triển khai"]]),
    ("capitaland", "d'Edge Thảo Điền", CH, "Thảo Điền, Quận 2 (cũ)", BG),
    ("capitaland", "Vista Verde", CH, "Đồng Văn Cống, Thạnh Mỹ Lợi, Quận 2 (cũ)", BG),
    ("capitaland", "The Vista An Phú", CH, "628C Xa lộ Hà Nội, An Phú, Quận 2 (cũ)", BG),
    ("capitaland", "Feliz en Vista", CH, "Thạnh Mỹ Lợi, Quận 2 (cũ)", BG),
    ("capitaland", "De La Sol", CH, "Quận 4 (cũ)", BG),
    ("hkland", "The Nassim", CH, "Thảo Điền, Quận 2 (cũ)", BG),
    ("hkland", "The Marq", CH, "29B Nguyễn Đình Chiểu, Quận 1 (cũ)", BG),
    # dự án bổ sung cho CĐT có sẵn từ bdsvietnam (tra báo chí 18/11/2026)
    ("phulong", "Essensia Sky", CH, "Nguyễn Hữu Thọ, Phước Kiển, Nhà Bè (cũ)", [["Quy mô", "Tháp đôi 26 tầng, 424 căn"], ["Tiến độ", "Khởi công 9/2024, khánh thành 11/2026"]]),
    ("phulong", "Essensia Parkway", NP, "Nguyễn Hữu Thọ, Phước Kiển, Nhà Bè (cũ)", [["Quy mô", "Khoảng 1,65 ha, 74 căn"]]),
    ("keppel", "Celesta Gold", CH, "Nguyễn Hữu Thọ, Phước Kiển, Nhà Bè (cũ)", [["Quy mô", "2 tháp 25 tầng, khoảng 420 căn"], ["Ghi chú", "Giai đoạn 3 Celesta City; liên doanh Keppel Land – Phú Long – Nomura"]]),
    ("mik", "Imperia Sensa Park", KDT, "Võ Chí Công, phường Phước Long", [["Quy mô", "4,9 ha; 2 tháp 25 tầng (922 căn hộ), 93 căn thấp tầng"], ["Tiến độ", "Khởi công 6/8/2026, dự kiến bàn giao quý IV/2028"]]),
]

def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()

CACHE = "data/dev_geo.json"
geo = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
ct = pd.concat([pd.read_json(f, lines=True) for f in ["data/raw_chotot.jsonl"]], ignore_index=True)
ct = ct[ct.pty_project_name.notna() & ct.latitude.notna()]
ct["k"] = ct.pty_project_name.map(norm)

# toạ độ kiểm tra bằng đối tượng OSM mang đúng tên/địa chỉ dự án (Nominatim), ưu tiên hơn điểm Chợ Tốt
FIX = {"The Sun Avenue": [10.78417, 106.74617], "Lexington Residence": [10.79842, 106.75181], "The Botanica": [10.8084, 106.67005],
       "RiverGate Residence": [10.76192, 106.69929], "Palm City": [10.79285, 106.75908], "The Nassim": [10.80487, 106.7439],
       "The EverRich 1": [10.76254, 106.6573],
       # quần thể Essensia Nam Sài Gòn / Celesta City trên Nguyễn Hữu Thọ (điểm dự án Chợ Tốt); Imperia Sensa Park: giao Võ Chí Công – Liên Phường (OSM)
       "Essensia Sky": [10.7056, 106.707], "Essensia Parkway": [10.7056, 106.707], "Celesta Gold": [10.7087, 106.7064],
       "Imperia Sensa Park": [10.8068, 106.7915]}

def locate(name, ct_name, addr):
    if name in FIX: return FIX[name], "osm"
    k = norm(ct_name or name)
    g = ct[ct.k == k]
    if len(g) >= 2:
        c = g[["latitude", "longitude"]].round(4).value_counts().index[0]
        return [float(c[0]), float(c[1])], "chotot"
    if name in geo: return geo[name], "nominatim"
    q = urllib.parse.quote(f"{name}, Hồ Chí Minh, Việt Nam")
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1&countrycodes=vn",
                                 headers={"User-Agent": "bds-ai-research/0.1"})
    time.sleep(1.1)
    r = json.load(urllib.request.urlopen(req, timeout=20))
    if not r: return None, None
    geo[name] = [round(float(r[0]["lat"]), 5), round(float(r[0]["lon"]), 5)]
    return geo[name], "nominatim"

data = json.load(open("docs/data/projects.json"))
data["dev"].update(DEV)
pid = lambda d, n: d + "-" + re.sub(r"[^a-z0-9]+", "-", norm(n)).strip("-")
new_ids = {pid(r[0], r[1]) for r in P}
data["projects"] = [p for p in data["projects"] if p["d"] not in DEV and p["id"] not in new_ids]
miss = []
for row in P:
    d, n, g, addr, info = row[:5]; ctn = row[5] if len(row) > 5 else None
    ll, src = locate(n, ctn, addr)
    if not ll: miss.append(n); continue
    dn = DEV.get(d, data["dev"][d])
    data["projects"].append({"id": pid(d, n), "n": n, "d": d, "ll": [round(ll[0], 5), round(ll[1], 5)],
        "a": True, "g": g, "addr": addr + ", TP.HCM", "tag": "", "desc": f"Dự án {g.lower()} của {dn['n']} tại TP.HCM.",
        "info": info, "am": [], "web": dn["web"], "poly": None})
    print(f"{src:9s} {ll} {n}")
json.dump(geo, open(CACHE, "w"), ensure_ascii=False, indent=0)
json.dump(data, open("docs/data/projects.json", "w"), ensure_ascii=False, separators=(",", ":"))
# dự án đã có CĐT thì bỏ khỏi danh sách "dự án khác" (rivals)
names = {norm(p["n"]) for p in data["projects"]}
rv = [r for r in json.load(open("docs/data/rivals.json")) if norm(r[0]) not in names]
json.dump(rv, open("docs/data/rivals.json", "w"), ensure_ascii=False)
print("thiếu toạ độ:", miss, "| tổng dự án:", len(data["projects"]), "| rivals còn:", len(rv))
