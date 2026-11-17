"""Dựng đồ thị đường bộ TP.HCM cho thuật toán A*/Dijkstra chạy trong trình duyệt.

Nguồn: lớp `transportation` trong vector tile OpenMapTiles (OpenStreetMap) của OpenFreeMap, z14.
Các bước:
 1. Tải tile, đổi toạ độ tile -> kinh/vĩ độ, cắt đúng biên tile (bỏ vùng đệm trùng lặp).
 2. Làm tròn toạ độ ~1 m để nối các đoạn bị cắt ở biên tile, "noding" (tách đường tại mọi giao cắt).
 3. Gán lại loại đường / một chiều cho từng đoạn, dựng đồ thị (nút = điểm, cạnh = đoạn thẳng).
 4. Rút gọn chuỗi nút bậc 2 (giữ hình học để vẽ), lấy thành phần liên thông lớn nhất.
 5. Ghi nhị phân gọn: docs/data/graph.bin + docs/data/graph.json (mô tả).
"""
import json, math, gzip, struct, urllib.request, concurrent.futures as cf
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import LineString, MultiLineString, box
from shapely.strtree import STRtree
import mapbox_vector_tile as mvt

UA = {"User-Agent": "bds-ai-research"}
TJ = json.load(urllib.request.urlopen(urllib.request.Request("https://tiles.openfreemap.org/planet", headers=UA)))["tiles"][0]
Z = 14
S, W, N, E = 10.66, 106.56, 10.96, 106.86
# loại đường -> mã; path (đường đi bộ) chỉ dùng cho đi bộ
CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]  # bỏ service/path (lối nội bộ) để đồ thị gọn cho web
CI = {c: i for i, c in enumerate(CLASSES)}

def tx(lon): return int((lon + 180) / 360 * 2 ** Z)
def ty(lat): r = math.radians(lat); return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z)
def lon_of(x): return x / 2 ** Z * 360 - 180
def lat_of(y): n = math.pi - 2 * math.pi * y / 2 ** Z; return math.degrees(math.atan(math.sinh(n)))

def one(xy):
    x, y = xy
    try:
        raw = urllib.request.urlopen(urllib.request.Request(TJ.format(z=Z, x=x, y=y), headers=UA), timeout=40).read()
        if raw[:2] == b"\x1f\x8b": raw = gzip.decompress(raw)
        t = mvt.decode(raw)
    except Exception as e:
        print("lỗi tile", x, y, e); return []
    L = t.get("transportation")
    if not L: return []
    ext = L.get("extent", 4096)
    bb = box(lon_of(x), lat_of(y + 1), lon_of(x + 1), lat_of(y))
    out = []
    for f in L["features"]:
        p = f["properties"]; c = p.get("class")
        if c not in CI or p.get("service") == "parking_aisle": continue
        g = f["geometry"]
        if g["type"] == "LineString": parts = [g["coordinates"]]
        elif g["type"] == "MultiLineString": parts = g["coordinates"]
        else: continue
        for part in parts:
            pts = [(lon_of(x + px / ext), lat_of(y + 1 - py / ext)) for px, py in part]  # y của mvt hướng lên
            if len(pts) < 2: continue
            ln = LineString(pts).intersection(bb)
            if ln.is_empty: continue
            for seg in (ln.geoms if hasattr(ln, "geoms") else [ln]):
                if seg.geom_type == "LineString" and seg.length > 0:
                    out.append((seg, CI[c], int(p.get("oneway", 0) or 0), p.get("brunnel") or ""))
    return out

