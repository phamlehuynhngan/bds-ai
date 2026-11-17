# Bàn giao: BĐS AI (đồ án tốt nghiệp ngành AI)
Repo này là web đồ án tách từ `phamlehuynhngan/bdsvietnam` (web map dự án). Web: GitHub Pages thư mục `docs/`.
Người dùng: "chị" (xưng "em"), trả lời tiếng Việt, ngắn gọn. Commit với `-c user.name="phamlehuynhngan" -c user.email="phamlehuynhngan@users.noreply.github.com"`.
- Web: `docs/index.html` (khung) + `app.css` + `app.js` (bản đồ, 4 tab, mô hình chạy trong trình duyệt, `window.APP`) + `chat.js` (trợ lý). Sau mỗi lần sửa đổi `?v=YYYYMMDDHHMM` trong index.html và `const V` trong app.js.
- Tab: Dự án · Metro · Bản đồ giá · Hỏi đáp. Tab "Mô hình" đã ẩn theo yêu cầu chị (có thể khôi phục từ lịch sử git).
- Bản đồ 3D: pitch 55, nhà 3D lớp `b3d` (OSM), xoay chậm khi mở web và quanh dự án đang chọn (`startOrbit/stopOrbit`, dừng khi chạm bản đồ). Bản đồ giá = cột 3D (cao = giá/m² × 4 m).
- Tab Dự án "Dự án TP.HCM": danh sách ẩn, bấm chủ đầu tư mới sổ ra dự án (`#devAcc`); ô tìm kiếm hiện kết quả phẳng.
- Tab Metro: `docs/metro3d.js` chuyển từ bdsvietnam `metro-anim.js` (cầu cạn, đoạn ngầm, tàu 3D, camera bám tàu, thanh điều khiển `#metroBar`); bấm tuyến để chạy, bấm lại/đổi tab để dừng.
- Tab Hỏi đáp: không có tiêu đề/nút Cài đặt (chị yêu cầu xoá). Cài đặt kết nối ẩn: mở `…/docs/#caidat` hoặc gõ `/caidat` trong ô chat.
- Trợ lý: model `claude-opus-5-5`, effort low, fallbacks default; SDK đóng gói sẵn `docs/vendor/anthropic-sdk-1.4.0.mjs`. Kết nối: proxy `worker/claude-proxy.js` hoặc khoá cá nhân (localStorage) hoặc chế độ không LLM.
- Dữ liệu web: `docs/data/infra.json`, `projects.json` xuất từ repo bdsvietnam (infra.js, projects.js, developers.js) — cập nhật bên đó thì xuất lại.
- Dữ liệu: Chợ Tốt Nhà (gateway.chotot.com), OSM qua tiles.openfreemap.org (Overpass bị chặn). batdongsan.com.vn có Cloudflare — không vượt chặn.
- Không đưa ảnh/logo CĐT lên repo này (repo công khai cho đồ án). Dự án lấy từ bdsvietnam chỉ gồm chữ (tên, CĐT, toạ độ, địa chỉ, mô tả, thông tin), không ảnh.
- Đề cương đồ án ở Claude Docs. Việc tiếp: thêm đặc trưng cấp dự án (CĐT, năm bàn giao), GNN/GWR, máy chủ FastAPI + PostGIS; dữ liệu theo thời gian để đo tác động Metro (thu thập định kỳ).
