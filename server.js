require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const multer = require('multer');
const XLSX = require('xlsx');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGzip, createGunzip } = require('node:zlib');
const readline = require('node:readline');

const app = express();

// Tự động tạo thư mục 'uploads' nếu chưa có để tránh lỗi lưu file tạm của multer
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });
// File sao lưu được ghi tạm trên ổ đĩa, không giữ toàn bộ file trong RAM.
const backupUpload = multer({
    dest: uploadDir,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const name = String(file.originalname || '').toLowerCase();
        if (!name.endsWith('.gz')) return cb(new Error('Chỉ chấp nhận file sao lưu .gz do hệ thống tải xuống.'));
        cb(null, true);
    }
});

// Tiến độ nhập dân cư theo phiên đăng nhập; chỉ giữ số liệu tiến độ, không giữ dữ liệu Excel trong RAM.
const danCuImportProgress = new Map();

// ============================================================
// CSDL SQLITE TRA CỨU BHYT
// Chỉ đọc, không ảnh hưởng PostgreSQL đang lưu dữ liệu 11 bảng
// ============================================================
const bhytDbPath = path.join(__dirname, 'data', 'bhyt.sqlite');
let bhytDb = null;
try {
    if (fs.existsSync(bhytDbPath)) {
        bhytDb = new DatabaseSync(bhytDbPath, { readOnly: true });
        console.log('✅ Đã mở CSDL BHYT SQLite:', bhytDbPath);
    } else {
        console.warn('⚠️ Không tìm thấy CSDL BHYT:', bhytDbPath);
    }
} catch (err) {
    console.error('❌ Không mở được CSDL BHYT:', err.message);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    options: '-c timezone=Asia/Ho_Chi_Minh'
});

// Bắt lỗi connection PostgreSQL
pool.on('error', (err) => {
    console.error('❌ PostgreSQL Pool Error:', err.message);
});

// PostgreSQL Keep-Alive
setInterval(async () => {
    try {
        await pool.query('SELECT 1');
        console.log('✅ PostgreSQL: connection OK');

    } catch (err) {
        console.error('❌ PostgreSQL Keep-Alive Error:', err.message);
    }
}, 4 * 60 * 1000);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'dan-so-luong-hoa-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function getVietnamTimestamp() {
    return new Date().toLocaleString("vi-VN");
}

// Hàm ghi nhật ký tự động chuẩn xác kèm thông tin chi tiết
async function logAction(user, action, target_id = null, target_name = null) {
    try {
        const userInfo = user ? `${user.fullname} (${user.username})` : 'Hệ thống';
        await pool.query(
            `INSERT INTO logs (user_id, username, action, target_id, target_name, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
            [user ? user.id : null, userInfo, action, target_id, target_name, getVietnamTimestamp()]
        );
    } catch (err) {
        console.error('Lỗi ghi log:', err);
    }
}

// Tự động khởi tạo CSDL và cập nhật đầy đủ các bảng, cột như ban đầu của bạn
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY, 
                fullname TEXT,            
                username TEXT UNIQUE,      
                password TEXT,            
                role TEXT,                
                active INTEGER DEFAULT 1, 
                created_at TEXT
            );

            ALTER TABLE users ADD COLUMN IF NOT EXISTS fullname TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS diabanh TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS ap TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS xa TEXT;

            -- Danh mục xã dùng chung cho toàn hệ thống. Mỗi lần triển khai chỉ chọn
            -- một xã mặc định; có thể lưu nhiều xã để đổi cấu hình mà không sửa mã nguồn.
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
                ON danh_sach_xa (la_mac_dinh) WHERE la_mac_dinh = TRUE AND trang_thai = 1;

            CREATE TABLE IF NOT EXISTS danh_sach_ap (
                id SERIAL PRIMARY KEY, ten_ap TEXT NOT NULL, trang_thai INTEGER DEFAULT 1
            );

            -- Tạo bảng danh sách bệnh viện
            CREATE TABLE IF NOT EXISTS danh_sach_benh_vien (
                id SERIAL PRIMARY KEY, 
                ten_benh_vien TEXT NOT NULL, 
                dia_chi TEXT, 
                trang_thai INTEGER DEFAULT 1
            );

            -- Tạo bảng danh sách Biện pháp tránh thai (BPTT) với cột mã ký hiệu riêng
            CREATE TABLE IF NOT EXISTS danh_sach_bptt (
                id SERIAL PRIMARY KEY, 
                ma_bptt TEXT NOT NULL, 
                ten_bptt TEXT NOT NULL, 
                trang_thai INTEGER DEFAULT 1
            );

            -- Tạo bảng danh sách Nơi thực hiện
            CREATE TABLE IF NOT EXISTS danh_sach_noi_thuc_hien (
                id SERIAL PRIMARY KEY, 
                ten_noi_thuc_hien TEXT NOT NULL, 
                trang_thai INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS danh_sach_quan_he (
                id SERIAL PRIMARY KEY, 
                ten_quan_he TEXT NOT NULL, 
                trang_thai INTEGER DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY, user_id INTEGER, username TEXT, action TEXT, target_id INTEGER, target_name TEXT, created_at TEXT
            );

            -- Từ điển chuẩn hóa họ tên tiếng Việt
            CREATE TABLE IF NOT EXISTS vietnamese_name_map (
                id SERIAL PRIMARY KEY,
                tu_khoa TEXT NOT NULL,
                ten_hien_thi TEXT NOT NULL,
                loai TEXT NOT NULL DEFAULT 'word',
                trang_thai INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (tu_khoa, loai)
            );

            -- Hồ sơ phụ nữ 15-49 được quản lý trực tiếp trong dan_cu.
            -- Không tạo mới bảng nghiệp vụ phụ nữ 15-49 cũ.

            CREATE TABLE IF NOT EXISTS lich_su_bptt (
                id SERIAL PRIMARY KEY,
                ma_dinh_danh VARCHAR(30), -- cột legacy nullable, không còn dùng để tra cứu/ghi mới
                dan_cu_id BIGINT,
                ma_bptt VARCHAR(10) NOT NULL,        -- Mã BPTT (1, 2, 4, 5, 6...)
                ngay_ap_dung DATE NOT NULL,          -- Ngày bắt đầu áp dụng (VD: '2026-04-01')
                noi_thuc_hien VARCHAR(150),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bien_dong_phu_nu (
            id SERIAL PRIMARY KEY,
            diabanh VARCHAR(100),
            loai_bien_dong VARCHAR(50),
            ho_so VARCHAR(50),  
            ho_ten VARCHAR(100),
            nguoi_thuc_hien VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
            -- Danh sách dân cư gốc: lưu mỗi người một lần, không sao chép toàn bộ hồ sơ vào lịch sử.
            CREATE TABLE IF NOT EXISTS dan_cu (
                id BIGSERIAL PRIMARY KEY,
                ho_ten TEXT NOT NULL,
                ma_ho TEXT,
                household_id TEXT,
                quan_he TEXT,
                gioi_tinh TEXT,
                ngay_sinh TEXT,
                dan_toc TEXT,
                hoc_van TEXT,
                hon_nhan TEXT,
                tinh_trang_cu_tru TEXT,
                ma_bhyt TEXT,
                dia_chi TEXT,
                diabanh TEXT,
                ap TEXT,
                ma_xa_phuong TEXT,
                trang_thai_cu_tru TEXT NOT NULL DEFAULT 'DANG_CU_TRU',
                su_kien_cuoi TEXT,
                ngay_su_kien DATE,
                nguon_du_lieu TEXT DEFAULT 'Excel',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                -- Thông tin quản lý sinh sản lấy từ Bảng 4/Bảng 7, không suy ra chỉ từ lịch sử sinh con.
                so_con INTEGER,
                nam_sinh_con VARCHAR(50),
                cccd TEXT,
                ngay_cap_cccd TEXT
            );
            ALTER TABLE dan_cu ADD COLUMN IF NOT EXISTS so_con INTEGER;
            ALTER TABLE dan_cu ADD COLUMN IF NOT EXISTS nam_sinh_con VARCHAR(50);
            ALTER TABLE dan_cu ADD COLUMN IF NOT EXISTS ma_xa_phuong TEXT;
            ALTER TABLE dan_cu ADD COLUMN IF NOT EXISTS ap TEXT;
            ALTER TABLE dan_cu ADD COLUMN IF NOT EXISTS cccd TEXT;
            ALTER TABLE dan_cu ADD COLUMN IF NOT EXISTS ngay_cap_cccd TEXT;
            ALTER TABLE dan_cu ADD COLUMN IF NOT EXISTS theo_doi_15_49 BOOLEAN NOT NULL DEFAULT TRUE;

            -- Khóa sự kiện sinh để mỗi trẻ trong Bảng 1 chỉ làm tăng số con một lần,
            -- kể cả khi đồng bộ lại cùng hồ sơ.
            CREATE TABLE IF NOT EXISTS dan_cu_sinh_con_events (
                id BIGSERIAL PRIMARY KEY,
                event_key TEXT NOT NULL UNIQUE,
                dan_cu_id BIGINT REFERENCES dan_cu(id) ON DELETE SET NULL,
                ma_ho TEXT,
                ho_ten_me TEXT,
                ho_ten_con TEXT,
                ngay_sinh_con TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_dan_cu_ma_ho_ten ON dan_cu (ma_ho, lower(ho_ten));
            CREATE INDEX IF NOT EXISTS idx_dan_cu_trang_thai ON dan_cu (trang_thai_cu_tru);
            CREATE INDEX IF NOT EXISTS idx_dan_cu_bhyt ON dan_cu (ma_bhyt) WHERE ma_bhyt IS NOT NULL AND ma_bhyt <> '';

            -- Chỉ lưu thông tin tối thiểu của từng biến động, tránh nhân bản hồ sơ dân cư.
            CREATE TABLE IF NOT EXISTS lich_su_bien_dong_dan_cu (
                id BIGSERIAL PRIMARY KEY,
                dan_cu_id BIGINT REFERENCES dan_cu(id) ON DELETE SET NULL,
                ma_ho TEXT,
                ho_ten TEXT NOT NULL,
                su_kien TEXT NOT NULL,
                ngay_su_kien DATE DEFAULT CURRENT_DATE,
                nguon_bieu_mau TEXT,
                nguoi_thuc_hien TEXT,
                ghi_chu TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_lsbd_dan_cu ON lich_su_bien_dong_dan_cu (dan_cu_id, ngay_su_kien DESC);
            CREATE INDEX IF NOT EXISTS idx_lsbd_ma_ho_ten ON lich_su_bien_dong_dan_cu (ma_ho, lower(ho_ten));
        `);

        // Đảm bảo tất cả các bảng từ table_1 đến table_11 đều có cột cơ bản
        for (let i = 1; i <= 11; i++) {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS table_${i} (id SERIAL PRIMARY KEY);
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS ap TEXT;
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS diabanh TEXT;
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS nguoi_nhap TEXT;
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS created_at TEXT;
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS ghi_chu TEXT;
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS ghi_chu_ma_ho TEXT;
            `);
        }
        
        await pool.query(`
            -- Dọn dẹp các cột thừa bị sót từ phiên bản trước
            ALTER TABLE table_4 DROP COLUMN IF EXISTS hoc_van;
            ALTER TABLE table_4 DROP COLUMN IF EXISTS hon_nhan;

            ALTER TABLE table_7 DROP COLUMN IF EXISTS ho_ten;
            ALTER TABLE table_7 DROP COLUMN IF EXISTS nam_sinh;
            ALTER TABLE table_7 DROP COLUMN IF EXISTS bptt;

            ALTER TABLE table_8 DROP COLUMN IF EXISTS ho_ten;
            ALTER TABLE table_8 DROP COLUMN IF EXISTS nam_sinh;
            ALTER TABLE table_8 DROP COLUMN IF EXISTS bptt_moi;
            ALTER TABLE table_8 DROP COLUMN IF EXISTS bptt_thoi_su_dung;

            -- Dọn dẹp triệt để các biến thể cột mã đối tượng bị thừa ở bảng 11
            ALTER TABLE table_11 DROP COLUMN IF EXISTS ma_doi_tuong;
            ALTER TABLE table_11 DROP COLUMN IF EXISTS ma_so_doi_tuong;
            ALTER TABLE table_11 ALTER COLUMN nam_sinh TYPE TEXT USING nam_sinh::TEXT;

            -- Thêm lại các cột đúng chuẩn cho từng bảng
            -- Bảng 1: Sàng lọc sinh
            ALTER TABLE table_1 ADD COLUMN IF NOT EXISTS ho_so TEXT, ADD COLUMN IF NOT EXISTS ho_ten_con TEXT, ADD COLUMN IF NOT EXISTS ngay_sinh_con TEXT, ADD COLUMN IF NOT EXISTS gioi_tinh TEXT, ADD COLUMN IF NOT EXISTS dan_toc TEXT, ADD COLUMN IF NOT EXISTS ho_ten_me TEXT, ADD COLUMN IF NOT EXISTS so_the_bhyt_me TEXT, ADD COLUMN IF NOT EXISTS ngay_sinh_me TEXT, ADD COLUMN IF NOT EXISTS noi_de TEXT, ADD COLUMN IF NOT EXISTS con_thu_may TEXT;

            -- Bảng 2: Danh sách sàng lọc sơ sinh
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS so_ho TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS ho_ten_tre TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS ngay_sinh_tre TEXT; 
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS ho_ten_me TEXT;     
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS ma_the_bhyt_me TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS noi_cu_tru TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS nam_sinh_me TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS gioi_tinh TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS benh_suy_giap TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS thieu_men_g6pd TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS tang_san_thuong_than TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS khiem_thinh TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS benh_tim TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS noi_thuc_hien TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS ghi_chu TEXT;

            -- Bảng 4: Nhân khẩu
            ALTER TABLE table_4 ADD COLUMN IF NOT EXISTS ho_so TEXT, ADD COLUMN IF NOT EXISTS ho_ten TEXT, ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT, ADD COLUMN IF NOT EXISTS quan_he TEXT, ADD COLUMN IF NOT EXISTS gioi_tinh TEXT, ADD COLUMN IF NOT EXISTS ngay_sinh TEXT, ADD COLUMN IF NOT EXISTS dan_toc TEXT, ADD COLUMN IF NOT EXISTS trinh_do_hoc_van TEXT, ADD COLUMN IF NOT EXISTS tinh_trang_hon_nhan TEXT, ADD COLUMN IF NOT EXISTS ngay_den TEXT, ADD COLUMN IF NOT EXISTS noi_di TEXT;
            
            ALTER TABLE table_5 ADD COLUMN IF NOT EXISTS dan_toc TEXT;
            
            -- Bảng 7: Cập nhật đúng và đủ các cột thực tế
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS ho_so TEXT;
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS ho_ten_vo TEXT;
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS ngay_sinh TEXT;
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS ngay_su_dung TEXT;
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS bptt_moi TEXT;
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS so_con_hien_co TEXT;
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS noi_thuc_hien TEXT;

            -- Bảng 8: Khai báo đầy đủ các cột khớp với giao diện form
            ALTER TABLE table_8 DROP COLUMN IF EXISTS bptt; 
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS ho_so TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS ho_ten_vo TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS ngay_sinh TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS ngay_thoi_su_dung TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS bptt_thoi TEXT; 
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS noi_thuc_hien TEXT;

            -- Bảng 10: Sàng lọc trước sinh
            ALTER TABLE table_10 DROP COLUMN IF EXISTS ket_qua;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS so_ho TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS ma_the_bhyt TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS ho_ten TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS noi_cu_tru TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS ngay_sinh TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS ngay_thang_mang_thai TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS mang_thai_tuan_12 TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS mang_thai_tuan_21 TEXT;
            
            -- Kết quả tuần 12
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS hoi_chung_down_12 TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS hoi_chung_edward_12 TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS hoi_chung_patau_12 TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS benh_thalassemia_12 TEXT;
            
            -- Kết quả tuần 21
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS hoi_chung_down_21 TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS hoi_chung_edward_21 TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS hoi_chung_patau_21 TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS benh_thalassemia_21 TEXT;
            
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS ghi_chu TEXT;

            -- Bảng 11: Khám sức khỏe / Đối tượng khác
            ALTER TABLE table_11 ADD COLUMN IF NOT EXISTS ho_so TEXT;
            ALTER TABLE table_11 ADD COLUMN IF NOT EXISTS ma_so_doi_tuong TEXT;
            ALTER TABLE table_11 ADD COLUMN IF NOT EXISTS ho_ten TEXT;
            ALTER TABLE table_11 ADD COLUMN IF NOT EXISTS nam_sinh TEXT;
            ALTER TABLE table_11 ADD COLUMN IF NOT EXISTS ngay_kham TEXT;
            ALTER TABLE table_11 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_11 ADD COLUMN IF NOT EXISTS cong_so_nguoi_co TEXT;

            -- Bảo đảm các trường BHYT đang có trong 11 biểu mẫu
            ALTER TABLE table_1 ADD COLUMN IF NOT EXISTS so_the_bhyt_me TEXT;
            ALTER TABLE table_2 ADD COLUMN IF NOT EXISTS ma_the_bhyt_me TEXT;
            ALTER TABLE table_3 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_3 ADD COLUMN IF NOT EXISTS dan_toc TEXT;
            ALTER TABLE table_4 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_5 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS ho_so TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS ho_ten TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS ngay_sinh TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS gioi_tinh TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS thong_tin_cu TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS thong_tin_moi TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS ap TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS diabanh TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS nguoi_nhap TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS ghi_chu TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS dan_cu_id BIGINT;
            -- noi_dung_thay_doi không còn được sử dụng; nội dung thay đổi ghi trực tiếp vào ghi_chu.
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            
            -- Bảng 9: bổ sung các cột còn thiếu để tránh lỗi khi lưu
            ALTER TABLE table_9 ADD COLUMN IF NOT EXISTS ho_so TEXT;
            ALTER TABLE table_9 ADD COLUMN IF NOT EXISTS ho_ten TEXT;
            ALTER TABLE table_9 ADD COLUMN IF NOT EXISTS ngay_sinh TEXT;
            ALTER TABLE table_9 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_9 ADD COLUMN IF NOT EXISTS ngay_su_kien TEXT;
            ALTER TABLE table_9 ADD COLUMN IF NOT EXISTS su_kien TEXT;
            ALTER TABLE table_9 ADD COLUMN IF NOT EXISTS mang_thai_lan_thu TEXT;
            
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS ma_the_bhyt TEXT;

            -- Lịch sử BPTT chỉ liên kết trực tiếp với dan_cu.
            ALTER TABLE lich_su_bptt ADD COLUMN IF NOT EXISTS dan_cu_id BIGINT;
            ALTER TABLE lich_su_bptt ALTER COLUMN ma_dinh_danh DROP NOT NULL;
            ALTER TABLE lich_su_bptt DROP CONSTRAINT IF EXISTS lich_su_bptt_ma_dinh_danh_fkey;
            DROP TRIGGER IF EXISTS trg_lich_su_bptt_set_dan_cu ON lich_su_bptt;
            DROP FUNCTION IF EXISTS set_lich_su_bptt_dan_cu_id();
            DO $$ BEGIN
                ALTER TABLE lich_su_bptt ADD CONSTRAINT fk_lich_su_bptt_dan_cu
                    FOREIGN KEY (dan_cu_id) REFERENCES dan_cu(id) ON DELETE SET NULL;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
            CREATE INDEX IF NOT EXISTS idx_lich_su_bptt_dan_cu_ngay
                ON lich_su_bptt (dan_cu_id, ngay_ap_dung DESC);

        `);

        // Khóa liên kết ổn định giữa từng bản ghi báo cáo và nhân khẩu trong dan_cu.
        // Các cột để NULL nhằm bảo toàn dữ liệu biểu mẫu cũ; tuyệt đối không tự dò tên để gán ID.
        const reportResidentLinkColumns = {
            table_1: ['dan_cu_me_id', 'dan_cu_con_id'],
            table_2: ['dan_cu_tre_id', 'dan_cu_me_id'],
            table_3: ['dan_cu_id'], table_4: ['dan_cu_id'], table_5: ['dan_cu_id'],
            table_6: ['dan_cu_id'], table_7: ['dan_cu_id'], table_8: ['dan_cu_id'],
            table_9: ['dan_cu_id'], table_10: ['dan_cu_id'], table_11: ['dan_cu_id']
        };
        // Chạy cả migration liên kết trong một round-trip tới Supabase để giảm thời gian khởi động Render.
        await pool.query(`DO $$
        DECLARE
            item RECORD;
            constraint_name TEXT;
            index_name TEXT;
        BEGIN
            FOR item IN
                SELECT * FROM (VALUES
                    ('table_1','dan_cu_me_id'), ('table_1','dan_cu_con_id'),
                    ('table_2','dan_cu_tre_id'), ('table_2','dan_cu_me_id'),
                    ('table_3','dan_cu_id'), ('table_4','dan_cu_id'),
                    ('table_5','dan_cu_id'), ('table_6','dan_cu_id'),
                    ('table_7','dan_cu_id'), ('table_8','dan_cu_id'),
                    ('table_9','dan_cu_id'), ('table_10','dan_cu_id'),
                    ('table_11','dan_cu_id')
                ) AS links(table_name, column_name)
            LOOP
                EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I BIGINT', item.table_name, item.column_name);
                EXECUTE format(
                    'UPDATE %I AS r SET %I = NULL WHERE r.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dan_cu d WHERE d.id = r.%I)',
                    item.table_name, item.column_name, item.column_name, item.column_name
                );
                constraint_name := 'fk_' || item.table_name || '_' || item.column_name;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = constraint_name AND conrelid = to_regclass(item.table_name)
                ) THEN
                    EXECUTE format(
                        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES dan_cu(id) ON DELETE SET NULL',
                        item.table_name, constraint_name, item.column_name
                    );
                END IF;
                index_name := 'idx_' || item.table_name || '_' || item.column_name;
                EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (%I) WHERE %I IS NOT NULL',
                    index_name, item.table_name, item.column_name, item.column_name);
            END LOOP;
        END $$`);

        // Bảng 6 có một người chính (table_6.dan_cu_id) và có thể có nhiều
        // thành viên đi cùng khi tách hộ; chỉ lưu các thành viên phụ tại bảng này.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS table_6_thanh_vien (
                id BIGSERIAL PRIMARY KEY,
                table_6_id INTEGER NOT NULL REFERENCES table_6(id) ON DELETE CASCADE,
                dan_cu_id BIGINT REFERENCES dan_cu(id) ON DELETE SET NULL,
                vai_tro TEXT NOT NULL DEFAULT 'THANH_VIEN_TACH_CUNG',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (table_6_id, dan_cu_id)
            );
            CREATE INDEX IF NOT EXISTS idx_table_6_thanh_vien_dan_cu ON table_6_thanh_vien (dan_cu_id) WHERE dan_cu_id IS NOT NULL;
        `);

        // Thêm dữ liệu mẫu Biện pháp tránh thai (BPTT) kèm mã ký hiệu chuẩn
        const bpttCheck = await pool.query("SELECT id FROM danh_sach_bptt LIMIT 1");
        if (bpttCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO danh_sach_bptt (ma_bptt, ten_bptt) VALUES 
                ('1', 'Vòng tránh thai'), 
                ('2', 'Triệt sản nam'), 
                ('3', 'Triệt sản nữ'), 
                ('4', 'Bao cao su'), 
                ('5', 'Thuốc uống tránh thai'), 
                ('6', 'Thuốc tiêm tránh thai'), 
                ('7', 'Thuốc cấy tránh thai');
            `);
        }

        // Danh mục Ấp, cơ sở y tế và nơi thực hiện được quản trị trong admin.html.
        // Không tự chèn danh sách địa phương mẫu để tránh mang dữ liệu của xã cũ sang xã mới.

        // Thêm dữ liệu mẫu Quan hệ với chủ hộ nếu chưa có
        const qhCheck = await pool.query("SELECT id FROM danh_sach_quan_he LIMIT 1");
        if (qhCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO danh_sach_quan_he (ten_quan_he) VALUES 
                ('Chủ hộ'), 
                ('Vợ/Chồng'), 
                ('Con'), 
                ('Bố/Mẹ'), 
                ('Con dâu/rể'),
                ('Cháu'),
                ('Khác');
            `);
        }

        // Tạo tài khoản Admin mặc định nếu chưa có
        const adminCheck = await pool.query("SELECT id FROM users WHERE username = $1", ["admin"]);
        if (adminCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO users (fullname, username, password, role, diabanh, ap, xa, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, ["Quản trị hệ thống", "admin", "admin123", "admin", "Toàn xã", "Tất cả", null, getVietnamTimestamp()]);
        }

        // Khởi tạo danh mục xã từ dữ liệu đang có một lần (nếu chưa có cấu hình).
        // Ưu tiên users.xa cũ, sau đó mới dò tên xã/tỉnh trong dia_cu.dia_chi.
        const communeCount = await pool.query("SELECT id FROM danh_sach_xa LIMIT 1");
        if (communeCount.rows.length === 0) {
            const legacyXa = await pool.query(`
                SELECT NULLIF(BTRIM(xa), '') AS ten_xa
                FROM users
                WHERE NULLIF(BTRIM(xa), '') IS NOT NULL
                  AND LOWER(BTRIM(xa)) NOT IN ('toàn xã', 'toan xa', 'tất cả', 'tat ca', '00')
                ORDER BY CASE WHEN LOWER(COALESCE(role,'')) = 'admin' THEN 0 ELSE 1 END, id
                LIMIT 1
            `);
            const legacyAddress = await pool.query(`
                SELECT dia_chi FROM dan_cu
                WHERE NULLIF(BTRIM(dia_chi), '') IS NOT NULL
                ORDER BY id LIMIT 300
            `);
            const stripPrefix = (value, prefix) => String(value || '').replace(new RegExp('^' + prefix + '\\s*', 'i'), '').trim();
            let tenXa = stripPrefix(legacyXa.rows[0]?.ten_xa || '', 'xã');
            let tenTinh = '';
            for (const row of legacyAddress.rows) {
                const parts = String(row.dia_chi || '').split(',').map(x => x.trim()).filter(Boolean);
                if (!tenXa) {
                    const xaPart = parts.find(x => /^xã\s+/i.test(x));
                    if (xaPart) tenXa = stripPrefix(xaPart, 'xã');
                }
                const tinhPart = parts.find(x => /^(tỉnh|thành phố)\s+/i.test(x));
                if (!tenTinh && tinhPart) tenTinh = tinhPart;
                if (tenXa && tenTinh) break;
            }
            if (tenXa) {
                const tenTram = `Trạm Y tế xã ${tenXa}`;
                const inserted = await pool.query(`
                    INSERT INTO danh_sach_xa (ten_xa, ten_tinh, ten_tram_y_te, la_mac_dinh, trang_thai)
                    VALUES ($1, $2, $3, TRUE, 1) RETURNING id
                `, [tenXa, tenTinh, tenTram]);
                await syncCommuneClinicToCatalog({ ten_xa: tenXa, ten_tinh: tenTinh, ten_tram_y_te: tenTram });
                await pool.query(`UPDATE users SET xa = $1 WHERE NULLIF(BTRIM(xa), '') IS NULL`, [tenXa]);
                console.log(`Đã chuyển cấu hình địa phương cũ sang danh_sach_xa (ID ${inserted.rows[0].id}).`);
            }
        }

        const activeCommuneAtStartup = await getActiveCommune();
        if (activeCommuneAtStartup) await syncCommuneClinicToCatalog(activeCommuneAtStartup);

        console.log("==> HỆ THỐNG CSDL ĐÃ SẴN SÀNG!");

        // Nạp các từ mặc định vào DB một lần
        const defaultNameMap = {"nguyen": "Nguyễn", "tran": "Trần", "le": "Lê", "pham": "Phạm", "hoang": "Hoàng", "huynh": "Huỳnh", "phan": "Phan", "vu": "Vũ", "vo": "Võ", "danh": "Danh", "bui": "Bùi", "dang": "Đặng", "ho": "Hồ", "ngo": "Ngô", "duong": "Dương", "ly": "Lý", "thi": "Thị", "huu": "Hữu", "duc": "Đức", "cong": "Công", "ngoc": "Ngọc", "xuan": "Xuân", "phuong": "Phương", "thuan": "Thuận", "khanh": "Khánh"};
        
        await pool.query(`
            UPDATE vietnamese_name_map
            SET trang_thai = 0
            WHERE loai = 'word' AND tu_khoa = 'dung' AND ten_hien_thi = 'Dũng'
        `);
        for (const [tuKhoa, tenHienThi] of Object.entries(defaultNameMap)) {
            await pool.query(`
                INSERT INTO vietnamese_name_map (tu_khoa, ten_hien_thi, loai, trang_thai)
                VALUES ($1, $2, 'word', 1)
                ON CONFLICT (tu_khoa, loai) DO NOTHING
            `, [tuKhoa, tenHienThi]);
        }

    } catch (err) {
        console.error("Lỗi khởi tạo CSDL:", err);
    }
}
//initDatabase();

// Lấy cấu hình xã đang được chọn trong CSDL. Không dùng tên xã/tỉnh mặc định trong mã nguồn.
async function getActiveCommune(db = pool) {
    const result = await db.query(`
        SELECT id, ten_xa, ten_tinh, ma_xa_phuong, ten_tram_y_te
        FROM danh_sach_xa
        WHERE trang_thai = 1 AND la_mac_dinh = TRUE
        ORDER BY id DESC LIMIT 1
    `);
    return result.rows[0] || null;
}

async function syncCommuneClinicToCatalog(commune, db = pool) {
    const clinic = String(commune?.ten_tram_y_te || '').trim();
    if (!clinic) return;
    const xa = String(commune?.ten_xa || '').trim();
    const tinh = String(commune?.ten_tinh || '').trim();
    const diaChi = [xa ? (/^xã\s*/i.test(xa) ? xa : `Xã ${xa}`) : '', tinh].filter(Boolean).join(', ');
    await db.query(`
        INSERT INTO danh_sach_noi_thuc_hien (ten_noi_thuc_hien, trang_thai)
        SELECT $1, 1 WHERE NOT EXISTS (
            SELECT 1 FROM danh_sach_noi_thuc_hien WHERE LOWER(BTRIM(ten_noi_thuc_hien))=LOWER(BTRIM($1))
        )
    `, [clinic]);
    await db.query(`
        INSERT INTO danh_sach_benh_vien (ten_benh_vien, dia_chi, trang_thai)
        SELECT $1, NULLIF($2,''), 1 WHERE NOT EXISTS (
            SELECT 1 FROM danh_sach_benh_vien WHERE LOWER(BTRIM(ten_benh_vien))=LOWER(BTRIM($1))
        )
    `, [clinic, diaChi]);
}

app.get('/api/public/thong-tin-xa', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const commune = await getActiveCommune();
        res.json(commune || { ten_xa: '', ten_tinh: '', ma_xa_phuong: '', ten_tram_y_te: '' });
    } catch (err) {
        console.error('Lỗi tải cấu hình xã:', err);
        res.status(500).json({ success: false, message: 'Không thể tải thông tin xã.' });
    }
});

