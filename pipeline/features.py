"""Tạo đặc trưng không gian cho mỗi căn hộ (dùng chung cho huấn luyện và lưới bản đồ)."""
import json, re, numpy as np
STATIONS = json.loads(re.search(r"window\.STATIONS=(\[.*?\]);", open("data/data-geo.js").read()).group(1))
ST = np.array([[s[1], s[2]] for s in STATIONS])
BEN_THANH = (10.77251, 106.69802)
POI = json.load(open("data/poi.json"))
KINDS = ["edu", "health", "shop", "park"]
PK = {k: np.array([[p[0], p[1]] for p in POI if p[2] == k]) for k in KINDS}

def km(lat, lon, arr):
    """Khoảng cách (km) xấp xỉ phẳng từ các điểm (lat, lon) tới tập điểm arr -> ma trận."""
    dy = (lat[:, None] - arr[None, :, 0]) * 111.32
    dx = (lon[:, None] - arr[None, :, 1]) * 111.32 * np.cos(np.radians(10.8))
    return np.sqrt(dx * dx + dy * dy)

SPATIAL = ["d_center", "d_metro"] + [f"n_{k}_1km" for k in KINDS] + [f"d_{k}" for k in KINDS]

def spatial(lat, lon):
    lat, lon = np.asarray(lat, float), np.asarray(lon, float)
    f = {"d_center": km(lat, lon, np.array([BEN_THANH]))[:, 0], "d_metro": km(lat, lon, ST).min(1)}
    for k in KINDS:
        d = km(lat, lon, PK[k])
        f[f"n_{k}_1km"] = (d < 1).sum(1)
        f[f"d_{k}"] = d.min(1)
    return f
