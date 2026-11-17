"""Lấy điểm tiện ích (lớp poi, OpenMapTiles/OSM) từ vector tile OpenFreeMap z14 phủ TP.HCM -> data/poi.json"""
import json, math, urllib.request, gzip, concurrent.futures as cf
import mapbox_vector_tile as mvt
TJ = json.load(urllib.request.urlopen(urllib.request.Request("https://tiles.openfreemap.org/planet", headers={"User-Agent": "bds-ai-research"})))["tiles"][0]
Z = 14; S, W, N, E = 10.62, 106.52, 10.98, 106.90
def tx(lon): return int((lon + 180) / 360 * 2**Z)
def ty(lat): r = math.radians(lat); return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**Z)
CLS = {"school": "edu", "college": "edu", "kindergarten": "edu", "hospital": "health", "doctors": "health",
       "pharmacy": None, "shop": None, "grocery": "shop", "department_store": "shop", "park": "park",
       "attraction": None}
SUB = {"supermarket": "shop", "mall": "shop", "department_store": "shop", "clinic": "health", "hospital": "health",
       "university": "edu", "school": "edu", "kindergarten": "edu", "park": "park"}
def one(xy):
    x, y = xy
    try:
        raw = urllib.request.urlopen(urllib.request.Request(TJ.format(z=Z, x=x, y=y), headers={"User-Agent": "bds-ai-research"}), timeout=30).read()
        if raw[:2] == b"\x1f\x8b": raw = gzip.decompress(raw)
        t = mvt.decode(raw)
    except Exception as e:
        return []
    out = []
    lay = t.get("poi")
    if not lay: return out
    ext = lay.get("extent", 4096)
    for f in lay["features"]:
        p = f["properties"]; k = SUB.get(p.get("subclass")) or CLS.get(p.get("class"))
        if not k: continue
        g = f["geometry"]; c = g["coordinates"]
        if g["type"] != "Point": continue
        px, py = c[0] / ext, c[1] / ext  # mapbox_vector_tile: y hướng lên
        lon = (x + px) / 2**Z * 360 - 180
        n = math.pi - 2 * math.pi * (y + 1 - py) / 2**Z
        lat = math.degrees(math.atan(math.sinh(n)))
        out.append([round(lat, 5), round(lon, 5), k])
    return out
tiles = [(x, y) for x in range(tx(W), tx(E) + 1) for y in range(ty(N), ty(S) + 1)]
print("tiles", len(tiles), flush=True)
res = []
with cf.ThreadPoolExecutor(4) as ex:
    for r in ex.map(one, tiles): res += r
res = [list(t) for t in {tuple(r) for r in res}]
json.dump(res, open("data/poi.json", "w"))
from collections import Counter; print(len(res), Counter(k for *_, k in res))
