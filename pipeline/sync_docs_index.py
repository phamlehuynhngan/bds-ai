"""Sao chép index.html (gốc) sang docs/index.html, bỏ dòng <base href="docs/">."""
h = open("index.html").read()
d = h.replace('<base href="docs/">\n', "", 1).replace("<head>\n", "<head>\n<!-- BẢN SAO của index.html gốc (bỏ dòng <base>), để link cũ /docs/ và bản lưu đệm cũ vẫn mở được. Sửa index.html gốc thì chạy: python3 pipeline/sync_docs_index.py -->\n", 1)
open("docs/index.html", "w").write(d)
