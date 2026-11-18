"""Giá thị trường tham khảo cho từng dự án trên web -> docs/data/project_prices.json

Thứ tự ưu tiên:
1. Tin rao bán trên Chợ Tốt Nhà của chính dự án (>= 3 tin): trung vị + khoảng tứ phân vị.
2. Giá công bố / giá rao tổng hợp từ báo chí, sàn (PRESS bên dưới, có link nguồn) cho dự án mới mở bán,
   hàng hiệu hoặc ít tin rao bán lại.
Dự án nhà phố – biệt thự: không áp dụng mô hình căn hộ.
"""
import json, re, unicodedata
import numpy as np, pandas as pd

def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " ").replace(",", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()

# Giá tham khảo từ báo chí / sàn (triệu đồng/m², tra cứu 17/11/2026). kind: so_cap | du_kien | rao_ban
PRESS = {
    "Grand Marina, Saigon": dict(lo=423, hi=480, kind="rao_ban", note="Mở bán khoảng 18.000 USD/m²; tin rao thứ cấp 460–480 triệu/m²",
        src="https://nhadautu.vn/masterise-homes-ra-mat-can-ho-marriott-phien-ban-dac-biet-chua-den-450-trieu-m2-d97717.html"),
    "One Central Saigon": dict(lo=650, hi=800, kind="du_kien", note="Chưa công bố giá chính thức; mức dự kiến theo báo chí",
        src="https://vneconomy.vn/can-ho-sieu-sang-dat-co-xat-ra-mieng.htm"),
    "Masteri Cosmo Central": dict(lo=108, hi=145, kind="rao_ban", note="Giá rao bán tổng hợp",
        src="https://batdongsan.com.vn/nha-dat-ban-masteri-cosmo-central"),
    "Masteri Grand View": dict(lo=113, hi=146, kind="rao_ban", note="Giá rao bán tổng hợp",
        src="https://batdongsan.com.vn/nha-dat-ban-masteri-grand-view"),
    "Masteri Park Place": dict(lo=106, hi=138, kind="rao_ban", note="Giá rao bán tổng hợp",
        src="https://batdongsan.com.vn/ban-can-ho-chung-cu-masteri-park-place"),
    "LUMIÈRE Midtown": dict(lo=155, hi=185, kind="du_kien", note="Bảng giá dự kiến 2025 quy đổi ~158–160 triệu/m²; tin rao đến ~185",
        src="https://thuviennhadat.vn/bat-dong-san/gia-ban-du-an-phan-khu-lumiere-midtown-bao-nhieu-15400.html"),
    "The Metropole Thủ Thiêm": dict(lo=330, hi=448, kind="rao_ban", note="Báo cáo quý 1/2026; giao dịch thứ cấp 330–500 triệu/m²",
        src="https://24hmoney.vn/news/can-ho-o-thu-thiem-lap-mat-bang-gia-moi-c3a2788410.html"),
    "Gladia by the Waters": dict(lo=72, hi=95, kind="so_cap", note="Căn hộ Gladia Heights, giá chủ đầu tư/môi giới rao",
        src="https://batdongsan.com.vn/nha-dat-ban-gladia-heights"),
    "Vinhomes Green Paradise": dict(lo=60, hi=75, kind="du_kien", note="Căn hộ phân khu Imperia Green Paradise, giá tham khảo giai đoạn 1",
        src="https://cafeland.vn/du-an/imperia-green-paradise-phan-khu-can-ho-thuoc-vinhomes-green-paradise-tphcm-5328.html"),
}
# Tên trên Chợ Tốt khác tên trên web
ALIAS = {
    "Vinhomes Golden River": ["Vinhomes Golden River BaSon"],
    "Dragon Hill Residence & Suites": ["Dragon Hill Residence And Suites 1"],
    "Dragon Hill 2": ["Dragon Hill Residence And Suites 2 (Dragon hill 2)"],
    "Safira Khang Điền": ["Safira Khang Điền (Sapphire Khang Điền)"],
    "Akari City": ["Akari City", "Akari City Nam Long"],
    "Q7 Saigon Riverside Complex": ["Saigon Riverside Complex Q7"],
    "River Panorama": ["River Panorama (The Garden Bay)"],
    "Grand Manhattan": ["The Grand Manhattan"],
    "RichStar": ["Căn hộ RichStar"],
    "Palm City": ["Palm Heights", "Palm Residence", "Palm City"],
    "d'Edge Thảo Điền": ["d'Edge", "D'Edge Thảo Điền"],
}
EXACT = {"Sunrise City", "The Estella", "Empire City"}  # tên là phần đầu của dự án khác (Sunrise CityView, Estella Heights…)
LOW_RISE = {"The Rivus"}  # dinh thự / biệt thự dù không thuộc nhóm "Nhà phố – Biệt thự"

def build():
    df = pd.read_json("data/raw_chotot.jsonl", lines=True).drop_duplicates("ad_id")
    df = df[(df["size"].between(20, 300)) & (df.price > 3e8)]
    df["ppm2"] = df.price / df["size"] / 1e6
    df = df[df.ppm2.between(15, 900)]
    df["pn"] = df.pty_project_name.map(norm)
    P = json.load(open("docs/data/projects.json"))["projects"]
    out = {}
    for p in P:
        if p["g"] == "Nhà phố – Biệt thự" or p["n"] in LOW_RISE:
            out[p["id"]] = {"kind": "thap_tang", "note": "Dự án nhà phố – biệt thự: giá tính theo căn, mô hình căn hộ không áp dụng."}
            continue
        names = [norm(a) for a in ALIAS.get(p["n"], [])] or [norm(p["n"]).replace(" saigon", "")]
        ex = p["n"] in EXACT
        m = df[df.pn.apply(lambda s: any(s == k or (not ex and len(k) > 6 and k in s) for k in names))]
        if len(m) >= 3:
            q1, med, q3 = np.percentile(m.ppm2, [25, 50, 75])
            out[p["id"]] = {"kind": "chotot", "mid": round(med, 1), "lo": round(q1, 1), "hi": round(q3, 1), "n": int(len(m)),
                            "note": f"Trung vị {len(m)} tin rao bán trên Chợ Tốt Nhà (11/2026)"}
        elif p["n"] in PRESS:
            r = PRESS[p["n"]]
            out[p["id"]] = {"kind": r["kind"], "lo": r["lo"], "hi": r["hi"], "mid": round((r["lo"] + r["hi"]) / 2, 1), "note": r["note"], "src": r["src"]}
        else:
            out[p["id"]] = {"kind": "none", "note": "Chưa có đủ dữ liệu giá thị trường cho dự án này."}
    json.dump(out, open("docs/data/project_prices.json", "w"), ensure_ascii=False, indent=0)
    from collections import Counter
    print(Counter(v["kind"] for v in out.values()))
    for p in P: print(f'{p["n"][:30]:30} {out[p["id"]].get("kind"):9} {out[p["id"]].get("mid","")}')

if __name__ == "__main__":
    build()