// ==================== API XÁC THỰC & NGƯỜI DÙNG (CÓ LOG ĐĂNG NHẬP/ĐĂNG XUẤT) ====================
app.get("/api/public/users-list", async (req, res) => {
    try {
        const result = await pool.query("SELECT username, fullname FROM users WHERE active = 1 ORDER BY fullname ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query("SELECT * FROM users WHERE username = $1 AND password = $2 AND active = 1", [username, password]);
        const user = result.rows[0];
        if (!user) return res.json({ success: false, message: "Sai tài khoản, mật khẩu hoặc tài khoản đã bị khóa!" });
        const activeCommune = await getActiveCommune();

        req.session.user = { 
            id: user.id, 
            username: user.username, 
            fullname: user.fullname, 
            role: user.role,
            diabanh: user.diabanh,
            ap: user.ap,
            xa: activeCommune?.ten_xa || user.xa || '',
            tinh: activeCommune?.ten_tinh || '',
            ten_tram_y_te: activeCommune?.ten_tram_y_te || ''
        };

        // Ghi log đăng nhập
        await logAction(req.session.user, `Đăng nhập vào hệ thống thành công`, user.id, user.fullname);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/me", async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const commune = await getActiveCommune();
        if (commune) {
            req.session.user.xa = commune.ten_xa || '';
            req.session.user.tinh = commune.ten_tinh || '';
            req.session.user.ten_tram_y_te = commune.ten_tram_y_te || '';
        }
        res.json({
            ...req.session.user,
            xa: commune?.ten_xa || req.session.user.xa || '',
            tinh: commune?.ten_tinh || req.session.user.tinh || '',
            ten_tram_y_te: commune?.ten_tram_y_te || req.session.user.ten_tram_y_te || ''
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Không thể tải thông tin tài khoản.' });
    }
});

app.post("/api/logout", async (req, res) => {
    if (req.session.user) {
        // Ghi log đăng xuất
        await logAction(req.session.user, `Đăng xuất khỏi hệ thống`, req.session.user.id, req.session.user.fullname);
    }
    req.session.destroy(() => res.json({ success: true }));
});

// ==================== API DANH MỤC & DỮ LIỆU BẢNG ====================

app.get("/api/danh-sach-ap", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM danh_sach_ap WHERE trang_thai = 1 ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/danh-sach-benh-vien", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM danh_sach_benh_vien WHERE trang_thai = 1 ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/danh-sach-bptt", async (req, res) => {
    try {
        const result = await pool.query("SELECT id, ma_bptt, ten_bptt FROM danh_sach_bptt WHERE trang_thai = 1 ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/danh-sach-noi-thuc-hien", async (req, res) => {
    try {
        const result = await pool.query("SELECT id, ten_noi_thuc_hien FROM danh_sach_noi_thuc_hien WHERE trang_thai = 1 ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/admin/danh-sach-benh-vien", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    try {
        const { ten_benh_vien, dia_chi } = req.body;
        if (!ten_benh_vien) return res.status(400).json({ success: false, message: "Tên bệnh viện không được để trống" });

        const insertRes = await pool.query("INSERT INTO danh_sach_benh_vien (ten_benh_vien, dia_chi) VALUES ($1, $2) RETURNING id", [ten_benh_vien, dia_chi]);
        await logAction(req.session.user, "Thêm danh mục Bệnh viện", insertRes.rows[0].id, ten_benh_vien);

        res.json({ success: true, message: "Thêm bệnh viện thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// API TRA CỨU SỐ THẺ BHYT
// Dùng chung cho tất cả bảng có trường BHYT
// ============================================================
app.get("/api/bhyt/search", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }

    if (!bhytDb) {
        return res.status(500).json({ success: false, message: "CSDL BHYT SQLite chưa được nạp." });
    }

    try {
        const name = String(req.query.name || "").trim();
        const year = String(req.query.year || "").trim();

        if (!name && !year) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập Họ tên hoặc năm sinh." });
        }

        let sql = `
            SELECT id, ho_ten, ngay_sinh, nam_sinh, gioi_tinh,
                   so_the_bhyt, so_cccd, dia_chi
            FROM bhyt
            WHERE 1 = 1
        `;
        const params = [];

        if (name) {
            sql += ` AND ho_ten_norm LIKE ?`;
            params.push(`%${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()}%`);
        }

        if (year) {
            sql += ` AND nam_sinh = ?`;
            params.push(year);
        }

        sql += ` ORDER BY ho_ten ASC, ngay_sinh ASC LIMIT 50`;

        const rows = bhytDb.prepare(sql).all(...params);
        return res.json({ success: true, count: rows.length, results: rows });
    } catch (err) {
        console.error("❌ Lỗi tra cứu BHYT:", err);
        return res.status(500).json({ success: false, message: "Lỗi tra cứu BHYT: " + err.message });
    }
});

// API Đọc dữ liệu các bảng nghiệp vụ (Lọc chuẩn theo Ấp và Địa bàn / Khu vực)
// Cột ngày dùng để lọc/báo cáo theo tháng - năm cho từng biểu mẫu.
// Ưu tiên ngày nghiệp vụ thay vì created_at để số liệu báo cáo đúng với thời điểm phát sinh.
const reportDateFields = {
    table_1: 'ngay_sinh_con',
    table_2: 'ngay_sinh_tre',
    table_3: 'ngay_chet',
    table_4: 'ngay_den',
    table_5: 'ngay_di',
    table_6: 'created_at',
    table_7: 'ngay_su_dung',
    table_8: 'ngay_thoi_su_dung',
    table_9: 'ngay_su_kien',
    table_10: 'mang_thai_tuan_12',
    table_11: 'ngay_kham'
};

function normalizeReportDateField(tableName) {
    return reportDateFields[tableName] || 'created_at';
}

// created_at được lưu theo định dạng vi-VN: DD/MM/YYYY, HH:MM:SS.
// Các trường ngày nghiệp vụ từ form được lưu theo YYYY-MM-DD.
function reportDateExpr(tableName) {
    if (tableName === 'table_10') {
        return `COALESCE(NULLIF(mang_thai_tuan_12::text, ''), NULLIF(mang_thai_tuan_21::text, ''), NULLIF(created_at::text, ''))`;
    }
    const field = normalizeReportDateField(tableName);
    return `COALESCE(NULLIF(${field}::text, ''), '')`;
}

function reportYearExpr(tableName) {
    if (tableName === 'table_6') {
        return `SUBSTRING(${reportDateExpr(tableName)}, 7, 4)`;
    }
    return `SUBSTRING(${reportDateExpr(tableName)}, 1, 4)`;
}

function reportMonthExpr(tableName) {
    if (tableName === 'table_6') {
        return `SUBSTRING(${reportDateExpr(tableName)}, 4, 2)`;
    }
    return `SUBSTRING(${reportDateExpr(tableName)}, 6, 2)`;
}


// Lọc "Dữ liệu trực tuyến" và thống kê Lãnh đạo theo THỜI ĐIỂM NHẬP DỮ LIỆU.
// created_at được hệ thống tự động ghi khi POST /api/data/:table.
// Hỗ trợ cả DD/M/YYYY, DD/MM/YYYY và YYYY-MM-DD.
function createdAtYearExpr(tableName) {
    return `COALESCE(
        CASE
            WHEN trim(created_at::text) ~ '[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}'
                THEN SUBSTRING(trim(created_at::text) FROM '([0-9]{4})')
            WHEN trim(created_at::text) ~ '[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}'
                THEN SUBSTRING(trim(created_at::text) FROM '([0-9]{4})')
            ELSE SUBSTRING(trim(created_at::text) FROM '([0-9]{4})')
        END,
        ''
    )`;
}

function createdAtMonthExpr(tableName) {
    return `COALESCE(
        CASE
            -- Dạng YYYY-MM-DD hoặc YYYY/MM/DD: Lấy nhóm số giữa 2 dấu phân cách
            WHEN trim(created_at::text) ~ '[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}'
                THEN LPAD(SUBSTRING(trim(created_at::text) FROM '[0-9]{4}[-/]([0-9]{1,2})[-/]'), 2, '0')
            -- Dạng DD/MM/YYYY hoặc D/M/YYYY: Lấy nhóm số ở giữa 2 dấu phân cách
            WHEN trim(created_at::text) ~ '[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}'
                THEN LPAD(SUBSTRING(trim(created_at::text) FROM '[-/]([0-9]{1,2})[-/][0-9]{4}'), 2, '0')
            ELSE ''
        END,
        ''
    )`;
}

app.get("/api/data/:table", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const tableName = req.params.table;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    try {
        const user = req.session.user;
        const month = req.query.month ? String(req.query.month) : '';
        const year = req.query.year ? String(req.query.year) : '';
        let query = `SELECT * FROM ${tableName}`;
        let params = [];

        const conditions = [];
        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            conditions.push(`((ap = $1 AND diabanh = $2) OR nguoi_nhap ILIKE $3)`);
            params.push(user.ap, user.diabanh, `%${user.username}%`);
        }

        if (month || year) {
            const field = normalizeReportDateField(tableName);
            if (year) {
                params.push(year);
                conditions.push(`${createdAtYearExpr(tableName)} = $${params.length}`);
            }
            if (month) {
                params.push(month.padStart(2, '0'));
                conditions.push(`${createdAtMonthExpr(tableName)} = $${params.length}`);
            }
        }

        if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
        query += ` ORDER BY id DESC LIMIT 1000`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Lỗi lấy dữ liệu:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Danh sách năm có dữ liệu cho bộ lọc của từng bảng.
app.get('/api/data/:table/years', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const tableName = req.params.table;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: 'Bảng không hợp lệ' });

    try {
        const user = req.session.user;
        let query = `
            SELECT DISTINCT ${createdAtYearExpr(tableName)} AS year
            FROM ${tableName}
            WHERE ${createdAtYearExpr(tableName)} ~ '^[0-9]{4}$'
        `;
        const params = [];
        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            query += ` AND ((ap = $1 AND diabanh = $2) OR nguoi_nhap ILIKE $3)`;
            params.push(user.ap, user.diabanh, `%${user.username}%`);
        }
        query += ' ORDER BY year DESC';
        const result = await pool.query(query, params);
        res.json({ success: true, years: result.rows.map(r => r.year).filter(Boolean) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== API THỐNG KÊ 11 BẢNG CHO LÃNH ĐẠO ====================
// Lưu ý: thống kê này đếm số BẢN GHI ĐÃ NHẬP vào hệ thống trong tháng/năm,
// dựa trên created_at, KHÔNG dựa vào ngày nghiệp vụ (ngày sinh, ngày khám...).
app.get('/api/dashboard/summary', async (req, res) => {
    if (!req.session.user || !['admin', 'lãnh đạo'].includes(String(req.session.user.role || '').toLowerCase())) {
        return res.status(403).json({ success: false, message: 'Không có quyền xem thống kê tổng hợp' });
    }

    try {
        const month = req.query.month ? String(req.query.month).padStart(2, '0') : '';
        const year = req.query.year ? String(req.query.year) : '';
        const counts = [];
        const yearSet = new Set();

        for (let i = 1; i <= 11; i++) {
            const tableName = `table_${i}`;
    
            // Lấy các năm đang có dữ liệu để dropdown không còn rỗng.
            const yearsResult = await pool.query(`
                SELECT DISTINCT ${createdAtYearExpr(tableName)} AS year
                FROM ${tableName}
                WHERE ${createdAtYearExpr(tableName)} ~ '^[0-9]{4}$'
            `);
            yearsResult.rows.forEach(r => { if (r.year) yearSet.add(r.year); });

            let countQuery = `SELECT COUNT(*)::int AS total FROM ${tableName}`;
            const params = [];
            const conditions = [];
            if (year) {
                params.push(year);
                conditions.push(`${createdAtYearExpr(tableName)} = $${params.length}`);
            }
            if (month) {
                params.push(month);
                conditions.push(`${createdAtMonthExpr(tableName)} = $${params.length}`);
            }
            if (conditions.length) countQuery += ` WHERE ${conditions.join(' AND ')}`;

            const countResult = await pool.query(countQuery, params);
            counts.push({
                table: tableName,
                title: [
                    'Danh sách trẻ sinh ra', 'Danh sách SL sơ sinh', 'Danh sách người chết',
                    'Danh sách người chuyển đến từ xã khác', 'Danh sách người chuyển đi khỏi xã',
                    'Danh sách thay đổi thông tin cơ bản', 'Vợ chồng mới sử dụng BPTT',
                    'Vợ chồng thôi sử dụng BPTT', 'Phụ nữ có thông tin thai sản',
                    'Sàng lọc trước sinh', 'Người cao tuổi khám sức khỏe'
                ][i - 1],
                total: countResult.rows[0].total
            });
        }

        res.json({
            success: true,
            month,
            year,
            years: [...yearSet].sort((a, b) => Number(b) - Number(a)),
            counts,
            grandTotal: counts.reduce((sum, item) => sum + Number(item.total || 0), 0)
        });
    } catch (err) {
        console.error('❌ Lỗi thống kê 11 bảng:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// API Thêm dữ liệu vào các bảng nghiệp vụ (Đã tích hợp log)
app.post("/api/data/:table", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const tableName = req.params.table;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    try {
        let user = req.session.user;
        let dataObj = req.body;

        // BẢNG 1: quan_he_con chỉ phục vụ đồng bộ quan hệ trẻ vào dan_cu.quan_he.
        // Không cho phép trường phụ này trở thành cột INSERT của table_1.
        if (tableName === 'table_1' && Object.prototype.hasOwnProperty.call(dataObj, 'quan_he_con')) {
            dataObj = { ...dataObj };
            delete dataObj.quan_he_con;
        }

        const residentFkColumnsByTable = {
            table_1: ['dan_cu_me_id', 'dan_cu_con_id'], table_2: ['dan_cu_tre_id', 'dan_cu_me_id'],
            table_3: ['dan_cu_id'], table_4: ['dan_cu_id'], table_5: ['dan_cu_id'],
            table_6: ['dan_cu_id'], table_7: ['dan_cu_id'], table_8: ['dan_cu_id'],
            table_9: ['dan_cu_id'], table_10: ['dan_cu_id'], table_11: ['dan_cu_id']
        };
        dataObj = { ...dataObj };

        // Bảo vệ API lưu chung: mỗi biểu mẫu chỉ được ghi đúng cột liên kết dân cư
        // đã khai báo cho chính bảng đó. Trước đây client có thể gửi kèm dan_cu_me_id
        // từ trạng thái tìm kiếm/biểu mẫu khác; INSERT sẽ cố ghi cột không tồn tại
        // (ví dụ table_5.dan_cu_me_id) và gây lỗi PostgreSQL 42703.
        const allResidentFkColumns = ['dan_cu_id', 'dan_cu_me_id', 'dan_cu_con_id', 'dan_cu_tre_id'];
        const allowedResidentFkColumns = new Set(residentFkColumnsByTable[tableName] || []);
        for (const fkColumn of allResidentFkColumns) {
            if (!allowedResidentFkColumns.has(fkColumn)) delete dataObj[fkColumn];
        }

        // Các trường điều khiển luồng/chỉ dùng để gọi API đồng bộ không phải cột
        // của bảng báo cáo; không được đưa vào câu INSERT của table_1..table_11.
        delete dataObj.shared_household_confirmed;
        delete dataObj.resident_details_confirmed;
        delete dataObj.resident_details;

        for (const fkColumn of (residentFkColumnsByTable[tableName] || [])) {
            if (!Object.prototype.hasOwnProperty.call(dataObj, fkColumn)) continue;
            const rawId = String(dataObj[fkColumn] ?? '').trim();
            if (!rawId) dataObj[fkColumn] = null;
            else if (!/^\d+$/.test(rawId) || Number(rawId) <= 0) {
                return res.status(400).json({ success: false, message: `Khóa liên kết ${fkColumn} không hợp lệ.` });
            } else dataObj[fkColumn] = Number(rawId);
        }

        // BẢNG 6: cập nhật hồ sơ dân cư và ghi lịch sử trong cùng một transaction.
        if (tableName === 'table_6') {
            const client = await pool.connect();
            try {
                const danCuId = String(dataObj.dan_cu_id || '').trim();
                let changes = dataObj.changes;
                if (typeof changes === 'string') {
                    try { changes = JSON.parse(changes); } catch (_) { changes = []; }
                }
                if (!danCuId || !Array.isArray(changes) || changes.length === 0) {
                    return res.status(400).json({ success: false, message: 'Vui lòng chọn người dân và ít nhất một nội dung thay đổi.' });
                }

                await client.query('BEGIN');
                const residentResult = await client.query('SELECT * FROM dan_cu WHERE id = $1 FOR UPDATE', [danCuId]);
                if (!residentResult.rows.length) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ success: false, message: 'Không tìm thấy người trong danh sách dân cư.' });
                }
                const old = residentResult.rows[0];

                // Giữ giới hạn khu vực: CTV chỉ được cập nhật hồ sơ thuộc địa bàn tài khoản.
                const roleKey = String(user.role || '').trim().toLowerCase();
                const isPrivileged = roleKey === 'admin' || roleKey.includes('lãnh đạo') || roleKey.includes('lanh dao');
                if (!isPrivileged) {
                    const userAreaPrefix = String(user.diabanh || '').trim().split(',')[0].trim();
                    const residentAreaPrefix = String(old.dia_chi || '').trim().split(',')[0].trim();
                    if (user.ap && String(old.ap || '').trim() && String(user.ap).trim() !== String(old.ap).trim()) {
                        await client.query('ROLLBACK');
                        return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật người dân thuộc Ấp khác.' });
                    }
                    if (userAreaPrefix && /^\d+$/.test(userAreaPrefix) && residentAreaPrefix !== userAreaPrefix) {
                        await client.query('ROLLBACK');
                        return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật người dân thuộc địa bàn khác.' });
                    }
                }

                const allowed = new Set(['ho_ten','ngay_sinh','gioi_tinh','dan_toc','hoc_van','hon_nhan','tinh_trang_cu_tru','ma_bhyt','cccd','ngay_cap_cccd','dia_chi','diabanh','ap']);
                const updates = {};
                const historyRows = [];
                const seen = new Set();
                let splitHousehold = null;
                for (const item of changes) {
                    if (!item || typeof item !== 'object') continue;
                    const field = String(item.field || '').trim();
                    if (field === 'tach_ho') {
                        if (splitHousehold) continue;
                        const v = item.value || {};
                        const rawNewHousehold = String(v.new_ma_ho || '').trim();
                        const ghiChuMaHoMoi = String(v.ghi_chu_ma_ho || '').trim();
                        const householdMatch = rawNewHousehold.match(/^(\d{1,5})(?:\.(\d+(?:\.\d+)*))?$/);
                        if (!householdMatch) {
                            await client.query('ROLLBACK');
                            return res.status(400).json({ success: false, message: 'Mã hộ mới phải có phần chính từ 1 đến 5 chữ số; phần sau dấu chấm (nếu có) chỉ gồm chữ số. Ký hiệu/chữ ghi ở ô Ghi chú mã hộ.' });
                        }
                        const newHousehold = householdMatch[1].padStart(5, '0') + (householdMatch[2] ? `.${householdMatch[2]}` : '');
                        const mainRelation = String(v.main_quan_he || '').trim();
                        const companionIds = Array.isArray(v.member_ids) ? [...new Set(v.member_ids.map(Number).filter(n => Number.isInteger(n) && n > 0))] : [];
                        const companionRelations = v.member_relations && typeof v.member_relations === 'object' ? v.member_relations : {};
                        if (!newHousehold || newHousehold === String(old.ma_ho || '').trim()) {
                            await client.query('ROLLBACK');
                            return res.status(400).json({ success: false, message: 'Mã hộ mới phải khác mã hộ hiện tại.' });
                        }
                        if (!mainRelation) {
                            await client.query('ROLLBACK');
                            return res.status(400).json({ success: false, message: 'Vui lòng chọn quan hệ mới của người chính.' });
                        }
                        for (const memberId of companionIds) {
                            if (!String(companionRelations[memberId] || '').trim()) {
                                await client.query('ROLLBACK');
                                return res.status(400).json({ success: false, message: 'Vui lòng chọn quan hệ mới cho tất cả người đi kèm.' });
                            }
                        }
                        if (changes.length !== 1) {
                            await client.query('ROLLBACK');
                            return res.status(400).json({ success: false, message: 'Nội dung Tách hộ cần thực hiện riêng, không ghép với thay đổi thông tin khác.' });
                        }
                        const ids = [Number(danCuId), ...companionIds.filter(id => id !== Number(danCuId))];
                        const areaPrefix = String(old.dia_chi || '').trim().split(',')[0].trim();
                        const duplicateNewHousehold = await client.query(`
                            SELECT id FROM dan_cu
                            WHERE TRIM(COALESCE(ma_ho,'')) = $1
                              AND split_part(TRIM(COALESCE(dia_chi,'')), ',', 1) = $2
                              AND NOT (id = ANY($3::bigint[]))
                            LIMIT 1
                        `, [newHousehold, areaPrefix, ids]);
                        if (duplicateNewHousehold.rowCount) {
                            await client.query('ROLLBACK');
                            return res.status(409).json({ success: false, message: `Mã hộ mới ${newHousehold} đã được sử dụng trong địa bàn này. Vui lòng chọn mã hộ khác.` });
                        }
                        const validMembers = await client.query(`
                            SELECT id, ho_ten FROM dan_cu
                            WHERE id = ANY($1::bigint[])
                              AND TRIM(COALESCE(ma_ho,'')) = $2
                              AND split_part(TRIM(COALESCE(dia_chi,'')), ',', 1) = $3
                            FOR UPDATE
                        `, [ids, String(old.ma_ho || '').trim(), areaPrefix]);
                        if (validMembers.rowCount !== ids.length) {
                            await client.query('ROLLBACK');
                            return res.status(400).json({ success: false, message: 'Có người đi kèm không còn thuộc hộ hiện tại. Vui lòng tải lại danh sách thành viên.' });
                        }
                        splitHousehold = { newHousehold, ghiChuMaHoMoi, ids, mainRelation, companionRelations, names: validMembers.rows.filter(r => Number(r.id) !== Number(danCuId)).map(r => r.ho_ten).filter(Boolean) };
                        continue;
                    }
                    if (field === 'dia_chi_nhom') {
                        const v = item.value || {};
                        const selectedArea = String(v.diabanh || '').trim();
                        const areaCodeMatch = selectedArea.match(/^([0-9]{3})\s*,?/);
                        const addressDetail = String(v.dia_chi || '').trim();
                        const newAddress = {
                            diabanh: selectedArea,
                            ap: String(v.ap || '').trim(),
                            ma_xa_phuong: areaCodeMatch ? areaCodeMatch[1] : String(old.ma_xa_phuong || ''),
                            // Bảo toàn quy tắc mã địa bàn là 3 số đầu của dia_chi.
                            dia_chi: areaCodeMatch ? `${areaCodeMatch[1]}, ${addressDetail}`.trim() : addressDetail
                        };
                        const oldAddress = {
                            diabanh: String(old.diabanh || '').trim(),
                            ap: String(old.ap || '').trim(),
                            dia_chi: String(old.dia_chi || '').trim().replace(/^\s*\d{3}\s*,\s*/, '')
                        };
                        const oldText = [oldAddress.diabanh, oldAddress.ap, oldAddress.dia_chi].filter(Boolean).join(' · ') || '(Trống)';
                        const newText = [newAddress.diabanh, newAddress.ap, addressDetail].filter(Boolean).join(' · ') || '(Trống)';
                        if (oldText !== newText) {
                            Object.assign(updates, newAddress);
                            historyRows.push({ label: 'Địa chỉ (địa bàn, Ấp, địa chỉ cụ thể)', oldText, newText });
                        }
                        continue;
                    }
                    if (!allowed.has(field) || seen.has(field)) continue;
                    seen.add(field);
                    const value = String(item.value ?? '').trim();
                    const oldValue = String(old[field] ?? '').trim();
                    if (value === oldValue) continue;
                    updates[field] = value;
                    const labels = {
                        ho_ten:'Họ và tên', ngay_sinh:'Ngày sinh', gioi_tinh:'Giới tính', dan_toc:'Dân tộc',
                        hoc_van:'Trình độ học vấn', hon_nhan:'Tình trạng hôn nhân', tinh_trang_cu_tru:'Tình trạng cư trú',
                        ma_bhyt:'Mã thẻ BHYT', cccd:'CCCD', ngay_cap_cccd:'Ngày cấp CCCD', dia_chi:'Địa chỉ', diabanh:'Địa bàn', ap:'Ấp'
                    };
                    historyRows.push({ label: labels[field] || field, oldText: oldValue || '(Trống)', newText: value || '(Trống)' });
                }

                if (splitHousehold) {
                    const oldHouseholdLabel = `Hộ ${String(old.ma_ho || '').trim()}`;
                    const newHouseholdLabel = `Hộ ${splitHousehold.newHousehold}`;
                    const companionText = splitHousehold.names.length ? `Tách hộ kèm ${splitHousehold.names.join(', ')}` : 'Tách hộ';
                    historyRows.push({ label: 'Tách hộ', oldText: oldHouseholdLabel, newText: newHouseholdLabel, note: companionText });
                }

                if (!historyRows.length) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'Không có thông tin nào thay đổi so với dữ liệu hiện tại.' });
                }

                const updateKeys = Object.keys(updates);
                if (updateKeys.length) {
                    const updateValues = updateKeys.map(k => updates[k]);
                    const setSql = updateKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
                    updateValues.push(danCuId);
                    await client.query(`UPDATE dan_cu SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = $${updateValues.length}`, updateValues);
                }

                if (splitHousehold) {
                    for (const personId of splitHousehold.ids) {
                        const relation = personId === Number(danCuId)
                            ? splitHousehold.mainRelation
                            : String(splitHousehold.companionRelations[personId] || '').trim();
                        await client.query(`UPDATE dan_cu SET ma_ho = $1, quan_he = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, [splitHousehold.newHousehold, relation, personId]);
                    }
                    updates.ma_ho = splitHousehold.newHousehold;
                    updates.quan_he = splitHousehold.mainRelation;
                }

                const createdAt = getVietnamTimestamp();
                const updatedPerson = { ...old, ...updates };
                const apLog = updatedPerson.ap || user.ap || '';
                const areaLog = updatedPerson.diabanh || user.diabanh || '';
                for (const change of historyRows) {
                    const insertedTable6 = await client.query(`
                        INSERT INTO table_6
                        (dan_cu_id, ho_so, ho_ten, ngay_sinh, so_the_bhyt, gioi_tinh,
                         thong_tin_cu, thong_tin_moi, ap, diabanh, nguoi_nhap, created_at, ghi_chu, ghi_chu_ma_ho)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                        RETURNING id
                    `, [danCuId, updatedPerson.ma_ho || '', updatedPerson.ho_ten || '', updatedPerson.ngay_sinh || '', updatedPerson.ma_bhyt || '', updatedPerson.gioi_tinh || '',
                        `${change.label === 'Tách hộ' ? change.oldText : `${change.label}: ${change.oldText}`}`, `${change.label === 'Tách hộ' ? change.newText : `${change.label}: ${change.newText}`}`, apLog, areaLog,
                        `${user.fullname} (${user.username})`, createdAt, [change.note, dataObj.ghi_chu].filter(Boolean).join('. '),
                        change.label === 'Tách hộ' ? String(splitHousehold?.ghiChuMaHoMoi || '') : '']);
                    if (change.label === 'Tách hộ' && splitHousehold) {
                        const table6RowId = insertedTable6.rows[0]?.id;
                        for (const memberId of splitHousehold.ids.filter(id => Number(id) !== Number(danCuId))) {
                            await client.query(`INSERT INTO table_6_thanh_vien (table_6_id, dan_cu_id, vai_tro)
                                VALUES ($1,$2,'THANH_VIEN_TACH_CUNG') ON CONFLICT (table_6_id, dan_cu_id) DO NOTHING`, [table6RowId, memberId]);
                        }
                    }
                }
                await client.query('COMMIT');
                await logAction(user, 'Cập nhật thông tin dân cư qua Bảng 6', Number(danCuId), `[${old.ho_ten}] ${historyRows.map(x => x.label).join(', ')}`);
                return res.json({ success: true, message: splitHousehold ? `Đã tách ${splitHousehold.ids.length} người sang hộ ${splitHousehold.newHousehold} và ghi 1 dòng lịch sử vào Bảng 6.` : `Đã cập nhật hồ sơ dân cư và ghi nhận ${historyRows.length} nội dung thay đổi vào Bảng 6.`, updated: historyRows.length });
            } catch (table6Error) {
                try { await client.query('ROLLBACK'); } catch (_) {}
                throw table6Error;
            } finally {
                client.release();
            }
        }
        
        dataObj.created_at = getVietnamTimestamp();
        dataObj.nguoi_nhap = `${user.fullname} (${user.username})`;

        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            dataObj.ap = user.ap;
            dataObj.diabanh = user.diabanh;
        }

        const keys = Object.keys(dataObj);
        const values = Object.values(dataObj);
        const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
        const columns = keys.join(", ");

        const insertRes = await pool.query(`INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING id`, values);
        const newId = insertRes.rows[0] ? insertRes.rows[0].id : null;
        const targetName = dataObj.ho_so || dataObj.ho_ten || dataObj.ho_ten_con || dataObj.ho_ten_vo || `Bản ghi #${newId}`;

        // === GHI NHẬT KÝ THÊM ===
        await logAction(user, `Thêm mới dữ liệu vào ${tableName}`, newId, `Hồ sơ/Tên: ${targetName}`);

        res.json({ success: true, id: newId, message: "Lưu dữ liệu thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API Xóa dữ liệu (Đã tích hợp log)
app.delete("/api/data/:table/:id", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const tableName = req.params.table;
    const recordId = req.params.id;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    try {
        let user = req.session.user;

        let checkRecord = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [recordId]);
        if (checkRecord.rows.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi" });

        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            if (checkRecord.rows[0].ap !== user.ap) {
                return res.status(403).json({ success: false, message: "Bạn không có quyền xóa dữ liệu của ấp khác!" });
            }
        }

        const oldData = checkRecord.rows[0];
        const targetName = oldData.ho_so || oldData.ho_ten || oldData.ho_ten_con || oldData.ho_ten_vo || `ID: ${recordId}`;

        await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [recordId]);

        // === GHI NHẬT KÝ XÓA ===
        await logAction(user, `Xóa bản ghi khỏi ${tableName}`, parseInt(recordId), `Đã xóa: ${targetName}`);

        res.json({ success: true, message: "Đã xóa dữ liệu thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== ĐỒNG BỘ MỘT CHIỀU TỪ BIỂU MẪU SANG DAN_CU ====================
// Chỉ cập nhật các thuộc tính thực sự có trong dan_cu. Tuyệt đối không ghi ngược
// thay đổi từ dan_cu vào table_1..table_11 vì đây là dữ liệu báo cáo độc lập.
const reportResidentSpecs = {
    table_1: [
        { idKey: 'dan_cu_con_id', fields: {
            ho_so: 'ma_ho', ho_ten_con: 'ho_ten', ngay_sinh_con: 'ngay_sinh', gioi_tinh: 'gioi_tinh',
            dan_toc: 'dan_toc', ap: 'ap', diabanh: 'diabanh'
        }},
        { idKey: 'dan_cu_me_id', fields: {
            ho_so: 'ma_ho', ho_ten_me: 'ho_ten', ngay_sinh_me: 'ngay_sinh',
            so_the_bhyt_me: 'ma_bhyt', ap: 'ap', diabanh: 'diabanh'
        }}
    ],
    table_2: [
        { idKey: 'dan_cu_tre_id', fields: {
            so_ho: 'ma_ho', ho_ten_tre: 'ho_ten', ngay_sinh_tre: 'ngay_sinh', gioi_tinh: 'gioi_tinh',
            noi_cu_tru: 'dia_chi', ap: 'ap', diabanh: 'diabanh'
        }},
        { idKey: 'dan_cu_me_id', fields: {
            so_ho: 'ma_ho', ho_ten_me: 'ho_ten', nam_sinh_me: 'ngay_sinh', ma_the_bhyt_me: 'ma_bhyt',
            ap: 'ap', diabanh: 'diabanh'
        }}
    ],
    table_3: [{ idKey: 'dan_cu_id', fields: {
        ho_so: 'ma_ho', ho_ten: 'ho_ten', ngay_sinh: 'ngay_sinh', so_the_bhyt: 'ma_bhyt',
        gioi_tinh: 'gioi_tinh', dan_toc: 'dan_toc', quan_he: 'quan_he', ap: 'ap', diabanh: 'diabanh'
    }}],
    table_4: [{ idKey: 'dan_cu_id', fields: {
        ho_so: 'ma_ho', ho_ten: 'ho_ten', ngay_sinh: 'ngay_sinh', so_the_bhyt: 'ma_bhyt',
        gioi_tinh: 'gioi_tinh', dan_toc: 'dan_toc', quan_he: 'quan_he',
        trinh_do_hoc_van: 'hoc_van', tinh_trang_hon_nhan: 'hon_nhan', ap: 'ap', diabanh: 'diabanh'
    }}],
    table_5: [{ idKey: 'dan_cu_id', fields: {
        ho_so: 'ma_ho', ho_ten: 'ho_ten', ngay_sinh: 'ngay_sinh', so_the_bhyt: 'ma_bhyt',
        gioi_tinh: 'gioi_tinh', dan_toc: 'dan_toc', quan_he: 'quan_he', ap: 'ap', diabanh: 'diabanh'
    }}],
    table_6: [{ idKey: 'dan_cu_id', fields: {
        ho_so: 'ma_ho', ho_ten: 'ho_ten', ngay_sinh: 'ngay_sinh', so_the_bhyt: 'ma_bhyt',
        gioi_tinh: 'gioi_tinh', ap: 'ap', diabanh: 'diabanh'
    }}],
    table_7: [{ idKey: 'dan_cu_id', fields: {
        ho_so: 'ma_ho', ho_ten_vo: 'ho_ten', ngay_sinh: 'ngay_sinh', so_the_bhyt: 'ma_bhyt',
        so_con_hien_co: 'so_con', ap: 'ap', diabanh: 'diabanh'
    }}],
    table_8: [{ idKey: 'dan_cu_id', fields: {
        ho_so: 'ma_ho', ho_ten_vo: 'ho_ten', ngay_sinh: 'ngay_sinh', so_the_bhyt: 'ma_bhyt', ap: 'ap', diabanh: 'diabanh'
    }}],
    table_9: [{ idKey: 'dan_cu_id', fields: {
        ho_so: 'ma_ho', ho_ten: 'ho_ten', ngay_sinh: 'ngay_sinh', so_the_bhyt: 'ma_bhyt', ap: 'ap', diabanh: 'diabanh'
    }}],
    table_10: [{ idKey: 'dan_cu_id', fields: {
        so_ho: 'ma_ho', ho_ten: 'ho_ten', ngay_sinh: 'ngay_sinh', ma_the_bhyt: 'ma_bhyt',
        noi_cu_tru: 'dia_chi', ap: 'ap', diabanh: 'diabanh'
    }}],
    table_11: [{ idKey: 'dan_cu_id', fields: {
        ho_so: 'ma_ho', ho_ten: 'ho_ten', so_the_bhyt: 'ma_bhyt', ap: 'ap', diabanh: 'diabanh'
    }}]
};

const reportDanCuAllowedColumns = new Set([
    'ho_ten', 'ma_ho', 'quan_he', 'gioi_tinh', 'ngay_sinh', 'dan_toc', 'hoc_van',
    'hon_nhan', 'ma_bhyt', 'dia_chi', 'diabanh', 'ap', 'so_con'
]);

function reportTextKey(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

function reportBirthYear(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    let m = text.match(/^(\d{4})/);
    if (m) return m[1];
    m = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    return m ? m[3] : '';
}

function reportHouseholdCode(value) {
    const text = String(value ?? '').trim();
    // Mã hộ là 5 số đầu; phần sau dấu chấm/khoảng trắng có thể là nội dung ghi chú.
    const leading = text.match(/^(\d{1,5})/);
    if (leading) return leading[1].padStart(5, '0');
    const digits = text.replace(/\D/g, '');
    if (!digits) return '';
    return digits.length <= 5 ? digits.padStart(5, '0') : digits;
}

async function updateReportResidentLink(client, tableName, recordId, residentId, column) {
    const allowed = {
        table_1: ['dan_cu_me_id', 'dan_cu_con_id'], table_2: ['dan_cu_tre_id', 'dan_cu_me_id'],
        table_3: ['dan_cu_id'], table_4: ['dan_cu_id'], table_5: ['dan_cu_id'],
        table_6: ['dan_cu_id'], table_7: ['dan_cu_id'], table_8: ['dan_cu_id'],
        table_9: ['dan_cu_id'], table_10: ['dan_cu_id'], table_11: ['dan_cu_id']
    };
    if (!recordId) return;
    if (!/^\d+$/.test(String(recordId))) throw new Error('ID bản ghi báo cáo không hợp lệ khi gắn liên kết dân cư.');
    if (!/^\d+$/.test(String(residentId)) || Number(residentId) <= 0) throw new Error('ID nhân khẩu không hợp lệ khi gắn liên kết dân cư.');
    if (!(allowed[tableName] || []).includes(column)) throw new Error('Cột liên kết dân cư không được phép.');
    const result = await client.query(`UPDATE ${tableName} SET ${column} = $1 WHERE id = $2`, [Number(residentId), Number(recordId)]);
    if (result.rowCount !== 1) throw new Error(`Không tìm thấy bản ghi ${tableName} cần gắn ID dân cư.`);
}

async function getExplicitResidentById(client, residentId, householdCode, fullName) {
    const rawId = String(residentId ?? '').trim();
    if (!rawId) return null;
    if (!/^\d+$/.test(rawId) || Number(rawId) <= 0) {
        const error = new Error('Mã liên kết dân cư không hợp lệ. Vui lòng chọn lại nhân khẩu từ danh sách tìm kiếm.');
        error.status = 400; throw error;
    }
    const result = await client.query('SELECT * FROM dan_cu WHERE id = $1 FOR UPDATE', [Number(rawId)]);
    if (!result.rows.length) { const error = new Error('Nhân khẩu đã chọn không còn tồn tại trong danh sách dân cư.'); error.status = 404; throw error; }
    const person = result.rows[0];
    const expectedHousehold = reportHouseholdCode(householdCode);
    const actualHousehold = reportHouseholdCode(person.ma_ho);
    if (expectedHousehold && actualHousehold && expectedHousehold !== actualHousehold && !options.allowHouseholdChange) {
        const error = new Error('Mã hộ trên biểu mẫu không khớp với nhân khẩu đã chọn. Vui lòng chọn lại người dân.'); error.status = 409; throw error;
    }
    // Mặc định vẫn kiểm tra tên nghiêm ngặt. Chỉ cho phép tên khác khi caller
    // đã xác minh ID này được lưu sẵn trên chính bản ghi báo cáo đang xử lý.
    // Điều này hỗ trợ sửa chính tả/đổi tên người cùng nhân khẩu mà không dò tên.
    if (fullName && reportTextKey(person.ho_ten) !== reportTextKey(fullName)) {
        const error = new Error('Họ tên trên biểu mẫu đã khác nhân khẩu được chọn. Vui lòng tìm và chọn lại đúng người để tránh gắn nhầm hồ sơ.');
        error.status = 409; throw error;
    }
    return person;
}

function firstReportValue(row, keys) {
    for (const key of keys) {
        const value = String(row?.[key] ?? '').trim();
        if (value) return value;
    }
    return '';
}

function changedReportResidentValues(oldRow, dataObj, fields) {
    const output = {};
    for (const [sourceKey, targetKey] of Object.entries(fields || {})) {
        if (!reportDanCuAllowedColumns.has(targetKey)) continue;
        if (!Object.prototype.hasOwnProperty.call(dataObj, sourceKey)) continue;
        if (String(oldRow[sourceKey] ?? '') === String(dataObj[sourceKey] ?? '')) continue;
        let value = dataObj[sourceKey];
        if (value === '') value = null;
        if (targetKey === 'so_con') {
            if (value === null) {
                output[targetKey] = null;
                continue;
            }
            const n = Number(value);
            if (!Number.isInteger(n) || n < 0) continue;
            value = n;
        } else if (value !== null && value !== undefined) {
            value = String(value).trim() || null;
        }
        output[targetKey] = value;
    }
    return output;
}

async function findResidentForReportEdit(client, oldRow, spec) {
    // Chỉ dùng khóa liên kết đã được lưu trên chính bản ghi báo cáo.
    // Không dò theo tên, mã hộ, ngày sinh hay BHYT vì có thể trùng người.
    const directId = String(oldRow?.[spec.idKey] ?? '').trim();
    if (!directId || !/^\d+$/.test(directId)) return null;
    const result = await client.query('SELECT * FROM dan_cu WHERE id = $1 FOR UPDATE', [directId]);
    return result.rows.length === 1 ? result.rows[0] : null;
}

async function syncEditedReportToDanCu(client, tableName, oldRow, dataObj) {
    const specs = reportResidentSpecs[tableName] || [];
    const result = { updated: 0, skipped: 0, columns: [] };
    for (const spec of specs) {
        const updates = changedReportResidentValues(oldRow, dataObj, spec.fields);
        const columns = Object.keys(updates);
        if (!columns.length) continue;

        const resident = await findResidentForReportEdit(client, oldRow, spec);
        if (!resident) {
            result.skipped++;
            continue;
        }

        const values = columns.map(key => updates[key]);
        const sets = columns.map((key, index) => `"${key}" = $${index + 1}`);
        values.push(resident.id);
        await client.query(
            `UPDATE dan_cu SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
            values
        );
        result.updated++;
        result.columns.push(...columns);
    }
    result.columns = [...new Set(result.columns)];
    return result;
}


// Đồng bộ CÁC TRƯỜNG NHÂN THÂN CHUNG giữa Bảng 1, 2 và 10 theo dan_cu_id.
// Chỉ cập nhật khi bản ghi nguồn đã có khóa liên kết; tuyệt đối không dò theo tên/mã hộ.
// Các trường nghiệp vụ sàng lọc/kết quả khám không nằm trong mapping này.
const linkedBirthReportSyncMap = {
    table_1: [
        {
            role: 'mother', idKey: 'dan_cu_me_id', fields: {
                ho_so: [ ['table_2', 'dan_cu_me_id', 'so_ho'], ['table_10', 'dan_cu_id', 'so_ho'] ],
                ho_ten_me: [ ['table_2', 'dan_cu_me_id', 'ho_ten_me'], ['table_10', 'dan_cu_id', 'ho_ten'] ],
                ngay_sinh_me: [ ['table_2', 'dan_cu_me_id', 'nam_sinh_me'], ['table_10', 'dan_cu_id', 'ngay_sinh'] ],
                so_the_bhyt_me: [ ['table_2', 'dan_cu_me_id', 'ma_the_bhyt_me'], ['table_10', 'dan_cu_id', 'ma_the_bhyt'] ]
            }
        },
        {
            role: 'child', idKey: 'dan_cu_con_id', fields: {
                ho_so: [ ['table_2', 'dan_cu_tre_id', 'so_ho'] ],
                ho_ten_con: [ ['table_2', 'dan_cu_tre_id', 'ho_ten_tre'] ],
                ngay_sinh_con: [ ['table_2', 'dan_cu_tre_id', 'ngay_sinh_tre'] ],
                gioi_tinh: [ ['table_2', 'dan_cu_tre_id', 'gioi_tinh'] ]
            }
        }
    ],
    table_2: [
        {
            role: 'mother', idKey: 'dan_cu_me_id', fields: {
                so_ho: [ ['table_1', 'dan_cu_me_id', 'ho_so'], ['table_10', 'dan_cu_id', 'so_ho'] ],
                ho_ten_me: [ ['table_1', 'dan_cu_me_id', 'ho_ten_me'], ['table_10', 'dan_cu_id', 'ho_ten'] ],
                nam_sinh_me: [ ['table_1', 'dan_cu_me_id', 'ngay_sinh_me'], ['table_10', 'dan_cu_id', 'ngay_sinh'] ],
                ma_the_bhyt_me: [ ['table_1', 'dan_cu_me_id', 'so_the_bhyt_me'], ['table_10', 'dan_cu_id', 'ma_the_bhyt'] ]
            }
        },
        {
            role: 'child', idKey: 'dan_cu_tre_id', fields: {
                so_ho: [ ['table_1', 'dan_cu_con_id', 'ho_so'] ],
                ho_ten_tre: [ ['table_1', 'dan_cu_con_id', 'ho_ten_con'] ],
                ngay_sinh_tre: [ ['table_1', 'dan_cu_con_id', 'ngay_sinh_con'] ],
                gioi_tinh: [ ['table_1', 'dan_cu_con_id', 'gioi_tinh'] ]
            }
        }
    ],
    table_10: [
        {
            role: 'mother', idKey: 'dan_cu_id', fields: {
                so_ho: [ ['table_1', 'dan_cu_me_id', 'ho_so'], ['table_2', 'dan_cu_me_id', 'so_ho'] ],
                ho_ten: [ ['table_1', 'dan_cu_me_id', 'ho_ten_me'], ['table_2', 'dan_cu_me_id', 'ho_ten_me'] ],
                ngay_sinh: [ ['table_1', 'dan_cu_me_id', 'ngay_sinh_me'], ['table_2', 'dan_cu_me_id', 'nam_sinh_me'] ],
                ma_the_bhyt: [ ['table_1', 'dan_cu_me_id', 'so_the_bhyt_me'], ['table_2', 'dan_cu_me_id', 'ma_the_bhyt_me'] ]
            }
        }
    ]
};

async function syncRelatedBirthReports(client, tableName, oldRow, dataObj, user) {
    const roleSpecs = linkedBirthReportSyncMap[tableName] || [];
    const result = { updated: 0, skipped: 0, columns: [], byTable: {} };
    const updatedRecordKeys = new Set();
    const roleKey = String(user?.role || '').trim().toLowerCase();
    const privileged = roleKey === 'admin' || roleKey.includes('lãnh đạo') || roleKey.includes('lanh dao');

    for (const roleSpec of roleSpecs) {
        const personId = String(oldRow?.[roleSpec.idKey] ?? '').trim();
        if (!personId || !/^\d+$/.test(personId)) continue;

        // Tập hợp thay đổi theo từng bảng đích, nhưng chỉ lấy trường thực sự thay đổi ở nguồn.
        const targets = new Map();
        for (const [sourceKey, destinations] of Object.entries(roleSpec.fields)) {
            if (!Object.prototype.hasOwnProperty.call(dataObj, sourceKey)) continue;
            if (String(oldRow[sourceKey] ?? '') === String(dataObj[sourceKey] ?? '')) continue;
            const rawValue = dataObj[sourceKey];
            const value = rawValue === null || rawValue === undefined || String(rawValue).trim() === ''
                ? null : String(rawValue).trim();
            for (const [targetTable, targetIdKey, targetColumn] of destinations) {
                if (!targets.has(targetTable)) targets.set(targetTable, { idKey: targetIdKey, fields: {} });
                targets.get(targetTable).fields[targetColumn] = value;
            }
        }

        for (const [targetTable, target] of targets.entries()) {
            const columns = Object.keys(target.fields);
            if (!columns.length) continue;
            const values = columns.map(column => target.fields[column]);
            const sets = columns.map((column, index) => `"${column}" = $${index + 1}`);
            values.push(Number(personId));
            let where = `"${target.idKey}" = $${values.length}`;
            if (!privileged) {
                // Không cho thao tác sửa một biểu mẫu lan sang bản ghi thuộc Ấp khác.
                where += ` AND COALESCE(ap, '') = $${values.length + 1}`;
                values.push(String(user?.ap || ''));
            }
            const update = await client.query(
                `UPDATE ${targetTable} SET ${sets.join(', ')} WHERE ${where} RETURNING id`,
                values
            );
            if (update.rowCount > 0) {
                result.columns.push(...columns);
                for (const row of update.rows || []) {
                    const recordKey = `${targetTable}:${row.id}`;
                    if (updatedRecordKeys.has(recordKey)) continue;
                    updatedRecordKeys.add(recordKey);
                    result.updated++;
                    result.byTable[targetTable] = (result.byTable[targetTable] || 0) + 1;
                }
            } else {
                result.skipped++;
            }
        }
    }
    result.columns = [...new Set(result.columns)];
    return result;
}

// ==================== API CẬP NHẬT DỮ LIỆU BẢNG (GHI CHI TIẾT THAY ĐỔI) ====================
// Cả trang Dữ liệu trực tuyến và Quản lý biểu mẫu đều dùng endpoint này.
// Sau khi sửa table_N, chỉ đồng bộ chiều table_N -> dan_cu; không có luồng ngược.
app.put("/api/data/:table/:id", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    const tableName = req.params.table;
    const recordId = req.params.id;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    let client;
    let user = req.session.user;
    try {
        client = await pool.connect();
        let dataObj = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? { ...req.body } : {};
        await client.query('BEGIN');

        const checkRecord = await client.query(`SELECT * FROM ${tableName} WHERE id = $1 FOR UPDATE`, [recordId]);
        if (checkRecord.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi" });
        }
        const oldData = checkRecord.rows[0];

        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            if (oldData.ap !== user.ap) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: "Bạn không có quyền sửa dữ liệu của ấp khác!" });
            }
            delete dataObj.ap;
        }

        delete dataObj.id;
        // Liên kết dân cư chỉ được tạo qua luồng chọn nhân khẩu / API gắn ID riêng.
        // Không cho các màn hình sửa báo cáo tự ghi đè khóa liên kết; đồng bộ luôn
        // sử dụng khóa đã lưu sẵn trong oldData để tránh chuyển nhầm người.
        const immutableResidentLinkColumns = new Set([
            'dan_cu_id', 'dan_cu_me_id', 'dan_cu_con_id', 'dan_cu_tre_id'
        ]);
        for (const key of Object.keys(dataObj)) {
            if (!Object.prototype.hasOwnProperty.call(oldData, key) || immutableResidentLinkColumns.has(key)) {
                delete dataObj[key];
            }
        }

        const changes = [];
        for (const key of Object.keys(dataObj)) {
            if (String(oldData[key] ?? '') !== String(dataObj[key] ?? '')) {
                changes.push(`${key}: "${oldData[key] ?? ''}" ➔ "${dataObj[key] ?? ''}"`);
            }
        }

        const keys = Object.keys(dataObj);
        if (!keys.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "Không có cột dữ liệu hợp lệ để cập nhật" });
        }
        const values = keys.map(key => dataObj[key]);
        const setString = keys.map((key, idx) => `"${key}" = $${idx + 1}`).join(", ");
        values.push(recordId);

        await client.query(`UPDATE ${tableName} SET ${setString} WHERE id = $${values.length}`, values);

        // Đồng bộ các trường dùng chung sang hồ sơ dân cư. Lỗi đồng bộ sẽ rollback
        // luôn lần sửa báo cáo, tránh trạng thái hai nơi lệch nhau ngoài ý muốn.
        const residentSync = await syncEditedReportToDanCu(client, tableName, oldData, dataObj);
        // Bảng 1, 2, 10 có dữ liệu mẹ/trẻ trùng nhau; cập nhật chéo các trường
        // nhân thân theo ID liên kết để ba biểu mẫu không bị lệch thông tin.
        const relatedReportSync = await syncRelatedBirthReports(client, tableName, oldData, dataObj, user);
        await client.query('COMMIT');

        const targetName = oldData.ho_so || oldData.ho_ten || oldData.ho_ten_con || oldData.ho_ten_vo || `ID: ${recordId}`;
        const changeDetails = changes.length > 0 ? changes.join(' | ') : 'Cập nhật thông tin';
        try {
            await logAction(user, `Cập nhật dữ liệu ${tableName} (ID: ${recordId})`, parseInt(recordId), `[${targetName}] Thay đổi: ${changeDetails}`);
            if (residentSync.updated > 0) {
                await logAction(user, `ĐỒNG BỘ SỬA DÂN CƯ từ ${tableName}`, parseInt(recordId),
                    `Cập nhật hồ sơ dân cư: ${residentSync.columns.join(', ')}`);
            }
            if (relatedReportSync.updated > 0) {
                const detail = Object.entries(relatedReportSync.byTable || {})
                    .map(([name, count]) => `${name}: ${count} bản ghi`).join('; ');
                await logAction(user, `ĐỒNG BỘ TRƯỜNG CHUNG BẢNG 1/2/10 từ ${tableName}`, parseInt(recordId), detail);
            }
        } catch (logError) {
            console.error('Không ghi được nhật ký sửa dữ liệu:', logError);
        }

        const relatedReportMessage = relatedReportSync.updated > 0
            ? ` Đã đồng bộ ${relatedReportSync.updated} bản ghi liên quan ở Bảng 1, 2, 10.`
            : '';
        res.json({
            success: true,
            message: (residentSync.skipped > 0 && residentSync.updated === 0
                ? "Cập nhật biểu mẫu thành công. Không tìm được hồ sơ dân cư đã liên kết nên danh sách dân cư chưa thay đổi."
                : "Cập nhật dữ liệu thành công!") + relatedReportMessage,
            dan_cu_sync: residentSync,
            related_report_sync: relatedReportSync
        });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error(`Lỗi cập nhật ${tableName} và đồng bộ dân cư:`, err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (client) client.release();
    }
});

// Gắn thủ công bản ghi báo cáo cũ (chưa có dan_cu_id) với nhân khẩu do quản lý chọn.
// Không tự dò theo tên; chỉ admin/lãnh đạo được gọi và máy chủ đối chiếu lại tên + mã hộ.
app.post('/api/admin/link-report-resident', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
    const role = String(req.session.user.role || '').trim().toLowerCase();
    if (!(role === 'admin' || role.includes('lãnh đạo') || role.includes('lanh dao'))) {
        return res.status(403).json({ success: false, message: 'Chỉ quản trị viên hoặc lãnh đạo được gắn liên kết cho dữ liệu cũ.' });
    }
    const tableName = String(req.body.table || '').trim();
    const recordId = String(req.body.record_id || '').trim();
    const residentId = String(req.body.dan_cu_id || '').trim();
    const roleKey = String(req.body.person_role || 'person').trim();
    const linkMap = {
        table_1: { mother: ['dan_cu_me_id', 'ho_ten_me', 'ho_so'], child: ['dan_cu_con_id', 'ho_ten_con', 'ho_so'] },
        table_2: { mother: ['dan_cu_me_id', 'ho_ten_me', 'so_ho'], child: ['dan_cu_tre_id', 'ho_ten_tre', 'so_ho'] },
        table_3: { person: ['dan_cu_id', 'ho_ten', 'ho_so'] },
        table_4: { person: ['dan_cu_id', 'ho_ten', 'ho_so'] },
        table_5: { person: ['dan_cu_id', 'ho_ten', 'ho_so'] },
        table_6: { person: ['dan_cu_id', 'ho_ten', 'ho_so'] },
        table_7: { person: ['dan_cu_id', 'ho_ten_vo', 'ho_so'] },
        table_8: { person: ['dan_cu_id', 'ho_ten_vo', 'ho_so'] },
        table_9: { person: ['dan_cu_id', 'ho_ten', 'ho_so'] },
        table_10: { person: ['dan_cu_id', 'ho_ten', 'so_ho'] },
        table_11: { person: ['dan_cu_id', 'ho_ten', 'ho_so'] }
    };
    const definition = linkMap[tableName]?.[roleKey];
    if (!definition || !/^\d+$/.test(recordId) || !/^\d+$/.test(residentId)) {
        return res.status(400).json({ success: false, message: 'Bảng, vai trò hoặc ID không hợp lệ.' });
    }
    const [column, nameColumn, householdColumn] = definition;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const reportResult = await client.query(`SELECT * FROM ${tableName} WHERE id = $1 FOR UPDATE`, [Number(recordId)]);
        if (!reportResult.rows.length) throw Object.assign(new Error('Không tìm thấy bản ghi báo cáo.'), { status: 404 });
        const residentResult = await client.query('SELECT * FROM dan_cu WHERE id = $1 FOR UPDATE', [Number(residentId)]);
        if (!residentResult.rows.length) throw Object.assign(new Error('Không tìm thấy nhân khẩu trong dan_cu.'), { status: 404 });
        const report = reportResult.rows[0], resident = residentResult.rows[0];
        if (report[column] && Number(report[column]) !== Number(residentId)) {
            throw Object.assign(new Error(`Bản ghi ${tableName} #${recordId} đã được liên kết với nhân khẩu ID ${report[column]}. Không tự ý thay thế liên kết hiện có.`), { status: 409 });
        }
        const reportName = String(report[nameColumn] || '').trim();
        if (reportName && reportTextKey(reportName) !== reportTextKey(resident.ho_ten)) {
            throw Object.assign(new Error(`Họ tên không khớp: báo cáo “${reportName}”, dân cư “${resident.ho_ten}”.`), { status: 409 });
        }
        const reportHousehold = reportHouseholdCode(report[householdColumn]);
        const residentHousehold = reportHouseholdCode(resident.ma_ho);
        if (reportHousehold && residentHousehold && reportHousehold !== residentHousehold) {
            throw Object.assign(new Error(`Mã hộ không khớp: báo cáo ${reportHousehold}, dân cư ${residentHousehold}.`), { status: 409 });
        }
        await client.query(`UPDATE ${tableName} SET ${column} = $1 WHERE id = $2`, [Number(residentId), Number(recordId)]);
        await client.query('COMMIT');
        try { await logAction(req.session.user, `Gắn liên kết dân cư cho ${tableName}`, Number(recordId), `Cột ${column}; dan_cu_id=${resident.id}; ${resident.ho_ten}`); } catch (logError) { console.error('Không ghi được nhật ký gắn liên kết dân cư:', logError); }
        return res.json({ success: true, message: `Đã gắn ${tableName} #${recordId} với nhân khẩu ${resident.ho_ten} (dan_cu_id ${resident.id}).`, column });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        return res.status(err.status || 500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

// ==================== TỪ ĐIỂN CHUẨN HÓA HỌ TÊN TIẾNG VIỆT ====================
function normalizeVietnameseKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/đ/g, 'd')
        .replace(/\s+/g, ' ')
        .trim();
}
// Chuẩn hóa vai trò và kiểm tra quyền quản lý hồ sơ 15-49

function chuanHoaVaiTro(user) {
    return String(user?.role || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

function coQuyenQuanLyPhuNu(user) {
    const role = chuanHoaVaiTro(user);

    return [
        'admin',
        'lanhdao',
        'congtacvien',
        'congtacvienap',
        'congtacvienxa',
        'ctv',
        'collaborator'
    ].includes(role);
}

function laQuanLyToanXa(user) {
    const role = chuanHoaVaiTro(user);

    return role === 'admin' || role === 'lanhdao';
}

function thuocDiaBanCongTacVien(user, diaBan) {
    const diaBanUser = String(user?.diabanh || '').trim();
    const diaBanHoSo = String(diaBan || '').trim();

    if (!diaBanUser || !diaBanHoSo) return false;

    // Địa bàn được xác định bằng 3 chữ số đầu của chuỗi Địa chỉ,
    // ví dụ '142, Xã ...'; không dùng Mã Xã/Phường 10 chữ số.
    const maUser = diaBanUser.match(/^\d{3}/)?.[0] || '';
    const maHoSo = diaBanHoSo.match(/^\d{3}/)?.[0] || '';
    if (maUser && maHoSo) return maUser === maHoSo;

    const userKey = diaBanUser.toLocaleLowerCase('vi');
    const hoSoKey = diaBanHoSo.toLocaleLowerCase('vi');
    return userKey === hoSoKey || hoSoKey.startsWith(userKey + '_');
}

// Public: formatter trên các trang nhập liệu chỉ cần đọc danh mục đang hoạt động.
app.get("/api/vietnamese-name-map", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, tu_khoa, ten_hien_thi, loai
            FROM vietnamese_name_map
            WHERE trang_thai = 1
            ORDER BY loai ASC, tu_khoa ASC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/admin/vietnamese-name-map", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, tu_khoa, ten_hien_thi, loai, trang_thai, created_at
            FROM vietnamese_name_map
            ORDER BY loai ASC, tu_khoa ASC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/admin/vietnamese-name-map", async (req, res) => {
    try {
        const { tu_khoa, ten_hien_thi, loai = 'word' } = req.body;
        const key = normalizeVietnameseKey(tu_khoa);
        const value = String(ten_hien_thi || '').trim();

        if (!key || !value) {
            return res.status(400).json({ success: false, message: "Từ khóa và tên hiển thị không được để trống." });
        }
        if (!['word', 'fullname'].includes(loai)) {
            return res.status(400).json({ success: false, message: "Loại ánh xạ không hợp lệ." });
        }

        const exists = await pool.query(
            "SELECT id FROM vietnamese_name_map WHERE tu_khoa = $1 AND loai = $2",
            [key, loai]
        );
        if (exists.rows.length) {
            return res.status(409).json({ success: false, message: "Từ khóa này đã tồn tại." });
        }

        const result = await pool.query(`
            INSERT INTO vietnamese_name_map (tu_khoa, ten_hien_thi, loai, trang_thai)
            VALUES ($1, $2, $3, 1)
            RETURNING id
        `, [key, value, loai]);

        await logAction(req.session.user, "Thêm ánh xạ tên tiếng Việt", result.rows[0].id, `${key} → ${value}`);
        res.json({ success: true, message: "Đã thêm ánh xạ tên.", id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/admin/vietnamese-name-map/:id", async (req, res) => {
    try {
        const { tu_khoa, ten_hien_thi, loai = 'word' } = req.body;
        const key = normalizeVietnameseKey(tu_khoa);
        const value = String(ten_hien_thi || '').trim();

        if (!key || !value) {
            return res.status(400).json({ success: false, message: "Từ khóa và tên hiển thị không được để trống." });
        }
        if (!['word', 'fullname'].includes(loai)) {
            return res.status(400).json({ success: false, message: "Loại ánh xạ không hợp lệ." });
        }

        const old = await pool.query("SELECT * FROM vietnamese_name_map WHERE id = $1", [req.params.id]);
        if (!old.rows.length) return res.status(404).json({ success: false, message: "Không tìm thấy ánh xạ." });

        const conflict = await pool.query(
            "SELECT id FROM vietnamese_name_map WHERE tu_khoa = $1 AND loai = $2 AND id <> $3",
            [key, loai, req.params.id]
        );
        if (conflict.rows.length) {
            return res.status(409).json({ success: false, message: "Từ khóa này đã tồn tại." });
        }

        await pool.query(`
            UPDATE vietnamese_name_map
            SET tu_khoa = $1, ten_hien_thi = $2, loai = $3
            WHERE id = $4
        `, [key, value, loai, req.params.id]);

        await logAction(req.session.user, "Sửa ánh xạ tên tiếng Việt", parseInt(req.params.id), `${key} → ${value}`);
        res.json({ success: true, message: "Đã cập nhật ánh xạ tên." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete("/api/admin/vietnamese-name-map/:id", async (req, res) => {
    try {
        const old = await pool.query("SELECT tu_khoa, ten_hien_thi FROM vietnamese_name_map WHERE id = $1", [req.params.id]);
        if (!old.rows.length) return res.status(404).json({ success: false, message: "Không tìm thấy ánh xạ." });

        await pool.query("DELETE FROM vietnamese_name_map WHERE id = $1", [req.params.id]);
        await logAction(req.session.user, "Xóa ánh xạ tên tiếng Việt", parseInt(req.params.id), `${old.rows[0].tu_khoa} → ${old.rows[0].ten_hien_thi}`);
        res.json({ success: true, message: "Đã xóa ánh xạ tên." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== QUẢN LÝ DANH MỤC XÃ (CÓ LOG) ====================
function requireAdmin(req, res) {
    if (!req.session.user || String(req.session.user.role || '').toLowerCase() !== 'admin') {
        res.status(403).json({ success: false, message: 'Chỉ quản trị viên được thực hiện chức năng này.' });
        return false;
    }
    return true;
}


// ============================================================
// GIỚI THIỆU HỆ THỐNG + SAO LƯU / KHÔI PHỤC TOÀN BỘ DỮ LIỆU
// Định dạng NDJSON.GZ: xuất/nhập theo từng dòng, hạn chế dùng RAM.
// Chỉ tài khoản admin được phép thao tác vì file chứa dữ liệu cá nhân
// và thông tin tài khoản của toàn hệ thống.
// ============================================================
function quotePgIdent(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
}

function getBackupTableOrder(tableNames, edges) {
    const names = [...tableNames];
    const incoming = new Map(names.map(name => [name, 0]));
    const children = new Map(names.map(name => [name, []]));
    for (const edge of edges) {
        if (!incoming.has(edge.parent) || !incoming.has(edge.child) || edge.parent === edge.child) continue;
        children.get(edge.parent).push(edge.child);
        incoming.set(edge.child, incoming.get(edge.child) + 1);
    }
    const ready = names.filter(name => incoming.get(name) === 0);
    const ordered = [];
    while (ready.length) {
        const name = ready.shift();
        ordered.push(name);
        for (const child of children.get(name) || []) {
            incoming.set(child, incoming.get(child) - 1);
            if (incoming.get(child) === 0) ready.push(child);
        }
    }
    if (ordered.length !== names.length) {
        throw new Error('CSDL có quan hệ khóa ngoại vòng giữa các bảng; không thể khôi phục an toàn theo thứ tự.');
    }
    return ordered;
}

async function getPublicBackupSchema(client) {
    const tablesResult = await client.query(`
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
          )
        ORDER BY c.relname
    `);
    const tableNames = tablesResult.rows.map(row => row.table_name);
    if (!tableNames.length) throw new Error('Không tìm thấy bảng dữ liệu ứng dụng trong schema public.');

    const columnsResult = await client.query(`
        SELECT table_name, column_name, ordinal_position, data_type, udt_name,
               is_nullable, column_default, is_identity, is_generated
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position
    `, [tableNames]);
    const columnsByTable = new Map(tableNames.map(name => [name, []]));
    for (const col of columnsResult.rows) columnsByTable.get(col.table_name).push({
        name: col.column_name,
        ordinal: Number(col.ordinal_position),
        dataType: col.data_type,
        udtName: col.udt_name,
        nullable: col.is_nullable === 'YES',
        hasDefault: col.column_default !== null,
        identity: col.is_identity === 'YES',
        generated: col.is_generated !== 'NEVER'
    });

    const pkResult = await client.query(`
        SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'
        ORDER BY tc.table_name, kcu.ordinal_position
    `);
    const primaryKeys = new Map(tableNames.map(name => [name, []]));
    for (const row of pkResult.rows) if (primaryKeys.has(row.table_name)) primaryKeys.get(row.table_name).push(row.column_name);

    const fkResult = await client.query(`
        SELECT child.relname AS child_table, parent.relname AS parent_table
        FROM pg_constraint fk
        JOIN pg_class child ON child.oid = fk.conrelid
        JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
        JOIN pg_class parent ON parent.oid = fk.confrelid
        JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
        WHERE fk.contype='f' AND child_ns.nspname='public' AND parent_ns.nspname='public'
          AND child.relname = ANY($1::text[]) AND parent.relname = ANY($1::text[])
    `, [tableNames]);
    const edges = fkResult.rows.map(row => ({ child: row.child_table, parent: row.parent_table }));

    const externalFk = await client.query(`
        SELECT child_ns.nspname AS child_schema, child.relname AS child_table, parent.relname AS parent_table
        FROM pg_constraint fk
        JOIN pg_class child ON child.oid = fk.conrelid
        JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
        JOIN pg_class parent ON parent.oid = fk.confrelid
        JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
        WHERE fk.contype='f' AND parent_ns.nspname='public' AND parent.relname = ANY($1::text[])
          AND NOT (child_ns.nspname='public' AND child.relname = ANY($1::text[]))
    `, [tableNames]);
    if (externalFk.rowCount) throw new Error('Có bảng ngoài schema public tham chiếu dữ liệu ứng dụng; dừng sao lưu/khôi phục để tránh ảnh hưởng dữ liệu ngoài hệ thống.');

    return { tableNames, columnsByTable, primaryKeys, edges };
}

async function* readGzipBackupObjects(filePath) {
    const gunzip = createGunzip();
    const input = fs.createReadStream(filePath);
    input.pipe(gunzip);
    const lines = readline.createInterface({ input: gunzip, crlfDelay: Infinity });
    let totalBytes = 0;
    try {
        for await (const line of lines) {
            totalBytes += Buffer.byteLength(line, 'utf8') + 1;
            if (totalBytes > 300 * 1024 * 1024) throw new Error('File sau giải nén vượt quá 300 MB; từ chối để bảo vệ RAM của Render Free.');
            if (!line.trim()) continue;
            let item;
            try { item = JSON.parse(line); }
            catch { throw new Error('File sao lưu bị lỗi hoặc không đúng định dạng ở một dòng dữ liệu.'); }
            yield item;
        }
    } finally {
        lines.close();
        input.destroy();
        gunzip.destroy();
    }
}

async function validateBackupFile(filePath, client) {
    const current = await getPublicBackupSchema(client);
    const currentByTable = new Map(current.tableNames.map(name => [name, current.columnsByTable.get(name) || []]));
    const headers = new Map();
    const rowCounts = new Map();
    let meta = null;
    let sawEnd = false;
    let sawBhyT = false;
    let afterTables = false;
    let lastTable = null;
    let tableOrder = [];
    let sequences = new Set();

    for await (const item of readGzipBackupObjects(filePath)) {
        if (!meta) {
            if (item.type !== 'meta' || item.format !== 'dansoluonghoa-backup-ndjson' || item.version !== 1) {
                throw new Error('Không nhận diện được file sao lưu của hệ thống hoặc phiên bản không được hỗ trợ.');
            }
            meta = item;
            continue;
        }
        if (sawEnd) throw new Error('File sao lưu có dữ liệu nằm sau dòng kết thúc.');
        if (item.type === 'table') {
            if (afterTables) throw new Error('File sao lưu có cấu trúc bảng nằm sau phần sequence/BHYT.');
            if (!currentByTable.has(item.name)) throw new Error(`Bảng ${item.name} không có trong phiên bản hệ thống hiện tại.`);
            if (headers.has(item.name) || !Array.isArray(item.columns) || !item.columns.length) throw new Error(`Thông tin cấu trúc bảng ${item.name} không hợp lệ.`);
            const backupNames = item.columns.map(col => col.name);
            if (new Set(backupNames).size !== backupNames.length || backupNames.some(name => typeof name !== 'string')) throw new Error(`Danh sách cột của bảng ${item.name} không hợp lệ.`);
            const currentCols = currentByTable.get(item.name);
            const currentColumnMap = new Map(currentCols.map(col => [col.name, col]));
            const currentNames = new Set(currentCols.map(col => col.name));
            const missingRequired = currentCols.filter(col => !backupNames.includes(col.name) && !col.nullable && !col.hasDefault && !col.generated && !col.identity);
            if (missingRequired.length) throw new Error(`File sao lưu thiếu cột bắt buộc của bảng ${item.name}: ${missingRequired.map(c => c.name).join(', ')}.`);
            const mapped = item.columns.map((col, index) => ({
                backupIndex: index,
                name: col.name,
                current: currentNames.has(col.name),
                currentGenerated: currentColumnMap.get(col.name)?.generated === true,
                currentIdentity: currentColumnMap.get(col.name)?.identity === true
            })).filter(col => col.current);
            headers.set(item.name, { columns: item.columns, mapped });
            tableOrder.push(item.name);
            lastTable = item.name;
            rowCounts.set(item.name, 0);
        } else if (item.type === 'row') {
            if (afterTables) throw new Error('File sao lưu có dòng dữ liệu nằm sai vị trí.');
            if (!lastTable || item.table !== lastTable || !headers.has(item.table)) throw new Error('Các dòng dữ liệu trong file sao lưu không đúng thứ tự.');
            if (!Array.isArray(item.values) || item.values.length !== headers.get(item.table).columns.length) throw new Error(`Một dòng trong bảng ${item.table} bị thiếu hoặc thừa cột.`);
            rowCounts.set(item.table, rowCounts.get(item.table) + 1);
        } else if (item.type === 'sequence') {
            afterTables = true;
            if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 250 || sequences.has(item.name)) throw new Error('Thông tin sequence trong file sao lưu không hợp lệ.');
            if (!/^\d+$/.test(String(item.lastValue)) || typeof item.isCalled !== 'boolean') throw new Error(`Giá trị sequence ${item.name} không hợp lệ.`);
            sequences.add(item.name);
        } else if (item.type === 'bhyt') {
            afterTables = true;
            if (sawBhyT || typeof item.base64 !== 'string') throw new Error('Dữ liệu file BHYT trong bản sao lưu không hợp lệ.');
            const bytes = Buffer.from(item.base64, 'base64');
            if (bytes.length < 16 || bytes.subarray(0, 16).toString('binary') !== 'SQLite format 3\0') throw new Error('File BHYT trong bản sao lưu không phải SQLite hợp lệ.');
            sawBhyT = true;
        } else if (item.type === 'end') {
            if (!item.rowCounts || typeof item.rowCounts !== 'object') throw new Error('Thiếu thống kê kết thúc bản sao lưu.');
            for (const [name, count] of Object.entries(item.rowCounts)) {
                if (!rowCounts.has(name) || Number(count) !== rowCounts.get(name)) throw new Error(`Số dòng kiểm tra của bảng ${name} không khớp.`);
            }
            if (Object.keys(item.rowCounts).length !== rowCounts.size) throw new Error('Bản sao lưu thiếu thống kê của một số bảng.');
            sawEnd = true;
        } else {
            throw new Error('File sao lưu chứa loại dữ liệu không được hỗ trợ.');
        }
    }

    if (!meta || !sawEnd) throw new Error('File sao lưu chưa hoàn chỉnh hoặc thiếu dòng kết thúc.');
    if (!Array.isArray(meta.tableNames) || meta.tableNames.length !== tableOrder.length || meta.tableNames.join('|') !== tableOrder.join('|')) {
        throw new Error('Danh sách bảng trong phần đầu file sao lưu không khớp dữ liệu thực tế.');
    }
    const missingTables = current.tableNames.filter(name => !headers.has(name));
    if (missingTables.length) {
        // Cho phép khôi phục bản sao lưu cũ sang phiên bản mới: bảng mới sẽ được để trống.
        // Nhưng phải chắc chắn bảng mới không phải cha của bảng cũ có FK tham chiếu ngược.
        for (const edge of current.edges) {
            if (headers.has(edge.child) && !headers.has(edge.parent)) {
                throw new Error(`Không thể khôi phục: bảng ${edge.child} cần bảng ${edge.parent} nhưng file sao lưu không có bảng này.`);
            }
        }
    }
    getBackupTableOrder(tableOrder, current.edges.filter(edge => headers.has(edge.parent) && headers.has(edge.child))); // kiểm tra khóa ngoại vòng
    const positions = new Map(tableOrder.map((name, index) => [name, index]));
    for (const edge of current.edges) {
        if (positions.has(edge.parent) && positions.has(edge.child) && positions.get(edge.parent) > positions.get(edge.child)) {
            throw new Error(`Thứ tự bảng trong file sao lưu không an toàn: ${edge.parent} phải được nạp trước ${edge.child}.`);
        }
    }
    return { current, headers, tableOrder, sawBhyT };
}

async function insertBackupBatch(client, tableName, header, rows) {
    if (!rows.length) return;
    const columns = header.mapped.filter(col => !col.currentGenerated);
    if (!columns.length) return;
    const colSql = columns.map(col => quotePgIdent(col.name)).join(', ');
    const params = [];
    const valuesSql = rows.map(row => {
        const tuple = columns.map(col => {
            let value = row[col.backupIndex];
            if (value && typeof value === 'object' && value.$backupType === 'Buffer' && typeof value.base64 === 'string') value = Buffer.from(value.base64, 'base64');
            params.push(value);
            return `$${params.length}`;
        });
        return `(${tuple.join(', ')})`;
    }).join(', ');
    const hasIdentity = columns.some(col => col.currentIdentity);
    const override = hasIdentity ? ' OVERRIDING SYSTEM VALUE' : '';
    await client.query(`INSERT INTO public.${quotePgIdent(tableName)} (${colSql})${override} VALUES ${valuesSql}`, params);
}

// Lấy thông tin giới thiệu động từ xã mặc định và danh mục cơ sở y tế.
app.get('/api/admin/gioi-thieu', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
        const [xa, yte] = await Promise.all([
            pool.query(`SELECT ten_xa, ten_tinh, ma_xa_phuong, ten_tram_y_te FROM danh_sach_xa WHERE trang_thai=1 AND la_mac_dinh=TRUE LIMIT 1`),
            pool.query(`SELECT ten_benh_vien, dia_chi FROM danh_sach_benh_vien WHERE trang_thai=1 ORDER BY id ASC LIMIT 20`)
        ]);
        res.json({ success: true, xa: xa.rows[0] || null, coSoYTe: yte.rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Tải bản sao lưu gzip theo luồng, phân trang 500 dòng/batch để giảm RAM.
app.get('/api/admin/backup/download', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    let client;
    let transactionOpen = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        transactionOpen = true;
        const schema = await getPublicBackupSchema(client);
        const tableOrder = getBackupTableOrder(schema.tableNames, schema.edges);
        const filename = `sao-luu-dan-so-${new Date().toISOString().slice(0, 10)}.jsonl.gz`;
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');

        const generator = async function* () {
            const rowCounts = {};
            yield JSON.stringify({ type: 'meta', format: 'dansoluonghoa-backup-ndjson', version: 1, createdAt: new Date().toISOString(), createdBy: req.session.user.username, database: 'public', tableNames: tableOrder }) + '\n';
            for (const tableName of tableOrder) {
                const cols = schema.columnsByTable.get(tableName) || [];
                const pk = schema.primaryKeys.get(tableName) || [];
                yield JSON.stringify({ type: 'table', name: tableName, columns: cols }) + '\n';
                const orderSql = pk.length ? ` ORDER BY ${pk.map(quotePgIdent).join(', ')}` : ' ORDER BY ctid';
                let offset = 0;
                let count = 0;
                while (true) {
                    const batch = await client.query(`SELECT * FROM public.${quotePgIdent(tableName)}${orderSql} LIMIT 500 OFFSET $1`, [offset]);
                    if (!batch.rows.length) break;
                    for (const row of batch.rows) {
                        const values = cols.map(col => {
                            let value = row[col.name];
                            if (Buffer.isBuffer(value)) return { $backupType: 'Buffer', base64: value.toString('base64') };
                            return value === undefined ? null : value;
                        });
                        yield JSON.stringify({ type: 'row', table: tableName, values }) + '\n';
                        count++;
                    }
                    offset += batch.rows.length;
                    if (batch.rows.length < 500) break;
                }
                rowCounts[tableName] = count;
            }
            const seqResult = await client.query(`
                SELECT c.relname AS sequence_name
                FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relkind='S'
                ORDER BY c.relname
            `);
            for (const seq of seqResult.rows) {
                const state = await client.query(`SELECT last_value::text AS last_value, is_called FROM public.${quotePgIdent(seq.sequence_name)}`);
                yield JSON.stringify({ type: 'sequence', name: seq.sequence_name, lastValue: state.rows[0].last_value, isCalled: state.rows[0].is_called }) + '\n';
            }
            if (fs.existsSync(bhytDbPath)) {
                // File tham chiếu BHYT cũng được mang theo để bản sao lưu thực sự đầy đủ.
                const bhytBytes = fs.readFileSync(bhytDbPath);
                yield JSON.stringify({ type: 'bhyt', base64: bhytBytes.toString('base64') }) + '\n';
            }
            yield JSON.stringify({ type: 'end', rowCounts }) + '\n';
            await client.query('COMMIT');
            transactionOpen = false;
        };
        await pipeline(Readable.from(generator()), createGzip({ level: 6 }), res);
    } catch (err) {
        if (transactionOpen) { try { await client.query('ROLLBACK'); } catch {} }
        console.error('Lỗi sao lưu dữ liệu:', err);
        if (!res.headersSent) res.status(500).json({ success: false, message: err.message || 'Không thể tạo file sao lưu.' });
        else res.destroy(err);
    } finally {
        if (client) client.release();
    }
});

// Multer lỗi được trả JSON rõ ràng; file nhập được xử lý trực tiếp trên ổ tạm.
app.post('/api/admin/backup/restore', (req, res, next) => {
    if (!requireAdmin(req, res)) return;
    backupUpload.single('backup')(req, res, err => {
        if (err) return res.status(400).json({ success: false, message: err.message || 'Không tải được file sao lưu.' });
        next();
    });
}, async (req, res) => {
    if (!requireAdmin(req, res)) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return;
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file sao lưu .gz.' });
    const backupPath = req.file.path;
    let client;
    let transactionOpen = false;
    let tempBhytPath = null;
    let oldBhytPath = null;
    try {
        client = await pool.connect();
        const validation = await validateBackupFile(backupPath, client);
        const currentSchema = validation.current;
        const currentNames = currentSchema.tableNames;
        const allTableSql = currentNames.map(name => `public.${quotePgIdent(name)}`).join(', ');

        // Giải nén file BHYT vào file tạm riêng, chỉ thay file đang dùng sau khi DB commit thành công.
        if (validation.sawBhyT) {
            for await (const item of readGzipBackupObjects(backupPath)) {
                if (item.type === 'bhyt') {
                    const bytes = Buffer.from(item.base64, 'base64');
                    tempBhytPath = `${bhytDbPath}.restore-${Date.now()}`;
                    fs.writeFileSync(tempBhytPath, bytes, { mode: 0o600 });
                    const checkDb = new DatabaseSync(tempBhytPath, { readOnly: true });
                    try {
                        const checkResult = checkDb.prepare('PRAGMA quick_check').get();
                        if (!checkResult || Object.values(checkResult)[0] !== 'ok') throw new Error('File BHYT trong bản sao lưu bị lỗi dữ liệu.');
                    } finally { checkDb.close(); }
                    break;
                }
            }
        }

        await client.query('BEGIN');
        transactionOpen = true;
        await client.query(`LOCK TABLE ${allTableSql} IN ACCESS EXCLUSIVE MODE`);
        await client.query(`TRUNCATE TABLE ${allTableSql} RESTART IDENTITY CASCADE`);

        const tableHeaders = new Map();
        let activeTable = null;
        let pendingRows = [];
        const flush = async () => {
            if (activeTable && pendingRows.length) {
                await insertBackupBatch(client, activeTable, tableHeaders.get(activeTable), pendingRows);
                pendingRows = [];
            }
        };
        const sequenceStates = [];
        for await (const item of readGzipBackupObjects(backupPath)) {
            if (item.type === 'table') {
                await flush();
                activeTable = item.name;
                const currentCols = currentSchema.columnsByTable.get(activeTable) || [];
                const currentColumnMap = new Map(currentCols.map(col => [col.name, col]));
                const currentNamesSet = new Set(currentCols.map(col => col.name));
                const mapped = item.columns.map((col, index) => ({
                    backupIndex: index,
                    name: col.name,
                    current: currentNamesSet.has(col.name),
                    currentGenerated: currentColumnMap.get(col.name)?.generated === true,
                    currentIdentity: currentColumnMap.get(col.name)?.identity === true
                })).filter(col => col.current);
                tableHeaders.set(activeTable, { columns: item.columns, mapped });
            } else if (item.type === 'row') {
                pendingRows.push(item.values);
                if (pendingRows.length >= 150) await flush();
            } else if (item.type === 'sequence') {
                sequenceStates.push(item);
            }
        }
        await flush();

        // Đưa bộ đếm ID về đúng vị trí trong bản sao lưu.
        const currentSequences = await client.query(`
            SELECT c.relname AS sequence_name
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind='S'
        `);
        const sequenceNames = new Set(currentSequences.rows.map(row => row.sequence_name));
        for (const seq of sequenceStates) {
            if (!sequenceNames.has(seq.name)) continue;
            await client.query('SELECT setval($1::regclass, $2::bigint, $3::boolean)', [`public.${quotePgIdent(seq.name)}`, String(seq.lastValue), seq.isCalled]);
        }
        await client.query('COMMIT');
        transactionOpen = false;

        if (tempBhytPath) {
            if (bhytDb) { try { bhytDb.close(); } catch {} bhytDb = null; }
            if (fs.existsSync(bhytDbPath)) {
                oldBhytPath = `${bhytDbPath}.before-restore-${Date.now()}`;
                fs.renameSync(bhytDbPath, oldBhytPath);
            }
            try {
                fs.renameSync(tempBhytPath, bhytDbPath);
                tempBhytPath = null;
                if (fs.existsSync(oldBhytPath || '')) fs.unlinkSync(oldBhytPath);
                oldBhytPath = null;
                bhytDb = new DatabaseSync(bhytDbPath, { readOnly: true });
            } catch (fileErr) {
                if (oldBhytPath && fs.existsSync(oldBhytPath)) fs.renameSync(oldBhytPath, bhytDbPath);
                if (fs.existsSync(bhytDbPath)) bhytDb = new DatabaseSync(bhytDbPath, { readOnly: true });
                throw new Error(`Dữ liệu PostgreSQL đã khôi phục nhưng không thay được file BHYT: ${fileErr.message}`);
            }
        }
        await logAction(req.session.user, 'Khôi phục toàn bộ dữ liệu từ file sao lưu', null, req.file.originalname);
        res.json({ success: true, message: 'Khôi phục dữ liệu thành công. Hệ thống đã thay dữ liệu hiện tại bằng dữ liệu trong file sao lưu. Vui lòng tải lại trang.' });
    } catch (err) {
        if (transactionOpen) { try { await client.query('ROLLBACK'); } catch {} }
        console.error('Lỗi khôi phục dữ liệu:', err);
        res.status(400).json({ success: false, message: err.message || 'Không thể khôi phục file sao lưu.' });
    } finally {
        if (client) client.release();
        if (tempBhytPath && fs.existsSync(tempBhytPath)) { try { fs.unlinkSync(tempBhytPath); } catch {} }
        if (fs.existsSync(backupPath)) { try { fs.unlinkSync(backupPath); } catch {} }
    }
});

app.get('/api/admin/xa', async (req, res) => {
    if (!req.session.user || !['admin', 'lãnh đạo'].includes(String(req.session.user.role || '').toLowerCase())) {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập.' });
    }
    try {
        const result = await pool.query(`
            SELECT id, ten_xa, ten_tinh, ma_xa_phuong, ten_tram_y_te, trang_thai, la_mac_dinh
            FROM danh_sach_xa ORDER BY la_mac_dinh DESC, ten_xa ASC, id ASC
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/admin/xa', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const tenXa = String(req.body.ten_xa || '').trim();
    const tenTinh = String(req.body.ten_tinh || '').trim();
    const maXa = String(req.body.ma_xa_phuong || '').trim();
    const tenTram = String(req.body.ten_tram_y_te || '').trim();
    if (!tenXa || !tenTinh) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên xã và tỉnh/thành phố.' });
    try {
        const count = await pool.query('SELECT COUNT(*)::int AS total FROM danh_sach_xa WHERE trang_thai=1 AND la_mac_dinh=TRUE');
        const setDefault = Number(count.rows[0]?.total || 0) === 0;
        const result = await pool.query(`
            INSERT INTO danh_sach_xa (ten_xa, ten_tinh, ma_xa_phuong, ten_tram_y_te, trang_thai, la_mac_dinh)
            VALUES ($1,$2,$3,$4,1,$5) RETURNING id
        `, [tenXa, tenTinh, maXa || null, tenTram || null, setDefault]);
        if (setDefault) {
            await pool.query('UPDATE users SET xa=$1', [tenXa]);
            await syncCommuneClinicToCatalog({ ten_xa: tenXa, ten_tinh: tenTinh, ten_tram_y_te: tenTram });
        }
        await logAction(req.session.user, 'Thêm danh mục xã', result.rows[0].id, `${tenXa}, ${tenTinh}`);
        res.json({ success: true, message: setDefault ? 'Đã thêm xã và đặt làm xã đang sử dụng.' : 'Đã thêm xã thành công.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/xa/:id', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    const tenXa = String(req.body.ten_xa || '').trim();
    const tenTinh = String(req.body.ten_tinh || '').trim();
    const maXa = String(req.body.ma_xa_phuong || '').trim();
    const tenTram = String(req.body.ten_tram_y_te || '').trim();
    if (!Number.isInteger(id) || id < 1 || !tenXa || !tenTinh) return res.status(400).json({ success: false, message: 'Thông tin xã không hợp lệ hoặc còn thiếu.' });
    try {
        const result = await pool.query(`
            UPDATE danh_sach_xa SET ten_xa=$1, ten_tinh=$2, ma_xa_phuong=$3, ten_tram_y_te=$4, updated_at=CURRENT_TIMESTAMP
            WHERE id=$5 RETURNING id, ten_xa, ten_tinh, ten_tram_y_te, la_mac_dinh
        `, [tenXa, tenTinh, maXa || null, tenTram || null, id]);
        if (!result.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy xã cần sửa.' });
        if (result.rows[0].la_mac_dinh) {
            await pool.query('UPDATE users SET xa=$1', [tenXa]);
            await syncCommuneClinicToCatalog(result.rows[0]);
        }
        await logAction(req.session.user, 'Cập nhật danh mục xã', id, `${tenXa}, ${tenTinh}`);
        res.json({ success: true, message: 'Cập nhật thông tin xã thành công.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/admin/xa/:id/mac-dinh', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'ID xã không hợp lệ.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const target = await client.query('SELECT id, ten_xa, ten_tinh, ten_tram_y_te FROM danh_sach_xa WHERE id=$1 AND trang_thai=1 FOR UPDATE', [id]);
        if (!target.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Không tìm thấy xã đang hoạt động.' }); }
        await client.query('UPDATE danh_sach_xa SET la_mac_dinh=FALSE, updated_at=CURRENT_TIMESTAMP WHERE la_mac_dinh=TRUE');
        await client.query('UPDATE danh_sach_xa SET la_mac_dinh=TRUE, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
        await client.query('UPDATE users SET xa=$1', [target.rows[0].ten_xa]);
        await client.query('COMMIT');
        await syncCommuneClinicToCatalog(target.rows[0]);
        await logAction(req.session.user, 'Đổi xã đang sử dụng', id, `${target.rows[0].ten_xa}, ${target.rows[0].ten_tinh}`);
        res.json({ success: true, message: `Đã chọn ${target.rows[0].ten_xa} (${target.rows[0].ten_tinh}) làm xã đang sử dụng. Tải lại trang để cập nhật toàn hệ thống.` });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        res.status(500).json({ success: false, message: err.message });
    } finally { client.release(); }
});

app.delete('/api/admin/xa/:id', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'ID xã không hợp lệ.' });
    try {
        const record = await pool.query('SELECT id, ten_xa, la_mac_dinh FROM danh_sach_xa WHERE id=$1', [id]);
        if (!record.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy xã cần xóa.' });
        if (record.rows[0].la_mac_dinh) return res.status(409).json({ success: false, message: 'Không thể xóa xã đang sử dụng. Hãy chọn xã khác làm mặc định trước.' });
        await pool.query('DELETE FROM danh_sach_xa WHERE id=$1', [id]);
        await logAction(req.session.user, 'Xóa danh mục xã', id, record.rows[0].ten_xa);
        res.json({ success: true, message: 'Đã xóa xã.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== QUẢN LÝ DANH MỤC ẤP (CÓ LOG) ====================
app.get("/api/admin/ap", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM danh_sach_ap ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/admin/ap", async (req, res) => {
    try {
        let { ten_ap } = req.body;
        const insertRes = await pool.query("INSERT INTO danh_sach_ap (ten_ap, trang_thai) VALUES ($1, 1) RETURNING id", [ten_ap]);
        await logAction(req.session.user, "Thêm danh mục Ấp mới", insertRes.rows[0].id, ten_ap);
        res.json({ success: true, message: "Thêm ấp thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete("/api/admin/ap/:id", async (req, res) => {
    try {
        let record = await pool.query("SELECT ten_ap FROM danh_sach_ap WHERE id = $1", [req.params.id]);
        let tenAp = record.rows[0] ? record.rows[0].ten_ap : '';
        await pool.query("DELETE FROM danh_sach_ap WHERE id = $1", [req.params.id]);
        await logAction(req.session.user, "Xóa danh mục Ấp", parseInt(req.params.id), tenAp);
        res.json({ success: true, message: "Xóa ấp thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== QUẢN LÝ DANH MỤC BỆNH VIỆN (CÓ LOG) ====================
app.get("/api/admin/benh-vien", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM danh_sach_benh_vien ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/admin/benh-vien", async (req, res) => {
    try {
        let { ten_benh_vien, dia_chi } = req.body;
        const insertRes = await pool.query("INSERT INTO danh_sach_benh_vien (ten_benh_vien, dia_chi, trang_thai) VALUES ($1, $2, 1) RETURNING id", [ten_benh_vien, dia_chi]);
        await logAction(req.session.user, "Thêm danh mục Bệnh viện", insertRes.rows[0].id, ten_benh_vien);
        res.json({ success: true, message: "Thêm bệnh viện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete("/api/admin/benh-vien/:id", async (req, res) => {
    try {
        let record = await pool.query("SELECT ten_benh_vien FROM danh_sach_benh_vien WHERE id = $1", [req.params.id]);
        let tenBv = record.rows[0] ? record.rows[0].ten_benh_vien : '';
        await pool.query("DELETE FROM danh_sach_benh_vien WHERE id = $1", [req.params.id]);
        await logAction(req.session.user, "Xóa danh mục Bệnh viện", parseInt(req.params.id), tenBv);
        res.json({ success: true, message: "Xóa bệnh viện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== QUẢN LÝ NHẬT KÝ (LOGS) & XÓA LỊCH SỬ ====================
app.get("/api/admin/logs", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM logs ORDER BY id DESC LIMIT 200");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// API Xóa toàn bộ lịch sử nhật ký hệ thống
app.delete("/api/admin/logs", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Không có quyền thực hiện" });
    }
    try {
        await pool.query("DELETE FROM logs");
        await logAction(req.session.user, "Đã xóa toàn bộ lịch sử nhật ký hệ thống", null, "Xóa sạch logs");
        res.json({ success: true, message: "Đã xóa toàn bộ lịch sử nhật ký thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// ==================== SỬA LẠI API XÓA 1 DÒNG NHẬT KÝ THEO ID ====================
app.delete("/api/admin/logs/:id", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Không có quyền thực hiện" });
    }
    try {
        const logId = req.params.id;
        
        // Sửa lại dùng $1 thay vì ? và nhận kết quả chuẩn của pg (dùng rowCount)
        const result = await pool.query("DELETE FROM logs WHERE id = $1", [logId]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy dòng nhật ký này" });
        }

        await logAction(req.session.user, `Đã xóa nhật ký ID: ${logId}`, null, "Xóa 1 log");
        res.json({ success: true, message: `Đã xóa nhật ký ID ${logId} thành công!` });
    } catch (err) {
        console.error('Lỗi khi xóa log:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});
// ==================== QUẢN LÝ DANH MỤC BPTT (CÓ LOG) ====================
app.get("/api/admin/bptt", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM danh_sach_bptt ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/admin/bptt", async (req, res) => {
    try {
        let { ma_bptt, ten_bptt } = req.body;
        const insertRes = await pool.query("INSERT INTO danh_sach_bptt (ma_bptt, ten_bptt, trang_thai) VALUES ($1, $2, 1) RETURNING id", [ma_bptt, ten_bptt]);
        await logAction(req.session.user, "Thêm danh mục BPTT", insertRes.rows[0].id, ten_bptt);
        res.json({ success: true, message: "Thêm BPTT thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put("/api/admin/bptt/:id", async (req, res) => {
    try {
        let { ma_bptt, ten_bptt } = req.body;
        await pool.query("UPDATE danh_sach_bptt SET ma_bptt = $1, ten_bptt = $2 WHERE id = $3", [ma_bptt, ten_bptt, req.params.id]);
        await logAction(req.session.user, "Cập nhật danh mục BPTT", parseInt(req.params.id), ten_bptt);
        res.json({ success: true, message: "Cập nhật BPTT thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete("/api/admin/bptt/:id", async (req, res) => {
    try {
        let record = await pool.query("SELECT ten_bptt FROM danh_sach_bptt WHERE id = $1", [req.params.id]);
        let tenBptt = record.rows[0] ? record.rows[0].ten_bptt : '';
        await pool.query("DELETE FROM danh_sach_bptt WHERE id = $1", [req.params.id]);
        await logAction(req.session.user, "Xóa danh mục BPTT", parseInt(req.params.id), tenBptt);
        res.json({ success: true, message: "Xóa BPTT thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== QUẢN LÝ DANH MỤC NƠI THỰC HIỆN (CÓ LOG) ====================
app.get("/api/admin/noi-thuc-hien", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM danh_sach_noi_thuc_hien ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/admin/noi-thuc-hien", async (req, res) => {
    try {
        let { ten_noi_thuc_hien } = req.body;
        const insertRes = await pool.query("INSERT INTO danh_sach_noi_thuc_hien (ten_noi_thuc_hien, trang_thai) VALUES ($1, 1) RETURNING id", [ten_noi_thuc_hien]);
        await logAction(req.session.user, "Thêm danh mục Nơi thực hiện", insertRes.rows[0].id, ten_noi_thuc_hien);
        res.json({ success: true, message: "Thêm nơi thực hiện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put("/api/admin/noi-thuc-hien/:id", async (req, res) => {
    try {
        let { ten_noi_thuc_hien } = req.body;
        await pool.query("UPDATE danh_sach_noi_thuc_hien SET ten_noi_thuc_hien = $1 WHERE id = $2", [ten_noi_thuc_hien, req.params.id]);
        await logAction(req.session.user, "Cập nhật danh mục Nơi thực hiện", parseInt(req.params.id), ten_noi_thuc_hien);
        res.json({ success: true, message: "Cập nhật nơi thực hiện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete("/api/admin/noi-thuc-hien/:id", async (req, res) => {
    try {
        let record = await pool.query("SELECT ten_noi_thuc_hien FROM danh_sach_noi_thuc_hien WHERE id = $1", [req.params.id]);
        let tenNth = record.rows[0] ? record.rows[0].ten_noi_thuc_hien : '';
        await pool.query("DELETE FROM danh_sach_noi_thuc_hien WHERE id = $1", [req.params.id]);
        await logAction(req.session.user, "Xóa danh mục Nơi thực hiện", parseInt(req.params.id), tenNth);
        res.json({ success: true, message: "Xóa nơi thực hiện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== QUẢN LÝ DANH MỤC QUAN HỆ VỚI CHỦ HỘ (CÓ LOG) ====================
app.get('/api/danh-sach-quan-he', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM danh_sach_quan_he WHERE trang_thai = 1 ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        console.error("Lỗi lấy danh sách quan hệ:", err);
        res.status(500).json({ error: "Lỗi Server" });
    }
});

app.post('/api/danh-sach-quan-he', async (req, res) => {
    try {
        const { ten_quan_he } = req.body;
        if (!ten_quan_he || ten_quan_he.trim() === "") {
            return res.status(400).json({ success: false, message: "Tên quan hệ không được để trống!" });
        }

        const newRecord = await pool.query(
            "INSERT INTO danh_sach_quan_he (ten_quan_he, trang_thai) VALUES ($1, 1) RETURNING *",
            [ten_quan_he.trim()]
        );
        await logAction(req.session.user, "Thêm danh mục Quan hệ", newRecord.rows[0].id, ten_quan_he.trim());
        res.json({ success: true, data: newRecord.rows[0] });
    } catch (err) {
        console.error("Lỗi thêm quan hệ:", err);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
});

app.put('/api/danh-sach-quan-he/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_quan_he } = req.body;

        if (!ten_quan_he || ten_quan_he.trim() === "") {
            return res.status(400).json({ success: false, message: "Tên quan hệ không được để trống!" });
        }

        const updateRecord = await pool.query(
            "UPDATE danh_sach_quan_he SET ten_quan_he = $1 WHERE id = $2 RETURNING *",
            [ten_quan_he.trim(), id]
        );

        if (updateRecord.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy quan hệ cần sửa!" });
        }

        await logAction(req.session.user, "Cập nhật danh mục Quan hệ", parseInt(id), ten_quan_he.trim());
        res.json({ success: true, data: updateRecord.rows[0] });
    } catch (err) {
        console.error("Lỗi cập nhật quan hệ:", err);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
});

app.delete('/api/danh-sach-quan-he/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let record = await pool.query("SELECT ten_quan_he FROM danh_sach_quan_he WHERE id = $1", [id]);
        let tenQh = record.rows[0] ? record.rows[0].ten_quan_he : '';

        const deleteRecord = await pool.query(
            "UPDATE danh_sach_quan_he SET trang_thai = 0 WHERE id = $1 RETURNING *",
            [id]
        );

        if (deleteRecord.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy quan hệ cần xóa!" });
        }

        await logAction(req.session.user, "Xóa danh mục Quan hệ", parseInt(id), tenQh);
        res.json({ success: true, message: "Đã xóa thành công!" });
    } catch (err) {
        console.error("Lỗi xóa quan hệ:", err);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
});

// ==================== QUẢN TRỊ NGƯỜI DÙNG / TÀI KHOẢN (CÓ LOG) ====================
app.get("/api/admin/users", async (req, res) => {
    if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'lãnh đạo')) {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    try {
        const commune = await getActiveCommune();
        const result = await pool.query("SELECT id, fullname, username, role, diabanh, ap, COALESCE(NULLIF($1,''), NULLIF(xa,''), '') AS xa, active, created_at FROM users ORDER BY id ASC", [commune?.ten_xa || '']);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/admin/users", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    const { fullname, username, password, role, diabanh, ap, xa, admin_password } = req.body;
    const activeCommune = await getActiveCommune();
    const xaToSave = activeCommune?.ten_xa || xa || '';

    if (admin_password !== 'admin123') {
        return res.status(400).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
    }

    try {
        const insertRes = await pool.query(
            `INSERT INTO users (fullname, username, password, role, diabanh, ap, xa, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8) RETURNING id`,
            [fullname, username, password, role, diabanh, ap, xaToSave, getVietnamTimestamp()]
        );
        await logAction(req.session.user, "Thêm tài khoản người dùng mới", insertRes.rows[0].id, `${fullname} (${username})`);
        res.json({ success: true, message: "Thêm người dùng thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/admin/users/:id", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    const userId = req.params.id;
    const { fullname, username, password, role, diabanh, ap, xa, admin_password } = req.body;
    const activeCommune = await getActiveCommune();
    const xaToSave = activeCommune?.ten_xa || xa || '';

    if (admin_password !== 'admin123') {
        return res.status(400).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
    }

    try {
        if (password) {
            await pool.query(
                `UPDATE users SET fullname = $1, username = $2, password = $3, role = $4, diabanh = $5, ap = $6, xa = $7 WHERE id = $8`,
                [fullname, username, password, role, diabanh, ap, xaToSave, userId]
            );
        } else {
            await pool.query(
                `UPDATE users SET fullname = $1, username = $2, role = $3, diabanh = $4, ap = $5, xa = $6 WHERE id = $7`,
                [fullname, username, role, diabanh, ap, xaToSave, userId]
            );
        }
        await logAction(req.session.user, "Cập nhật thông tin tài khoản", parseInt(userId), `${fullname} (${username})`);
        res.json({ success: true, message: "Cập nhật thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/admin/users/:id/toggle", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Not allowed" });
    }
    const userId = req.params.id;
    const { admin_password } = req.body;

    if (admin_password !== 'admin123') {
        return res.status(400).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
    }

    try {
        const userRes = await pool.query("SELECT username, fullname, active FROM users WHERE id = $1", [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });

        const targetUser = userRes.rows[0];
        const newActive = targetUser.active === 1 ? 0 : 1;
        await pool.query("UPDATE users SET active = $1 WHERE id = $2", [newActive, userId]);
        
        await logAction(req.session.user, `Đổi trạng thái tài khoản (${newActive === 1 ? 'Mở khóa' : 'Khóa'})`, parseInt(userId), `${targetUser.fullname} (${targetUser.username})`);
        res.json({ success: true, message: "Đổi trạng thái thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    const userId = req.params.id;
    const { admin_password } = req.body;

    if (admin_password !== 'admin123') {
        return res.status(400).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
    }

    try {
        let userRes = await pool.query("SELECT username, fullname FROM users WHERE id = $1", [userId]);
        let targetUser = userRes.rows[0] ? `${userRes.rows[0].fullname} (${userRes.rows[0].username})` : '';

        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        await logAction(req.session.user, "Xóa tài khoản người dùng", parseInt(userId), targetUser);

        res.json({ success: true, message: 'Xóa tài khoản thành công!' });
    } catch (error) {
        console.error('Lỗi khi xóa tài khoản:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa tài khoản!' });
    }
});


// ============================================================
// DANH SÁCH DÂN CƯ GỐC: nhập Excel và tra cứu trạng thái
// Chỉ admin/lãnh đạo được nhập; dữ liệu được upsert theo mã hộ + họ tên + ngày sinh.
// ============================================================
app.get('/api/admin/import-dan-cu/progress', (req, res) => {
    if (!req.session.user || !['admin', 'lãnh đạo'].includes(String(req.session.user.role || '').toLowerCase())) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xem tiến độ nhập.' });
    }
    const p = danCuImportProgress.get(req.sessionID);
    return res.json(p || { running: false, percent: 0, stage: 'Chưa có lượt nhập.' });
});

app.post('/api/admin/import-dan-cu', upload.single('excel'), async (req, res) => {
    const progressKey = req.sessionID;
    if (!req.session.user || !['admin', 'lãnh đạo'].includes(String(req.session.user.role || '').toLowerCase())) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ success: false, message: 'Bạn không có quyền nhập danh sách dân cư.' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel.' });
    if (danCuImportProgress.get(progressKey)?.running) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(409).json({ success: false, message: 'Phiên này đang có lượt nhập dân cư chạy.' });
    }
    const client = await pool.connect();
    danCuImportProgress.set(progressKey, { running: true, percent: 1, stage: 'Đang đọc file Excel…' });
    try {
        // Đọc từ file tạm của Multer, không nạp buffer upload vào RAM lần thứ hai.
        const workbook = XLSX.readFile(req.file.path, { cellDates: true, dense: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const headerIndex = rows.findIndex(row => row.some(v => String(v || '').trim().toLowerCase() === 'họ tên'));
        if (headerIndex < 0) return res.status(400).json({ success: false, message: 'Không tìm thấy cột “Họ tên” trong Excel.' });
        const headers = rows[headerIndex].map(v => String(v || '').trim().toLowerCase());
        const findCol = (...names) => headers.findIndex(h => names.some(n => h === n));
        const col = {
            name: findCol('họ tên'), relation: findCol('quan hệ'), sex: findCol('giới tính'), birth: findCol('ngày sinh'),
            ethnicity: findCol('dân tộc'), education: findCol('tđ học vấn', 'trình độ học vấn'), marital: findCol('tt hôn nhân', 'tình trạng hôn nhân'),
            residency: findCol('tt cư trú', 'tình trạng cư trú'), householdId: findCol('household_id'), bhyt: findCol('mã bhyt', 'số thẻ bhyt', 'mã thẻ bhyt'),
            address: findCol('địa chỉ'), maHo: findCol('số hộ'), maXaPhuong: findCol('mã xã/phường'),
            cccd: findCol('cccd', 'số cccd', 'số căn cước', 'số căn cước công dân'),
            ngayCapCccd: findCol('ngày cấp cccd', 'ngày cấp căn cước', 'ngày cấp căn cước công dân', 'ngày cấp')
        };
        if (col.name < 0 || col.maHo < 0) return res.status(400).json({ success: false, message: 'Excel cần có ít nhất cột Họ tên và Số hộ.' });
        const norm = v => v === null || v === undefined ? '' : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
        const cell = (row, index) => index < 0 ? '' : norm(row[index]);
        const staged = [];
        let skipped = 0;
        // Lọc/chuẩn hóa trước; giữ file và dữ liệu làm việc ở mức cần thiết.
        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const name = cell(row, col.name), maHo = cell(row, col.maHo);
            if (!name || !maHo || name.toLowerCase() === 'null') { skipped++; continue; }
            const birth = cell(row, col.birth), residency = cell(row, col.residency), marital = cell(row, col.marital);
            const statusText = `${residency} ${cell(row, col.place)}`.toLowerCase();
            let status = 'DANG_CU_TRU';
            if (statusText.includes('chuyển đi') || statusText.includes('đã chuyển')) status = 'DA_CHUYEN_DI';
            else if (statusText.includes('khai tử') || statusText.includes('đã chết') || statusText.includes('qua đời')) status = 'DA_KHAI_TU';
            const diaBan = cell(row, col.address);
            const maXaPhuong = cell(row, col.maXaPhuong);
            staged.push([name, maHo, cell(row, col.householdId), cell(row, col.relation), cell(row, col.sex), birth,
                cell(row, col.ethnicity), cell(row, col.education), marital, residency, cell(row, col.bhyt), diaBan, diaBan, maXaPhuong, status, cell(row, col.cccd), cell(row, col.ngayCapCccd)]);
        }
        if (!staged.length) return res.status(400).json({ success: false, message: 'Không có dòng hợp lệ để nhập.' });
        danCuImportProgress.set(progressKey, { running: true, percent: 3, stage: `Đã đọc ${staged.length.toLocaleString('vi-VN')} dòng hợp lệ. Đang chuẩn bị nhập…`, total: staged.length, processed: 0 });
        await client.query('BEGIN');
        await client.query(`CREATE TEMP TABLE tmp_import_dan_cu (
            ho_ten TEXT, ma_ho TEXT, household_id TEXT, quan_he TEXT, gioi_tinh TEXT, ngay_sinh TEXT,
            dan_toc TEXT, hoc_van TEXT, hon_nhan TEXT, tinh_trang_cu_tru TEXT, ma_bhyt TEXT,
            dia_chi TEXT, diabanh TEXT, ma_xa_phuong TEXT, trang_thai_cu_tru TEXT, cccd TEXT, ngay_cap_cccd TEXT
        ) ON COMMIT DROP`);
        // Ghi theo lô 500 dòng thay vì 2 truy vấn cho từng người (giảm hàng chục nghìn lượt round-trip).
        const batchSize = 500;
        for (let offset = 0; offset < staged.length; offset += batchSize) {
            const batch = staged.slice(offset, offset + batchSize);
            const params = [];
            const tuples = batch.map((r, ri) => {
                const placeholders = r.map((v, ci) => { params.push(v); return `$${ri * 17 + ci + 1}`; });
                return `(${placeholders.join(',')})`;
            });
            await client.query(`INSERT INTO tmp_import_dan_cu (ho_ten,ma_ho,household_id,quan_he,gioi_tinh,ngay_sinh,dan_toc,hoc_van,hon_nhan,tinh_trang_cu_tru,ma_bhyt,dia_chi,diabanh,ma_xa_phuong,trang_thai_cu_tru,cccd,ngay_cap_cccd) VALUES ${tuples.join(',')}`, params);
            const done = Math.min(offset + batch.length, staged.length);
            danCuImportProgress.set(progressKey, { running: true, percent: Math.min(75, 3 + Math.floor(done / staged.length * 72)), stage: `Đang nạp dữ liệu tạm: ${done.toLocaleString('vi-VN')}/${staged.length.toLocaleString('vi-VN')} dòng`, total: staged.length, processed: done });
        }
        danCuImportProgress.set(progressKey, { running: true, percent: 80, stage: 'Đang cập nhật người dân đã có…', total: staged.length, processed: staged.length });
        // Chỉ dùng một dòng đại diện cho mỗi khóa định danh nếu Excel có dòng trùng.
        const updateResult = await client.query(`WITH src AS (
            SELECT DISTINCT ON (ma_ho, lower(trim(ho_ten)), COALESCE(ngay_sinh,'')) *
            FROM tmp_import_dan_cu ORDER BY ma_ho, lower(trim(ho_ten)), COALESCE(ngay_sinh,''), ctid DESC
        ), upd AS (
            UPDATE dan_cu d SET household_id=s.household_id, quan_he=s.quan_he, gioi_tinh=s.gioi_tinh, ngay_sinh=s.ngay_sinh,
                dan_toc=s.dan_toc, hoc_van=s.hoc_van, hon_nhan=s.hon_nhan, tinh_trang_cu_tru=s.tinh_trang_cu_tru,
                ma_bhyt=s.ma_bhyt, dia_chi=s.dia_chi, diabanh=s.diabanh, ma_xa_phuong=s.ma_xa_phuong, trang_thai_cu_tru=s.trang_thai_cu_tru,
                cccd=COALESCE(NULLIF(s.cccd,''), d.cccd), ngay_cap_cccd=COALESCE(NULLIF(s.ngay_cap_cccd,''), d.ngay_cap_cccd),
                nguon_du_lieu='Excel', updated_at=CURRENT_TIMESTAMP
            FROM src s WHERE d.ma_ho=s.ma_ho AND lower(trim(d.ho_ten))=lower(trim(s.ho_ten))
              AND COALESCE(d.ngay_sinh,'')=COALESCE(s.ngay_sinh,'') RETURNING d.id
        ) SELECT count(*)::int AS count FROM upd`);
        danCuImportProgress.set(progressKey, { running: true, percent: 90, stage: 'Đang thêm người dân mới…', total: staged.length, processed: staged.length });
        const insertResult = await client.query(`WITH src AS (
            SELECT DISTINCT ON (ma_ho, lower(trim(ho_ten)), COALESCE(ngay_sinh,'')) *
            FROM tmp_import_dan_cu ORDER BY ma_ho, lower(trim(ho_ten)), COALESCE(ngay_sinh,''), ctid DESC
        ) INSERT INTO dan_cu (ho_ten,ma_ho,household_id,quan_he,gioi_tinh,ngay_sinh,dan_toc,hoc_van,hon_nhan,tinh_trang_cu_tru,ma_bhyt,dia_chi,diabanh,ma_xa_phuong,trang_thai_cu_tru,cccd,ngay_cap_cccd,nguon_du_lieu,updated_at)
        SELECT s.ho_ten,s.ma_ho,s.household_id,s.quan_he,s.gioi_tinh,s.ngay_sinh,s.dan_toc,s.hoc_van,s.hon_nhan,s.tinh_trang_cu_tru,s.ma_bhyt,s.dia_chi,s.diabanh,s.ma_xa_phuong,s.trang_thai_cu_tru,s.cccd,s.ngay_cap_cccd,'Excel',CURRENT_TIMESTAMP
        FROM src s WHERE NOT EXISTS (
            SELECT 1 FROM dan_cu d WHERE d.ma_ho=s.ma_ho AND lower(trim(d.ho_ten))=lower(trim(s.ho_ten)) AND COALESCE(d.ngay_sinh,'')=COALESCE(s.ngay_sinh,'')
        )`);
        await client.query('COMMIT');
        const inserted = insertResult.rowCount || 0, updated = Number(updateResult.rows[0]?.count || 0);
        const message = `Nhập danh sách dân cư hoàn tất: ${inserted} thêm mới, ${updated} cập nhật, ${skipped} dòng bỏ qua.`;
        danCuImportProgress.set(progressKey, { running: false, success: true, percent: 100, stage: 'Hoàn tất!', total: staged.length, processed: staged.length, inserted, updated, skipped, message });
        return res.json({ success: true, inserted, updated, skipped, message });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('Lỗi nhập danh sách dân cư:', err);
        danCuImportProgress.set(progressKey, { running: false, success: false, percent: 0, stage: 'Nhập thất bại', message: 'Không thể nhập Excel: ' + err.message });
        return res.status(500).json({ success: false, message: 'Không thể nhập Excel: ' + err.message });
    } finally {
        client.release();
        if (req.file?.path) fs.unlink(req.file.path, () => {});
    }
});

// ============================================================
// QUẢN LÝ DÂN CƯ - CHỈ ADMIN VÀ LÃNH ĐẠO
// ============================================================
function requireQuanLyDanCu(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
    }
    if (!laQuanLyToanXa(req.session.user)) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý dân cư.' });
    }
    next();
}

const danCuEditableFields = [
    'ho_ten', 'ma_ho', 'household_id', 'quan_he', 'gioi_tinh', 'ngay_sinh',
    'dan_toc', 'hoc_van', 'hon_nhan', 'tinh_trang_cu_tru', 'ma_bhyt',
    'dia_chi', 'diabanh', 'ma_xa_phuong', 'trang_thai_cu_tru', 'cccd',
    'ngay_cap_cccd', 'so_con', 'nam_sinh_con', 'theo_doi_15_49'
];

function danCuPayload(body = {}) {
    const value = {};
    for (const key of danCuEditableFields) {
        if (Object.prototype.hasOwnProperty.call(body, key)) value[key] = body[key];
    }
    value.ho_ten = String(value.ho_ten || '').trim();
    if (value.so_con !== undefined) {
        value.so_con = value.so_con === '' || value.so_con === null ? null : Number(value.so_con);
        if (value.so_con !== null && (!Number.isInteger(value.so_con) || value.so_con < 0)) {
            throw new Error('Số con phải là số nguyên không âm.');
        }
    }
    if (value.theo_doi_15_49 !== undefined) {
        value.theo_doi_15_49 = value.theo_doi_15_49 === true || value.theo_doi_15_49 === 'true' || value.theo_doi_15_49 === 1 || value.theo_doi_15_49 === '1';
    }
    for (const key of danCuEditableFields) {
        if (key !== 'so_con' && key !== 'theo_doi_15_49' && value[key] !== undefined) {
            value[key] = value[key] === null ? null : String(value[key]).trim();
        }
    }
    if (!value.ho_ten) throw new Error('Vui lòng nhập họ và tên.');
    return value;
}

// Danh mục Ấp/địa bàn lấy từ users; chỉ đọc một lần khi trang quản lý mở.
app.get('/api/admin/dan-cu/filters', requireQuanLyDanCu, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT BTRIM(ap) AS ap, BTRIM(diabanh) AS diabanh,
                   SUBSTRING(BTRIM(diabanh) FROM '^[0-9]{3}') AS ma_dia_ban
            FROM users
            WHERE COALESCE(BTRIM(ap), '') <> ''
              AND COALESCE(BTRIM(diabanh), '') <> ''
              AND BTRIM(diabanh) NOT IN ('00', 'Toàn xã')
            ORDER BY ap, diabanh
        `);
        res.json({ success: true, options: result.rows });
    } catch (err) {
        console.error('Lỗi lấy danh mục lọc dân cư từ users:', err);
        res.status(500).json({ success: false, message: 'Không thể tải danh mục Ấp/địa bàn.' });
    }
});


// Các danh mục phục vụ chỉnh sửa hồ sơ. Quan hệ lấy trực tiếp từ danh_sach_quan_he;
// dân tộc/học vấn ghép danh sách chuẩn với các giá trị lịch sử đã có trong CSDL.
app.get('/api/admin/dan-cu/options', requireQuanLyDanCu, async (req, res) => {
    try {
        const danhSachDanTocChuan = [
            'Kinh','Tày','Thái','Hoa','Khmer','Mường','Nùng','Mông','Dao','Gia Rai','Ngái','Ê Đê',
            'Ba Na','Xơ Đăng','Sán Chay','Cơ Ho','Chăm','Sán Dìu','Hrê','Mnông','Ra Glai','Xtiêng',
            'Bru-Vân Kiều','Thổ','Giáy','Cơ Tu','Gié-Triêng','Mạ','Khơ Mú','Co','Tà Ôi','Chơ Ro',
            'Kháng','Xinh Mun','Hà Nhì','Chu Ru','Lào','La Chí','La Ha','Phù Lá','La Hủ','Lự',
            'Lô Lô','Chứt','Mảng','Pà Thẻn','Cơ Lao','Bố Y','Cống','Si La','Pu Péo','Rơ Măm','Brâu','Ơ Đu'
        ];
        const danhSachHocVanChuan = [
            'Chưa đi học','Không biết chữ','Biết đọc, biết viết','Chưa tốt nghiệp tiểu học',
            'Tiểu học','THCS','THPT','Sơ cấp','Trung cấp','Cao đẳng','Đại học','Sau đại học'
        ];
        const [quanHeResult, danTocResult, hocVanResult] = await Promise.all([
            pool.query("SELECT ten_quan_he FROM danh_sach_quan_he WHERE trang_thai = 1 ORDER BY id ASC"),
            pool.query("SELECT DISTINCT BTRIM(dan_toc) AS value FROM dan_cu WHERE COALESCE(BTRIM(dan_toc),'') <> '' ORDER BY value ASC"),
            pool.query("SELECT DISTINCT BTRIM(hoc_van) AS value FROM dan_cu WHERE COALESCE(BTRIM(hoc_van),'') <> '' ORDER BY value ASC")
        ]);
        const merge = (standard, existing) => [...new Set([...standard, ...existing.rows.map(r => r.value).filter(Boolean)])];
        res.json({
            success: true,
            quan_he: quanHeResult.rows.map(r => r.ten_quan_he),
            dan_toc: merge(danhSachDanTocChuan, danTocResult),
            hoc_van: merge(danhSachHocVanChuan, hocVanResult)
        });
    } catch (err) {
        console.error('Lỗi tải danh mục chỉnh sửa dân cư:', err);
        res.status(500).json({ success: false, message: 'Không thể tải danh mục dân cư.' });
    }
});

// Thống kê trẻ đang dùng tên tạm và phát hiện mã hộ trùng trong cùng địa bàn.
// Địa bàn luôn lấy 3 chữ số đầu của dia_chi (không dùng ma_xa_phuong).
app.get('/api/admin/dan-cu/thong-bao', requireQuanLyDanCu, async (req, res) => {
    try {
        const latestEventD = `COALESCE((
            SELECT h.su_kien FROM lich_su_bien_dong_dan_cu h
            WHERE h.dan_cu_id=d.id
            ORDER BY h.ngay_su_kien DESC NULLS LAST, h.created_at DESC NULLS LAST, h.id DESC
            LIMIT 1
        ), d.su_kien_cuoi, '')`;
        const activeOnly = `
            UPPER(BTRIM(COALESCE(d.trang_thai_cu_tru,''))) NOT IN ('DA_CHUYEN_DI','DA_KHAI_TU','DA_CHET')
            AND UPPER(BTRIM(${latestEventD})) NOT IN ('CHUYEN_DI','DA_CHUYEN_DI','KHAI_TU','DA_KHAI_TU','DA_CHET')`;
        const childType = `CASE
            WHEN LOWER(REGEXP_REPLACE(BTRIM(COALESCE(d.ho_ten,'')), '[[:space:]]+', ' ', 'g')) IN ('gái','gai','bé gái','be gái','bé gai','be gai') THEN 'BE_GAI'
            WHEN LOWER(REGEXP_REPLACE(BTRIM(COALESCE(d.ho_ten,'')), '[[:space:]]+', ' ', 'g')) IN ('trai','bé trai','be trai') THEN 'BE_TRAI'
            WHEN LOWER(REGEXP_REPLACE(BTRIM(COALESCE(d.ho_ten,'')), '[[:space:]]+', ' ', 'g')) IN ('chưa đặt tên','chua dat ten','chưa dat tên','chua đặt tên','chưa có tên','chua co ten') THEN 'CHUA_DAT_TEN'
            ELSE NULL END`;
        const childSummary = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE child_type='BE_GAI')::int AS be_gai,
                COUNT(*) FILTER (WHERE child_type='BE_TRAI')::int AS be_trai,
                COUNT(*) FILTER (WHERE child_type='CHUA_DAT_TEN')::int AS chua_dat_ten,
                COUNT(*)::int AS tong_tre
            FROM (
                SELECT ${childType} AS child_type
                FROM dan_cu d
                WHERE ${activeOnly}
            ) x WHERE child_type IS NOT NULL
        `);
        const childRows = await pool.query(`
            SELECT d.id, d.ho_ten, d.ma_ho, d.ngay_sinh, ${childType.replaceAll('d.', 'd.')} AS loai,
                   LEFT(BTRIM(COALESCE(d.dia_chi,'')),3) AS ma_dia_ban,
                   CASE WHEN LEFT(BTRIM(COALESCE(d.dia_chi,'')),3) ~ '^[0-9]{3}$'
                        THEN LEFT(BTRIM(d.dia_chi),3) || ', ' || COALESCE(
                            NULLIF(BTRIM(SPLIT_PART(COALESCE(d.dia_chi,''), ',', 2)), ''),
                            NULLIF(BTRIM(REGEXP_REPLACE(COALESCE(d.diabanh,''), '^[0-9]{3}[[:space:]]*,[[:space:]]*', '')), ''), 'Chưa rõ địa bàn')
                        ELSE COALESCE(NULLIF(BTRIM(d.diabanh),''),'Chưa xác định') END AS dia_ban
            FROM dan_cu d
            WHERE ${activeOnly} AND (${childType}) IS NOT NULL
            ORDER BY ma_dia_ban, d.ma_ho, d.ho_ten
            LIMIT 500
        `);
        const duplicateRows = await pool.query(`
            WITH active_people AS (
                SELECT d.id, BTRIM(COALESCE(d.ma_ho,'')) AS ma_ho,
                       NULLIF(BTRIM(d.household_id),'') AS household_id,
                       d.ho_ten, d.quan_he,
                       LEFT(BTRIM(COALESCE(d.dia_chi,'')),3) AS ma_dia_ban,
                       CASE WHEN LEFT(BTRIM(COALESCE(d.dia_chi,'')),3) ~ '^[0-9]{3}$'
                            THEN LEFT(BTRIM(d.dia_chi),3) || ', ' || COALESCE(
                                NULLIF(BTRIM(SPLIT_PART(COALESCE(d.dia_chi,''), ',', 2)), ''),
                                NULLIF(BTRIM(REGEXP_REPLACE(COALESCE(d.diabanh,''), '^[0-9]{3}[[:space:]]*,[[:space:]]*', '')), ''), 'Chưa rõ địa bàn')
                            ELSE COALESCE(NULLIF(BTRIM(d.diabanh),''),'Chưa xác định') END AS dia_ban,
                       (LOWER(BTRIM(COALESCE(d.quan_he,''))) IN ('chủ hộ','chu ho')) AS la_chu_ho
                FROM dan_cu d
                WHERE COALESCE(BTRIM(d.ma_ho),'') <> ''
                  AND LEFT(BTRIM(COALESCE(d.dia_chi,'')),3) ~ '^[0-9]{3}$'
                  AND ${activeOnly}
            ), grouped AS (
                SELECT ma_dia_ban, ma_ho, MAX(dia_ban) AS dia_ban,
                       COUNT(*)::int AS so_nhan_khau,
                       GREATEST(COUNT(DISTINCT household_id), COUNT(*) FILTER (WHERE la_chu_ho))::int AS so_ma_dinh_danh_ho,
                       COUNT(*) FILTER (WHERE la_chu_ho)::int AS so_chu_ho,
                       ARRAY_TO_STRING(ARRAY_AGG(DISTINCT ho_ten) FILTER (WHERE la_chu_ho), ', ') AS ten_chu_ho,
                       ARRAY_TO_STRING(ARRAY_AGG(DISTINCT ho_ten), ', ') AS danh_sach_thanh_vien
                FROM active_people
                GROUP BY ma_dia_ban, ma_ho
                HAVING COUNT(DISTINCT household_id) > 1 OR COUNT(*) FILTER (WHERE la_chu_ho) > 1
            )
            SELECT *, COUNT(*) OVER()::int AS total_groups FROM grouped
            ORDER BY ma_dia_ban, ma_ho
            LIMIT 300
        `);
        res.json({
            success: true,
            tre: childSummary.rows[0] || { be_gai: 0, be_trai: 0, chua_dat_ten: 0, tong_tre: 0 },
            danh_sach_tre: childRows.rows,
            trung_ma_ho: duplicateRows.rows,
            tong_nhom_trung_ma_ho: duplicateRows.rows[0]?.total_groups || 0
        });
    } catch (err) {
        console.error('Lỗi tải thông báo dân cư:', err);
        res.status(500).json({ success: false, message: 'Không thể tải thông báo dân cư.', error: err.message });
    }
});

app.get('/api/admin/dan-cu', requireQuanLyDanCu, async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const ap = String(req.query.ap || '').trim();
        const maDiaBan = String(req.query.diabanh || '').trim().match(/^\d{3}/)?.[0] || '';
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        // Mỗi trang lấy tối đa 20 HỘ; các thành viên trong cùng hộ không bị tách trang.
        const householdLimit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * householdLimit;
        const params = [];
        const conditions = [];
        if (q) {
            params.push(`%${q}%`);
            conditions.push(`(id::text ILIKE $${params.length} OR ho_ten ILIKE $${params.length} OR ma_ho ILIKE $${params.length} OR household_id ILIKE $${params.length} OR cccd ILIKE $${params.length} OR ma_bhyt ILIKE $${params.length} OR dia_chi ILIKE $${params.length})`);
        }
        if (maDiaBan) {
            params.push(maDiaBan);
            conditions.push(`LEFT(BTRIM(COALESCE(dia_chi, '')), 3) = $${params.length}`);
        } else if (ap) {
            const areaResult = await pool.query(`
                SELECT DISTINCT SUBSTRING(BTRIM(diabanh) FROM '^[0-9]{3}') AS ma_dia_ban
                FROM users
                WHERE BTRIM(ap) = $1 AND diabanh IS NOT NULL
                  AND BTRIM(diabanh) <> '' AND BTRIM(diabanh) NOT IN ('00', 'Toàn xã')
            `, [ap]);
            const codes = areaResult.rows.map(r => r.ma_dia_ban).filter(code => /^\d{3}$/.test(String(code || '')));
            if (codes.length) {
                params.push(codes);
                conditions.push(`LEFT(BTRIM(COALESCE(dia_chi, '')), 3) = ANY($${params.length}::text[])`);
            } else {
                conditions.push('1 = 0');
            }
        }
        // Giữ đầy đủ các bộ lọc cũ; điều kiện lọc áp dụng để tìm hộ phù hợp,
        // sau đó truy vấn cuối vẫn lấy toàn bộ thành viên của hộ đó.
        for (const [key, column] of [['hon_nhan','hon_nhan'], ['gioi_tinh','gioi_tinh'], ['trang_thai','trang_thai_cu_tru']]) {
            const value = String(req.query[key] || '').trim();
            if (value) { params.push(value); conditions.push(`COALESCE(${column}, '') = $${params.length}`); }
        }
        const birthDate = `CASE WHEN ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN to_date(ngay_sinh,'YYYY-MM-DD') WHEN ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(ngay_sinh,'DD/MM/YYYY') ELSE NULL END`;
        const ageExpr = `EXTRACT(YEAR FROM AGE(CURRENT_DATE, ${birthDate}))`;
        const ageFrom = req.query.tu_tuoi === '' || req.query.tu_tuoi == null ? null : Number(req.query.tu_tuoi);
        const ageTo = req.query.den_tuoi === '' || req.query.den_tuoi == null ? null : Number(req.query.den_tuoi);
        if (Number.isInteger(ageFrom) && ageFrom >= 0) { params.push(ageFrom); conditions.push(`${ageExpr} >= $${params.length}`); }
        if (Number.isInteger(ageTo) && ageTo >= 0) { params.push(ageTo); conditions.push(`${ageExpr} <= $${params.length}`); }
        const birthYear = String(req.query.nam_sinh || '').trim();
        if (/^\d{4}$/.test(birthYear)) { params.push(Number(birthYear)); conditions.push(`EXTRACT(YEAR FROM ${birthDate}) = $${params.length}`); }
        const event = String(req.query.bien_dong || '').trim();
        if (event === 'DA_CHET') conditions.push(`(trang_thai_cu_tru IN ('DA_CHET','DA_KHAI_TU') OR EXISTS (SELECT 1 FROM lich_su_bien_dong_dan_cu h WHERE h.dan_cu_id=dan_cu.id AND h.su_kien IN ('KHAI_TU','DA_CHET')))`);
        if (event === 'CHUYEN_DI') conditions.push(`(trang_thai_cu_tru='DA_CHUYEN_DI' OR EXISTS (SELECT 1 FROM lich_su_bien_dong_dan_cu h WHERE h.dan_cu_id=dan_cu.id AND h.su_kien='CHUYEN_DI'))`);
        if (event === 'MOI_CHUYEN_DEN') conditions.push(`(trang_thai_cu_tru IN ('MOI_CHUYEN_DEN','CHUYEN_DEN') OR EXISTS (SELECT 1 FROM lich_su_bien_dong_dan_cu h WHERE h.dan_cu_id=dan_cu.id AND h.su_kien IN ('MOI_CHUYEN_DEN','CHUYEN_DEN')))`);
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        // Khóa hộ = mã địa bàn (3 số đầu dia_chi) + mã hộ.
        // Hồ sơ thiếu mã hộ được xem là một nhóm riêng để không ghép nhầm người.
        const areaExpr = `CASE WHEN LEFT(BTRIM(COALESCE(dia_chi, '')), 3) ~ '^[0-9]{3}$' THEN LEFT(BTRIM(COALESCE(dia_chi, '')), 3) ELSE '#NOAREA:' || id::text END`;
        const householdExpr = `COALESCE(NULLIF(BTRIM(ma_ho), ''), '#ID:' || id::text)`;
        const areaExprD = areaExpr.replaceAll('dia_chi', 'd.dia_chi').replaceAll('id', 'd.id');
        const householdExprD = householdExpr.replaceAll('ma_ho', 'd.ma_ho').replaceAll('id', 'd.id');
        const latestEventD = `COALESCE((
            SELECT h.su_kien FROM lich_su_bien_dong_dan_cu h
            WHERE h.dan_cu_id=d.id
            ORDER BY h.ngay_su_kien DESC NULLS LAST, h.created_at DESC NULLS LAST, h.id DESC
            LIMIT 1
        ), d.su_kien_cuoi, '')`;
        const deadExprD = `(
            UPPER(BTRIM(COALESCE(d.trang_thai_cu_tru,''))) IN ('DA_CHET','DA_KHAI_TU')
            OR UPPER(BTRIM(${latestEventD})) IN ('KHAI_TU','DA_KHAI_TU','DA_CHET')
        )`;
        const movedExprD = `(
            UPPER(BTRIM(COALESCE(d.trang_thai_cu_tru,''))) = 'DA_CHUYEN_DI'
            OR UPPER(BTRIM(${latestEventD})) IN ('CHUYEN_DI','DA_CHUYEN_DI')
        )`;
        const count = await pool.query(`
            WITH matched AS (
                SELECT ${areaExpr} AS ma_dia_ban, ${householdExpr} AS household_key
                FROM dan_cu ${where}
                GROUP BY ${areaExpr}, ${householdExpr}
            ), all_members AS (
                SELECT ${areaExprD} AS ma_dia_ban, ${householdExprD} AS household_key,
                       CASE WHEN ${deadExprD} THEN 'DA_KHAI_TU'
                            WHEN ${movedExprD} THEN 'DA_CHUYEN_DI'
                            ELSE 'DANG_CU_TRU' END AS nhom_trang_thai
                FROM dan_cu d
                JOIN matched m ON ${areaExprD}=m.ma_dia_ban AND ${householdExprD}=m.household_key
            )
            SELECT
                COUNT(DISTINCT (ma_dia_ban, household_key))::int AS total_listed_households,
                COUNT(DISTINCT (ma_dia_ban, household_key)) FILTER (WHERE nhom_trang_thai='DANG_CU_TRU')::int AS total_households,
                COUNT(*) FILTER (WHERE nhom_trang_thai='DANG_CU_TRU')::int AS total_population,
                COUNT(DISTINCT (ma_dia_ban, household_key)) FILTER (WHERE nhom_trang_thai='DA_KHAI_TU')::int AS dead_households,
                COUNT(*) FILTER (WHERE nhom_trang_thai='DA_KHAI_TU')::int AS dead_population,
                COUNT(DISTINCT (ma_dia_ban, household_key)) FILTER (WHERE nhom_trang_thai='DA_CHUYEN_DI')::int AS moved_households,
                COUNT(*) FILTER (WHERE nhom_trang_thai='DA_CHUYEN_DI')::int AS moved_population
            FROM all_members
        `, params);
        const summaryCounts = count.rows[0] || {};
        const totalHouseholds = summaryCounts.total_households || 0;
        const totalPopulation = summaryCounts.total_population || 0;
        const data = await pool.query(`
            WITH matched AS (
                SELECT ${areaExpr} AS ma_dia_ban, ${householdExpr} AS household_key,
                       MIN(id) AS first_id, MIN(NULLIF(BTRIM(ma_ho), '')) AS ma_ho_sort
                FROM dan_cu ${where}
                GROUP BY ${areaExpr}, ${householdExpr}
            ), page_households AS (
                SELECT * FROM matched
                ORDER BY ma_dia_ban ASC NULLS LAST, ma_ho_sort ASC NULLS LAST, first_id ASC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            )
            SELECT d.id, d.ho_ten, d.ma_ho, d.household_id, d.quan_he, d.gioi_tinh, d.ngay_sinh,
                   d.dan_toc, d.hoc_van, d.hon_nhan, d.tinh_trang_cu_tru, d.ma_bhyt, d.dia_chi,
                   d.diabanh, d.ma_xa_phuong, d.trang_thai_cu_tru, d.cccd, d.ngay_cap_cccd,
                   d.so_con, d.nam_sinh_con, COALESCE(d.theo_doi_15_49, TRUE) AS theo_doi_15_49,
                   ph.ma_dia_ban AS _ma_dia_ban
            FROM page_households ph
            JOIN dan_cu d
              ON ${areaExpr.replaceAll('dia_chi','d.dia_chi').replaceAll('id','d.id')} = ph.ma_dia_ban
             AND ${householdExpr.replaceAll('ma_ho','d.ma_ho').replaceAll('id','d.id')} = ph.household_key
            ORDER BY ph.ma_dia_ban ASC NULLS LAST, ph.ma_ho_sort ASC NULLS LAST, ph.first_id ASC,
              CASE
                WHEN LOWER(BTRIM(COALESCE(d.quan_he,''))) IN ('chủ hộ','chu ho') THEN 0
                WHEN LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'vợ%' OR LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'chồng%' OR LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'vo/%' THEN 1
                WHEN LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'con dâu%' OR LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'con rể%' THEN 4
                WHEN LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'con đẻ%' OR LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'con%' THEN 2
                WHEN LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'bố%' OR LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'mẹ%' OR LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'cha%' THEN 3
                WHEN LOWER(BTRIM(COALESCE(d.quan_he,''))) LIKE 'cháu%' THEN 5
                ELSE 6
              END,
              d.ngay_sinh ASC NULLS LAST, d.ho_ten ASC, d.id ASC
        `, [...params, householdLimit, offset]);
        res.json({ success: true, data: data.rows, page, limit: householdLimit,
            totalRows: data.rows.length, totalHouseholds, totalPopulation,
            totalListedHouseholds: summaryCounts.total_listed_households || 0,
            deadHouseholds: summaryCounts.dead_households || 0,
            deadPopulation: summaryCounts.dead_population || 0,
            movedHouseholds: summaryCounts.moved_households || 0,
            movedPopulation: summaryCounts.moved_population || 0,
            totalPages: Math.max(1, Math.ceil((summaryCounts.total_listed_households || 0) / householdLimit)) });
    } catch (err) {
        console.error('Lỗi tải danh sách quản lý dân cư:', err);
        res.status(500).json({ success: false, message: 'Không thể tải danh sách dân cư.', error: err.message });
    }
});

app.post('/api/admin/dan-cu', requireQuanLyDanCu, async (req, res) => {
    try {
        const data = danCuPayload(req.body);
        if (String(data.cccd || '').trim() && !/^\d{12}$/.test(String(data.cccd).trim())) {
            return res.status(400).json({ success: false, message: 'Số CCCD phải gồm đúng 12 chữ số.' });
        }
        if (!String(data.ma_xa_phuong || '').trim()) {
            const commune = await getActiveCommune();
            data.ma_xa_phuong = commune?.ma_xa_phuong || null;
        }
        const columns = Object.keys(data);
        const values = columns.map(key => data[key]);
        const placeholders = columns.map((_, i) => `$${i + 1}`);
        const result = await pool.query(
            `INSERT INTO dan_cu (${columns.join(', ')}, nguon_du_lieu, updated_at)
             VALUES (${placeholders.join(', ')}, 'Quản lý trực tiếp', CURRENT_TIMESTAMP)
             RETURNING id`, values
        );
        await logAction(req.session.user, 'THÊM DÂN CƯ', result.rows[0].id, data.ho_ten);
        res.json({ success: true, id: result.rows[0].id, message: 'Đã thêm hồ sơ dân cư.' });
    } catch (err) {
        console.error('Lỗi thêm dân cư:', err);
        res.status(400).json({ success: false, message: err.message || 'Không thể thêm hồ sơ dân cư.' });
    }
});

app.put('/api/admin/dan-cu/:id', requireQuanLyDanCu, async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!/^\d+$/.test(id)) return res.status(400).json({ success: false, message: 'ID dân cư không hợp lệ.' });
        const data = danCuPayload(req.body);
        const oldRecord = await pool.query('SELECT cccd FROM dan_cu WHERE id = $1', [id]);
        if (!oldRecord.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ dân cư.' });
        const oldCccd = String(oldRecord.rows[0].cccd || '').trim();
        const newCccd = String(data.cccd || '').trim();
        if (newCccd && newCccd !== oldCccd && !/^\d{12}$/.test(newCccd)) {
            return res.status(400).json({ success: false, message: 'Số CCCD mới phải gồm đúng 12 chữ số.' });
        }
        const columns = Object.keys(data);
        const sets = columns.map((key, i) => `${key} = $${i + 1}`);
        const values = columns.map(key => data[key]);
        values.push(id);
        const result = await pool.query(
            `UPDATE dan_cu SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
             WHERE id = $${values.length} RETURNING id`, values
        );
        if (!result.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ dân cư.' });
        await logAction(req.session.user, 'CẬP NHẬT DÂN CƯ', id, data.ho_ten);
        res.json({ success: true, message: 'Đã cập nhật hồ sơ dân cư.' });
    } catch (err) {
        console.error('Lỗi cập nhật dân cư:', err);
        res.status(400).json({ success: false, message: err.message || 'Không thể cập nhật hồ sơ dân cư.' });
    }
});

app.delete('/api/admin/dan-cu/:id', requireQuanLyDanCu, async (req, res) => {
    const client = await pool.connect();
    try {
        const id = String(req.params.id || '').trim();
        if (!/^\d+$/.test(id)) return res.status(400).json({ success: false, message: 'ID dân cư không hợp lệ.' });
        await client.query('BEGIN');
        const current = await client.query('SELECT id, ho_ten FROM dan_cu WHERE id = $1 FOR UPDATE', [id]);
        if (!current.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ dân cư.' });
        }
        // Giữ lịch sử BPTT/biến động; xóa hồ sơ chính theo đúng ID được chọn.
        await client.query('DELETE FROM dan_cu WHERE id = $1', [id]);
        await client.query('COMMIT');
        await logAction(req.session.user, 'XÓA DÂN CƯ', id, current.rows[0].ho_ten);
        res.json({ success: true, message: 'Đã xóa hồ sơ dân cư.' });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('Lỗi xóa dân cư:', err);
        res.status(409).json({ success: false, message: 'Không thể xóa hồ sơ này. Có thể hồ sơ đang được liên kết với dữ liệu khác.', error: err.message });
    } finally {
        client.release();
    }
});

// Danh mục phục vụ Bảng 6: lấy địa bàn và Ấp đang được khai báo trên tài khoản USER.
app.get('/api/table6/options', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
    try {
        const result = await pool.query(`
            SELECT DISTINCT
                NULLIF(BTRIM(diabanh), '') AS diabanh,
                NULLIF(BTRIM(ap), '') AS ap
            FROM users
            WHERE COALESCE(active, 1) = 1
              AND (NULLIF(BTRIM(diabanh), '') IS NOT NULL OR NULLIF(BTRIM(ap), '') IS NOT NULL)
            ORDER BY diabanh NULLS LAST, ap NULLS LAST
        `);
        const diabanh = [...new Set(result.rows.map(r => r.diabanh).filter(Boolean))];
        const ap = [...new Set(result.rows.map(r => r.ap).filter(Boolean))];
        res.json({ success: true, diabanh, ap });
    } catch (err) {
        console.error('Lỗi lấy danh mục Bảng 6:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/table6/household-members', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
    try {
        const personId = Number(req.query.dan_cu_id);
        if (!Number.isInteger(personId) || personId <= 0) return res.status(400).json({ success: false, message: 'Mã hồ sơ không hợp lệ.' });
        const person = await pool.query('SELECT id, ma_ho, dia_chi FROM dan_cu WHERE id = $1', [personId]);
        if (!person.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy người dân.' });
        const household = String(person.rows[0].ma_ho || '').trim();
        if (!household) return res.json({ success: true, members: [] });
        const areaPrefix = String(person.rows[0].dia_chi || '').trim().split(',')[0].trim();
        const result = await pool.query(`
            SELECT id, ho_ten, quan_he, ngay_sinh
            FROM dan_cu
            WHERE TRIM(COALESCE(ma_ho,'')) = $1
              AND id <> $2
              AND split_part(TRIM(COALESCE(dia_chi,'')), ',', 1) = $3
            ORDER BY ho_ten, id
        `, [household, personId, areaPrefix]);
        res.json({ success: true, members: result.rows });
    } catch (err) {
        console.error('Lỗi tải thành viên hộ cho Bảng 6:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/dan-cu/search', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json([]);

        const mode = String(req.query.mode || 'all').toLowerCase();
        const user = req.session.user;
        const roleKey = chuanHoaVaiTro(user);
        const isCollaborator = ['congtacvien', 'congtacvienap', 'congtacvienxa', 'ctv', 'collaborator'].includes(roleKey);
        // Khu vực của CTV được xác định bằng số đứng trước dấu phẩy, ví dụ "142, Xã ...".
        // Giới hạn ở phía máy chủ để CTV không thể xem khu vực khác bằng cách sửa tham số request.
        const areaPrefix = String(user?.diabanh || '').trim().split(',')[0].trim();
        const params = [`%${q}%`];
        let sql = `
            SELECT d.id, d.ho_ten, d.ma_ho, d.quan_he, d.ngay_sinh, d.gioi_tinh, d.dan_toc, d.hon_nhan, d.ma_bhyt,
                   d.so_con, d.dia_chi, d.diabanh, d.ap, d.trang_thai_cu_tru,
                   CASE
                     WHEN UPPER(TRIM(COALESCE(d.trang_thai_cu_tru, ''))) IN ('DA_KHAI_TU','DA_CHET')
                       OR UPPER(TRIM(COALESCE(last_event.su_kien, d.su_kien_cuoi, ''))) IN ('KHAI_TU','DA_KHAI_TU','DA_CHET')
                       THEN 'DA_KHAI_TU'
                     WHEN UPPER(TRIM(COALESCE(d.trang_thai_cu_tru, ''))) = 'DA_CHUYEN_DI'
                       OR UPPER(TRIM(COALESCE(last_event.su_kien, d.su_kien_cuoi, ''))) IN ('CHUYEN_DI','DA_CHUYEN_DI')
                       THEN 'DA_CHUYEN_DI'
                     ELSE COALESCE(NULLIF(d.trang_thai_cu_tru, ''), 'DANG_CU_TRU')
                   END AS trang_thai_tim_kiem,
                   COALESCE(last_event.su_kien, d.su_kien_cuoi) AS su_kien_cuoi,
                   COALESCE(last_event.ngay_su_kien, d.ngay_su_kien) AS ngay_su_kien,
                   CASE
                     WHEN d.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(d.ngay_sinh, 'DD/MM/YYYY')
                     WHEN d.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN to_date(d.ngay_sinh, 'YYYY-MM-DD')
                     ELSE NULL
                   END AS ngay_sinh_date
            FROM dan_cu d
            LEFT JOIN LATERAL (
                SELECT h.su_kien, h.ngay_su_kien
                FROM lich_su_bien_dong_dan_cu h
                WHERE h.dan_cu_id = d.id
                ORDER BY h.ngay_su_kien DESC NULLS LAST, h.created_at DESC NULLS LAST, h.id DESC
                LIMIT 1
            ) last_event ON TRUE
            WHERE (d.ho_ten ILIKE $1 OR d.ma_ho ILIKE $1 OR d.ma_bhyt ILIKE $1)
        `;
        if (isCollaborator) {
            if (!/^\d+$/.test(areaPrefix)) return res.json([]);
            params.push(areaPrefix);
            sql += ` AND split_part(trim(COALESCE(d.dia_chi, '')), ',', 1) = $${params.length}`;
        }
        if (mode === 'woman') {
            sql += `
                AND LOWER(TRIM(COALESCE(d.gioi_tinh, ''))) IN ('nữ', 'nu')
                AND LOWER(TRIM(COALESCE(d.hon_nhan, ''))) = LOWER('Có vợ/Có chồng')
                AND CASE
                      WHEN d.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE, to_date(d.ngay_sinh, 'DD/MM/YYYY')))
                      WHEN d.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE, to_date(d.ngay_sinh, 'YYYY-MM-DD')))
                      ELSE NULL
                    END BETWEEN 15 AND 49
            `;
        }
        // Tra cứu dân cư cho các biểu mẫu biến động cần tìm toàn bộ đối tượng,
        // không lọc theo giới tính, hôn nhân hoặc độ tuổi.
        sql += ` ORDER BY d.ho_ten LIMIT 30`;
        const result = await pool.query(sql, params);
        res.json(result.rows.map(row => {
            const date = row.ngay_sinh_date;
            let ngaySinh = row.ngay_sinh || '';
            if (date instanceof Date && !Number.isNaN(date.getTime())) ngaySinh = date.toISOString().slice(0, 10);
            else if (typeof ngaySinh === 'string' && /^\\d{2}\/\\d{2}\/\\d{4}$/.test(ngaySinh)) {
                const [d, m, y] = ngaySinh.split('/');
                ngaySinh = `${y}-${m}-${d}`;
            }
            const { ngay_sinh_date, ...item } = row;
            return { ...item, ngay_sinh: ngaySinh };
        }));
    } catch (err) {
        console.error('Lỗi tìm kiếm dân cư:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// API CHO BẢNG 7 (VỢ CHỒNG MỚI / THAY ĐỔI BPTT) & QUẢN LÝ 15-49
// ============================================================

// 1. API Tìm kiếm thông tin từ danh sách 4.062 phụ nữ (dành cho Bảng 7)
app.get('/api/search-phu-nu-15-49', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success:false, message:'Chưa đăng nhập' });
    try {
        const q=String(req.query.q||'').trim();
        if(!q) return res.json([]);
        const user=req.session.user; const params=[`%${q}%`];
        let sql=`SELECT d.id::text AS ma_dinh_danh,d.id AS dan_cu_id,d.ma_ho,COALESCE(NULLIF(d.dia_chi,''),d.diabanh,'') AS diabanh,d.ho_ten,
            CASE WHEN d.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_char(to_date(d.ngay_sinh,'DD/MM/YYYY'),'YYYY-MM-DD') WHEN d.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN d.ngay_sinh ELSE '' END AS ngay_sinh,
            d.ma_bhyt AS so_the_bhyt
            FROM dan_cu d WHERE (d.ma_ho ILIKE $1 OR d.ho_ten ILIKE $1)
            AND COALESCE(d.theo_doi_15_49,TRUE)=TRUE
            AND LOWER(TRIM(COALESCE(d.gioi_tinh,''))) IN ('nữ','nu','female','f')
            AND LOWER(TRIM(COALESCE(d.hon_nhan,''))) IN ('có vợ/có chồng','đã kết hôn','kết hôn','có chồng','có vợ','married','da ket hon')
            AND CASE WHEN d.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE,to_date(d.ngay_sinh,'DD/MM/YYYY'))) WHEN d.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE,to_date(d.ngay_sinh,'YYYY-MM-DD'))) ELSE NULL END BETWEEN 15 AND 49`;
        if(!laQuanLyToanXa(user)) {
            const db=String(user.diabanh||'').trim().match(/^\d{3}/)?.[0] || '';
            const ap=String(user.ap||'').trim();
            if(db && db!=='00' && db!=='Toàn xã') {params.push(db);sql+=` AND LEFT(COALESCE(d.dia_chi,''),3) = $${params.length}`;}
            else if(ap) {params.push(`%${ap}%`);sql+=` AND COALESCE(d.dia_chi,'') ILIKE $${params.length}`;}
        }
        sql+=' ORDER BY d.ma_ho ASC,d.ho_ten ASC LIMIT 20';
        const result=await pool.query(sql,params);
        res.json(result.rows);
    } catch(err) {console.error('Lỗi tìm kiếm phụ nữ từ dân cư:',err);res.status(500).json({success:false,error:err.message});}
});

// 2. API Đồng bộ khi Nhập Bảng 7 (Vợ chồng mới / thay đổi BPTT)
// API lưu Bảng 7 và kiểm tra điều kiện Phụ nữ 15–49


// Helpers cho luồng dùng chung hộ: chỉ tạo nhân khẩu bổ sung khi người dùng đã xác nhận.
function normalizeResidentName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}
function residentAgeFromDate(value) {
    const raw = String(value || '').trim();
    let d = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = new Date(`${raw}T00:00:00`);
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [dd, mm, yyyy] = raw.split('/').map(Number);
        d = new Date(yyyy, mm - 1, dd);
    }
    if (!d || Number.isNaN(d.getTime())) return null;
    let age = new Date().getFullYear() - d.getFullYear();
    const now = new Date();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
}
function isEligibleWoman1549(person) {
    const sex = normalizeResidentName(person?.gioi_tinh);
    const marital = normalizeResidentName(person?.hon_nhan || person?.tinh_trang_hon_nhan);
    const age = residentAgeFromDate(person?.ngay_sinh);
    return (sex === 'nu' || sex === 'female' || sex === 'f') && age !== null && age >= 15 && age <= 49
        && ['co vo/co chong', 'dang ket hon', 'da ket hon', 'ket hon', 'co chong', 'co vo', 'married'].includes(marital)
        && !['da khai tu', 'da chuyen di'].includes(normalizeResidentName(person?.trang_thai_cu_tru));
}
async function findResidentByHouseholdAndName(client, maHo, fullName) {
    const rows = await client.query(`SELECT * FROM dan_cu WHERE TRIM(COALESCE(ma_ho,''))=$1 ORDER BY id FOR UPDATE`, [String(maHo || '').trim()]);
    const matches = rows.rows.filter(row => normalizeResidentName(row.ho_ten) === normalizeResidentName(fullName));
    return { household: rows.rows, matches, person: matches[0] || null };
}
function getDefaultResidentAddressFromSessionUser(user = {}) {
    const clean = value => {
        const v = String(value || '').trim();
        return (!v || ['tất cả', '00'].includes(v.toLocaleLowerCase('vi-VN'))) ? '' : v;
    };
    const diaBan = clean(user.diabanh);
    const apRaw = clean(user.ap);
    if (!apRaw) return '';
    const ap = /^ấp\s*/i.test(apRaw) ? apRaw : `Ấp ${apRaw}`;
    const xaRaw = clean(user.xa);
    const tinhRaw = clean(user.tinh);
    const xa = xaRaw ? (/^xã\s*/i.test(xaRaw) ? xaRaw : `Xã ${xaRaw}`) : '';
    const tinh = tinhRaw ? (/^(tỉnh|thành phố)\s*/i.test(tinhRaw) ? tinhRaw : `Tỉnh ${tinhRaw}`) : '';
    return [diaBan, ap, xa, tinh].filter(Boolean).join(', ');
}
async function insertResidentForSharedHousehold(client, req, maHo, fullName, details, source) {
    const rawDetails = details && typeof details === 'object' ? details : {};
    // Nếu client cũ không gửi Nơi cư trú, máy chủ tự lấy địa chỉ Ấp đã gán
    // cho cộng tác viên đang đăng nhập. Địa chỉ vẫn có thể được sửa trên form.
    const d = { ...rawDetails };
    d.dia_chi = String(d.dia_chi || '').trim() || getDefaultResidentAddressFromSessionUser(req.session.user);
    // Mã xã lấy từ cấu hình hiện hành trong CSDL; chỉ giữ mã do biểu mẫu gửi lên
    // khi có giá trị rõ ràng.
    const activeCommune = await getActiveCommune(client);
    d.ma_xa_phuong = String(d.ma_xa_phuong || activeCommune?.ma_xa_phuong || '').trim();
    const required = ['ngay_sinh', 'gioi_tinh', 'quan_he', 'dan_toc', 'hon_nhan', 'dia_chi'];
    const missing = required.filter(key => !String(d[key] || '').trim());
    if (missing.length) {
        const labels = {ngay_sinh:'ngày sinh',gioi_tinh:'giới tính',quan_he:'quan hệ với chủ hộ',dan_toc:'dân tộc',hon_nhan:'tình trạng hôn nhân',dia_chi:'nơi cư trú'};
        const error = new Error(`Thiếu thông tin dân cư bắt buộc: ${missing.map(k => labels[k]).join(', ')}.`);
        error.status = 400;
        throw error;
    }
    const existing = await findResidentByHouseholdAndName(client, maHo, fullName);
    if (existing.matches.length > 1) {
        const error = new Error(`Hộ ${maHo} có nhiều nhân khẩu trùng tên ${fullName}; cần kiểm tra trước khi thêm.`);
        error.status = 409;
        throw error;
    }
    if (existing.person) return existing.person;
    const householdId = d.household_id || existing.household.find(x => x.household_id)?.household_id || String(maHo);
    const area = String(d.diabanh || req.session.user?.diabanh || '').trim();
    const ap = String(d.ap || req.session.user?.ap || '').trim();
    const track = isEligibleWoman1549({ ...d, trang_thai_cu_tru: 'DANG_CU_TRU' });
    const inserted = await client.query(`INSERT INTO dan_cu
        (ho_ten,ma_ho,household_id,quan_he,gioi_tinh,ngay_sinh,dan_toc,hoc_van,hon_nhan,ma_bhyt,dia_chi,diabanh,ap,ma_xa_phuong,trang_thai_cu_tru,theo_doi_15_49,nguon_du_lieu,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'DANG_CU_TRU',$15,$16,CURRENT_TIMESTAMP) RETURNING *`,
        [String(fullName).trim(),String(maHo).trim(),householdId,String(d.quan_he).trim(),String(d.gioi_tinh).trim(),String(d.ngay_sinh).trim(),String(d.dan_toc).trim(),String(d.hoc_van||'').trim()||null,String(d.hon_nhan).trim(),String(d.ma_bhyt||'').trim()||null,String(d.dia_chi).trim(),area||null,ap||null,String(d.ma_xa_phuong||'').trim()||null,track,source]);
    return inserted.rows[0];
}

/**
 * Resolve nhân khẩu cho các sự kiện Bảng 3/5/7/9.
 * Nếu người nhập chọn một nhân khẩu làm mẫu để lấy thông tin hộ rồi đổi sang
 * tên người khác, chỉ tạo một hồ sơ dan_cu mới sau khi họ đã xác nhận dùng chung
 * hộ và hoàn tất form bổ sung. Tuyệt đối không cập nhật hồ sơ mẫu đã chọn.
 */
async function resolveEventResident(client, req, options = {}) {
    const maHo = String(options.householdCode || '').trim();
    const fullName = String(options.fullName || '').trim().replace(/\s+/g, ' ');
    const source = String(options.source || 'Biểu mẫu').trim();
    const residentId = String(options.residentId ?? '').trim();
    const details = req.body.resident_details && typeof req.body.resident_details === 'object'
        ? req.body.resident_details : null;
    const confirmed = req.body.shared_household_confirmed === true
        || req.body.resident_details_confirmed === true;

    if (!maHo || !fullName) {
        const error = new Error('Thiếu mã hộ hoặc họ tên để xác định nhân khẩu.');
        error.status = 400;
        throw error;
    }

    if (residentId) {
        // Kiểm tra ID và mã hộ, nhưng chưa so tên ở đây. Tên khác có thể là
        // trường hợp thêm người mới cùng hộ, không được coi là đổi tên người cũ.
        const selected = await getExplicitResidentById(client, residentId, maHo, '');
        const expectedHousehold = reportHouseholdCode(maHo);
        const selectedHousehold = reportHouseholdCode(selected.ma_ho);
        if (!expectedHousehold || !selectedHousehold || expectedHousehold !== selectedHousehold) {
            const error = new Error('Mã hộ của nhân khẩu được chọn không khớp hoặc chưa đủ thông tin để xác nhận cùng hộ. Vui lòng tìm lại đúng người trong hộ cần nhập.');
            error.status = 409;
            throw error;
        }
        if (reportTextKey(selected.ho_ten) === reportTextKey(fullName)) {
            return { person: selected, createdFromSelectedTemplate: false, selectedTemplate: null };
        }

        if (!confirmed || !details) {
            const error = new Error(
                `Tên “${fullName}” khác nhân khẩu “${selected.ho_ten}” đã chọn. Nếu đây là người mới cùng hộ, hãy xác nhận dùng chung hộ và bổ sung hồ sơ dân cư; hồ sơ cũ sẽ được giữ nguyên.`
            );
            error.status = 409;
            error.requires_resident_details = true;
            throw error;
        }

        // Giữ lại thông tin hộ/địa bàn từ nhân khẩu mẫu, còn thông tin cá nhân
        // ưu tiên những gì người nhập vừa xác nhận ở form bổ sung.
        const pick = (key, ...fallbacks) => {
            const values = [details[key], ...fallbacks];
            for (const value of values) {
                const text = String(value ?? '').trim();
                if (text) return text;
            }
            return '';
        };
        const newDetails = {
            ngay_sinh: pick('ngay_sinh', req.body.ngay_sinh, selected.ngay_sinh),
            gioi_tinh: pick('gioi_tinh', req.body.gioi_tinh, selected.gioi_tinh),
            quan_he: pick('quan_he', req.body.quan_he, selected.quan_he, 'Khác'),
            dan_toc: pick('dan_toc', req.body.dan_toc, selected.dan_toc),
            hoc_van: pick('hoc_van', req.body.hoc_van, selected.hoc_van),
            hon_nhan: pick('hon_nhan', req.body.tinh_trang_hon_nhan, selected.hon_nhan, 'Chưa có vợ hoặc chồng'),
            ma_bhyt: pick('ma_bhyt', req.body.so_the_bhyt, req.body.ma_the_bhyt, selected.ma_bhyt),
            dia_chi: pick('dia_chi', req.body.noi_cu_tru, req.body.dia_chi, selected.dia_chi, getDefaultResidentAddressFromSessionUser(req.session.user)),
            ap: pick('ap', selected.ap, req.session.user?.ap),
            diabanh: pick('diabanh', selected.diabanh, req.session.user?.diabanh),
            ma_xa_phuong: pick('ma_xa_phuong', selected.ma_xa_phuong),
            household_id: selected.household_id || String(maHo)
        };
        const person = await insertResidentForSharedHousehold(
            client, req, maHo, fullName, newDetails, `${source} - thêm nhân khẩu cùng hộ`
        );
        return {
            person,
            createdFromSelectedTemplate: Number(person.id) !== Number(selected.id),
            selectedTemplate: selected
        };
    }

    // Không có ID chọn sẵn: giữ quy tắc cũ, không tự ghép tên nếu chưa xác nhận.
    const possible = await findResidentByHouseholdAndName(client, maHo, fullName);
    if (possible.matches.length) {
        const error = new Error(`Đã có ${fullName} trong dân cư nhưng bản ghi chưa gắn ID. Hãy chọn đúng người từ danh sách tìm kiếm.`);
        error.status = 409;
        throw error;
    }
    if (!confirmed || !details) {
        const error = new Error(`Chưa có ${fullName} trong danh sách dân cư. Cần xác nhận và bổ sung thông tin nhân khẩu.`);
        error.status = 404;
        error.requires_resident_details = true;
        throw error;
    }
    const person = await insertResidentForSharedHousehold(client, req, maHo, fullName, details, source);
    return { person, createdFromSelectedTemplate: false, selectedTemplate: null };
}

// ==================== API ĐỒNG BỘ TỰ ĐỘNG PHỤ NỮ 15-49 TỪ BẢNG 1 ====================
app.post('/api/admin/sync-phu-nu-from-table1', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const client = await pool.connect();
    try {
        const { ho_ten_me, ho_ten_con, ngay_sinh_me, so_the_bhyt_me, ngay_sinh_con,
            noi_de, diabanh, con_thu_may, shared_household_confirmed, resident_details_confirmed,
            gioi_tinh, quan_he_con, dan_toc_con, resident_details } = req.body;
        const maHo = String(req.body.ho_so || req.body.so_ho || '').trim();
        const tenMe = String(ho_ten_me || '').trim().replace(/\s+/g, ' ');
        const tenCon = String(ho_ten_con || '').trim().replace(/\s+/g, ' ');
        if (!maHo || !tenMe || !tenCon || !String(ngay_sinh_con || '').trim()) return res.status(400).json({success:false,message:'Thiếu mã hộ, họ tên mẹ, họ tên trẻ hoặc ngày sinh trẻ.'});
        const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
        await client.query('BEGIN');
        const household = await client.query(`SELECT * FROM dan_cu WHERE TRIM(COALESCE(ma_ho,''))=$1 FOR UPDATE`,[maHo]);

        // Chỉ tin ID mẹ đã được lưu trên chính bản ghi table_1 vừa tạo.
        // Không dùng riêng ID client gửi lên để cho phép đổi tên, tránh client
        // tự truyền ID của người khác rồi ghi đè hồ sơ dân cư.
        let linkedMotherId = null;
        const recordId = String(req.body.record_id || '').trim();
        if (recordId) {
            if (!/^\d+$/.test(recordId)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'ID bản ghi Bảng 1 không hợp lệ.' });
            }
            const reportRecord = await client.query(
                'SELECT id, dan_cu_me_id, ap FROM table_1 WHERE id = $1 FOR UPDATE',
                [Number(recordId)]
            );
            if (!reportRecord.rows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi Bảng 1 để xác nhận liên kết người mẹ.' });
            }
            const savedMotherId = String(reportRecord.rows[0].dan_cu_me_id || '').trim();
            // ID đã lưu trên chính bản ghi table_1 là nguồn sự thật. Request có thể
            // còn giữ ID người được chọn ban đầu trong khi server đã thay liên kết
            // sang nhân khẩu mới ở lần đồng bộ trước; không để ID client ghi đè.
            linkedMotherId = savedMotherId || null;
            const roleKey = String(req.session.user?.role || '').trim().toLowerCase();
            const privileged = roleKey === 'admin' || roleKey.includes('lãnh đạo') || roleKey.includes('lanh dao');
            if (!privileged && String(reportRecord.rows[0].ap || '').trim() !== String(req.session.user?.ap || '').trim()) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: 'Bạn không có quyền đồng bộ bản ghi Bảng 1 thuộc Ấp khác.' });
            }
        }
        let mother = null;
        let selectedMother = null;
        let motherCreatedFromSelectedTemplate = false;

        // Khi người nhập chọn một phụ nữ có sẵn chỉ để lấy nhanh thông tin hộ,
        // rồi đổi tên thành một người mới, tuyệt đối KHÔNG sửa hồ sơ người được
        // chọn. Hệ thống tạo hồ sơ dan_cu riêng cho người mới và chuyển liên kết
        // của bản ghi Bảng 1 sang ID mới.
        if (linkedMotherId) {
            selectedMother = await getExplicitResidentById(client, linkedMotherId, maHo, '');
            const selectedNameKey = reportTextKey(selectedMother.ho_ten);
            const submittedNameKey = reportTextKey(tenMe);

            if (selectedNameKey === submittedNameKey) {
                // Cùng một nhân khẩu: sử dụng hồ sơ đã chọn như bình thường.
                mother = selectedMother;
            } else {
                // Khác tên: coi là thêm một nhân khẩu mới trong cùng hộ,
                // không phải thao tác đổi tên người cũ.
                if (shared_household_confirmed !== true || resident_details_confirmed !== true || !resident_details) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        success: false,
                        requires_resident_details: true,
                        message: `Tên “${tenMe}” khác nhân khẩu “${selectedMother.ho_ten}” đã chọn. Đây sẽ là một người mới trong hộ ${maHo}; vui lòng xác nhận và bổ sung thông tin để tạo hồ sơ riêng. Hồ sơ người cũ được giữ nguyên.`
                    });
                }

                const submittedDetails = resident_details && typeof resident_details === 'object' ? resident_details : {};
                const choose = (key, fallback) => {
                    const value = String(submittedDetails[key] ?? '').trim();
                    return value || String(fallback ?? '').trim();
                };
                const newResidentDetails = {
                    ngay_sinh: choose('ngay_sinh', ngay_sinh_me || selectedMother.ngay_sinh),
                    gioi_tinh: choose('gioi_tinh', selectedMother.gioi_tinh || 'Nữ'),
                    quan_he: choose('quan_he', selectedMother.quan_he),
                    dan_toc: choose('dan_toc', selectedMother.dan_toc),
                    hoc_van: choose('hoc_van', selectedMother.hoc_van),
                    hon_nhan: choose('hon_nhan', selectedMother.hon_nhan || 'Có vợ/Có chồng'),
                    ma_bhyt: choose('ma_bhyt', so_the_bhyt_me || selectedMother.ma_bhyt),
                    dia_chi: choose('dia_chi', selectedMother.dia_chi || getDefaultResidentAddressFromSessionUser(req.session.user)),
                    ap: choose('ap', selectedMother.ap || req.session.user?.ap),
                    diabanh: choose('diabanh', selectedMother.diabanh || req.session.user?.diabanh),
                    ma_xa_phuong: choose('ma_xa_phuong', selectedMother.ma_xa_phuong),
                    household_id: selectedMother.household_id
                };
                mother = await insertResidentForSharedHousehold(
                    client, req, maHo, tenMe, newResidentDetails, 'Bảng 1 - thêm nhân khẩu cùng hộ'
                );
                motherCreatedFromSelectedTemplate = Number(mother.id) !== Number(selectedMother.id);
            }
        }

        if (!mother) {
            const alreadyExists = household.rows.filter(r => norm(r.ho_ten) === norm(tenMe));
            if (alreadyExists.length) {
                await client.query('ROLLBACK');
                return res.status(409).json({success:false,message:`Đã có người tên ${tenMe} trong hộ ${maHo}, nhưng bản ghi chưa được chọn bằng ID dân cư. Hãy chọn người mẹ từ ô tìm kiếm để gắn đúng hồ sơ.`});
            }
            // Chưa chọn nhân khẩu: chỉ tạo mới sau khi xác nhận và nhập form bổ sung.
            if ((shared_household_confirmed !== true && resident_details_confirmed !== true) || !resident_details) {
                await client.query('ROLLBACK');
                return res.status(404).json({success:false,message:`Chưa có ID liên kết người mẹ ${tenMe}. Hãy chọn từ tìm kiếm dân cư hoặc bổ sung hồ sơ dân cư cho người mới.`,requires_resident_details:true});
            }
            mother = await insertResidentForSharedHousehold(client, req, maHo, tenMe, resident_details, 'Bảng 1');
        }
        const childDate = String(ngay_sinh_con || '').trim();
        const childOrder = String(con_thu_may || '').trim();
        // Giữ nguyên công thức khóa sự kiện của phiên bản trước để lần lưu lại
        // các ca sinh đã ghi nhận không bị tính thành sự kiện mới.
        const eventHashSql = `MD5(CONCAT_WS('|',TRIM($1::text),LOWER(REGEXP_REPLACE(TRIM($2::text),'[[:space:]]+',' ','g')),LOWER(TRIM($3::text)),TRIM($4::text),TRIM($5::text)))`;
        const eventParams = [maHo,tenMe,tenCon,childDate,childOrder];
        let childId = null;
        let eventId = null;
        let isNewBirthEvent = false;
        if (tenCon) {
            let eventLookup = await client.query(`SELECT id,dan_cu_id FROM dan_cu_sinh_con_events WHERE event_key=${eventHashSql} FOR UPDATE`,eventParams);
            if (!eventLookup.rows[0]) {
                // Trường hợp sửa chính tả tên trẻ: nếu chỉ có đúng một sự kiện sinh
                // của người mẹ trong ngày đó thì cập nhật sự kiện cũ, không tạo sự kiện mới.
                const relatedEvents = await client.query(`SELECT id,event_key,dan_cu_id FROM dan_cu_sinh_con_events
                    WHERE TRIM(COALESCE(ma_ho,''))=$1
                      AND REGEXP_REPLACE(LOWER(TRIM(COALESCE(ho_ten_me,''))),'[[:space:]]+',' ','g')=REGEXP_REPLACE(LOWER(TRIM($2)),'[[:space:]]+',' ','g')
                      AND COALESCE(ngay_sinh_con,'')=$3 FOR UPDATE`,[maHo,tenMe,childDate]);
                if (relatedEvents.rows.length === 1) {
                    eventLookup = await client.query(`UPDATE dan_cu_sinh_con_events SET event_key=${eventHashSql},ho_ten_con=$3 WHERE id=$6 RETURNING id,dan_cu_id`,[...eventParams,relatedEvents.rows[0].id]);
                } else if (relatedEvents.rows.length > 1) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({success:false,message:`Có nhiều sự kiện sinh của mẹ ${tenMe} cùng ngày ${childDate}. Không thể xác định sự kiện cần sửa một cách an toàn.`});
                } else {
                    eventLookup = await client.query(`INSERT INTO dan_cu_sinh_con_events(event_key,dan_cu_id,ma_ho,ho_ten_me,ho_ten_con,ngay_sinh_con)
                        VALUES (${eventHashSql},NULL,$1,$2,$3,$4) RETURNING id,dan_cu_id`,eventParams);
                    isNewBirthEvent = true;
                }
            }
            eventId = eventLookup.rows[0]?.id;
            const linkedId = eventLookup.rows[0]?.dan_cu_id;
            if (linkedId) {
                const linkedChild = await client.query(`SELECT id FROM dan_cu WHERE id=$1 AND TRIM(COALESCE(ma_ho,''))=$2 AND LOWER(TRIM(COALESCE(quan_he,''))) LIKE 'con%'`,[linkedId,maHo]);
                if (linkedChild.rows[0]) childId = linkedChild.rows[0].id;
            }
            if (childId) {
                await client.query(`UPDATE dan_cu SET ho_ten=$2,ngay_sinh=COALESCE(NULLIF($3,''),ngay_sinh),gioi_tinh=COALESCE(NULLIF($4,''),gioi_tinh),quan_he=COALESCE(NULLIF($5,''),quan_he),dan_toc=COALESCE(NULLIF($6,''),dan_toc),hon_nhan=COALESCE(NULLIF(hon_nhan,''),'Chưa có vợ hoặc chồng'),dia_chi=COALESCE(NULLIF($7,''),dia_chi),diabanh=COALESCE(NULLIF($8,''),diabanh),ma_xa_phuong=COALESCE(NULLIF($9,''),ma_xa_phuong),updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[childId,tenCon,childDate,gioi_tinh||'',String(quan_he_con||'Con'),String(dan_toc_con||''),mother.dia_chi||'',mother.diabanh||'',mother.ma_xa_phuong||'']);
            } else {
                const insertedChild = await client.query(`INSERT INTO dan_cu (ho_ten,ma_ho,household_id,quan_he,gioi_tinh,ngay_sinh,dan_toc,hon_nhan,dia_chi,diabanh,ma_xa_phuong,trang_thai_cu_tru,nguon_du_lieu,updated_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,'Chưa có vợ hoặc chồng',$8,$9,$10,'DANG_CU_TRU','Bảng 1',CURRENT_TIMESTAMP) RETURNING id`,
                    [tenCon,maHo,mother.household_id || maHo,String(quan_he_con||'Con'),gioi_tinh || null,childDate,String(dan_toc_con||'')||null,mother.dia_chi || null,mother.diabanh || null,mother.ma_xa_phuong || null]);
                childId = insertedChild.rows[0].id;
            }
            await client.query(`UPDATE dan_cu_sinh_con_events SET dan_cu_id=$1,ho_ten_con=$2,ngay_sinh_con=$3 WHERE id=$4`,[childId,tenCon,childDate,eventId]);
        }
        if (req.body.record_id) {
            await updateReportResidentLink(client, 'table_1', req.body.record_id, mother.id, 'dan_cu_me_id');
            if (childId) await updateReportResidentLink(client, 'table_1', req.body.record_id, childId, 'dan_cu_con_id');
        }
        const soConOrder = Number.parseInt(childOrder,10);
        const motherForTracking = { ...mother, ngay_sinh: mother.ngay_sinh || String(ngay_sinh_me||'').trim(), gioi_tinh: mother.gioi_tinh || 'Nữ' };
        const motherTrack = !['DA_KHAI_TU','DA_CHUYEN_DI'].includes(String(mother.trang_thai_cu_tru||'').toUpperCase()) && (Boolean(mother.theo_doi_15_49) || isEligibleWoman1549(motherForTracking));
        await client.query(`UPDATE dan_cu SET
            ho_ten=COALESCE(NULLIF($2,''),ho_ten),
            ma_bhyt=COALESCE(NULLIF($3,''),ma_bhyt),
            ngay_sinh=COALESCE(NULLIF($4,''),ngay_sinh),
            so_con=CASE WHEN $5::integer IS NOT NULL THEN GREATEST(COALESCE(so_con,0),$5::integer)
                        WHEN $6::boolean THEN COALESCE(so_con,0)+1 ELSE so_con END,
            nam_sinh_con=COALESCE(NULLIF($7,''),nam_sinh_con),
            theo_doi_15_49=$8,updated_at=CURRENT_TIMESTAMP
            WHERE id=$1`,[mother.id,tenMe,String(so_the_bhyt_me||'').trim(),String(ngay_sinh_me||'').trim(),Number.isInteger(soConOrder)&&soConOrder>0?soConOrder:null,isNewBirthEvent,String(childDate).slice(0,4),motherTrack]);
        // Cập nhật tên mẹ trên lịch sử sự kiện sinh đã gắn với trẻ này để lịch sử
        // không còn giữ cách viết tên cũ sau khi sửa chính tả/tên trên Bảng 1.
        if (childId && tenMe) {
            await client.query(`UPDATE dan_cu_sinh_con_events SET ho_ten_me=$1, ma_ho=$2 WHERE dan_cu_id=$3`, [tenMe, maHo, childId]);
        }
        const dateForHistory = childDate || new Date().toISOString().slice(0,10);
        const activeCommune = await getActiveCommune();
        const defaultClinic = noi_de || activeCommune?.ten_tram_y_te || null;
        await client.query(`INSERT INTO lich_su_bptt(dan_cu_id,ma_bptt,ngay_ap_dung,noi_thuc_hien)
            SELECT $1,'S',$2::date,$3::varchar WHERE NOT EXISTS
            (SELECT 1 FROM lich_su_bptt WHERE dan_cu_id=$1 AND ma_bptt='S' AND ngay_ap_dung=$2::date AND COALESCE(noi_thuc_hien,'')=COALESCE($3::varchar,''))`,
            [mother.id,dateForHistory,defaultClinic]);
        await client.query('COMMIT');
        return res.json({
            success: true,
            message: motherCreatedFromSelectedTemplate
                ? `Đã tạo nhân khẩu mới ${tenMe} trong hộ ${maHo}; hồ sơ người được chọn ban đầu ${selectedMother?.ho_ten || ''} được giữ nguyên. Đã liên kết người mẹ và trẻ vào Bảng 1, 2, 10.`
                : 'Đã đồng bộ người mẹ, trẻ vào dan_cu và kiểm tra lịch sử BPTT.',
            dan_cu_id: mother.id,
            child_dan_cu_id: childId,
            mother_created_as_new_member: motherCreatedFromSelectedTemplate,
            child_created: Boolean(childId && !household.rows.some(r => r.id === childId)),
            birth_event_created: isNewBirthEvent
        });
    } catch(err) { try{await client.query('ROLLBACK')}catch(_){} console.error('Lỗi đồng bộ Bảng 1:',err); return res.status(err.status || 500).json({success:false,message:err.message}); }
    finally { client.release(); }
});

// ==========================================================
// 2. API ĐỒNG BỘ BẢNG 3 (Khai tử -> Cập nhật dan_cu và ngừng theo dõi 15-49)
// ==========================================================

app.post('/api/admin/sync-phu-nu-from-table3', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập lại.' });
    const client = await pool.connect();
    try {
        const maHo = String(req.body.ho_so || '').trim();
        const hoTen = String(req.body.ho_ten || '').trim();
        const ngayChet = String(req.body.ngay_chet || '').trim() || new Date().toISOString().slice(0,10);
        if (!maHo || !hoTen) return res.status(400).json({success:false,message:'Thiếu mã hộ hoặc họ tên người chết.'});
        await client.query('BEGIN');
        const resolved = await resolveEventResident(client, req, {
            residentId: req.body.dan_cu_id,
            householdCode: maHo,
            fullName: hoTen,
            source: 'Bảng 3'
        });
        const person = resolved.person;
        await client.query(`UPDATE dan_cu SET trang_thai_cu_tru='DA_KHAI_TU',su_kien_cuoi='KHAI_TU',ngay_su_kien=$2::date,theo_doi_15_49=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[person.id,ngayChet]);
        const already = await client.query(`SELECT 1 FROM lich_su_bien_dong_dan_cu WHERE dan_cu_id=$1 AND su_kien='KHAI_TU' AND nguon_bieu_mau='Bảng 3' AND ngay_su_kien=$2::date LIMIT 1`,[person.id,ngayChet]);
        if (!already.rowCount) await client.query(`INSERT INTO lich_su_bien_dong_dan_cu (dan_cu_id,ma_ho,ho_ten,su_kien,ngay_su_kien,nguon_bieu_mau,nguoi_thuc_hien) VALUES ($1,$2,$3,'KHAI_TU',$4::date,'Bảng 3',$5)`,[person.id,maHo,hoTen,ngayChet,req.session.user.username || '']);
        if (req.body.record_id) await updateReportResidentLink(client, 'table_3', req.body.record_id, person.id, 'dan_cu_id');
        await client.query('COMMIT');
        return res.json({success:true,dan_cu_id:person.id,message:resolved.createdFromSelectedTemplate ? `Đã thêm ${hoTen} thành nhân khẩu mới và ghi nhận khai tử. Hồ sơ người được chọn ban đầu ${resolved.selectedTemplate?.ho_ten || ''} được giữ nguyên.` : 'Đã ghi nhận nhân khẩu và trạng thái đã khai tử; ngừng theo dõi 15–49.',created_new_resident:resolved.createdFromSelectedTemplate});
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('Lỗi đồng bộ Bảng 3:', err);
        return res.status(err.status || 500).json({success:false,message:err.message});
    } finally { client.release(); }
});

// ==========================================================
// 3. API ĐỒNG BỘ BẢNG 4 (Chuyển đến -> Thêm 15-49 nếu Nữ 15-49 & Ghi log THEM_MOI)
// ==========================================================
app.post('/api/admin/sync-phu-nu-from-table4', async (req,res)=>{
 if(!req.session.user)return res.status(401).json({success:false});
 const client=await pool.connect();
 try{
  const {ho_so,ho_ten,ngay_sinh,gioi_tinh,tinh_trang_hon_nhan,so_the_bhyt,noi_cu_tru,bptt_moi,so_con,nam_sinh_con,quan_he,dan_toc,hoc_van,shared_household_confirmed,resident_details}=req.body;
  const name=String(ho_ten||'').trim().replace(/\s+/g,' '), household=String(ho_so||'').trim();
  if(!name||!household)return res.json({success:true,message:'Thiếu thông tin định danh, bỏ qua đồng bộ dân cư.'});

  // Thông tin bổ sung chỉ dùng để hoàn thiện DAN_CU; không thêm cột/ghi dữ liệu
  // bổ sung vào table_4. Các cột của table_4 giữ nguyên như biểu mẫu hiện tại.
  const details = resident_details && typeof resident_details === 'object' ? resident_details : {};
  const effectiveSex=String(details.gioi_tinh||gioi_tinh||'').trim();
  const birth=String(details.ngay_sinh||ngay_sinh||'').trim();
  const effectiveMarital=String(details.hon_nhan||tinh_trang_hon_nhan||'').trim();
  const effectiveRelation=String(details.quan_he||quan_he||'').trim();
  const effectiveEthnicity=String(details.dan_toc||dan_toc||'').trim();
  const effectiveEducation=String(details.hoc_van||hoc_van||'').trim();
  const effectiveBHYT=String(details.ma_bhyt||so_the_bhyt||'').trim();
  const effectiveAddress=String(details.dia_chi||noi_cu_tru||'').trim() || getDefaultResidentAddressFromSessionUser(req.session.user);
  const activeCommune = await getActiveCommune(client);
  const activeCommuneCode = String(details.ma_xa_phuong || activeCommune?.ma_xa_phuong || '').trim();
  const age=residentAgeFromDate(birth);
  const track=isEligibleWoman1549({gioi_tinh:effectiveSex,ngay_sinh:birth,hon_nhan:effectiveMarital,trang_thai_cu_tru:'DANG_CU_TRU'});

  await client.query('BEGIN');
  let person=await client.query(`SELECT id, COALESCE(theo_doi_15_49,FALSE) AS theo_doi_15_49 FROM dan_cu WHERE TRIM(COALESCE(ma_ho,''))=$1 AND LOWER(TRIM(ho_ten))=LOWER(TRIM($2)) ORDER BY id LIMIT 2 FOR UPDATE`,[household,name]);
  if (person.rows.length > 1) {
    await client.query('ROLLBACK');
    return res.status(409).json({success:false,message:`Hộ ${household} có nhiều nhân khẩu trùng tên ${name}. Không thể tự chọn một hồ sơ; cần xác định đúng nhân khẩu trước khi đồng bộ.`});
  }
  let id=person.rows[0]?.id;
  // Chỉ ghi THEM_MOI khi người này bắt đầu được đưa vào diện quản lý 15-49.
  const wasTracked = Boolean(person.rows[0]?.theo_doi_15_49);

  if(!id){
    if(shared_household_confirmed === true && resident_details){
      // Tạo nhân khẩu mới trực tiếp trong DAN_CU từ form bổ sung.
      // Không thay đổi cấu trúc hoặc thêm trường vào table_4.
      const newResident = await insertResidentForSharedHousehold(client,req,household,name,details,'Bảng 4');
      id = newResident.id;
    } else {
      // Luồng chuyển đến bình thường: dùng đúng các trường vốn có của Bảng 4.
      const ins=await client.query(`INSERT INTO dan_cu(ho_ten,ma_ho,ngay_sinh,gioi_tinh,quan_he,dan_toc,hoc_van,hon_nhan,ma_bhyt,dia_chi,diabanh,ma_xa_phuong,so_con,nam_sinh_con,theo_doi_15_49,nguon_du_lieu,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Bảng 4',CURRENT_TIMESTAMP) RETURNING id`,[name,household,birth||null,effectiveSex||null,effectiveRelation||null,effectiveEthnicity||null,effectiveEducation||null,effectiveMarital||null,effectiveBHYT||null,effectiveAddress||null,req.session.user.diabanh||null,activeCommuneCode||null,(String(so_con ?? '').trim() !== '' && /^\d+$/.test(String(so_con).trim()))?Number(so_con):null,nam_sinh_con||null,track]);
      id=ins.rows[0].id;
    }
  }

  // Cập nhật các thông tin dân cư và phần theo dõi 15–49 vào DAN_CU.
  // Chạy cả với hồ sơ vừa thêm để không bỏ sót BHYT, số con, năm sinh con nhỏ nhất.
  await client.query(`UPDATE dan_cu SET
      ngay_sinh=COALESCE(NULLIF($2,''),ngay_sinh),
      gioi_tinh=COALESCE(NULLIF($3,''),gioi_tinh),
      quan_he=COALESCE(NULLIF($4,''),quan_he),
      dan_toc=COALESCE(NULLIF($5,''),dan_toc),
      hoc_van=COALESCE(NULLIF($6,''),hoc_van),
      hon_nhan=COALESCE(NULLIF($7,''),hon_nhan),
      ma_bhyt=COALESCE(NULLIF($8,''),ma_bhyt),
      dia_chi=COALESCE(NULLIF($9,''),dia_chi),
      so_con=CASE WHEN NULLIF($10,'') ~ '^\\d+$' THEN $10::int ELSE so_con END,
      nam_sinh_con=COALESCE(NULLIF($11,''),nam_sinh_con),
      theo_doi_15_49=$12,
      ma_xa_phuong=COALESCE(NULLIF(ma_xa_phuong,''),NULLIF($13,'')),
      updated_at=CURRENT_TIMESTAMP
    WHERE id=$1`,[id,birth,effectiveSex,effectiveRelation,effectiveEthnicity,effectiveEducation,effectiveMarital,effectiveBHYT,effectiveAddress,so_con==null?'':String(so_con),nam_sinh_con||'',track,activeCommuneCode]);

  if(track && bptt_moi){
    const activeCommune = await getActiveCommune();
    await client.query(`INSERT INTO lich_su_bptt(dan_cu_id,ma_bptt,ngay_ap_dung,noi_thuc_hien)
      SELECT $1,$2::varchar,CURRENT_DATE,NULLIF($3,'')
      WHERE NOT EXISTS(SELECT 1 FROM lich_su_bptt WHERE dan_cu_id=$1 AND ma_bptt=$2::varchar AND ngay_ap_dung=CURRENT_DATE)`,
      [id,bptt_moi,activeCommune?.ten_tram_y_te || '']);
  }

  if(track && !wasTracked){
    await client.query(`
      INSERT INTO bien_dong_phu_nu (diabanh,loai_bien_dong,ho_so,ho_ten,nguoi_thuc_hien)
      VALUES ($1,'THEM_MOI',$2,$3,$4)
    `,[req.session.user.diabanh || '',household,name,req.session.user.username || req.session.user.fullname || '']);
  }
  if (req.body.record_id) await updateReportResidentLink(client, 'table_4', req.body.record_id, id, 'dan_cu_id');
  await client.query('COMMIT');
  return res.json({success:true,dan_cu_id:id,tracked_15_49:track,table_4_schema_unchanged:true});
 }catch(err){try{await client.query('ROLLBACK')}catch(_){} console.error('Lỗi đồng bộ Bảng 4:',err);return res.status(err.status||500).json({success:false,message:err.message});}
 finally{client.release();}
});

// ==========================================================
// 4. API ĐỒNG BỘ BẢNG 5 (Chuyển đi -> Cập nhật dan_cu và ngừng theo dõi 15-49)
// ==========================================================

app.post('/api/admin/sync-phu-nu-from-table5', async (req, res) => {
    if (!req.session.user) return res.status(401).json({success:false,message:'Vui lòng đăng nhập lại.'});
    const client = await pool.connect();
    try {
        const maHo = String(req.body.ho_so || '').trim();
        const hoTen = String(req.body.ho_ten || '').trim();
        const ngayDi = String(req.body.ngay_di || '').trim() || new Date().toISOString().slice(0,10);
        if (!maHo || !hoTen) return res.status(400).json({success:false,message:'Thiếu mã hộ hoặc họ tên người chuyển đi.'});
        await client.query('BEGIN');
        const resolved = await resolveEventResident(client, req, {
            residentId: req.body.dan_cu_id,
            householdCode: maHo,
            fullName: hoTen,
            source: 'Bảng 5'
        });
        const person = resolved.person;
        await client.query(`UPDATE dan_cu SET trang_thai_cu_tru='DA_CHUYEN_DI',su_kien_cuoi='CHUYEN_DI',ngay_su_kien=$2::date,theo_doi_15_49=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[person.id,ngayDi]);
        const already = await client.query(`SELECT 1 FROM lich_su_bien_dong_dan_cu WHERE dan_cu_id=$1 AND su_kien='CHUYEN_DI' AND nguon_bieu_mau='Bảng 5' AND ngay_su_kien=$2::date LIMIT 1`,[person.id,ngayDi]);
        if (!already.rowCount) await client.query(`INSERT INTO lich_su_bien_dong_dan_cu (dan_cu_id,ma_ho,ho_ten,su_kien,ngay_su_kien,nguon_bieu_mau,nguoi_thuc_hien) VALUES ($1,$2,$3,'CHUYEN_DI',$4::date,'Bảng 5',$5)`,[person.id,maHo,hoTen,ngayDi,req.session.user.username || '']);
        if (req.body.record_id) await updateReportResidentLink(client, 'table_5', req.body.record_id, person.id, 'dan_cu_id');
        await client.query('COMMIT');
        return res.json({success:true,dan_cu_id:person.id,message:resolved.createdFromSelectedTemplate ? `Đã thêm ${hoTen} thành nhân khẩu mới và ghi nhận chuyển đi. Hồ sơ người được chọn ban đầu ${resolved.selectedTemplate?.ho_ten || ''} được giữ nguyên.` : 'Đã ghi nhận nhân khẩu và trạng thái đã chuyển đi; ngừng theo dõi 15–49.',created_new_resident:resolved.createdFromSelectedTemplate});
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('Lỗi đồng bộ Bảng 5:', err);
        return res.status(err.status || 500).json({success:false,message:err.message});
    } finally { client.release(); }
});

// ============================================================
// API 1: KIỂM TRA ĐIỀU KIỆN AN TOÀN TRƯỚC KHI HIỆN BẢNG PREVIEW
// ============================================================
app.post('/api/admin/check-table-7-eligibility', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    try {
        const { ho_so, ho_ten_vo } = req.body;
        if (!String(ho_so || '').trim() || !String(ho_ten_vo || '').trim()) {
            return res.json({ success: true });
        }

        const hoSoClean = String(ho_so).trim();
        const hoTenClean = String(ho_ten_vo).trim().replace(/\s+/g, ' ');

        const normalizeName = value => String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        const householdRes = await pool.query(`
            SELECT
                p.id AS dan_cu_id, p.ho_ten,
                latest.ma_bptt, latest.ngay_ap_dung,
                COALESCE(
                    ds.ten_bptt,
                    CASE latest.ma_bptt WHEN 'T' THEN 'Thai' WHEN 'S' THEN 'Sanh' ELSE latest.ma_bptt END
                ) AS ten_bptt
            FROM dan_cu p
            LEFT JOIN LATERAL (
                SELECT l.ma_bptt, l.ngay_ap_dung
                FROM lich_su_bptt l
                WHERE l.dan_cu_id = p.id
                ORDER BY l.ngay_ap_dung DESC, l.id DESC
                LIMIT 1
            ) latest ON TRUE
            LEFT JOIN danh_sach_bptt ds ON ds.ma_bptt = latest.ma_bptt
            WHERE TRIM(p.ma_ho) = $1 AND COALESCE(p.theo_doi_15_49,TRUE)=TRUE
        `, [hoSoClean]);

        const existingWoman = householdRes.rows.find(row =>
            normalizeName(row.ho_ten) === normalizeName(hoTenClean)
        );

        // 🛑 ĐÃ XÓA BỎ ĐOẠN KIỂM TRA GÂY LỖI HÌNH 1 Ở ĐÂY.
        // Chỉ tập trung kiểm tra các điều kiện y tế an toàn (Mang thai, Triệt sản, 3 tháng sau sinh) nếu người vợ đã tồn tại:
        if (existingWoman && existingWoman.ma_bptt) {
            const status = String(existingWoman.ma_bptt).trim().toUpperCase();
            const methodName = existingWoman.ten_bptt || (status === 'T' ? 'Thai' : status === 'S' ? 'Sanh' : `mã ${status}`);
            const identity = `Hộ số ${hoSoClean} – ${hoTenClean}`;

            if (['T', '2', '3'].includes(status)) {
                return res.status(409).json({
                    success: false,
                    blocked: true,
                    message: `${identity} đang có tình trạng/biện pháp ${methodName}. Không thể nhập vào Bảng 7.`
                });
            }

            if (status === 'S') {
                const dateCheck = await pool.query(`
                    SELECT
                        (($1::date + INTERVAL '3 months')::date > CURRENT_DATE) AS chua_du_3_thang,
                        ($1::date + INTERVAL '3 months')::date AS ngay_du_3_thang
                `, [existingWoman.ngay_ap_dung]);

                if (dateCheck.rows[0]?.chua_du_3_thang) {
                    const eligibleDate = String(dateCheck.rows[0].ngay_du_3_thang).slice(0, 10);
                    return res.status(409).json({
                        success: false,
                        blocked: true,
                        message: `${identity} chưa đủ 3 tháng sau sinh. Chỉ được nhập Bảng 7 từ ngày ${eligibleDate}.`
                    });
                }
            }
        }

        return res.json({ success: true });
    } catch (err) {
        console.error('Lỗi kiểm tra điều kiện Bảng 7:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});
// ============================================================
// KIỂM TRA ĐIỀU KIỆN BẢNG 9 TRƯỚC KHI CHO PHÉP XEM TRƯỚC/LƯU
// Mang thai dùng cùng quy tắc chặn T, 2, 3 và thời hạn 3 tháng sau sinh
// như Bảng 7. Sảy thai/Phá thai chỉ hợp lệ khi trước đó có mốc Mang thai.
// ============================================================
app.post('/api/admin/check-table-9-eligibility', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    try {
        const maHo = String(req.body.ho_so || '').trim();
        const name = String(req.body.ho_ten || '').trim().replace(/\s+/g, ' ');
        const event = normalizeResidentName(req.body.su_kien || '');
        const eventDate = String(req.body.ngay_su_kien || '').trim();
        if (!maHo || !name || !event || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập mã hộ, họ tên, sự kiện và ngày sự kiện hợp lệ.' });
        }
        const eventCode = event === 'mang thai' ? 'T' : event === 'say thai' ? 'ST' : event === 'pha thai' ? 'PT' : '';
        if (!eventCode) return res.status(400).json({ success: false, message: 'Sự kiện thai sản không hợp lệ.' });

        const household = await pool.query(
            `SELECT * FROM dan_cu WHERE TRIM(COALESCE(ma_ho,''))=$1 ORDER BY id`,
            [maHo]
        );
        const matches = household.rows.filter(row => normalizeResidentName(row.ho_ten) === normalizeResidentName(name));
        if (matches.length > 1) return res.status(409).json({ success: false, blocked: true, message: `Hộ ${maHo} có nhiều hồ sơ trùng tên ${name}; cần xác định đúng người.` });

        let person = matches[0] || null;
        if (!person) {
            const details = req.body.resident_details && typeof req.body.resident_details === 'object' ? req.body.resident_details : null;
            const confirmed = req.body.shared_household_confirmed === true || req.body.resident_details_confirmed === true;
            if (!confirmed || !details) {
                return res.status(404).json({ success: false, requires_resident_details: true, message: `Chưa có ${name} trong danh sách dân cư. Cần bổ sung hồ sơ nhân khẩu trước khi lưu Bảng 9.` });
            }
            person = {
                ...details,
                ho_ten: name,
                ngay_sinh: details.ngay_sinh || req.body.ngay_sinh || '',
                gioi_tinh: details.gioi_tinh || 'Nữ',
                hon_nhan: details.hon_nhan || 'Có vợ/Có chồng',
                trang_thai_cu_tru: 'DANG_CU_TRU'
            };
            if (!isEligibleWoman1549(person)) {
                return res.status(409).json({ success: false, blocked: true, message: 'Nhân khẩu mới chưa đủ điều kiện theo dõi phụ nữ 15–49 (cần là nữ, từ 15–49 tuổi và có vợ/có chồng). Vui lòng kiểm tra thông tin bổ sung.' });
            }
            // Nhân khẩu mới chưa có lịch sử BPTT.
            if (eventCode !== 'T') {
                return res.status(409).json({ success: false, blocked: true, message: `Không thể ghi nhận ${req.body.su_kien}: nhân khẩu chưa có mốc Mang thai trước đó trong lịch sử BPTT.` });
            }
            return res.json({ success: true, is_new_resident: true });
        }

        if (['DA_KHAI_TU', 'DA_CHUYEN_DI'].includes(String(person.trang_thai_cu_tru || '').toUpperCase())) {
            return res.status(409).json({ success: false, blocked: true, message: `${name} đã được ghi nhận ${String(person.trang_thai_cu_tru).toUpperCase() === 'DA_KHAI_TU' ? 'đã chết' : 'đã chuyển đi'}, không thể ghi nhận sự kiện thai sản.` });
        }
        if (!isEligibleWoman1549(person)) {
            return res.status(409).json({ success: false, blocked: true, message: `${name} không còn đủ điều kiện theo dõi phụ nữ 15–49. Vui lòng kiểm tra giới tính, ngày sinh và tình trạng hôn nhân trong danh sách dân cư.` });
        }

        const latestRes = await pool.query(`
            SELECT l.ma_bptt, l.ngay_ap_dung,
                   CASE l.ma_bptt WHEN 'T' THEN 'Mang thai' WHEN 'S' THEN 'Sinh con'
                        WHEN 'ST' THEN 'Sảy thai' WHEN 'PT' THEN 'Phá thai'
                        ELSE COALESCE(ds.ten_bptt, l.ma_bptt) END AS ten_trang_thai
            FROM lich_su_bptt l
            LEFT JOIN danh_sach_bptt ds ON ds.ma_bptt=l.ma_bptt
            WHERE l.dan_cu_id=$1 AND l.ngay_ap_dung <= $2::date
            ORDER BY l.ngay_ap_dung DESC, l.id DESC
            LIMIT 1
        `, [person.id, eventDate]);
        const latest = latestRes.rows[0] || null;
        const status = String(latest?.ma_bptt || '').trim().toUpperCase();
        const identity = `Hộ số ${maHo} – ${name}`;

        if (eventCode === 'T') {
            if (['T', '2', '3'].includes(status)) {
                return res.status(409).json({ success: false, blocked: true, message: `${identity} đang có trạng thái/biện pháp ${latest.ten_trang_thai || status}. Không thể ghi nhận Mang thai trùng hoặc trái với trạng thái hiện tại.` });
            }
            if (status === 'S') {
                const dateCheck = await pool.query(`
                    SELECT (($1::date + INTERVAL '3 months')::date > $2::date) AS chua_du_3_thang,
                           ($1::date + INTERVAL '3 months')::date AS ngay_du_3_thang
                `, [latest.ngay_ap_dung, eventDate]);
                if (dateCheck.rows[0]?.chua_du_3_thang) {
                    const eligibleDate = String(dateCheck.rows[0].ngay_du_3_thang).slice(0, 10);
                    return res.status(409).json({ success: false, blocked: true, message: `${identity} chưa đủ 3 tháng sau sinh. Chỉ được ghi nhận Mang thai từ ngày ${eligibleDate}.` });
                }
            }
        } else {
            if (status !== 'T') {
                return res.status(409).json({ success: false, blocked: true, message: `Không thể ghi nhận ${req.body.su_kien}: ${identity} chưa có mốc Mang thai còn hiệu lực trước ngày ${eventDate}.` });
            }
        }

        const duplicate = await pool.query(`SELECT 1 FROM lich_su_bptt WHERE dan_cu_id=$1 AND ma_bptt=$2 AND ngay_ap_dung=$3::date LIMIT 1`, [person.id, eventCode, eventDate]);
        if (duplicate.rowCount) return res.status(409).json({ success: false, blocked: true, message: `Sự kiện ${req.body.su_kien} ngày ${eventDate} đã được ghi nhận trong lịch sử BPTT.` });
        return res.json({ success: true });
    } catch (err) {
        console.error('Lỗi kiểm tra điều kiện Bảng 9:', err);
        return res.status(500).json({ success: false, message: err.message || 'Không kiểm tra được điều kiện Bảng 9.' });
    }
});

// ============================================================
// API 2: THỰC THI GHI DỮ LIỆU & ĐỒNG BỘ PHỤ NỮ 15-49 TỪ BẢNG 7
// ============================================================
app.post('/api/admin/sync-phu-nu-from-table7',async(req,res)=>{
 if(!req.session.user)return res.status(401).json({success:false,message:'Chưa đăng nhập'});
 const client=await pool.connect();
 try{
  const {ho_so,ho_ten_vo,ngay_sinh,so_the_bhyt,ngay_su_dung,bptt_moi,so_con_hien_co,noi_thuc_hien,shared_household_confirmed}=req.body;
  const maHo=String(ho_so||'').trim(),name=String(ho_ten_vo||'').trim().replace(/\s+/g,' ');
  if(!maHo||!name||!bptt_moi||!ngay_su_dung)return res.status(400).json({success:false,message:'Vui lòng nhập đủ mã hộ, họ tên, ngày sử dụng và BPTT.'});
  const soConText=String(so_con_hien_co??'').trim(),soCon=soConText===''?null:Number(soConText);
  if(soCon!==null&&(!Number.isInteger(soCon)||soCon<0))return res.status(400).json({success:false,message:'Số con phải là số nguyên không âm.'});
  await client.query('BEGIN');
  const resolved=await resolveEventResident(client,req,{
   residentId:req.body.dan_cu_id, householdCode:maHo, fullName:name, source:'Bảng 7'
  });
  const person=resolved.person;
  const personForTracking={...person,gioi_tinh:person.gioi_tinh||'Nữ',ngay_sinh:String(ngay_sinh||person.ngay_sinh||''),hon_nhan:person.hon_nhan||req.body.resident_details?.hon_nhan};
  const track=!['DA_KHAI_TU','DA_CHUYEN_DI'].includes(String(person.trang_thai_cu_tru||'').toUpperCase()) && (Boolean(person.theo_doi_15_49) || isEligibleWoman1549(personForTracking));
  await client.query(`UPDATE dan_cu SET so_con=COALESCE($2::int,so_con),ma_bhyt=COALESCE(NULLIF($3,''),ma_bhyt),ngay_sinh=COALESCE(NULLIF($4,''),ngay_sinh),theo_doi_15_49=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[person.id,soCon,String(so_the_bhyt||'').trim(),String(ngay_sinh||'').trim(),track]);
  // Ép kiểu $4 thành varchar ở TẤT CẢ vị trí sử dụng.
  // Nếu chỉ ép kiểu ở SELECT hoặc ở điều kiện NOT EXISTS, PostgreSQL có thể
  // suy luận cùng tham số $4 thành text và character varying (lỗi 42P08).
  await client.query(`INSERT INTO lich_su_bptt(dan_cu_id,ma_bptt,ngay_ap_dung,noi_thuc_hien)
    SELECT $1,$2::varchar,$3::date,$4::varchar
    WHERE NOT EXISTS(
      SELECT 1 FROM lich_su_bptt
      WHERE dan_cu_id=$1
        AND ma_bptt=$2::varchar
        AND ngay_ap_dung=$3::date
        AND COALESCE(noi_thuc_hien,'')=COALESCE($4::varchar,'')
    )`,[person.id,bptt_moi,ngay_su_dung,String(noi_thuc_hien||'')]);
  if (req.body.record_id) await updateReportResidentLink(client, 'table_7', req.body.record_id, person.id, 'dan_cu_id');
  await client.query('COMMIT');
  return res.json({success:true,message:resolved.createdFromSelectedTemplate ? `Đã thêm ${name} thành nhân khẩu mới trong hộ và ghi lịch sử BPTT. Hồ sơ ${resolved.selectedTemplate?.ho_ten || 'người được chọn'} ban đầu được giữ nguyên.` : 'Đã cập nhật dan_cu và ghi lịch sử BPTT.',dan_cu_id:person.id,created_new_resident:resolved.createdFromSelectedTemplate});
 }catch(err){try{await client.query('ROLLBACK')}catch(_){} console.error('Lỗi đồng bộ Bảng 7:',err);return res.status(err.status||500).json({success:false,message:err.message});}
 finally{client.release();}
});
// Bảng 9: ghi đủ Mang thai / Sảy thai / Phá thai vào lịch sử trạng thái thai sản.
// T = Mang thai, ST = Sảy thai, PT = Phá thai. ST/PT là mã sự kiện nội bộ,
// không đưa vào danh mục BPTT dùng để chọn biện pháp tránh thai.
app.post('/api/admin/sync-phu-nu-from-table9', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const client = await pool.connect();
    try {
        const maHo = String(req.body.ho_so || '').trim();
        const name = String(req.body.ho_ten || '').trim().replace(/\s+/g, ' ');
        const event = normalizeResidentName(req.body.su_kien || '');
        const eventDate = String(req.body.ngay_su_kien || '').trim();
        const eventLabel = event === 'mang thai' ? 'Mang thai' : event === 'say thai' ? 'Sảy thai' : event === 'pha thai' ? 'Phá thai' : '';
        const eventCode = event === 'mang thai' ? 'T' : event === 'say thai' ? 'ST' : event === 'pha thai' ? 'PT' : '';
        if (!maHo || !name || !eventCode || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
            return res.status(400).json({ success: false, message: 'Thiếu mã hộ, họ tên, sự kiện hoặc ngày sự kiện hợp lệ.' });
        }

        await client.query('BEGIN');
        const resolved = await resolveEventResident(client, req, {
            residentId: req.body.dan_cu_id,
            householdCode: maHo,
            fullName: name,
            source: 'Bảng 9'
        });
        let person = resolved.person;
        if (resolved.createdFromSelectedTemplate || !req.body.dan_cu_id) {
            const candidate = {
                ...person,
                ngay_sinh: person.ngay_sinh || req.body.ngay_sinh || '',
                gioi_tinh: person.gioi_tinh || 'Nữ',
                hon_nhan: person.hon_nhan || 'Có vợ/Có chồng',
                trang_thai_cu_tru: person.trang_thai_cu_tru || 'DANG_CU_TRU'
            };
            if (!isEligibleWoman1549(candidate)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: 'Thông tin nhân khẩu mới chưa đủ điều kiện theo dõi phụ nữ 15–49. Vui lòng kiểm tra ngày sinh, giới tính và tình trạng hôn nhân.' });
            }
        }

        if (['DA_KHAI_TU', 'DA_CHUYEN_DI'].includes(String(person.trang_thai_cu_tru || '').toUpperCase())) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: `${name} đã được ghi nhận ${String(person.trang_thai_cu_tru).toUpperCase() === 'DA_KHAI_TU' ? 'đã chết' : 'đã chuyển đi'}, không thể ghi nhận sự kiện thai sản.` });
        }
        if (!isEligibleWoman1549(person)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: `${name} không đủ điều kiện theo dõi phụ nữ 15–49. Vui lòng kiểm tra dữ liệu dân cư.` });
        }

        // Kiểm tra lại trạng thái trong transaction để tránh bỏ qua bước kiểm tra trước lưu.
        const latestRes = await client.query(`
            SELECT ma_bptt, ngay_ap_dung FROM lich_su_bptt
            WHERE dan_cu_id=$1 AND ngay_ap_dung <= $2::date
            ORDER BY ngay_ap_dung DESC, id DESC LIMIT 1 FOR UPDATE
        `, [person.id, eventDate]);
        const latest = latestRes.rows[0] || null;
        const status = String(latest?.ma_bptt || '').trim().toUpperCase();
        if (eventCode === 'T') {
            if (['T', '2', '3'].includes(status)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: `${name} đang có trạng thái/biện pháp ${status}; không thể ghi nhận Mang thai trùng hoặc trái với trạng thái hiện tại.` });
            }
            if (status === 'S') {
                const dateCheck = await client.query(`SELECT (($1::date + INTERVAL '3 months')::date > $2::date) AS blocked, ($1::date + INTERVAL '3 months')::date AS eligible_date`, [latest.ngay_ap_dung, eventDate]);
                if (dateCheck.rows[0]?.blocked) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, message: `Chưa đủ 3 tháng sau sinh. Chỉ được ghi nhận Mang thai từ ngày ${String(dateCheck.rows[0].eligible_date).slice(0, 10)}.` });
                }
            }
        } else if (status !== 'T') {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: `Không thể ghi nhận ${eventLabel}: ${name} chưa có mốc Mang thai còn hiệu lực trước ngày ${eventDate}.` });
        }

        const existingEvent = await client.query(`SELECT 1 FROM lich_su_bptt WHERE dan_cu_id=$1 AND ma_bptt=$2 AND ngay_ap_dung=$3::date LIMIT 1`, [person.id, eventCode, eventDate]);
        if (!existingEvent.rowCount) {
            const place = `Bảng 9 - ${eventLabel}`;
            await client.query(`
                INSERT INTO lich_su_bptt (dan_cu_id, ma_bptt, ngay_ap_dung, noi_thuc_hien)
                VALUES ($1, $2::varchar, $3::date, $4::varchar)
            `, [person.id, eventCode, eventDate, place]);
        }

        const track = !['DA_KHAI_TU', 'DA_CHUYEN_DI'].includes(String(person.trang_thai_cu_tru || '').toUpperCase())
            && (Boolean(person.theo_doi_15_49) || isEligibleWoman1549(person));
        await client.query(`UPDATE dan_cu SET theo_doi_15_49=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [person.id, track]);
        if (req.body.record_id) await updateReportResidentLink(client, 'table_9', req.body.record_id, person.id, 'dan_cu_id');
        await client.query('COMMIT');
        return res.json({
            success: true,
            dan_cu_id: person.id,
            message: resolved.createdFromSelectedTemplate
                ? `Đã thêm ${name} thành nhân khẩu mới và lưu sự kiện ${eventLabel}. Hồ sơ ${resolved.selectedTemplate?.ho_ten || 'người được chọn'} ban đầu được giữ nguyên.`
                : `Đã lưu sự kiện ${eventLabel} vào lịch sử BPTT và đồng bộ hồ sơ dân cư.`,
            created_new_resident: resolved.createdFromSelectedTemplate
        });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('Lỗi đồng bộ Bảng 9:', err);
        return res.status(err.status || 500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// API kiểm tra mã hộ: Báo xung đột nếu trùng mã nhưng khác tên, hoặc báo hộ mới nếu chưa có

/**
 * API kiểm tra mã hộ theo địa bàn của tài khoản đăng nhập.
 * Một mã hộ có thể có nhiều thành viên.
 */
app.post('/api/admin/check-ma-ho', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false });
    }

    try {
        const { ho_so, ho_ten } = req.body;

        if (!ho_so || !ho_ten) {
            return res.json({
                exists: false,
                conflict: false,
                isNew: true
            });
        }

        const maHoClean = String(ho_so).trim();
        const hoTenClean = String(ho_ten).trim();

        if (!maHoClean || !hoTenClean) {
            return res.json({
                exists: false,
                conflict: false,
                isNew: true
            });
        }

        // Lấy tiền tố địa bàn từ tài khoản đang đăng nhập.
        const user = req.session.user;
        const userDiabanh = String(user.diabanh || '').trim();
        const prefixMatch = userDiabanh.match(/(?:^|\D)(\d{3})(?:\D|$)/);
        const prefix = prefixMatch ? prefixMatch[1] : userDiabanh.split(',')[0].trim();
        const roleKey = String(user.role || '').trim().toLowerCase();
        const isPrivileged = roleKey === 'admin' || roleKey.includes('lãnh đạo') || roleKey.includes('lanh dao');
        const isAllArea = isPrivileged && (!userDiabanh || /tất cả|toàn xã/i.test(userDiabanh));
        if (!prefix && !isAllArea) {
            return res.status(400).json({ success: false, message: 'Tài khoản chưa được cấu hình địa bàn để kiểm tra mã hộ.' });
        }

        // So khớp theo mã địa bàn ở đầu dia_chi hoặc theo trường diabanh.
        // Tài khoản quản trị/toàn xã kiểm tra trên toàn bộ dân cư.
        const check = isAllArea
            ? await pool.query(`SELECT id::text AS ma_dinh_danh, ho_ten FROM dan_cu WHERE TRIM(COALESCE(ma_ho,'')) = $1 ORDER BY ho_ten ASC`, [maHoClean])
            : await pool.query(`
                SELECT id::text AS ma_dinh_danh, ho_ten
                FROM dan_cu
                WHERE TRIM(COALESCE(ma_ho,'')) = $1
                  AND (split_part(TRIM(COALESCE(dia_chi,'')), ',', 1) = $2
                       OR TRIM(COALESCE(diabanh,'')) = $3)
                ORDER BY ho_ten ASC
            `, [maHoClean, prefix, userDiabanh]);

        // Chuẩn hóa tên để so sánh không phân biệt dấu,
        // chữ hoa/thường và khoảng trắng.
        const normalizeName = (value) =>
            String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[đĐ]/g, 'd')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();

        if (check.rows.length > 0) {
            // Kiểm tra tất cả thành viên trong cùng mã hộ.
            const tenDaTonTai = check.rows.some(
                row =>
                    normalizeName(row.ho_ten) ===
                    normalizeName(hoTenClean)
            );

            // Đã có đúng tên thành viên: không báo xung đột.
            if (tenDaTonTai) {
                return res.json({
                    exists: true,
                    conflict: false,
                    isNew: false
                });
            }

            // Mã hộ đã tồn tại nhưng chưa tìm thấy tên này.
            // Trả về xung đột để giao diện hỏi xác nhận.
            return res.json({
                exists: true,
                conflict: true,
                tenCu: check.rows.map(row => row.ho_ten),
                tenDaTonTai: check.rows.map(row => row.ho_ten),
                soNguoiCungHo: check.rows.length,
                message:
                    `Mã hộ ${maHoClean} đã tồn tại trong danh sách ` +
                    `phụ nữ 15-49 tại địa bàn quản lý của bạn. ` +
                    `Vui lòng xác nhận nếu đây là thành viên cùng hộ.`
            });
        }

        // Mã hộ chưa tồn tại trong phạm vi địa bàn.
        return res.json({
            exists: false,
            conflict: false,
            isNew: true
        });

    } catch (err) {
        console.error(
            'Lỗi kiểm tra mã hộ theo phiên đăng nhập:',
            err
        );

        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


// API Xuất Báo Cáo Sổ 12 Tháng Theo Năm (Theo dõi BPTT & Thai sản)
// ==================== API XUẤT BÁO CÁO SỔ 12 THÁNG (PHÂN TRANG 16 NGƯỜI/A4) ====================

app.get('/api/bao-cao-bptt-12-thang', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập'
        });
    }

    const ap = req.query.ap || '';
    const diabanh = req.query.diabanh || '';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 16;
    const offset = (page - 1) * limit;
    const user = req.session.user;

    // Báo cáo theo đúng năm người dùng chọn, đủ 12 tháng từ tháng 1 đến tháng 12.
    const reportYear = Math.max(2000, Math.min(2100, parseInt(req.query.year, 10) || new Date().getFullYear()));
    const monthLabels = Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/${reportYear}`);

    try {
        const whereClauses = [
            'COALESCE(pn.theo_doi_15_49, TRUE) = TRUE',
            "LOWER(TRIM(COALESCE(pn.gioi_tinh,''))) IN ('nữ','nu','female','f')",
            "LOWER(TRIM(COALESCE(pn.hon_nhan,''))) IN ('có vợ/có chồng','đã kết hôn','kết hôn','có chồng','có vợ','married','da ket hon')",
            `CASE WHEN pn.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE,to_date(pn.ngay_sinh,'DD/MM/YYYY'))) WHEN pn.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE,to_date(pn.ngay_sinh,'YYYY-MM-DD'))) ELSE NULL END BETWEEN 15 AND 49`
        ];
        const params = [];
        let paramIdx = 1;

        const isAdminOrLeader = ['admin', 'lãnh đạo'].includes(
            String(user.role || '').trim().toLowerCase()
        );

        const activeAp = isAdminOrLeader ? ap : user.ap;
        const activeDiabanh =
            (!isAdminOrLeader && user.diabanh && user.diabanh !== '00')
                ? user.diabanh
                : diabanh;

        if (activeDiabanh) {
            // dia_ban của tài khoản/ô chọn có thể là '142' hoặc '142, ...'.
            // Trong dan_cu, địa bàn dùng để lọc báo cáo nằm ở dia_chi, không phải diabanh.
            const areaPrefix = String(activeDiabanh).trim().match(/^\d{3}/)?.[0] || '';
            if (areaPrefix) {
                whereClauses.push(`LEFT(BTRIM(COALESCE(pn.dia_chi, '')), 3) = $${paramIdx}`);
                params.push(areaPrefix);
            } else {
                whereClauses.push(`pn.dia_chi ILIKE $${paramIdx}`);
                params.push(`%${String(activeDiabanh).trim()}%`);
            }
            paramIdx++;
        } else if (activeAp && activeAp !== 'Tất cả') {
            const dbRes = await pool.query(
                `SELECT DISTINCT SUBSTRING(BTRIM(diabanh) FROM '^[0-9]{3}') AS ma_dia_ban
                 FROM users
                 WHERE ap ILIKE $1
                   AND diabanh IS NOT NULL
                   AND BTRIM(diabanh) <> ''
                   AND BTRIM(diabanh) NOT IN ('00', 'Toàn xã')`,
                [`%${activeAp}%`]
            );

            const dbList = [...new Set(dbRes.rows.map(r => r.ma_dia_ban).filter(Boolean))];

            if (dbList.length > 0) {
                params.push(dbList);
                whereClauses.push(`LEFT(BTRIM(COALESCE(pn.dia_chi, '')), 3) = ANY($${paramIdx}::text[])`);
                paramIdx++;
            } else {
                whereClauses.push(`pn.dia_chi ILIKE $${paramIdx}`);
                params.push(`%${activeAp}%`);
                paramIdx++;
            }
        }

        const reportYearParam = paramIdx++;
        const whereSql = whereClauses.length
            ? `WHERE ${whereClauses.join(' AND ')}`
            : '';

        const countQuery = `
            SELECT COUNT(*)::int AS total
            FROM dan_cu pn
            ${whereSql}
        `;

        const countRes = await pool.query(countQuery, params);
        const totalRows = countRes.rows[0].total;
        const totalPages = Math.ceil(totalRows / limit) || 1;

        const dataParams = [...params, reportYear, limit, offset];

        const dataQuery = `
            SELECT
                pn.id::text AS ma_dinh_danh,
                pn.ma_ho,
                pn.ho_ten,
                CASE WHEN pn.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN pn.ngay_sinh WHEN pn.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN to_char(to_date(pn.ngay_sinh,'YYYY-MM-DD'),'DD/MM/YYYY') ELSE '' END AS ngay_sinh,
                pn.so_con,
                pn.nam_sinh_con,
                ''::text AS ghi_chu,
                bptt.t1,bptt.t2,bptt.t3,bptt.t4,bptt.t5,bptt.t6,
                bptt.t7,bptt.t8,bptt.t9,bptt.t10,bptt.t11,bptt.t12,
                bptt.t1_changed,bptt.t2_changed,bptt.t3_changed,bptt.t4_changed,bptt.t5_changed,bptt.t6_changed,
                bptt.t7_changed,bptt.t8_changed,bptt.t9_changed,bptt.t10_changed,bptt.t11_changed,bptt.t12_changed
            FROM dan_cu pn
            LEFT JOIN LATERAL (
                SELECT
                    MAX(ma_bptt) FILTER (WHERE thang=1) AS t1,
                    MAX(ma_bptt) FILTER (WHERE thang=2) AS t2,
                    MAX(ma_bptt) FILTER (WHERE thang=3) AS t3,
                    MAX(ma_bptt) FILTER (WHERE thang=4) AS t4,
                    MAX(ma_bptt) FILTER (WHERE thang=5) AS t5,
                    MAX(ma_bptt) FILTER (WHERE thang=6) AS t6,
                    MAX(ma_bptt) FILTER (WHERE thang=7) AS t7,
                    MAX(ma_bptt) FILTER (WHERE thang=8) AS t8,
                    MAX(ma_bptt) FILTER (WHERE thang=9) AS t9,
                    MAX(ma_bptt) FILTER (WHERE thang=10) AS t10,
                    MAX(ma_bptt) FILTER (WHERE thang=11) AS t11,
                    MAX(ma_bptt) FILTER (WHERE thang=12) AS t12,
                    BOOL_OR(thang=1 AND co_thay_doi) AS t1_changed,BOOL_OR(thang=2 AND co_thay_doi) AS t2_changed,
                    BOOL_OR(thang=3 AND co_thay_doi) AS t3_changed,BOOL_OR(thang=4 AND co_thay_doi) AS t4_changed,
                    BOOL_OR(thang=5 AND co_thay_doi) AS t5_changed,BOOL_OR(thang=6 AND co_thay_doi) AS t6_changed,
                    BOOL_OR(thang=7 AND co_thay_doi) AS t7_changed,BOOL_OR(thang=8 AND co_thay_doi) AS t8_changed,
                    BOOL_OR(thang=9 AND co_thay_doi) AS t9_changed,BOOL_OR(thang=10 AND co_thay_doi) AS t10_changed,
                    BOOL_OR(thang=11 AND co_thay_doi) AS t11_changed,BOOL_OR(thang=12 AND co_thay_doi) AS t12_changed
                FROM (
                    -- Mỗi tháng hiển thị biện pháp có hiệu lực tại tháng đó:
                    -- lấy lần ghi nhận gần nhất tính đến hết tháng, kể cả lịch sử từ năm trước.
                    SELECT
                        m.thang,
                        (
                            SELECT ls.ma_bptt
                            FROM lich_su_bptt ls
                            WHERE ls.dan_cu_id = pn.id
                              AND ls.ngay_ap_dung < (make_date($${reportYearParam}, m.thang, 1) + INTERVAL '1 month')
                            ORDER BY ls.ngay_ap_dung DESC, ls.id DESC
                            LIMIT 1
                        ) AS ma_bptt,
                        EXISTS (
                            SELECT 1
                            FROM lich_su_bptt ls_changed
                            WHERE ls_changed.dan_cu_id = pn.id
                              AND ls_changed.ngay_ap_dung >= make_date($${reportYearParam}, m.thang, 1)
                              AND ls_changed.ngay_ap_dung < (make_date($${reportYearParam}, m.thang, 1) + INTERVAL '1 month')
                        ) AS co_thay_doi
                    FROM generate_series(1, 12) AS m(thang)
                ) monthly
            ) bptt ON TRUE

            ${whereSql}

            ORDER BY pn.ma_ho ASC, pn.ho_ten ASC
            LIMIT $${paramIdx++}
            OFFSET $${paramIdx++}
        `;

        const result = await pool.query(dataQuery, dataParams);

        res.json({
            success: true,
            data: result.rows,
            monthLabels,
            currentPage: page,
            totalPages,
            totalRows
        });

    } catch (err) {
        console.error('Lỗi xuất báo cáo 12 tháng:', err);
        res.status(500).json({
            success: false,
            message: 'Không thể tải báo cáo 12 tháng.',
            error: err.message
        });
    }
});




// API IMPORT EXCEL CHO PHỤ NỮ 15-49 VÀ LỊCH SỬ BPTT
app.post("/api/admin/import-phu-nu-15-49", upload.single("excel"), async (req,res)=>{
 if(!req.session.user || req.session.user.role!=='admin'){
  if(req.file&&fs.existsSync(req.file.path))fs.unlinkSync(req.file.path);
  return res.status(403).json({success:false,message:'Không có quyền truy cập'});
 }
 const client=await pool.connect();
 try{
  if(!req.file)return res.status(400).json({success:false,message:'Chưa chọn file Excel'});
  const workbook=XLSX.readFile(req.file.path),sheet=workbook.Sheets[workbook.SheetNames[0]];
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
  let header=0;for(let i=0;i<Math.min(matrix.length,10);i++){const t=matrix[i].join(' ').toLowerCase();if(t.includes('họ tên')||t.includes('ho ten')||t.includes('số hộ')||t.includes('so ho')){header=i;break;}}
  const rows=XLSX.utils.sheet_to_json(sheet,{range:header,defval:''});
  const parseDate=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*86400*1000));return d.toISOString().slice(0,10);}const x=String(v).trim();if(/^\d{4}$/.test(x))return `${x}-01-01`;if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(x)){const [y,m,d]=x.split('-');return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}const a=x.split(/[/. -]/);if(a.length===3){if(a[0].length===4)return `${a[0]}-${a[1].padStart(2,'0')}-${a[2].padStart(2,'0')}`;if(a[2].length===4)return `${a[2]}-${a[1].padStart(2,'0')}-${a[0].padStart(2,'0')}`;}return null;};
  await client.query('BEGIN');let imported=0,inserted=0,historyCount=0,unmatched=[];
  for(const r of rows){
   let maHo=String(r['Số hộ']||r['Mã hộ']||r['Hộ số']||r['ma_ho']||r['ho_so']||'').trim();
   const name=String(r['Họ tên']||r['Họ và tên']||r['ho_ten']||'').trim().replace(/\s+/g,' ');
   if(!maHo||!name)continue;
   const birth=parseDate(r['Ngày sinh']||r['Năm sinh']||r['ngay_sinh']);
   const address=String(r['Địa chỉ']||r['dia_chi']||'').trim();
   const areaCode=String(r['Mã Xã/Phường']||r['ma_xa_phuong']||'').trim();
   const bhyt=String(r['Số thẻ BHYT']||r['BHYT']||r['so_the_bhyt']||'').trim();
   const soConRaw=String(r['Số con']||r['so_con']||'').trim();
   const soCon=soConRaw!==''&&/^\d+$/.test(soConRaw)?Number(soConRaw):null;
   const namSinhCon=String(r['Năm sinh con nhỏ nhất']||r['Năm sinh con']||r['nam_sinh_con']||'').trim();
   const existing=await client.query(`SELECT id FROM dan_cu WHERE TRIM(COALESCE(ma_ho,''))=$1 AND LOWER(TRIM(ho_ten))=LOWER(TRIM($2)) AND ($3::text IS NULL OR COALESCE(ngay_sinh,'')=$3 OR COALESCE(ngay_sinh,'')=to_char(to_date($3,'YYYY-MM-DD'),'DD/MM/YYYY')) ORDER BY id LIMIT 1 FOR UPDATE`,[maHo,name,birth]);
   let personId;
   if(existing.rows[0]){
    personId=existing.rows[0].id;
    await client.query(`UPDATE dan_cu SET ngay_sinh=COALESCE(NULLIF($2,''),ngay_sinh),ma_bhyt=COALESCE(NULLIF($3,''),ma_bhyt),dia_chi=COALESCE(NULLIF($4,''),dia_chi),ma_xa_phuong=COALESCE(NULLIF($5,''),ma_xa_phuong),so_con=COALESCE($6::int,so_con),nam_sinh_con=COALESCE(NULLIF($7,''),nam_sinh_con),theo_doi_15_49=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[personId,birth||'',bhyt,address,areaCode,soCon,namSinhCon]);
   }else{
    const ins=await client.query(`INSERT INTO dan_cu(ho_ten,ma_ho,ngay_sinh,ma_bhyt,dia_chi,ma_xa_phuong,so_con,nam_sinh_con,gioi_tinh,hon_nhan,theo_doi_15_49,nguon_du_lieu,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Nữ','Có vợ/Có chồng',TRUE,'Import 15-49',CURRENT_TIMESTAMP) RETURNING id`,[name,maHo,birth,bhyt||null,address||null,areaCode||null,soCon,namSinhCon||null]);
    personId=ins.rows[0].id;inserted++;
   }
   imported++;
   const method=String(r['Biện pháp TT']||r['bptt_moi']||'').trim();
   const date=parseDate(r['Ngày nhập']||r['ngay_nhap'])||'2026-01-01';
   if(method){const h=await client.query(`INSERT INTO lich_su_bptt(dan_cu_id,ma_bptt,ngay_ap_dung) SELECT $1,$2,$3::date WHERE NOT EXISTS(SELECT 1 FROM lich_su_bptt WHERE dan_cu_id=$1 AND ma_bptt=$2 AND ngay_ap_dung=$3::date)`,[personId,method,date]);historyCount+=h.rowCount;}
  }
  if(!imported){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'Không tìm thấy dữ liệu hợp lệ trong Excel.'});}
  await client.query('COMMIT');
  return res.json({success:true,message:`Đã cập nhật ${imported} hồ sơ trong dan_cu (${inserted} thêm mới), ghi nhận ${historyCount} mốc BPTT mới. Dữ liệu và lịch sử cũ không bị xóa.`,imported,inserted,historyCount});
 }catch(err){try{await client.query('ROLLBACK')}catch(_){}console.error('Lỗi import phụ nữ 15-49 vào dan_cu:',err);return res.status(500).json({success:false,message:err.message});}
 finally{client.release();if(req.file?.path&&fs.existsSync(req.file.path))fs.unlinkSync(req.file.path);}
});

// ==================== EXCEL CẬP NHẬT NĂM SINH CON 15-49 ====================
// Dùng chung điều kiện với danh sách 15-49; nhân viên chỉ thấy/cập nhật địa bàn được phân công.
async function buildPhuNu1549Scope(user, filters = {}, startParam = 1) {
    const whereClauses = [
        'COALESCE(d.theo_doi_15_49, TRUE) = TRUE',
        "LOWER(TRIM(COALESCE(d.gioi_tinh,''))) IN ('nữ','nu','female','f')",
        "LOWER(TRIM(COALESCE(d.hon_nhan,''))) IN ('có vợ/có chồng','đã kết hôn','kết hôn','có chồng','có vợ','married','da ket hon')",
        `CASE WHEN d.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE, to_date(d.ngay_sinh,'DD/MM/YYYY'))) WHEN d.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE, to_date(d.ngay_sinh,'YYYY-MM-DD'))) ELSE NULL END BETWEEN 15 AND 49`
    ];
    const params = [];
    let n = startParam;
    const allArea = laQuanLyToanXa(user);
    const activeAp = allArea ? String(filters.ap || '').trim() : String(user.ap || '').trim();
    const rawDb = allArea ? String(filters.diabanh || '').trim() : String(user.diabanh || '').trim();
    const activeDb = rawDb.match(/^\d{3}/)?.[0] || '';

    if (activeDb && activeDb !== '00') {
        whereClauses.push(`LEFT(COALESCE(d.dia_chi,''),3) = $${n++}`);
        params.push(activeDb);
    } else if (activeAp && activeAp !== 'Tất cả') {
        const dbRes = await pool.query(
            `SELECT DISTINCT diabanh FROM users WHERE ap ILIKE $1 AND diabanh IS NOT NULL AND diabanh <> '' AND diabanh <> '00'`,
            [`%${activeAp}%`]
        );
        const prefixes = [...new Set(dbRes.rows.map(r => String(r.diabanh || '').trim().match(/^\d{3}/)?.[0]).filter(Boolean))];
        if (prefixes.length) {
            const terms = prefixes.map(code => {
                params.push(code);
                return `LEFT(COALESCE(d.dia_chi,''),3) = $${n++}`;
            });
            whereClauses.push(`(${terms.join(' OR ')})`);
        } else {
            whereClauses.push(`COALESCE(d.dia_chi,'') ILIKE $${n++}`);
            params.push(`%${activeAp}%`);
        }
    } else if (!allArea) {
        // Tài khoản CTV không có địa bàn phân công thì không được mở rộng ra toàn xã.
        whereClauses.push('FALSE');
    }

    return { whereSql: whereClauses.join(' AND '), params };
}

// Tải danh sách phụ nữ 15-49 để bổ sung/cập nhật số con và năm sinh con nhỏ nhất.
// Có ID dân cư làm khóa đối chiếu, không cần ghép bằng họ tên/mã hộ.
app.get('/api/admin/export-nam-sinh-con-15-49', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập lại.' });
    if (!coQuyenQuanLyPhuNu(req.session.user)) return res.status(403).json({ success: false, message: 'Bạn không có quyền xuất danh sách.' });
    try {
        const scope = await buildPhuNu1549Scope(req.session.user, {
            ap: req.query.ap,
            diabanh: req.query.diabanh
        }, 1);
        const result = await pool.query(`
            SELECT d.id::text AS id_dan_cu, COALESCE(d.ma_ho,'') AS ma_ho,
                   COALESCE(d.ho_ten,'') AS ho_ten,
                   COALESCE(d.ngay_sinh,'') AS ngay_sinh,
                   COALESCE(NULLIF(d.dia_chi,''),d.diabanh,'') AS dia_ban,
                   d.so_con AS so_con,
                   COALESCE(d.nam_sinh_con,'') AS nam_sinh_con
            FROM dan_cu d
            WHERE ${scope.whereSql}
            ORDER BY d.ma_ho ASC, d.ho_ten ASC, d.id ASC
        `, scope.params);

        const headers = [
            'ID dân cư', 'Mã hộ', 'Họ và tên', 'Ngày sinh', 'Địa bàn',
            'Số con', 'Năm sinh con nhỏ nhất'
        ];
        const data = result.rows.map(row => ({
            'ID dân cư': String(row.id_dan_cu),
            'Mã hộ': row.ma_ho,
            'Họ và tên': row.ho_ten,
            'Ngày sinh': row.ngay_sinh,
            'Địa bàn': row.dia_ban,
            'Số con': row.so_con === null || row.so_con === undefined ? '' : Number(row.so_con),
            'Năm sinh con nhỏ nhất': row.nam_sinh_con
        }));
        const ws = XLSX.utils.json_to_sheet(data, { header: headers });
        ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 25 }];
        const guide = XLSX.utils.aoa_to_sheet([
            ['HƯỚNG DẪN CẬP NHẬT SỐ CON VÀ NĂM SINH CON'],
            ['1. Có thể chỉnh sửa hai cột “Số con” và “Năm sinh con nhỏ nhất” ở sheet DanhSach.'],
            ['2. “Số con” phải là số nguyên không âm, ví dụ: 0, 1, 2, 3.'],
            ['3. “Năm sinh con nhỏ nhất” nhập năm gồm 4 chữ số, ví dụ: 2022; đây là năm sinh của người con gần nhất/nhỏ tuổi nhất theo cách hệ thống đang lưu.'],
            ['4. Không sửa hoặc xóa cột “ID dân cư”; hệ thống dùng cột này để tìm đúng hồ sơ.'],
            ['5. Ô “Số con” hoặc “Năm sinh con nhỏ nhất” để trống sẽ giữ nguyên giá trị cũ trong CSDL.'],
            ['6. Khi tải lên, hệ thống chỉ cập nhật dan_cu.so_con và dan_cu.nam_sinh_con cho hồ sơ đã tồn tại; không thêm nhân khẩu và không sửa các cột khác.']
        ]);
        guide['!cols'] = [{ wch: 115 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'DanhSach');
        XLSX.utils.book_append_sheet(wb, guide, 'HuongDan');
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        const filename = 'Danh_sach_phu_nu_15-49_so_con_nam_sinh_con.xlsx';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('Content-Length', buffer.length);
        return res.end(buffer);
    } catch (err) {
        console.error('Lỗi xuất Excel năm sinh con 15-49:', err);
        return res.status(500).json({ success: false, message: 'Không thể xuất Excel: ' + err.message });
    }
});

// Tải file đã điền lên: chỉ UPDATE số con và năm sinh con của ID dân cư tồn tại trong phạm vi được phép.
// Tuyệt đối không INSERT, không thay đổi mã hộ, họ tên, địa chỉ, BHYT hay lịch sử BPTT.
app.post('/api/admin/import-nam-sinh-con-15-49', upload.single('excel'), async (req, res) => {
    if (!req.session.user) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập lại.' });
    }
    if (!coQuyenQuanLyPhuNu(req.session.user)) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật danh sách.' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel đã cập nhật.' });

    let client = null;
    try {
        client = await pool.connect();
        const workbook = XLSX.readFile(req.file.path, { cellDates: false });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return res.status(400).json({ success: false, message: 'File Excel không có sheet dữ liệu.' });
        const sheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
        const normalizeHeader = value => String(value || '').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .toLowerCase().replace(/[^a-z0-9]/g, '');
        let headerIndex = -1;
        let idHeader = '';
        let yearHeader = '';
        let soConHeader = '';
        for (let i = 0; i < Math.min(matrix.length, 15); i++) {
            const headers = matrix[i].map(v => ({ raw: String(v || '').trim(), key: normalizeHeader(v) }));
            const id = headers.find(h => ['iddancu', 'dancuid', 'madinhdanh'].includes(h.key));
            const year = headers.find(h => ['namsinhconnhonhat', 'namsinhcongannhat', 'namsinhcon'].includes(h.key));
            const soCon = headers.find(h => ['socon', 'soconhienco', 'soluongcon'].includes(h.key));
            if (id && year && soCon) {
                headerIndex = i;
                idHeader = id.raw;
                yearHeader = year.raw;
                soConHeader = soCon.raw;
                break;
            }
        }
        if (headerIndex < 0) {
            return res.status(400).json({ success: false, message: 'Không tìm thấy đủ ba cột “ID dân cư”, “Số con” và “Năm sinh con nhỏ nhất”. Vui lòng dùng file Excel mới tải từ chức năng này và không đổi tên cột.' });
        }

        const rows = XLSX.utils.sheet_to_json(sheet, { range: headerIndex, defval: '', raw: true });
        const entries = [];
        const seenIds = new Set();
        const currentYear = new Date().getFullYear();
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const rawId = row[idHeader];
            if (rawId === null || rawId === undefined || String(rawId).trim() === '') {
                const hasOtherData = Object.values(row).some(value => value !== null && value !== undefined && String(value).trim() !== '');
                if (hasOtherData) return res.status(400).json({ success: false, message: `Dòng Excel ${headerIndex + rowIndex + 2} có dữ liệu nhưng thiếu ID dân cư. Không có dữ liệu nào được cập nhật.` });
                continue;
            }
            const idText = String(rawId).trim();
            if (!/^\d+$/.test(idText) || !Number.isSafeInteger(Number(idText)) || Number(idText) <= 0) {
                return res.status(400).json({ success: false, message: `ID dân cư không hợp lệ: ${idText}` });
            }
            const id = Number(idText);
            if (seenIds.has(id)) return res.status(400).json({ success: false, message: `ID dân cư ${id} bị lặp trong file. Vui lòng kiểm tra lại.` });
            seenIds.add(id);

            const rawYear = row[yearHeader];
            const yearText = rawYear === null || rawYear === undefined ? '' : String(rawYear).trim();
            let year = null;
            if (yearText !== '') {
                if (!/^\d{4}$/.test(yearText) || Number(yearText) < 1900 || Number(yearText) > currentYear) {
                    return res.status(400).json({ success: false, message: `Năm sinh con không hợp lệ tại ID dân cư ${id}: “${yearText}”. Chỉ nhập năm 4 chữ số từ 1900 đến ${currentYear}.` });
                }
                year = yearText;
            }

            const rawSoCon = row[soConHeader];
            const soConText = rawSoCon === null || rawSoCon === undefined ? '' : String(rawSoCon).trim();
            let soCon = null;
            if (soConText !== '') {
                const parsedSoCon = Number(soConText);
                if (!Number.isSafeInteger(parsedSoCon) || parsedSoCon < 0) {
                    return res.status(400).json({ success: false, message: `Số con không hợp lệ tại ID dân cư ${id}: “${soConText}”. Chỉ nhập số nguyên không âm, ví dụ 0, 1, 2, 3.` });
                }
                soCon = parsedSoCon;
            }
            entries.push({ id, year, soCon });
        }
        if (!entries.length) return res.status(400).json({ success: false, message: 'Không tìm thấy dòng dữ liệu có ID dân cư trong file Excel.' });

        // Khóa phạm vi theo tài khoản hiện tại; CTV không thể upload ID ngoài địa bàn được giao.
        const scope = await buildPhuNu1549Scope(req.session.user, {}, 2);
        await client.query('BEGIN');
        const ids = entries.map(item => item.id);
        const matched = await client.query(`
            SELECT d.id, d.so_con, COALESCE(d.nam_sinh_con,'') AS nam_sinh_con
            FROM dan_cu d
            WHERE d.id = ANY($1::bigint[]) AND ${scope.whereSql}
            FOR UPDATE
        `, [ids, ...scope.params]);
        const matchedById = new Map(matched.rows.map(row => [Number(row.id), {
            year: String(row.nam_sinh_con || '').trim(),
            soCon: row.so_con === null || row.so_con === undefined ? null : Number(row.so_con)
        }]));
        const missing = entries.filter(item => !matchedById.has(item.id));
        if (missing.length) {
            await client.query('ROLLBACK');
            const sample = missing.slice(0, 5).map(item => item.id).join(', ');
            return res.status(400).json({ success: false, message: `${missing.length} ID không còn thuộc danh sách phụ nữ 15-49 hiện tại hoặc nằm ngoài địa bàn được phân công (ví dụ: ${sample}). Không có dữ liệu nào được cập nhật.` });
        }

        const toUpdate = [];
        let blankYearSkipped = 0;
        let blankSoConSkipped = 0;
        let sameYear = 0;
        let sameSoCon = 0;
        let yearChanges = 0;
        let soConChanges = 0;
        for (const item of entries) {
            const current = matchedById.get(item.id);
            const nextYear = item.year !== null && current.year !== item.year ? item.year : null;
            const nextSoCon = item.soCon !== null && current.soCon !== item.soCon ? item.soCon : null;
            if (item.year === null) blankYearSkipped++;
            else if (nextYear === null) sameYear++;
            if (item.soCon === null) blankSoConSkipped++;
            else if (nextSoCon === null) sameSoCon++;
            if (nextYear !== null || nextSoCon !== null) {
                toUpdate.push({ id: item.id, year: nextYear, soCon: nextSoCon });
                if (nextYear !== null) yearChanges++;
                if (nextSoCon !== null) soConChanges++;
            }
        }

        if (toUpdate.length) {
            const values = [];
            const params = [];
            toUpdate.forEach((item, index) => {
                const p = index * 3;
                values.push(`($${p + 1}::bigint, $${p + 2}::integer, $${p + 3}::varchar)`);
                params.push(item.id, item.soCon, item.year);
            });
            await client.query(`
                UPDATE dan_cu AS d
                SET so_con = COALESCE(v.so_con, d.so_con),
                    nam_sinh_con = COALESCE(v.nam_sinh_con, d.nam_sinh_con)
                FROM (VALUES ${values.join(',')}) AS v(id, so_con, nam_sinh_con)
                WHERE d.id = v.id
            `, params);
        }
        await client.query('COMMIT');
        await logAction(req.session.user, 'Cập nhật số con và năm sinh con từ Excel 15-49', null, `Cập nhật ${toUpdate.length} hồ sơ; số con ${soConChanges}; năm sinh con ${yearChanges}; không thêm nhân khẩu.`);
        return res.json({
            success: true,
            message: `Hoàn tất: cập nhật ${toUpdate.length} hồ sơ (${soConChanges} thay đổi số con, ${yearChanges} thay đổi năm sinh con); ${sameSoCon} số con và ${sameYear} năm sinh đã đúng; ${blankSoConSkipped} ô số con và ${blankYearSkipped} ô năm sinh để trống được giữ nguyên. Không thêm nhân khẩu và không thay đổi thông tin dân cư khác.`,
            updated: toUpdate.length,
            updatedSoCon: soConChanges,
            updatedNamSinhCon: yearChanges,
            unchangedSoCon: sameSoCon,
            unchangedNamSinhCon: sameYear,
            blankSoConSkipped,
            blankYearSkipped,
            total: entries.length
        });
    } catch (err) {
        if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
        console.error('Lỗi nhập Excel cập nhật số con và năm sinh con 15-49:', err);
        return res.status(500).json({ success: false, message: 'Không thể cập nhật Excel: ' + err.message });
    } finally {
        if (client) client.release();
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
});

