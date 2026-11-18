"""Gom danh sách dự án BĐS TP.HCM từ tin rao Chợ Tốt Nhà (căn hộ 1010 + nhà ở 1020; tin bán).
Chỉ lưu: tên dự án, projectid, loại hình, toạ độ tin, giá/m². Không lưu thông tin người đăng.
-> data/raw_projects.jsonl"""
import json, time, urllib.request, sys, os
API = "https://gateway.chotot.com/v1/public/ad-listing"
OUT = "data/raw_projects.jsonl"
def get(params):
    q = "&".join(f"{k}={v}" for k, v in params.items())
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers={"User-Agent": "bds-ai-research/0.1"}), timeout=20) as r: return json.load(r)
        except Exception as e: time.sleep(3 * (i + 1))
    return {"ads": []}
seen = set()
with open(OUT, "w") as f:
    areas = set()
    for cg in (1010, 1020):
        base = {"region_v2": 13000, "cg": cg, "st": "s"}
        for o in range(0, 2000, 50):
            d = get({**base, "limit": 50, "o": o}); time.sleep(1); ads = d.get("ads", [])
            if not ads: break
            for a in ads:
                areas.add(a.get("area_v2"))
                if a["ad_id"] in seen: continue
                seen.add(a["ad_id"])
                f.write(json.dumps({k: a.get(k) for k in ["ad_id", "category", "projectid", "pty_project_name", "latitude", "longitude", "area_name", "ward_name", "street_name", "house_type", "size", "price", "price_million_per_m2"]}, ensure_ascii=False) + "\n")
        print("cg", cg, len(seen), flush=True)
        for ar in sorted(x for x in areas if x):
            for o in range(0, 600, 50):
                d = get({**base, "area_v2": ar, "limit": 50, "o": o}); time.sleep(1); ads = d.get("ads", [])
                if not ads: break
                for a in ads:
                    if a["ad_id"] in seen: continue
                    seen.add(a["ad_id"])
                    f.write(json.dumps({k: a.get(k) for k in ["ad_id", "category", "projectid", "pty_project_name", "latitude", "longitude", "area_name", "ward_name", "street_name", "house_type", "size", "price", "price_million_per_m2"]}, ensure_ascii=False) + "\n")
            f.flush()
        print("cg xong", cg, len(seen), flush=True)
