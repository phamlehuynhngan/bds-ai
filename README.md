# BĐS AI – Định giá căn hộ TP.HCM bằng học máy không gian

Đồ án tốt nghiệp ngành Trí tuệ nhân tạo. Web: `docs/` (GitHub Pages).

## Chạy lại toàn bộ
```bash
pip install -r requirements.txt
python3 pipeline/collect_chotot.py     # tin rao -> data/raw_chotot.jsonl (~1 request/giây)
python3 pipeline/fetch_poi_tiles.py    # tiện ích OSM -> data/poi.json
python3 pipeline/train.py              # làm sạch, so sánh mô hình, SHAP -> docs/data/
cp data/poi.json docs/data/poi.json
```
Xem web: `cd docs && python3 -m http.server 8000`.

## Thành phần
| Thư mục | Nội dung |
|---|---|
| `pipeline/collect_chotot.py` | Thu thập tin rao bán căn hộ TP.HCM (API công khai Chợ Tốt Nhà), không lưu thông tin người đăng |
| `pipeline/fetch_poi_tiles.py` | Trường học, y tế, siêu thị/TTTM, công viên từ vector tile OpenStreetMap |
| `pipeline/features.py` | Đặc trưng không gian: khoảng cách Bến Thành, ga Metro số 1, mật độ tiện ích |
| `pipeline/train.py` | Hồi quy tuyến tính vs LightGBM, kiểm định chéo chia theo không gian, SHAP, xuất cây cho trình duyệt |
| `docs/` | Web bản đồ: lớp giá dự đoán, lớp ảnh hưởng (SHAP), định giá tại điểm bất kỳ chạy ngay trong trình duyệt |

## Lưu ý dữ liệu
Giá tin rao là giá chào bán. Dữ liệu thô không đưa lên repo; web chỉ hiển thị tin rao đã làm tròn toạ độ (~100 m) để tham khảo nghiên cứu.
