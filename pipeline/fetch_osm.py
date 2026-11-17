"""Tải điểm tiện ích TP.HCM từ OpenStreetMap (Overpass) -> data/poi.json  [[lat,lon,loai],...]"""
import json, urllib.request, urllib.parse
BBOX = "10.55,106.45,11.05,106.95"
Q = f"""[out:json][timeout:180];
(
 nwr["amenity"~"^(school|kindergarten|university|college)$"]({BBOX});
 nwr["amenity"~"^(hospital|clinic)$"]({BBOX});
 nwr["shop"~"^(mall|supermarket|department_store)$"]({BBOX});
 nwr["leisure"="park"]({BBOX});
);
out center tags;"""
def kind(t):
    a, s = t.get("amenity", ""), t.get("shop", "")
    if a in ("school", "kindergarten", "university", "college"): return "edu"
    if a in ("hospital", "clinic"): return "health"
    if s: return "shop"
    return "park"
req = urllib.request.Request("https://overpass-api.de/api/interpreter",
      data=urllib.parse.urlencode({"data": Q}).encode(), headers={"User-Agent": "bds-ai-research/0.1"})
d = json.load(urllib.request.urlopen(req, timeout=240))
out = []
for e in d["elements"]:
    c = e if "lat" in e else e.get("center")
    if c: out.append([round(c["lat"], 5), round(c["lon"], 5), kind(e.get("tags", {}))])
json.dump(out, open("data/poi.json", "w"))
from collections import Counter; print(len(out), Counter(k for *_, k in out))