// API Lấy danh sách phụ nữ bị trùng (Cùng Mã hộ & Địa bàn hoặc Trùng Số thẻ BHYT)
// API Lấy danh sách phụ nữ bị trùng (Cùng Mã hộ & Địa bàn hoặc Trùng Số thẻ BHYT)
app.get('/api/admin/phu-nu-15-49-trung',async(req,res)=>{
 if(!req.session.user)return res.status(401).json({success:false,message:'Chưa đăng nhập'});
 try{
  const result=await pool.query(`WITH eligible AS (SELECT d.*,COALESCE(NULLIF(d.dia_chi,''),d.diabanh,'') AS dia_hien_thi FROM dan_cu d WHERE COALESCE(d.theo_doi_15_49,TRUE)=TRUE AND LOWER(TRIM(COALESCE(d.gioi_tinh,''))) IN ('nữ','nu','female','f') AND LOWER(TRIM(COALESCE(d.hon_nhan,''))) IN ('có vợ/có chồng','đã kết hôn','kết hôn','có chồng','có vợ','married','da ket hon'))
   SELECT e.id::text AS ma_dinh_danh,e.id AS dan_cu_id,e.ma_ho,e.dia_hien_thi AS diabanh,e.ho_ten,e.ngay_sinh,e.ma_bhyt AS so_the_bhyt,e.so_con,e.nam_sinh_con
   FROM eligible e WHERE EXISTS(SELECT 1 FROM eligible x WHERE x.id<>e.id AND x.ma_ho=e.ma_ho AND x.dia_hien_thi=e.dia_hien_thi)
   OR (NULLIF(e.ma_bhyt,'') IS NOT NULL AND EXISTS(SELECT 1 FROM eligible x WHERE x.id<>e.id AND x.ma_bhyt=e.ma_bhyt)) ORDER BY e.ma_ho,e.ho_ten`);
  return res.json({success:true,data:result.rows});
 }catch(err){console.error('Lỗi lấy danh sách trùng 15-49:',err);return res.status(500).json({success:false,message:err.message});}
});

