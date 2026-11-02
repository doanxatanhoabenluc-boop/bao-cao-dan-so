-- Danh mục xã/phường và cấu hình địa phương đang sử dụng.
-- server.js cũng tự chạy các lệnh IF NOT EXISTS khi khởi động.
CREATE TABLE IF NOT EXISTS danh_sach_xa (
    id BIGSERIAL PRIMARY KEY,
    ten_xa TEXT NOT NULL,
    ten_tinh TEXT NOT NULL,
    ma_xa_phuong TEXT,
    ten_tram_y_te TEXT,
    trang_thai INTEGER NOT NULL DEFAULT 1,
    la_mac_dinh BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_danh_sach_xa_mac_dinh
    ON danh_sach_xa (la_mac_dinh)
    WHERE la_mac_dinh = TRUE AND trang_thai = 1;
