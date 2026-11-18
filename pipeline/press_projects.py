"""Dự án biệt thự/compound/căn hộ tìm thấy qua tìm kiếm trên batdongsan.com.vn (17–18/11/2026).
Toạ độ tra Nominatim (OSM); không tìm thấy thì bỏ qua (ghi danh sách chờ)."""
import json, time, urllib.request, urllib.parse, urllib.error
SRC = {
 "thap": ["Chateau Phú Mỹ Hưng", "Biệt thự Phú Gia Phú Mỹ Hưng", "Biệt thự Mỹ Văn Phú Mỹ Hưng", "Evergreen Phú Mỹ Hưng", "The Manhattan Glory Vinhomes Grand Park",
          "Alta Villa The 9 Stellars", "Jardin Villas Vạn Phúc City", "Vạn Phúc City", "Cielo Island", "Hà Đô Villas", "Sola Đảo Ánh Dương", "Essensia Parkway",
          "The Solina", "Sol Villas", "Phố Đông Village", "Saigon Mystery Villas", "The Classia", "Villa Park", "Rio Vista", "Hausneo", "Đông Tăng Long",
          "Thủ Đức Garden Homes", "Vinhomes Saigon Park", "Senturia Nam Sài Gòn"],
 "cao": ["Triton Crown Phú Mỹ Hưng", "Gladia Heights", "Happy One Elite", "Trellia Vista", "Legacy 66", "The Symphony Phú Mỹ Hưng", "The Regency Phú Mỹ Hưng",
         "The Sculptura Phú Mỹ Hưng", "The Aurora Phú Mỹ Hưng"]}
def geo(q):
    u = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": q + ", Hồ Chí Minh", "format": "jsonv2", "countrycodes": "vn", "limit": 1, "viewbox": "106.35,11.2,107.05,10.35", "bounded": 1})
    for i in range(4):
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "bds-ai-research/0.1"}), timeout=20)); time.sleep(1.6)
            return r[0] if r else None
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(10 * (i + 1))
    return None
out, miss = [], []
for kind, names in SRC.items():
    for n in names:
        r = geo(n)
        if not r and " " in n: r = geo(n.split(" Phú Mỹ Hưng")[0].split(" Vinhomes")[0])
        if r: out.append({"n": n, "type": kind, "lat": round(float(r["lat"]), 5), "lon": round(float(r["lon"]), 5), "osm": r.get("display_name", "")[:80]})
        else: miss.append(n)
json.dump({"found": out, "missing": miss}, open("data/press_projects.json", "w"), ensure_ascii=False, indent=1)
print(len(out), "tìm thấy;", "thiếu:", miss)
for o in out: print(" ", o["n"], "→", o["osm"])