// Xem toàn bộ danh sách 4.062 phụ nữ 15-49 trong CSDL
// API Lấy danh sách mã Địa bàn động dựa theo Ấp được chọn
app.get('/api/admin/danh-sach-dia-ban-by-ap', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const apName = (req.query.ap || '').trim();
        // Danh mục địa bàn lấy từ tài khoản được phân công, chuẩn hóa còn 3 số đầu.
        // Dữ liệu hiện được quản lý trực tiếp trong dan_cu.
        let query = `
            SELECT DISTINCT SUBSTRING(BTRIM(diabanh) FROM '^[0-9]{3}') AS ma_dia_ban
            FROM users
            WHERE diabanh IS NOT NULL
              AND BTRIM(diabanh) <> ''
              AND BTRIM(diabanh) NOT IN ('00', 'Toàn xã')
        `;
        const params = [];
        if (apName) {
            query += ` AND ap ILIKE $1`;
            params.push(`%${apName}%`);
        }
        query += ` ORDER BY ma_dia_ban ASC`;

        const result = await pool.query(query, params);
        const list = [...new Set(result.rows.map(r => r.ma_dia_ban).filter(Boolean))];
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API lấy danh sách các mã địa bàn thuộc một Ấp (Tra cứu chuẩn từ bảng users)
app.get('/api/admin/danh-sach-dia-ban-by-ap', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const apName = (req.query.ap || '').trim();
        let query = `
            SELECT DISTINCT diabanh 
            FROM users 
            WHERE diabanh IS NOT NULL AND diabanh != '' AND diabanh != '00' AND diabanh != 'Toàn xã'
        `;
        let params = [];
        if (apName) {
            query += ` AND ap ILIKE $1`;
            params.push(`%${apName}%`);
        }
        query += ` ORDER BY diabanh ASC`;

        const result = await pool.query(query, params);
        const list = result.rows.map(r => r.diabanh).filter(Boolean);
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API lấy danh sách phụ nữ 15-49 chuẩn hóa truy vấn Ấp thông qua danh sách địa bàn trong users
app.get('/api/admin/phu-nu-15-49-list', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    try {
        const user = req.session.user;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const offset = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const bpttFilter = String(req.query.bptt || '').trim();
        const apFilter = String(req.query.ap || '').trim();
        const diabanhFilter = String(req.query.diabanh || '').trim();
        const allArea = laQuanLyToanXa(user);
        const whereClauses = [
            'COALESCE(d.theo_doi_15_49, TRUE) = TRUE',
            "LOWER(TRIM(COALESCE(d.gioi_tinh,''))) IN ('nữ','nu','female','f')",
            "LOWER(TRIM(COALESCE(d.hon_nhan,''))) IN ('có vợ/có chồng','đã kết hôn','kết hôn','có chồng','có vợ','married','da ket hon')",
            `CASE WHEN d.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE, to_date(d.ngay_sinh,'DD/MM/YYYY'))) WHEN d.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN EXTRACT(YEAR FROM age(CURRENT_DATE, to_date(d.ngay_sinh,'YYYY-MM-DD'))) ELSE NULL END BETWEEN 15 AND 49`
        ];
        const params = [];
        let n = 1;
        let activeAp = allArea ? apFilter : String(user.ap || '').trim();
        let activeDb = allArea ? String(diabanhFilter || '').trim().match(/^\d{3}/)?.[0] || '' : (String(user.diabanh || '').trim().match(/^\d{3}/)?.[0] || '');
        if (activeDb && activeDb !== '00' && activeDb !== 'Toàn xã') {
            whereClauses.push(`LEFT(COALESCE(d.dia_chi,''),3) = $${n++}`); params.push(activeDb);
        } else if (activeAp && activeAp !== 'Tất cả') {
            const dbRes = await pool.query(`SELECT DISTINCT diabanh FROM users WHERE ap ILIKE $1 AND diabanh IS NOT NULL AND diabanh <> '' AND diabanh <> '00'`, [`%${activeAp}%`]);
            const dbs = dbRes.rows.map(r => String(r.diabanh || '').trim()).filter(Boolean);
            if (dbs.length) {
                const terms = dbs.map(db => { const code=String(db).trim().match(/^\d{3}/)?.[0] || ''; params.push(code); return `LEFT(COALESCE(d.dia_chi,''),3) = $${n++}`; }).filter(Boolean);
                whereClauses.push(`(${terms.join(' OR ')})`);
            } else { whereClauses.push(`COALESCE(d.dia_chi,'') ILIKE $${n++}`); params.push(`%${activeAp}%`); }
        }
        if (search) {
            whereClauses.push(`(d.ho_ten ILIKE $${n} OR d.ma_ho ILIKE $${n} OR CAST(d.id AS TEXT) ILIKE $${n})`);
            params.push(`%${search}%`); n++;
        }
        if (bpttFilter === 'NONE') {
            whereClauses.push(`(lb.ma_bptt IS NULL OR lb.ma_bptt = '' OR lb.ma_bptt = '0')`);
        } else if (bpttFilter) { whereClauses.push(`lb.ma_bptt = $${n++}`); params.push(bpttFilter); }
        const base = `FROM dan_cu d LEFT JOIN LATERAL (SELECT l.ma_bptt FROM lich_su_bptt l WHERE l.dan_cu_id=d.id ORDER BY l.ngay_ap_dung DESC,l.id DESC LIMIT 1) lb ON TRUE WHERE ${whereClauses.join(' AND ')}`;
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${base}`, params);
        const totalRows = countRes.rows[0]?.total || 0;
        const dataParams = [...params, limit, offset];
        const result = await pool.query(`
            SELECT d.id::text AS ma_dinh_danh, d.id AS dan_cu_id, d.ma_ho, COALESCE(NULLIF(d.dia_chi,''), d.diabanh, '') AS diabanh, d.ho_ten,
                   CASE WHEN d.ngay_sinh ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_char(to_date(d.ngay_sinh,'DD/MM/YYYY'),'YYYY-MM-DD')
                        WHEN d.ngay_sinh ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN d.ngay_sinh ELSE '' END AS ngay_sinh,
                   d.ma_bhyt AS so_the_bhyt, COALESCE(d.so_con,0) AS so_con, COALESCE(d.nam_sinh_con,'') AS nam_sinh_con,
                   lb.ma_bptt AS current_bptt
            ${base} ORDER BY d.ma_ho ASC, d.ho_ten ASC LIMIT $${n} OFFSET $${n+1}
        `, dataParams);
        res.json({ success: true, data: result.rows, currentPage: page, totalPages: Math.ceil(totalRows / limit) || 1, totalRows });
    } catch (err) {
        console.error('Lỗi lấy danh sách 15–49 từ dân cư:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


app.post('/api/admin/quan-ly-phu-nu', async (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ success:false, message:'Vui lòng đăng nhập lại.' });
    if (!coQuyenQuanLyPhuNu(user)) return res.status(403).json({ success:false, message:'Bạn không có quyền thêm hồ sơ.' });
    try {
        const ten = String(req.body.ho_ten || '').trim().replace(/\s+/g,' ');
        const maHo = String(req.body.ma_ho || '').trim();
        const ngaySinh = String(req.body.ngay_sinh || '').trim();
        const soCon = Number(req.body.so_con ?? 0);
        const db = laQuanLyToanXa(user) ? String(req.body.diabanh || '').trim() : String(user.diabanh || '').trim();
        if (!ten || !maHo || !db) return res.status(400).json({success:false,message:'Vui lòng nhập họ tên, mã hộ và địa bàn.'});
        if (!Number.isInteger(soCon) || soCon < 0) return res.status(400).json({success:false,message:'Số con phải là số nguyên không âm.'});
        const duplicate = await pool.query(`SELECT id FROM dan_cu WHERE TRIM(ma_ho)=$1 AND LOWER(TRIM(ho_ten))=LOWER(TRIM($2)) AND COALESCE(ngay_sinh,'')=COALESCE($3,'') LIMIT 1`,[maHo,ten,ngaySinh]);
        if (duplicate.rowCount) return res.status(409).json({success:false,message:'Người này đã có trong danh sách dân cư. Hãy tìm và sửa hồ sơ hiện có.'});
        const result = await pool.query(`INSERT INTO dan_cu (ho_ten,ma_ho,gioi_tinh,hon_nhan,ngay_sinh,ma_bhyt,diabanh,so_con,nam_sinh_con,theo_doi_15_49,nguon_du_lieu,updated_at) VALUES ($1,$2,'Nữ','Có vợ/Có chồng',$3,$4,$5,$6,$7,TRUE,'Quản lý 15-49',CURRENT_TIMESTAMP) RETURNING id`,[ten,maHo,ngaySinh || null,String(req.body.so_the_bhyt || '').trim(),db,soCon,String(req.body.nam_sinh_con || '').trim()]);
        await logAction(user,'Thêm hồ sơ dân cư từ quản lý 15-49',null,`Dân cư ID: ${result.rows[0].id} - ${ten}`);
        return res.json({success:true,message:'Đã thêm người vào bảng dân cư và danh sách theo dõi 15–49.',ma_dinh_danh:String(result.rows[0].id)});
    } catch(err) { console.error('Lỗi thêm hồ sơ 15–49 vào dân cư:',err); return res.status(500).json({success:false,message:err.message || 'Không thể thêm hồ sơ.'}); }
});

app.put('/api/admin/quan-ly-phu-nu/:ma_dinh_danh', async (req,res) => {
    const user=req.session.user;
    if(!user) return res.status(401).json({success:false,message:'Vui lòng đăng nhập lại.'});
    if(!coQuyenQuanLyPhuNu(user)) return res.status(403).json({success:false,message:'Bạn không có quyền sửa hồ sơ.'});
    const id=Number(req.params.ma_dinh_danh);
    if(!Number.isSafeInteger(id)||id<=0) return res.status(400).json({success:false,message:'Mã hồ sơ dân cư không hợp lệ.'});
    try {
        const old=await pool.query('SELECT id,diabanh FROM dan_cu WHERE id=$1',[id]);
        if(!old.rowCount) return res.status(404).json({success:false,message:'Không tìm thấy hồ sơ dân cư.'});
        if(!laQuanLyToanXa(user)&&!thuocDiaBanCongTacVien(user,old.rows[0].diabanh)) return res.status(403).json({success:false,message:'Hồ sơ không thuộc địa bàn của bạn.'});
        const db=laQuanLyToanXa(user)?String(req.body.diabanh || '').trim():old.rows[0].diabanh;
        const ten=String(req.body.ho_ten || '').trim().replace(/\s+/g,' '), maHo=String(req.body.ma_ho || '').trim(), soCon=Number(req.body.so_con ?? 0);
        if(!ten||!maHo||!db) return res.status(400).json({success:false,message:'Họ tên, mã hộ và địa bàn không được để trống.'});
        if(!Number.isInteger(soCon)||soCon<0) return res.status(400).json({success:false,message:'Số con phải là số nguyên không âm.'});
        const result=await pool.query(`UPDATE dan_cu SET ho_ten=$1,ma_ho=$2,diabanh=$3,ngay_sinh=$4,ma_bhyt=$5,so_con=$6,nam_sinh_con=$7,updated_at=CURRENT_TIMESTAMP WHERE id=$8 RETURNING id`,[ten,maHo,db,String(req.body.ngay_sinh||'').trim()||null,String(req.body.so_the_bhyt||'').trim(),soCon,String(req.body.nam_sinh_con||'').trim(),id]);
        await logAction(user,'Cập nhật hồ sơ dân cư từ quản lý 15-49',null,`Dân cư ID: ${id} - ${ten}`);
        return res.json({success:true,message:'Đã cập nhật hồ sơ dân cư.'});
    } catch(err) { console.error('Lỗi cập nhật hồ sơ 15–49:',err); return res.status(500).json({success:false,message:err.message || 'Không thể cập nhật hồ sơ.'}); }
});

app.delete('/api/admin/quan-ly-phu-nu/:ma_dinh_danh', async (req,res) => {
    const user=req.session.user;
    if(!user) return res.status(401).json({success:false,message:'Vui lòng đăng nhập lại.'});
    if(!coQuyenQuanLyPhuNu(user)) return res.status(403).json({success:false,message:'Bạn không có quyền ngừng theo dõi hồ sơ.'});
    const id=Number(req.params.ma_dinh_danh);
    if(!Number.isSafeInteger(id)||id<=0) return res.status(400).json({success:false,message:'Mã hồ sơ dân cư không hợp lệ.'});
    try {
        const found=await pool.query('SELECT id,ho_ten,diabanh FROM dan_cu WHERE id=$1',[id]);
        if(!found.rowCount) return res.status(404).json({success:false,message:'Không tìm thấy hồ sơ dân cư.'});
        const person=found.rows[0];
        if(!laQuanLyToanXa(user)&&!thuocDiaBanCongTacVien(user,person.diabanh)) return res.status(403).json({success:false,message:'Hồ sơ không thuộc địa bàn của bạn.'});
        await pool.query('UPDATE dan_cu SET theo_doi_15_49=FALSE, updated_at=CURRENT_TIMESTAMP WHERE id=$1',[id]);
        await logAction(user,'Ngừng theo dõi hồ sơ 15-49',null,`Dân cư ID: ${id} - ${person.ho_ten}`);
        return res.json({success:true,message:'Đã ngừng hiển thị trong danh sách 15–49. Hồ sơ dân cư gốc và lịch sử không bị xóa.'});
    } catch(err) { console.error('Lỗi ngừng theo dõi hồ sơ 15–49:',err); return res.status(500).json({success:false,message:'Không thể ngừng theo dõi hồ sơ.'}); }
});

// Danh mục BPTT lấy từ database
app.get('/api/admin/danh-muc-bptt', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Vui lòng đăng nhập.'
        });
    }

    try {
        const result = await pool.query(`
            SELECT ma_bptt, ten_bptt
            FROM danh_sach_bptt
            WHERE trang_thai = 1
            ORDER BY ma_bptt ASC
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error('Lỗi tải danh mục BPTT:', err);
        res.status(500).json({
            success: false,
            message: 'Không tải được danh mục BPTT.'
        });
    }
});

// Danh mục nơi thực hiện lấy từ database
app.get('/api/admin/danh-muc-noi-thuc-hien', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Vui lòng đăng nhập.'
        });
    }

    try {
        const result = await pool.query(`
            SELECT id, ten_noi_thuc_hien
            FROM danh_sach_noi_thuc_hien
            WHERE trang_thai = 1
            ORDER BY ten_noi_thuc_hien ASC
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error('Lỗi tải nơi thực hiện:', err);
        res.status(500).json({
            success: false,
            message: 'Không tải được danh mục nơi thực hiện.'
        });
    }
});

// Lấy lịch sử BPTT theo mã định danh của từng phụ nữ
app.get('/api/admin/quan-ly-lich-su-bptt', async (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({success:false,message:'Chưa đăng nhập.'});
    if (!coQuyenQuanLyPhuNu(user)) return res.status(403).json({success:false,message:'Không có quyền xem lịch sử.'});
    try {
        const id = String(req.query.ma_dinh_danh || '').trim();
        const params=[]; const cond=[];
        if (id) { params.push(Number(id)); cond.push(`d.id=$${params.length}`); }
        if (!laQuanLyToanXa(user)) { params.push(String(user.diabanh || '').trim()); cond.push(`d.diabanh=$${params.length}`); }
        const where=cond.length ? `WHERE ${cond.join(' AND ')}` : '';
        const result=await pool.query(`
            SELECT l.id, d.id::text AS ma_dinh_danh, d.ho_ten, d.diabanh, l.ma_bptt,
                   TO_CHAR(l.ngay_ap_dung,'YYYY-MM-DD') AS ngay_ap_dung, l.noi_thuc_hien
            FROM lich_su_bptt l JOIN dan_cu d ON d.id=l.dan_cu_id ${where}
            ORDER BY l.ngay_ap_dung DESC,l.id DESC LIMIT 500
        `,params);
        return res.json({success:true,data:result.rows});
    } catch(err) { console.error('Lỗi lấy lịch sử BPTT từ dân cư:',err); return res.status(500).json({success:false,message:err.message || 'Không tải được lịch sử BPTT.'}); }
});

app.post('/api/admin/quan-ly-lich-su-bptt', async (req,res) => {
    const user=req.session.user;
    if(!user) return res.status(401).json({success:false,message:'Vui lòng đăng nhập!'});
    if(!coQuyenQuanLyPhuNu(user)) return res.status(403).json({success:false,message:'Bạn không có quyền thêm lịch sử BPTT!'});
    const client=await pool.connect();
    try {
        const personId=Number(req.body.ma_dinh_danh), maBptt=String(req.body.ma_bptt||'').trim(), date=String(req.body.ngay_ap_dung||'').trim(), place=String(req.body.noi_thuc_hien||'').trim();
        if(!Number.isSafeInteger(personId)||personId<=0||!maBptt||!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({success:false,message:'Vui lòng chọn hồ sơ dân cư, mã BPTT và ngày áp dụng hợp lệ.'});
        await client.query('BEGIN');
        const found=await client.query('SELECT id,ma_ho,ho_ten,diabanh FROM dan_cu WHERE id=$1 FOR UPDATE',[personId]);
        if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Không tìm thấy hồ sơ dân cư.'});}
        const person=found.rows[0];
        if(!laQuanLyToanXa(user)&&!thuocDiaBanCongTacVien(user,person.diabanh)){await client.query('ROLLBACK');return res.status(403).json({success:false,message:'Hồ sơ không thuộc địa bàn của bạn.'});}
        await client.query('INSERT INTO lich_su_bptt (dan_cu_id,ma_bptt,ngay_ap_dung,noi_thuc_hien) VALUES ($1,$2,$3,$4)',[personId,maBptt,date,place]);
        await client.query(`INSERT INTO bien_dong_phu_nu (diabanh,loai_bien_dong,ho_so,ho_ten,nguoi_thuc_hien) VALUES ($1,'THEM_BPTT',$2,$3,$4)`,[person.diabanh||'',person.ma_ho||String(personId),person.ho_ten||'',user.username||user.fullname||'']);
        await client.query('COMMIT');
        await logAction(user,'Thêm mốc lịch sử BPTT',null,`Dân cư ID: ${personId}; BPTT: ${maBptt}`);
        return res.json({success:true,message:'Thêm mốc lịch sử BPTT thành công!'});
    } catch(err) { try{await client.query('ROLLBACK')}catch(_){} console.error('Lỗi thêm lịch sử BPTT:',err); return res.status(500).json({success:false,message:err.message||'Có lỗi khi thêm lịch sử BPTT.'}); }
    finally {client.release();}
});

// Sửa một mốc lịch sử BPTT.
// Người quản lý toàn xã được sửa toàn xã;
// cộng tác viên chỉ được sửa trong địa bàn được giao.
app.put('/api/admin/quan-ly-lich-su-bptt/:id', async (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập.'
        });
    }

    if (!coQuyenQuanLyPhuNu(user)) {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền sửa lịch sử BPTT.'
        });
    }

    const id = Number(req.params.id);
    const ma_bptt = String(req.body.ma_bptt || '').trim();
    const ngay_ap_dung = String(req.body.ngay_ap_dung || '').trim();
    const noi_thuc_hien = String(req.body.noi_thuc_hien || '').trim();

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: 'ID lịch sử không hợp lệ.'
        });
    }

    if (!ma_bptt || !/^\d{4}-\d{2}-\d{2}$/.test(ngay_ap_dung)) {
        return res.status(400).json({
            success: false,
            message: 'Vui lòng nhập mã BPTT và ngày áp dụng hợp lệ (YYYY-MM-DD).'
        });
    }

    try {
        const params = [id];
        let scopeSql = '';

        if (!laQuanLyToanXa(user)) {
            params.push(String(user.diabanh || '').trim());

            scopeSql = `AND EXISTS (
                SELECT 1
                FROM dan_cu p
                WHERE p.id = lich_su_bptt.dan_cu_id
                  AND LOWER(TRIM(p.diabanh)) = LOWER(TRIM($2))
            )`;
        }

        const found = await pool.query(`
            SELECT id, dan_cu_id, ma_bptt
            FROM lich_su_bptt
            WHERE id = $1 ${scopeSql}
        `, params);

        if (!found.rowCount) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy lịch sử hoặc dữ liệu ngoài địa bàn.'
            });
        }

        await pool.query(`
            UPDATE lich_su_bptt
            SET ma_bptt = $1,
                ngay_ap_dung = $2,
                noi_thuc_hien = $3
            WHERE id = $4
        `, [ma_bptt, ngay_ap_dung, noi_thuc_hien, id]);

        await logAction(
            user,
            'Sửa mốc lịch sử BPTT',
            id,
            `Dân cư ID: ${found.rows[0].dan_cu_id}; BPTT: ${found.rows[0].ma_bptt} → ${ma_bptt}`
        );

        return res.json({
            success: true,
            message: 'Đã cập nhật mốc lịch sử BPTT.'
        });

    } catch (err) {
        console.error('Lỗi sửa lịch sử BPTT:', err);

        return res.status(500).json({
            success: false,
            message: 'Không thể sửa lịch sử BPTT.'
        });
    }
});
// Xóa 1 mốc lịch sử BPTT (Mở rộng cho Admin và Lãnh đạo)

app.delete('/api/admin/quan-ly-lich-su-bptt/:id', async (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Vui lòng đăng nhập lại.'
        });
    }

    if (!coQuyenQuanLyPhuNu(user)) {
        return res.status(403).json({
            success: false,
            message: 'Bạn không có quyền xóa lịch sử BPTT.'
        });
    }

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: 'ID lịch sử không hợp lệ.'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const found = await client.query(
            `SELECT
                l.id,
                l.dan_cu_id,
                l.ma_bptt,
                p.ma_ho,
                p.ho_ten,
                p.diabanh
             FROM lich_su_bptt l
             JOIN dan_cu p
               ON p.id = l.dan_cu_id
             WHERE l.id = $1
             FOR UPDATE OF l`,
            [id]
        );

        if (!found.rowCount) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy lịch sử BPTT.'
            });
        }

        const history = found.rows[0];

        if (
            !laQuanLyToanXa(user) &&
            !thuocDiaBanCongTacVien(user, history.diabanh)
        ) {
            await client.query('ROLLBACK');

            return res.status(403).json({
                success: false,
                message: 'Lịch sử không thuộc địa bàn của bạn.'
            });
        }

        await client.query(
            'DELETE FROM lich_su_bptt WHERE id = $1',
            [id]
        );

        // Ghi nhận biến động khi xóa lịch sử BPTT.
        await client.query(
            `INSERT INTO bien_dong_phu_nu
                (diabanh, loai_bien_dong, ho_so, ho_ten, nguoi_thuc_hien)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                history.diabanh || '',
                'XOA_BPTT',
                history.ma_ho || history.dan_cu_id,
                history.ho_ten || '',
                user.username || user.fullname || ''
            ]
        );

        await client.query('COMMIT');

        await logAction(
            user,
            'Xóa mốc lịch sử BPTT',
            id,
            `Dân cư ID: ${history.dan_cu_id}; BPTT: ${history.ma_bptt}`
        );

        return res.json({
            success: true,
            message: 'Đã xóa lịch sử BPTT và ghi nhận biến động.'
        });

    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}

        console.error('Lỗi xóa lịch sử BPTT:', err);

        return res.status(500).json({
            success: false,
            message: 'Không thể xóa lịch sử BPTT.'
        });
    } finally {
        client.release();
    }
});

