"""Gộp danh sách dự án BĐS khác tại TP.HCM -> docs/data/more_projects.json
Nguồn 1: tin rao Chợ Tốt Nhà (căn hộ 1010 + nhà ở 1020) có gắn dự án; toạ độ = điểm dự án cố định trên Chợ Tốt (mode toạ độ tin).
Nguồn 2: dự án tìm qua batdongsan.com.vn (pipeline/press_projects.py), toạ độ Nominatim, chỉ giữ khi tên khớp.
Bỏ các dự án đã có trong projects.json / rivals.json."""
import json, re, unicodedata
import numpy as np, pandas as pd
def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()
STOP = {"du", "an", "khu", "can", "ho", "chung", "cu", "biet", "thu", "nha", "pho", "the", "phu", "my", "hung", "vinhomes", "city", "tp", "hcm", "quan", "saigon", "sai", "gon"}
def key_tokens(n): return [t for t in norm(n).split() if t not in STOP and len(t) > 2]

frames = [pd.read_json(f, lines=True) for f in ["data/raw_chotot.jsonl", "data/raw_projects.jsonl"]]
df = pd.concat(frames, ignore_index=True).drop_duplicates("ad_id")
df = df[df.pty_project_name.notna() & (df.pty_project_name.astype(str).str.strip() != "") & df.latitude.notna()]
df["cat"] = df.category.fillna(1010).astype(int)
df["ppm2"] = df.price / df["size"] / 1e6
have = json.load(open("docs/data/projects.json"))["projects"]
known = [norm(p["n"]).replace(" saigon", "") for p in have] + [norm(r[0]) for r in json.load(open("docs/data/rivals.json"))]
def is_known(n):
    k = norm(n)
    return any(k == x or (len(x) > 6 and (x in k or k in x)) for x in known)
out = []
for pid, g in df.groupby(df.projectid.fillna(-1).astype(int).astype(str) + "|" + df.pty_project_name.where(df.projectid.isna(), "")):
    name = g.pty_project_name.mode().iloc[0].strip()
    if len(g) < 2 or len(norm(name)) < 4 or is_known(name): continue
    c = g[["latitude", "longitude"]].round(4).value_counts().index[0]
    lat, lon = float(c[0]), float(c[1])
    if not (10.35 < lat < 11.2 and 106.35 < lon < 107.05): continue
    low = (g.cat == 1020).mean() > .5
    ap = g[(g.cat == 1010) & g.ppm2.between(15, 900)]
    out.append({"id": "ct-" + re.sub(r"[^a-z0-9]+", "-", norm(name))[:40], "n": name, "t": "thap" if low else "cao",
                "dist": g.area_name.mode().iloc[0] if g.area_name.notna().any() else "", "ll": [round(lat, 5), round(lon, 5)],
                "ads": int(len(g)), "ppm2": round(float(ap.ppm2.median()), 1) if len(ap) >= 3 else None, "src": "Chợ Tốt Nhà"})
# nguồn batdongsan (tên phải khớp kết quả OSM)
pr = json.load(open("data/press_projects.json"))
for p in pr["found"]:
    toks = key_tokens(p["n"]); osm = norm(p["osm"])
    if not toks or not all(t in osm for t in toks) or is_known(p["n"]) or any(norm(o["n"]) == norm(p["n"]) for o in out): continue
    out.append({"id": "bds-" + re.sub(r"[^a-z0-9]+", "-", norm(p["n"]))[:40], "n": p["n"], "t": p["type"], "dist": "", "ll": [p["lat"], p["lon"]],
                "ads": 0, "ppm2": None, "src": "batdongsan.com.vn (toạ độ OSM)"})
# trùng tên khác mã: giữ bản nhiều tin
best = {}
for o in out:
    k = norm(o["n"])
    if k not in best or o["ads"] > best[k]["ads"]: best[k] = o
out = sorted(best.values(), key=lambda o: norm(o["n"]))
ids = {}
for o in out:  # id duy nhất
    i = o["id"]; ids[i] = ids.get(i, 0) + 1
    if ids[i] > 1: o["id"] = f"{i}-{ids[i]}"
json.dump(out, open("docs/data/more_projects.json", "w"), ensure_ascii=False, separators=(",", ":"))
from collections import Counter
print(len(out), Counter(o["t"] for o in out), Counter(o["src"] for o in out))
print([o["n"] for o in out if o["t"] == "thap"][:40])
