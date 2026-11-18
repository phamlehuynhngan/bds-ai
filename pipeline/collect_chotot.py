"""Thu thập tin rao bán căn hộ TP.HCM từ API công khai của Chợ Tốt Nhà (gateway.chotot.com).
- Tốc độ: ~1 request/giây; chỉ dùng cho nghiên cứu.
- KHÔNG lưu thông tin cá nhân người đăng (tên, số điện thoại, ảnh, mô tả tự do).
Chạy: python3 pipeline/collect_chotot.py  -> data/raw_chotot.jsonl
"""
import json, time, urllib.request, os, sys

API = "https://gateway.chotot.com/v1/public/ad-listing"
KEEP = ["ad_id", "list_id", "list_time", "price", "size", "price_million_per_m2", "rooms", "toilets",
        "latitude", "longitude", "area_v2", "area_name", "ward", "ward_name", "street_name",
        "projectid", "pty_project_name", "apartment_type", "furnishing_sell", "property_legal_document",
        "property_status", "company_ad", "type", "category",
        "floornumber", "balconydirection", "direction", "pty_project_transaction_status", "pty_project_type"]
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "raw_chotot.jsonl")

def get(params):
    q = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": "bds-ai-research/0.1"})
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except Exception as e:
            print("retry", i, e, file=sys.stderr); time.sleep(3 * (i + 1))
    return {"ads": []}

def crawl(base, seen, f, cap=10000):
    n = 0
    for o in range(0, cap, 50):
        d = get({**base, "limit": 50, "o": o}); time.sleep(1)
        ads = d.get("ads", [])
        if not ads: break
        for a in ads:
            if a.get("type") != "s" or a["ad_id"] in seen: continue
            seen.add(a["ad_id"]); n += 1
            f.write(json.dumps({k: a.get(k) for k in KEEP}, ensure_ascii=False) + "\n")
        if o + 50 >= d.get("total", 0): break
    return n

if __name__ == "__main__":
    seen = set()
    if os.path.exists(OUT):
        seen = {json.loads(l)["ad_id"] for l in open(OUT)}
    base = {"region_v2": 13000, "cg": 1010, "st": "s"}
    with open(OUT, "a") as f:
        # API trả tối đa ~10.000 tin/truy vấn -> chia theo quận/huyện để lấy sâu hơn
        areas = get({**base, "limit": 1}).get("ads", [])
        print("toàn TP:", crawl(base, seen, f, 2000), flush=True)
        area_ids = sorted({json.loads(l)["area_v2"] for l in open(OUT) if json.loads(l)["area_v2"]})
        for a in area_ids:
            print("khu", a, crawl({**base, "area_v2": a}, seen, f), flush=True)
    print("tổng", len(seen))