// Thống kê biến động phụ nữ 15-49 theo địa bàn
app.get('/api/admin/bien-dong-phu-nu/thong-ke',
    async (req, res) => {
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Chưa đăng nhập.'
            });
        }

        if (!coQuyenQuanLyPhuNu(user)) {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền xem biến động.'
            });
        }

        try {
            const params = [];
            let where = '';

            if (!laQuanLyToanXa(user)) {
                params.push(String(user.diabanh || '').trim());
                where = `WHERE diabanh = $1`;
            }

            const result = await pool.query(`
                SELECT
                    COALESCE(NULLIF(diabanh, ''), 'Chưa xác định')
                        AS dia_ban,
                    COALESCE(NULLIF(loai_bien_dong, ''), 'KHAC')
                        AS loai_bien_dong,
                    COUNT(*)::int AS so_luong
                FROM bien_dong_phu_nu
                ${where}
                GROUP BY 1, 2
                ORDER BY 1, 2
            `, params);

            res.json({
                success: true,
                data: result.rows
            });
        } catch (err) {
            console.error('Lỗi thống kê biến động:', err);
            res.status(500).json({
                success: false,
                message: 'Không tải được thống kê biến động.'
            });
        }
    }
);
// Xem chi tiết các dòng biến động
app.get('/api/admin/bien-dong-phu-nu',
    async (req, res) => {
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Chưa đăng nhập.'
            });
        }

        if (!coQuyenQuanLyPhuNu(user)) {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền xem biến động.'
            });
        }

        try {
            const params = [];
            const conditions = [];

            if (!laQuanLyToanXa(user)) {
                params.push(String(user.diabanh || '').trim());
                conditions.push(`diabanh = $${params.length}`);
            }

            if (req.query.diabanh) {
                params.push(String(req.query.diabanh).trim());
                conditions.push(`diabanh = $${params.length}`);
            }

            if (req.query.loai) {
                params.push(String(req.query.loai).trim());
                conditions.push(
                    `loai_bien_dong = $${params.length}`
                );
            }

            const where = conditions.length
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const result = await pool.query(`
                SELECT
                    id, diabanh, loai_bien_dong,
                    ho_so, ho_ten, nguoi_thuc_hien,
                    created_at
                FROM bien_dong_phu_nu
                ${where}
                ORDER BY id DESC
                LIMIT 1000
            `, params);

            res.json({
                success: true,
                data: result.rows
            });
        } catch (err) {
            console.error('Lỗi xem chi tiết biến động:', err);
            res.status(500).json({
                success: false,
                message: 'Không tải được chi tiết biến động.'
            });
        }
    }
);

