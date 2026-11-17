# Bàn giao: BĐS AI (đồ án tốt nghiệp ngành AI)
Repo này là web đồ án tách từ `phamlehuynhngan/bdsvietnam` (web map dự án). Web: GitHub Pages thư mục `docs/`.
Người dùng: "chị" (xưng "em"), trả lời tiếng Việt, ngắn gọn. Commit với `-c user.name="phamlehuynhngan" -c user.email="phamlehuynhngan@users.noreply.github.com"`.
- Sửa web: đổi `const V="?v=YYYYMMDDHHMM"` trong `docs/index.html` sau mỗi lần cập nhật dữ liệu.
- Dữ liệu: Chợ Tốt Nhà (gateway.chotot.com), OSM qua tiles.openfreemap.org (Overpass bị chặn). batdongsan.com.vn có Cloudflare — không vượt chặn.
- Không đưa ảnh/logo CĐT lên repo này (repo công khai cho đồ án). Dự án lấy từ bdsvietnam chỉ gồm tên, CĐT, toạ độ.
- Đề cương đồ án ở Claude Docs. Việc tiếp: thêm đặc trưng cấp dự án (CĐT, năm bàn giao), GNN/GWR, máy chủ FastAPI + PostGIS, trợ lý LLM; dữ liệu theo thời gian để đo tác động Metro (thu thập định kỳ).