if __name__ == "__main__":
    tiles = [(x, y) for x in range(tx(W), tx(E) + 1) for y in range(ty(N), ty(S) + 1)]
    print("tiles", len(tiles), flush=True)
    feats = []
    with cf.ThreadPoolExecutor(6) as ex:
        for r in ex.map(one, tiles): feats += r
    print("đoạn thô", len(feats), flush=True)
    GRID = 1e-5  # ~1,1 m
    geoms = shapely.set_precision(np.array([f[0] for f in feats]), GRID)
    keep = ~shapely.is_empty(geoms)
    feats = [f for f, k in zip(feats, keep) if k]; geoms = geoms[keep]
    noded = shapely.node(shapely.multilinestrings(list(shapely.get_parts(geoms))))
    pieces = list(shapely.get_parts(noded))
    print("đoạn sau noding", len(pieces), flush=True)
    tree = STRtree(geoms)
    # gán thuộc tính: đoạn gốc chứa trung điểm (gần nhất)
    mids = shapely.line_interpolate_point(np.array(pieces), 0.5, normalized=True)
    idx = tree.nearest(mids)
    nodes, nid = [], {}
    def node(pt):
        k = (round(pt[0] / GRID), round(pt[1] / GRID))
        if k not in nid: nid[k] = len(nodes); nodes.append(pt)
        return nid[k]
    edges = []  # (u, v, cls, oneway(+1 u->v / 0 hai chiều), coords)
    for pc, j in zip(pieces, idx):
        _, c, ow, br = feats[j]
        cs = list(pc.coords)
        if len(cs) < 2: continue
        u, v = node(cs[0]), node(cs[-1])
        if u == v: continue
        if ow:
            # cùng hướng với đường gốc?
            g = geoms[j]; a = shapely.line_locate_point(g, shapely.points(cs[0])); b = shapely.line_locate_point(g, shapely.points(cs[-1]))
            fwd = (b >= a) if ow == 1 else (b < a)
            if not fwd: u, v, cs = v, u, cs[::-1]
            ow = 1
        edges.append([u, v, c, ow, cs])
    print("nút", len(nodes), "cạnh", len(edges), flush=True)

    # thành phần liên thông lớn nhất (vô hướng)
    adj = defaultdict(list)
    for i, (u, v, *_ ) in enumerate(edges): adj[u].append(v); adj[v].append(u)
    seen, best = set(), []
    for s in list(adj):
        if s in seen: continue
        comp, st = [], [s]; seen.add(s)
        while st:
            a = st.pop(); comp.append(a)
            for b in adj[a]:
                if b not in seen: seen.add(b); st.append(b)
        if len(comp) > len(best): best = comp
    keepn = set(best)
    edges = [e for e in edges if e[0] in keepn]
    print("thành phần lớn nhất:", len(keepn), "nút,", len(edges), "cạnh", flush=True)

    # rút gọn chuỗi bậc 2 (cùng loại, cùng tính một chiều, không tạo vòng)
    inc = defaultdict(list)
    for i, e in enumerate(edges): inc[e[0]].append(i); inc[e[1]].append(i)
    alive = [True] * len(edges)
    def mergeable(n):
        es = [i for i in inc[n] if alive[i]]
        if len(es) != 2: return None
        a, b = edges[es[0]], edges[es[1]]
        if a[2] != b[2] or a[3] != b[3]: return None
        if a[3] and not ((a[1] == n and b[0] == n) or (b[1] == n and a[0] == n)): return None
        return es
    for n in list(inc):
        es = mergeable(n)
        if not es: continue
        i, j = es; a, b = edges[i], edges[j]
        if a[3] and a[0] == n: a, b, i, j = b, a, j, i       # a đi vào n, b đi ra
        # hướng hoá: a kết thúc tại n, b bắt đầu tại n
        ac = a[4] if a[1] == n else a[4][::-1]; au = a[0] if a[1] == n else a[1]
        bc = b[4] if b[0] == n else b[4][::-1]; bv = b[1] if b[0] == n else b[0]
        if au == bv: continue
        edges[i] = [au, bv, a[2], a[3], ac + bc[1:]]; alive[j] = False
        inc[bv] = [x if x != j else i for x in inc[bv]]
        inc[n] = []
    edges = [e for e, k in zip(edges, alive) if k]
    used = sorted({e[0] for e in edges} | {e[1] for e in edges})
    remap = {o: i for i, o in enumerate(used)}
    nodes = [nodes[o] for o in used]
    print("sau rút gọn:", len(nodes), "nút,", len(edges), "cạnh", flush=True)

    # ghi nhị phân: toạ độ nguyên (1e-5 độ) tương đối gốc
    LON0, LAT0 = W, S
    q = lambda v, o: int(round((v - o) / GRID))
    def m(a, b):
        return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(10.8)), (a[1] - b[1]) * 110540)
    out = bytearray()
    out += struct.pack("<4sII", b"BDSG", len(nodes), len(edges))
    for lo, la in nodes: out += struct.pack("<ii", q(lo, LON0), q(la, LAT0))
    shape = []
    for u, v, c, ow, cs in edges:
        L = sum(m(cs[k - 1], cs[k]) for k in range(1, len(cs)))
        mids = cs[1:-1]
        out += struct.pack("<IIfBBH", remap[u], remap[v], L, c, ow, len(mids))
        for lo, la in mids: shape.append((q(lo, LON0), q(la, LAT0)))
    # hình học trung gian: delta mã hoá int16 nếu được
    for lo, la in shape: out += struct.pack("<ii", lo, la)
    open("docs/data/graph.bin.gz", "wb").write(gzip.compress(bytes(out), 9))  # trình duyệt giải nén bằng DecompressionStream
    meta = {"lon0": LON0, "lat0": LAT0, "grid": GRID, "classes": CLASSES, "bbox": [S, W, N, E],
            "nodes": len(nodes), "edges": len(edges), "source": "OpenStreetMap qua OpenFreeMap (vector tile z14)", "built": "2026-11-17"}
    json.dump(meta, open("docs/data/graph.json", "w"))
    import os; print("graph.bin.gz", round(os.path.getsize("docs/data/graph.bin.gz") / 1e6, 2), "MB")