// Xóa một dòng biến động theo ID
app.delete('/api/admin/bien-dong-phu-nu/:id',
    async (req, res) => {
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Chưa đăng nhập.'
            });
        }

        if (!coQuyenQuanLyPhuNu(user)) {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền xóa biến động.'
            });
        }

        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ.'
                });
            }

            const params = [id];
            let scopeSql = '';

            if (!laQuanLyToanXa(user)) {
                params.push(String(user.diabanh || '').trim());
                scopeSql = 'AND diabanh = $2';
            }

            const result = await pool.query(`
                DELETE FROM bien_dong_phu_nu
                WHERE id = $1
                ${scopeSql}
                RETURNING id, diabanh, ho_so, ho_ten
            `, params);

            if (!result.rowCount) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Không tìm thấy dòng biến động hoặc ngoài địa bàn.'
                });
            }

            await logAction(
                user,
                'Xóa dòng biến động phụ nữ 15-49',
                id,
                `Địa bàn: ${result.rows[0].diabanh || ''}; ` +
                `Mã hộ: ${result.rows[0].ho_so || ''}`
            );

            res.json({
                success: true,
                message: 'Đã xóa dòng biến động.'
            });
        } catch (err) {
            console.error('Lỗi xóa biến động:', err);
            res.status(500).json({
                success: false,
                message: 'Không thể xóa dòng biến động.'
            });
        }
    }
);
// ==================== API XEM TRƯỚC (PREVIEW) ĐỒNG BỘ NĂM SINH CON & BPTT ====================
app.get('/api/admin/preview-sync-nam-sinh-con', async (req,res) => {
    if(!req.session.user || !laQuanLyToanXa(req.session.user)) return res.status(403).json({success:false,message:'Không có quyền thực hiện chức năng này!'});
    try {
        const result=await pool.query(`
            WITH normalized_child AS (
                SELECT t1.ho_so,t1.ngay_sinh_con,t1.noi_de,t1.ho_ten_me,
                    CASE WHEN POSITION('.' IN TRIM(t1.ho_so))>0 THEN LPAD(SPLIT_PART(TRIM(t1.ho_so),'.',1),5,'0')||'.'||SPLIT_PART(TRIM(t1.ho_so),'.',2) ELSE LPAD(TRIM(t1.ho_so),5,'0') END AS ma_ho_chuan,
                    REGEXP_REPLACE(LOWER(TRIM(t1.ho_ten_me)),'[[:space:]]+',' ','g') AS ho_ten_me_norm
                FROM table_1 t1 WHERE COALESCE(TRIM(t1.ho_so),'')<>'' AND COALESCE(TRIM(t1.ho_ten_me),'')<>''
            ), child_stats AS (
                SELECT ma_ho_chuan,ho_ten_me_norm,MAX(SUBSTRING(TRIM(ngay_sinh_con::text),1,4)) AS new_nam_sinh_con
                FROM normalized_child GROUP BY ma_ho_chuan,ho_ten_me_norm
            )
            SELECT d.id::text AS ma_dinh_danh,d.id AS dan_cu_id,d.ma_ho,d.ho_ten,d.diabanh,
                   COALESCE(d.so_con,0) AS so_con_cu,COALESCE(d.so_con,0) AS so_con_moi,
                   d.nam_sinh_con AS nam_sinh_con_cu,cs.new_nam_sinh_con AS nam_sinh_con_moi,
                   COALESCE(lb.ma_bptt,'0') AS bptt_cu
            FROM dan_cu d JOIN child_stats cs ON
                (CASE WHEN POSITION('.' IN TRIM(d.ma_ho))>0 THEN LPAD(SPLIT_PART(TRIM(d.ma_ho),'.',1),5,'0')||'.'||SPLIT_PART(TRIM(d.ma_ho),'.',2) ELSE LPAD(TRIM(d.ma_ho),5,'0') END)=cs.ma_ho_chuan
                AND REGEXP_REPLACE(LOWER(TRIM(d.ho_ten)),'[[:space:]]+',' ','g')=cs.ho_ten_me_norm
            LEFT JOIN LATERAL (SELECT ma_bptt FROM lich_su_bptt WHERE dan_cu_id=d.id ORDER BY ngay_ap_dung DESC,id DESC LIMIT 1) lb ON TRUE
            WHERE d.theo_doi_15_49=TRUE AND (d.nam_sinh_con IS DISTINCT FROM cs.new_nam_sinh_con OR COALESCE(lb.ma_bptt,'0') IS DISTINCT FROM 'S')
            ORDER BY d.ma_ho,d.ho_ten LIMIT 200
        `);
        return res.json({success:true,data:result.rows});
    } catch(err) {console.error('Lỗi xem trước đồng bộ từ dân cư:',err);return res.status(500).json({success:false,message:'Lỗi xem trước: '+err.message});}
});

