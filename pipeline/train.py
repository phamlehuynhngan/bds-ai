"""Làm sạch dữ liệu, so sánh mô hình (chia theo không gian), tính SHAP, xuất mô hình cho web."""
import json, numpy as np, pandas as pd, lightgbm as lgb, shap
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, r2_score
from features import spatial, SPATIAL

df = pd.read_json("data/raw_chotot.jsonl", lines=True).drop_duplicates("ad_id")
n0 = len(df)
df = df.dropna(subset=["price", "size", "latitude", "longitude"])
df = df[(df["size"].between(20, 300)) & (df.price > 3e8)]
df["ppm2"] = df.price / df["size"] / 1e6                     # triệu đồng / m²
df = df[df.ppm2.between(15, 400)]
df = df[df.latitude.between(10.62, 10.98) & df.longitude.between(106.52, 106.90)]
# bỏ ngoại lai theo phường (|log ppm2 - trung vị phường| > 0.9)
med = df.groupby("ward").ppm2.transform("median")
df = df[np.abs(np.log(df.ppm2) - np.log(med)) < 0.9].copy()
# tin rao trùng: cùng toạ độ, diện tích, giá
df = df.drop_duplicates(["latitude", "longitude", "size", "price"])
print(f"tin thô {n0} -> sau làm sạch {len(df)}")

for k, v in spatial(df.latitude, df.longitude).items(): df[k] = v
df["rooms"] = df.rooms.fillna(df.rooms.median()); df["toilets"] = df.toilets.fillna(df.toilets.median())
for c in ["furnishing_sell", "property_legal_document", "property_status", "apartment_type"]:
    df[c] = df[c].fillna(0).astype(int)
df["district"] = df.area_v2.fillna(0).astype(int)
BASE = ["size", "rooms", "toilets", "furnishing_sell", "property_legal_document", "property_status", "apartment_type"]
FULL = BASE + SPATIAL + ["lat", "lon"]
df["lat"], df["lon"] = df.latitude, df.longitude
y = np.log(df.ppm2.values)
# chia theo ô lưới ~2 km để tránh rò rỉ giữa các căn sát nhau
groups = (np.floor(df.lat / 0.018)).astype(int) * 1000 + np.floor(df.lon / 0.018).astype(int)
gkf = GroupKFold(n_splits=5)

def evaluate(name, make, cols, onehot=False):
    X = pd.get_dummies(df[cols + (["district"] if onehot else [])], columns=["district"] if onehot else [], dtype=float)
    pred = np.zeros(len(df))
    for tr, te in gkf.split(X, y, groups):
        m = make(); m.fit(X.iloc[tr], y[tr]); pred[te] = m.predict(X.iloc[te])
    p, t = np.exp(pred), df.ppm2.values
    r = {"model": name, "MAPE_%": round(float(np.mean(np.abs(p - t) / t) * 100), 1),
         "MAE_trieu_m2": round(float(mean_absolute_error(t, p)), 1), "R2": round(float(r2_score(t, p)), 3)}
    print(r); return r

LGB = dict(n_estimators=400, learning_rate=0.045, num_leaves=31, min_child_samples=20, subsample=0.8,
           subsample_freq=1, colsample_bytree=0.8, verbose=-1)
results = [
    evaluate("Hồi quy tuyến tính – cơ bản + quận", lambda: Ridge(1.0), BASE, onehot=True),
    evaluate("Hồi quy tuyến tính – đầy đủ đặc trưng không gian", lambda: Ridge(1.0), FULL),
    evaluate("LightGBM – cơ bản + quận", lambda: lgb.LGBMRegressor(**LGB), BASE, onehot=True),
    evaluate("LightGBM – đầy đủ đặc trưng không gian", lambda: lgb.LGBMRegressor(**LGB), FULL),
]

