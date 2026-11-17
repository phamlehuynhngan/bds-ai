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
| `docs/` | Web 4 tab: Dự án (CĐT lớn) · Metro (tuyến 1 + quy hoạch) · Bản đồ giá (mô hình + SHAP) · Hỏi đáp (trợ lý Claude gọi công cụ tra cứu) |
| `docs/chat.js` | Trợ lý: Claude (claude-opus-5-5) + 5 công cụ chạy trong trình duyệt (lọc tin rao, tìm dự án, định giá, Metro, tra địa chỉ); có chế độ không LLM |
| `worker/claude-proxy.js` | Máy chủ trung gian Cloudflare Worker giữ khoá API cho bản công khai |

## Lưu ý dữ liệu
Giá tin rao là giá chào bán. Dữ liệu thô không đưa lên repo; web chỉ hiển thị tin rao đã làm tròn toạ độ (~100 m) để tham khảo nghiên cứu.

## Trợ lý hỏi đáp
Web tĩnh nên khoá API không được nằm trong mã nguồn. Hai cách kết nối (Hỏi đáp → Cài đặt):
1. **Máy chủ trung gian** – triển khai `worker/claude-proxy.js` (hướng dẫn trong file), khoá lưu ở Cloudflare; mọi người xem web đều dùng được.
2. **Khoá API cá nhân** – lưu trong trình duyệt của máy đó, gọi thẳng api.anthropic.com. Chỉ dùng trên máy riêng.

Không kết nối thì trợ lý chạy chế độ không LLM (hiểu mẫu câu đơn giản).