app.post('/api/admin/confirm-sync-nam-sinh-con', async (req,res) => {
    if(!req.session.user || !laQuanLyToanXa(req.session.user)) return res.status(403).json({success:false,message:'Không có quyền thực hiện chức năng này!'});
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        const activeCommune = await getActiveCommune();
        await client.query(`
            WITH normalized_child AS (
                SELECT t1.ho_so,t1.ngay_sinh_con,t1.noi_de,t1.ho_ten_me,
                    CASE WHEN POSITION('.' IN TRIM(t1.ho_so))>0 THEN LPAD(SPLIT_PART(TRIM(t1.ho_so),'.',1),5,'0')||'.'||SPLIT_PART(TRIM(t1.ho_so),'.',2) ELSE LPAD(TRIM(t1.ho_so),5,'0') END AS ma_ho_chuan,
                    REGEXP_REPLACE(LOWER(TRIM(t1.ho_ten_me)),'[[:space:]]+',' ','g') AS ho_ten_me_norm
                FROM table_1 t1 WHERE COALESCE(TRIM(t1.ho_so),'')<>'' AND COALESCE(TRIM(t1.ho_ten_me),'')<>''
            ), child_stats AS (
                SELECT ma_ho_chuan,ho_ten_me_norm,MAX(SUBSTRING(TRIM(ngay_sinh_con::text),1,4)) AS max_nam_sinh_con,
                       MAX(ngay_sinh_con::text) AS max_ngay_sinh,MAX(noi_de) AS noi_thuc_hien
                FROM normalized_child GROUP BY ma_ho_chuan,ho_ten_me_norm
            ), updated_women AS (
                UPDATE dan_cu d SET nam_sinh_con=cs.max_nam_sinh_con,updated_at=CURRENT_TIMESTAMP
                FROM child_stats cs
                WHERE d.theo_doi_15_49=TRUE
                  AND (CASE WHEN POSITION('.' IN TRIM(d.ma_ho))>0 THEN LPAD(SPLIT_PART(TRIM(d.ma_ho),'.',1),5,'0')||'.'||SPLIT_PART(TRIM(d.ma_ho),'.',2) ELSE LPAD(TRIM(d.ma_ho),5,'0') END)=cs.ma_ho_chuan
                  AND REGEXP_REPLACE(LOWER(TRIM(d.ho_ten)),'[[:space:]]+',' ','g')=cs.ho_ten_me_norm
                RETURNING d.id AS dan_cu_id,d.ma_ho,d.ho_ten,d.diabanh,cs.max_ngay_sinh,cs.noi_thuc_hien
            )
            INSERT INTO lich_su_bptt (dan_cu_id,ma_bptt,ngay_ap_dung,noi_thuc_hien)
            SELECT u.dan_cu_id,'S',COALESCE(NULLIF(u.max_ngay_sinh,'')::date,CURRENT_DATE),COALESCE(NULLIF(u.noi_thuc_hien,''),NULLIF($1,''))
            FROM updated_women u
            WHERE NOT EXISTS (SELECT 1 FROM lich_su_bptt l WHERE l.dan_cu_id=u.dan_cu_id AND l.ma_bptt='S' AND l.ngay_ap_dung=COALESCE(NULLIF(u.max_ngay_sinh,'')::date,CURRENT_DATE))
        `, [activeCommune?.ten_tram_y_te || '']);
        await client.query('COMMIT');
        await logAction(req.session.user,'Đồng bộ năm sinh con và BPTT S từ Bảng 1',null,'Cập nhật dan_cu; không thay đổi tổng số con.');
        return res.json({success:true,message:'Đã đồng bộ năm sinh con và lịch sử BPTT từ Bảng 1. Tổng số con không bị ghi đè.'});
    } catch(err) {try{await client.query('ROLLBACK')}catch(_){} console.error('Lỗi thực thi đồng bộ từ dân cư:',err);return res.status(500).json({success:false,message:'Lỗi đồng bộ: '+err.message});}
    finally {client.release();}
});



// Khởi chạy server
/// Khởi chạy server sau khi CSDL đã sẵn sàng
const PORT = process.env.PORT || 3000;

async function startServer() {
    await initDatabase(); // Chờ khởi tạo xong bảng và cột
    app.listen(PORT, () => {
        console.log(`==> Server đang chạy trên cổng ${PORT}`);
    });
}

startServer();