# mô hình cuối + SHAP
final = lgb.LGBMRegressor(**LGB).fit(df[FULL], y)
expl = shap.TreeExplainer(final)
sv = expl.shap_values(df[FULL])
imp = sorted(zip(FULL, np.abs(sv).mean(0)), key=lambda t: -t[1])
print("SHAP:", [(k, round(float(v), 3)) for k, v in imp])

# lưới ~500 m cho căn tham chiếu 70 m², 2PN, 2WC
lat = np.arange(10.66, 10.96, 0.0045); lon = np.arange(106.56, 106.86, 0.0045)
LA, LO = np.meshgrid(lat, lon); LA, LO = LA.ravel(), LO.ravel()
# chỉ giữ ô trong vùng có dữ liệu (≤ 2 km tới tin rao gần nhất)
pts = df[["lat", "lon"]].values
from scipy.spatial import cKDTree
d, _ = cKDTree(np.c_[pts[:, 0] * 111.32, pts[:, 1] * 109.4]).query(np.c_[LA * 111.32, LO * 109.4])
keep = d < 2.0; LA, LO = LA[keep], LO[keep]
REF = {"size": 70, "rooms": 2, "toilets": 2, "furnishing_sell": int(df.furnishing_sell.mode()[0]),
       "property_legal_document": int(df.property_legal_document.mode()[0]),
       "property_status": int(df.property_status.mode()[0]), "apartment_type": int(df.apartment_type.mode()[0])}
G = pd.DataFrame({**{k: v for k, v in REF.items()}, **spatial(LA, LO), "lat": LA, "lon": LO}, index=range(len(LA)))[FULL]
gp = final.predict(G); gs = expl.shap_values(G)
grid = [{"lat": round(float(a), 5), "lon": round(float(b), 5), "p": round(float(np.exp(c)), 1),
         "s": [round(float(v), 3) for v in s]} for a, b, c, s in zip(LA, LO, gp, gs)]

# xuất
pts_out = df[["lat", "lon", "ppm2", "size", "rooms", "pty_project_name", "area_name"]].round(3)  # làm tròn ~100 m, không công bố toạ độ gốc
json.dump({"features": FULL, "base": float(expl.expected_value), "ref": REF, "grid": grid,
           "results": results, "importance": [[k, round(float(v), 4)] for k, v in imp],
           "n": int(len(df)), "n_raw": int(n0),
           "collected": "Chợ Tốt Nhà (API công khai), 11/2026"}, open("docs/data/model.json", "w"), ensure_ascii=False)
json.dump([[r.lat, r.lon, round(r.ppm2, 1), r.size, None if pd.isna(r.pty_project_name) else r.pty_project_name, int(r.rooms), r.area_name]
           for r in pts_out.itertuples()], open("docs/data/listings.json", "w"), ensure_ascii=False)
import os; os.makedirs("models", exist_ok=True); final.booster_.save_model("models/lgb.txt")
json.dump(final.booster_.dump_model()["tree_info"], open("data/trees_full.json", "w"))
print("grid", len(grid))

# cây gọn cho trình duyệt: nút = [chỉ_số_đặc_trưng, ngưỡng, trái, phải], lá = số
def compact(n):
    if "leaf_value" in n: return round(n["leaf_value"], 6)
    assert n["decision_type"] == "<="
    return [n["split_feature"], round(n["threshold"], 6), compact(n["left_child"]), compact(n["right_child"]), round(n["internal_value"], 6)]
trees = [compact(t["tree_structure"]) for t in final.booster_.dump_model()["tree_info"]]
json.dump(trees, open("docs/data/trees.json", "w"), separators=(",", ":"))
# kiểm tra: dự đoán JS-tương-đương bằng Python
def run(t, x):
    while isinstance(t, list): t = t[2] if x[t[0]] <= t[1] else t[3]
    return t
x0 = df[FULL].iloc[0].values
assert abs(sum(run(t, x0) for t in trees) - final.predict(df[FULL].iloc[[0]])[0]) < 1e-4
print("trees ok", len(trees))
