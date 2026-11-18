"""Tiện ích & địa điểm có tên ở TP.HCM (lớp poi + aerodrome_label của OpenMapTiles/OSM, vector tile z14)
-> docs/data/places.json: [[tên, nhóm, lat, lon], ...] dùng cho ô tìm kiếm tab Kết nối."""
import json, math, gzip, urllib.request, concurrent.futures as cf
import mapbox_vector_tile as mvt
UA = {"User-Agent": "bds-ai-research"}
TJ = json.load(urllib.request.urlopen(urllib.request.Request("https://tiles.openfreemap.org/planet", headers=UA)))["tiles"][0]
Z = 14; S, W, N, E = 10.62, 106.52, 10.98, 106.90
def tx(lon): return int((lon + 180) / 360 * 2 ** Z)
def ty(lat): r = math.radians(lat); return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z)
# (class/subclass) -> nhóm hiển thị
SUB = {"university": "Giáo dục", "college": "Giáo dục", "school": "Giáo dục", "kindergarten": "Giáo dục",
       "hospital": "Y tế", "clinic": "Y tế",
       "mall": "Mua sắm", "department_store": "Mua sắm", "supermarket": "Mua sắm", "marketplace": "Chợ",
       "park": "Công viên", "garden": "Công viên", "zoo": "Tham quan", "theme_park": "Tham quan",
       "museum": "Tham quan", "attraction": "Tham quan", "monument": "Tham quan", "memorial": "Tham quan", "viewpoint": "Tham quan",
       "theatre": "Văn hoá – giải trí", "cinema": "Văn hoá – giải trí", "arts_centre": "Văn hoá – giải trí",
       "stadium": "Thể thao", "sports_centre": "Thể thao", "golf_course": "Thể thao", "swimming_pool": "Thể thao",
       "place_of_worship": "Tôn giáo", "townhall": "Hành chính", "embassy": "Hành chính", "police": None,
       "bus_station": "Giao thông", "station": "Giao thông", "ferry_terminal": "Giao thông",
       "hotel": None, "bank": None, "bus_stop": None, "tram_stop": None, "halt": None}
CLS = {"school": "Giáo dục", "college": "Giáo dục", "hospital": "Y tế", "shop": None, "grocery": None, "park": "Công viên",
       "attraction": "Tham quan", "museum": "Tham quan", "theatre": "Văn hoá – giải trí", "cinema": "Văn hoá – giải trí",
       "stadium": "Thể thao", "place_of_worship": "Tôn giáo", "town_hall": "Hành chính", "bus": "Giao thông", "railway": "Giao thông",
       "lodging": None, "zoo": "Tham quan", "golf": "Thể thao", "swimming": "Thể thao"}
def one(xy):
    x, y = xy
    try:
        raw = urllib.request.urlopen(urllib.request.Request(TJ.format(z=Z, x=x, y=y), headers=UA), timeout=40).read()
        if raw[:2] == b"\x1f\x8b": raw = gzip.decompress(raw)
        t = mvt.decode(raw)
    except Exception: return []
    out = []
    for lname in ("poi", "aerodrome_label"):
        L = t.get(lname)
        if not L: continue
        ext = L.get("extent", 4096)
        for f in L["features"]:
            p = f["properties"]; name = (p.get("name:vi") or p.get("name") or "").strip()
            if not name or f["geometry"]["type"] != "Point": continue
            if lname == "aerodrome_label": cat = "Giao thông"
            else:
                sub, cl = p.get("subclass"), p.get("class")
                cat = SUB.get(sub) if sub in SUB else CLS.get(cl)
                if cl == "shop" and sub in ("mall", "department_store", "supermarket"): cat = "Mua sắm"
                if cl in ("bus", "railway") and sub not in ("bus_station", "station"): cat = None
            if not cat: continue
            cx, cy = f["geometry"]["coordinates"]
            lon = (x + cx / ext) / 2 ** Z * 360 - 180
            n = math.pi - 2 * math.pi * (y + 1 - cy / ext) / 2 ** Z
            out.append([name, cat, round(math.degrees(math.atan(math.sinh(n))), 5), round(lon, 5), p.get("rank", 99)])
    return out
tiles = [(x, y) for x in range(tx(W), tx(E) + 1) for y in range(ty(N), ty(S) + 1)]
res = []
with cf.ThreadPoolExecutor(6) as ex:
    for r in ex.map(one, tiles): res += r
seen, out = set(), []
for name, cat, la, lo, rk in sorted(res, key=lambda r: r[4] or 99):
    k = (name.lower(), round(la, 3), round(lo, 3))
    if k in seen: continue
    seen.add(k); out.append([name, cat, la, lo])
json.dump(out, open("docs/data/places.json", "w"), ensure_ascii=False, separators=(",", ":"))
from collections import Counter
print(len(out), Counter(c for _, c, *_ in out))
import os; print(round(os.path.getsize("docs/data/places.json") / 1e3), "KB")
