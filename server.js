require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();

// Tự động tạo thư mục 'uploads' nếu chưa có để tránh lỗi lưu file tạm của multer
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: 'uploads/' });

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

            -- 1. Bảng lưu danh sách 4.062 phụ nữ cố định (Mã định danh ghép: 101_00007)
            CREATE TABLE IF NOT EXISTS phu_nu_15_49 (
                ma_dinh_danh VARCHAR(30) PRIMARY KEY, -- VD: '101_00007'
                ma_ho VARCHAR(20) NOT NULL,          -- VD: '00007'
                diabanh VARCHAR(100) NOT NULL,        -- VD: '101, Xã Lương Hòa'
                ho_ten VARCHAR(100) NOT NULL,        -- VD: 'Lê Nguyễn Phương Bình'
                ngay_sinh DATE,                       -- VD: '1995-01-01'
                so_the_bhyt VARCHAR(20),
                so_con INT DEFAULT 0,
                nam_sinh_con VARCHAR(50),
                ghi_chu TEXT
            );

            -- 2. Bảng lưu lịch sử thay đổi BPTT (Siêu nhẹ, chỉ ghi mốc phát sinh)
            CREATE TABLE IF NOT EXISTS lich_su_bptt (
                id SERIAL PRIMARY KEY,
                ma_dinh_danh VARCHAR(30) REFERENCES phu_nu_15_49(ma_dinh_danh) ON DELETE CASCADE,
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
            ALTER TABLE table_4 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_5 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_6 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_7 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_9 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_10 ADD COLUMN IF NOT EXISTS ma_the_bhyt TEXT;

            -- Đảm bảo bảng có sẵn các cột này
            ALTER TABLE phu_nu_15_49 ADD COLUMN IF NOT EXISTS so_con INT DEFAULT 0;
            ALTER TABLE phu_nu_15_49 ADD COLUMN IF NOT EXISTS nam_sinh_con VARCHAR(50);
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

        // Thêm dữ liệu mẫu Nơi thực hiện nếu chưa có
        const nthCheck = await pool.query("SELECT id FROM danh_sach_noi_thuc_hien LIMIT 1");
        if (nthCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO danh_sach_noi_thuc_hien (ten_noi_thuc_hien) VALUES 
                ('Trạm Y tế xã Lương Hòa'), 
                ('Bệnh viện Đa khoa Bến Lức'), 
                ('Bệnh viện Hùng Vương'), 
                ('Bệnh viện Từ Dũ');
            `);
        }

        // Thêm Ấp mẫu nếu chưa có
        const apCheck = await pool.query("SELECT id FROM danh_sach_ap LIMIT 1");
        if (apCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO danh_sach_ap (ten_ap) VALUES 
                ('Ấp Mỹ Nhơn'), ('Ấp Tân Bửu'), ('Ấp Bình Yên'), 
                ('Ấp Tân Phú'), ('Ấp Xáng Lớn'), ('Ấp Lương Hòa Hạ');
            `);
        }

        // Thêm Bệnh viện mẫu mặc định nếu chưa có
        const bvCheck = await pool.query("SELECT id FROM danh_sach_benh_vien LIMIT 1");
        if (bvCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO danh_sach_benh_vien (ten_benh_vien, dia_chi) VALUES 
                ('Bệnh viện Đa khoa khu vực Long An', 'Tỉnh Long An'),
                ('Bệnh viện Đa khoa Bến Lức', 'Huyện Bến Lức'),
                ('Trạm Y tế xã Lương Hòa', 'Xã Lương Hòa'),
                ('Bệnh viện Từ Dũ', 'TP. Hồ Chí Minh');
            `);
        }

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
            `, ["Quản trị hệ thống", "admin", "admin123", "admin", "Toàn xã", "Tất cả", "Lương Hòa", getVietnamTimestamp()]);
        }

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

        req.session.user = { 
            id: user.id, 
            username: user.username, 
            fullname: user.fullname, 
            role: user.role,
            diabanh: user.diabanh,
            ap: user.ap,
            xa: user.xa
        };

        // Ghi log đăng nhập
        await logAction(req.session.user, `Đăng nhập vào hệ thống thành công`, user.id, user.fullname);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/me", (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    res.json(req.session.user);
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

        res.json({ success: true, message: "Lưu dữ liệu thành công!" });
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

// ==================== API CẬP NHẬT DỮ LIỆU BẢNG (GHI CHI TIẾT THAY ĐỔI) ====================
app.put("/api/data/:table/:id", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    const tableName = req.params.table;
    const recordId = req.params.id;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    try {
        let user = req.session.user;
        let dataObj = req.body;

        let checkRecord = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [recordId]);
        if (checkRecord.rows.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi" });
        
        let oldData = checkRecord.rows[0];

        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            if (oldData.ap !== user.ap) {
                return res.status(403).json({ success: false, message: "Bạn không có quyền sửa dữ liệu của ấp khác!" });
            }
            delete dataObj.ap;
        }

        delete dataObj.id;
        //delete dataObj.created_at;

        // So sánh để ghi rõ thay đổi
        let changes = [];
        for (let key of Object.keys(dataObj)) {
            if (String(oldData[key] || '') !== String(dataObj[key] || '')) {
                changes.push(`${key}: "${oldData[key] || ''}" ➔ "${dataObj[key]}"`);
            }
        }

        const keys = Object.keys(dataObj);
        const values = Object.values(dataObj);
        if (keys.length === 0) return res.status(400).json({ success: false, message: "Không có dữ liệu cập nhật" });

        const setString = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");
        values.push(recordId);

        await pool.query(`UPDATE ${tableName} SET ${setString} WHERE id = $${values.length}`, values);

        const targetName = oldData.ho_so || oldData.ho_ten || oldData.ho_ten_con || oldData.ho_ten_vo || `ID: ${recordId}`;
        const changeDetails = changes.length > 0 ? changes.join(' | ') : 'Cập nhật thông tin';

        // === GHI NHẬT KÝ SỬA CHI TIẾT ===
        await logAction(user, `Cập nhật dữ liệu ${tableName} (ID: ${recordId})`, parseInt(recordId), `[${targetName}] Thay đổi: ${changeDetails}`);

        res.json({ success: true, message: "Cập nhật dữ liệu thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
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

    const userKey = diaBanUser.toLocaleLowerCase('vi');
    const hoSoKey = diaBanHoSo.toLocaleLowerCase('vi');

    return userKey === hoSoKey ||
           hoSoKey.startsWith(userKey + '_');
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
        const result = await pool.query("SELECT id, fullname, username, role, diabanh, ap, xa, active, created_at FROM users ORDER BY id ASC");
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
    
    if (admin_password !== 'admin123') {
        return res.status(400).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
    }

    try {
        const insertRes = await pool.query(
            `INSERT INTO users (fullname, username, password, role, diabanh, ap, xa, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8) RETURNING id`,
            [fullname, username, password, role, diabanh, ap, xa, getVietnamTimestamp()]
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

    if (admin_password !== 'admin123') {
        return res.status(400).json({ success: false, message: "Mật khẩu quản trị không chính xác!" });
    }

    try {
        if (password) {
            await pool.query(
                `UPDATE users SET fullname = $1, username = $2, password = $3, role = $4, diabanh = $5, ap = $6, xa = $7 WHERE id = $8`,
                [fullname, username, password, role, diabanh, ap, xa, userId]
            );
        } else {
            await pool.query(
                `UPDATE users SET fullname = $1, username = $2, role = $3, diabanh = $4, ap = $5, xa = $6 WHERE id = $7`,
                [fullname, username, role, diabanh, ap, xa, userId]
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
// API CHO BẢNG 7 (VỢ CHỒNG MỚI / THAY ĐỔI BPTT) & QUẢN LÝ 15-49
// ============================================================

// 1. API Tìm kiếm thông tin từ danh sách 4.062 phụ nữ (dành cho Bảng 7)
app.get('/api/search-phu-nu-15-49', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    try {
        const q = req.query.q || '';
        if (!q.trim()) return res.json([]);

        const user = req.session.user;
        let query = `
            SELECT ma_dinh_danh, ma_ho, diabanh, ho_ten, TO_CHAR(ngay_sinh, 'YYYY-MM-DD') AS ngay_sinh, so_the_bhyt
            FROM phu_nu_15_49
            WHERE (ma_ho ILIKE $1 OR ho_ten ILIKE $1)
        `;
        let params = [`%${q.trim()}%`];

        // Nếu là cộng tác viên ấp (không phải admin hay lãnh đạo), chỉ tìm kiếm trong địa bàn/ấp của họ
        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            params.push(`%${user.ap}%`, `%${user.diabanh}%`);
            query += ` AND (diabanh ILIKE $2 OR diabanh ILIKE $3)`;
        }

        query += ` ORDER BY ma_ho ASC LIMIT 20`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Lỗi tìm kiếm phụ nữ:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. API Đồng bộ khi Nhập Bảng 7 (Vợ chồng mới / thay đổi BPTT)
// API lưu Bảng 7 và kiểm tra điều kiện Phụ nữ 15–49


// ==================== API ĐỒNG BỘ TỰ ĐỘNG PHỤ NỮ 15-49 TỪ BẢNG 1 ====================
app.post('/api/admin/sync-phu-nu-from-table1', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    
    try {
        
        const {
            ho_ten_me,
            ngay_sinh_me,
            so_the_bhyt_me,
            ngay_sinh_con,
            noi_de,
            diabanh,
            con_thu_may
        } = req.body;

        const ho_so = String(req.body.ho_so || req.body.so_ho || '').trim();

        if (!ho_so || !ho_ten_me) {
            return res.status(400).json({
                success: false,
                message: "Thiếu mã hộ hoặc họ tên mẹ, không thể đồng bộ phụ nữ 15-49."
            });
        }

        if (!ho_so || !ho_ten_me) return res.json({ success: true });

        const prefix = (diabanh || '101').trim().substring(0, 3);
        const maHoClean = ho_so.trim();
        const maDinhDanh = `${prefix}_${maHoClean}`;
        const namSinhCon = ngay_sinh_con ? ngay_sinh_con.substring(0, 4) : '';

        // Kiểm tra xem người mẹ đã tồn tại trong danh sách 15-49 chưa
        const findMom = await pool.query(`
            SELECT ma_dinh_danh, so_con FROM phu_nu_15_49 
            WHERE ma_ho = $1 AND REGEXP_REPLACE(LOWER(TRIM(ho_ten)), '\\s+', ' ', 'g') = REGEXP_REPLACE(LOWER(TRIM($2)), '\\s+', ' ', 'g')
            LIMIT 1
        `, [maHoClean, ho_ten_me]);

        let targetMaDinhDanh = maDinhDanh;

        // 👇 ĐẶT ĐOẠN CODE CỦA BẠN VÀO NGAY KHÚC NÀY 👇
        if (findMom.rows.length > 0) {
            targetMaDinhDanh = findMom.rows[0].ma_dinh_danh;
            let currentSoCon = (Number(findMom.rows[0].so_con) || 0) + 1;

            await pool.query(`
                UPDATE phu_nu_15_49 
                SET so_con = $1, nam_sinh_con = $2, so_the_bhyt = COALESCE(NULLIF($3, ''), so_the_bhyt)
                WHERE ma_dinh_danh = $4
            `, [currentSoCon, namSinhCon, so_the_bhyt_me, targetMaDinhDanh]);
        } else {
            // 🎯 ĐỐI VỚI HỘ MỚI HOẶC NGƯỜI MỚI CHƯA CÓ TRONG 15-49:
            // Lấy số con khởi tạo từ form (mặc định là 1 nếu không truyền)
            let initialSoCon = Number(con_thu_may) || 1;

            await pool.query(`
                INSERT INTO phu_nu_15_49 (ma_dinh_danh, ma_ho, diabanh, ho_ten, ngay_sinh, so_the_bhyt, so_con, nam_sinh_con)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (ma_dinh_danh) DO UPDATE SET so_con = EXCLUDED.so_con, nam_sinh_con = EXCLUDED.nam_sinh_con
            `, [targetMaDinhDanh, maHoClean, diabanh || '101, Xã Lương Hòa', ho_ten_me, ngay_sinh_me || null, so_the_bhyt_me || null, initialSoCon, namSinhCon]);
        }

        // Tự động ghi nhận mốc lịch sử BPTT là mã 'S' (Sinh đẻ) cho cả hộ mới lẫn hộ cũ
        await pool.query(`
            INSERT INTO lich_su_bptt (ma_dinh_danh, ma_bptt, ngay_ap_dung, noi_thuc_hien)
            VALUES ($1, 'S', $2, $3)
        `, [targetMaDinhDanh, ngay_sinh_con || new Date().toISOString().split('T')[0], noi_de || 'Trạm Y tế xã Lương Hòa']);
        // 👆 HẾT KHÚC NÀY 👆

        res.json({ success: true, message: "Đồng bộ phụ nữ 15-49 thành công!" });
    } catch (err) {
        console.error('Lỗi sync phụ nữ từ Bảng 1:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================================
// 2. API ĐỒNG BỘ BẢNG 3 (Người chết -> Xóa 15-49 & Ghi log XOA_BO)
// ==========================================================

app.post('/api/admin/sync-phu-nu-from-table3', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Vui lòng đăng nhập lại.'
        });
    }

    const client = await pool.connect();

    try {
        const { ho_so, ho_ten } = req.body;

        const maHo = String(ho_so || '').trim();
        const hoTen = String(ho_ten || '').trim();

        if (!maHo || !hoTen) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu mã hộ hoặc họ tên, không thể xác định người.'
            });
        }

        await client.query('BEGIN');

        // Chỉ xóa đúng người khớp cả mã hộ và họ tên.
        const deleteResult = await client.query(`
            DELETE FROM phu_nu_15_49
            WHERE TRIM(ma_ho) = $1
              AND LOWER(TRIM(ho_ten)) = LOWER(TRIM($2))
            RETURNING ma_dinh_danh, ma_ho, ho_ten
        `, [maHo, hoTen]);

        // Chỉ ghi log khi thực sự xóa được hồ sơ.
        if (deleteResult.rowCount > 0) {
            await client.query(`
                INSERT INTO bien_dong_phu_nu (
                    diabanh,
                    loai_bien_dong,
                    ho_so,
                    ho_ten,
                    nguoi_thuc_hien
                )
                VALUES ($1, 'XOA_BO', $2, $3, $4)
            `, [
                req.session.user.diabanh || '',
                maHo,
                hoTen,
                req.session.user.username || ''
            ]);
        }

        await client.query('COMMIT');

        return res.json({
            success: true,
            deleted: deleteResult.rowCount > 0,
            deleted_count: deleteResult.rowCount,
            message: deleteResult.rowCount > 0
                ? 'Đã xóa đúng người khỏi danh sách 15–49.'
                : 'Không tìm thấy người khớp cả mã hộ và họ tên.'
        });

    } catch (err) {
        await client.query('ROLLBACK');

        console.error('Lỗi đồng bộ Bảng 3:', err);

        return res.status(500).json({
            success: false,
            message: err.message
        });
    } finally {
        client.release();
    }
});


// ==========================================================
// 3. API ĐỒNG BỘ BẢNG 4 (Chuyển đến -> Thêm 15-49 nếu Nữ 15-49 & Ghi log THEM_MOI)
// ==========================================================
app.post('/api/admin/sync-phu-nu-from-table4', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const { ho_so, ho_ten, ngay_sinh, gioi_tinh, tinh_trang_hon_nhan, so_the_bhyt, noi_cu_tru, bptt_moi, so_con, nam_sinh_con } = req.body;
        if (!ho_ten) return res.json({ success: true });

        // 1. Kiểm tra giới tính Nữ
        const gioiTinhStr = String(gioi_tinh || '').trim().toLowerCase();
        const isNu = gioiTinhStr.includes('nữ') || gioiTinhStr === 'nu' || gioiTinhStr === 'f';
        if (!isNu) return res.json({ success: true, message: "Không phải nữ, bỏ qua" });

        // 2. Kiểm tra độ tuổi từ 15 đến 49
        let age = null;
        if (ngay_sinh) {
            const birthDate = new Date(ngay_sinh);
            if (!isNaN(birthDate.getTime())) {
                const today = new Date();
                age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
            }
        }
        if (age === null || age < 15 || age > 49) return res.json({ success: true, message: "Ngoài độ tuổi 15-49, bỏ qua" });

        // 3. Kiểm tra tình trạng có chồng (Bỏ qua nếu độc thân hoặc chưa kết hôn)
        const honNhanStr = String(tinh_trang_hon_nhan || '').trim().toLowerCase();
        if (honNhanStr.includes('chưa kết hôn') || honNhanStr.includes('độc thân') || honNhanStr.includes('chưa có chồng')) {
            return res.json({ success: true, message: "Chưa có chồng, bỏ qua đồng bộ 15-49" });
        }

        const diabanhUser = noi_cu_tru || req.session.user.diabanh || '';
        const prefix = (diabanhUser || '101').trim().substring(0, 3);
        const maHoClean = (ho_so || '').trim();
        const maDinhDanh = `${prefix}_${maHoClean}_${Date.now()}`;

        // Kiểm tra tồn tại trong 15-49
        const checkExist = await pool.query(`
            SELECT ma_dinh_danh FROM phu_nu_15_49 WHERE LOWER(TRIM(ho_ten)) = LOWER(TRIM($1)) AND ma_ho = $2
        `, [ho_ten, maHoClean]);

        if (checkExist.rows.length === 0) {
            // Thêm mới vào danh sách quản lý 15-49 kèm thông tin gia đình
            await pool.query(`
                INSERT INTO phu_nu_15_49 (ma_dinh_danh, ma_ho, ho_ten, ngay_sinh, so_the_bhyt, diabanh, so_con, nam_sinh_con)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [maDinhDanh, maHoClean, ho_ten, ngay_sinh || null, so_the_bhyt || '', diabanhUser, parseInt(so_con) || 0, nam_sinh_con || '']);

            // Ghi nhận mốc BPTT nếu có chọn
            if (bptt_moi) {
                await pool.query(`
                    INSERT INTO lich_su_bptt (ma_dinh_danh, ma_bptt, ngay_ap_dung, noi_thuc_hien)
                    VALUES ($1, $2, CURRENT_DATE, $3)
                `, [maDinhDanh, bptt_moi, 'Trạm Y tế xã Lương Hòa']);
            }

            // Ghi log biến động THEM_MOI tối giản
            await pool.query(`
                INSERT INTO bien_dong_phu_nu (diabanh, loai_bien_dong, ho_so, ho_ten, nguoi_thuc_hien)
                VALUES ($1, 'THEM_MOI', $2, $3, $4)
            `, [req.session.user.diabanh || '', maHoClean, ho_ten, req.session.user.username]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Lỗi đồng bộ Bảng 4:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================================
// 4. API ĐỒNG BỘ BẢNG 5 (Chuyển đi -> Xóa 15-49 & Ghi log XOA_BO)
// ==========================================================

app.post('/api/admin/sync-phu-nu-from-table5', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Vui lòng đăng nhập lại.'
        });
    }

    const client = await pool.connect();

    try {
        const { ho_so, ho_ten } = req.body;

        const maHo = String(ho_so || '').trim();
        const hoTen = String(ho_ten || '').trim();

        if (!maHo || !hoTen) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu mã hộ hoặc họ tên, không thể xác định người chuyển đi.'
            });
        }

        await client.query('BEGIN');

        // Chỉ xóa người khớp CẢ mã hộ và họ tên.
        // Không dùng OR để tránh xóa nhầm người trùng tên.
        const deleteResult = await client.query(`
            DELETE FROM phu_nu_15_49
            WHERE TRIM(ma_ho) = $1
              AND LOWER(TRIM(ho_ten)) = LOWER(TRIM($2))
            RETURNING ma_dinh_danh, ma_ho, ho_ten
        `, [maHo, hoTen]);

        // Chỉ ghi nhận biến động nếu thực sự xóa được hồ sơ.
        if (deleteResult.rowCount > 0) {
            await client.query(`
                INSERT INTO bien_dong_phu_nu (
                    diabanh,
                    loai_bien_dong,
                    ho_so,
                    ho_ten,
                    nguoi_thuc_hien
                )
                VALUES ($1, 'XOA_BO', $2, $3, $4)
            `, [
                req.session.user.diabanh || '',
                maHo,
                hoTen,
                req.session.user.username || ''
            ]);
        }

        await client.query('COMMIT');

        return res.json({
            success: true,
            deleted: deleteResult.rowCount > 0,
            deleted_count: deleteResult.rowCount,
            message: deleteResult.rowCount > 0
                ? 'Đã xóa đúng người chuyển đi khỏi danh sách 15–49.'
                : 'Không tìm thấy người khớp cả mã hộ và họ tên trong danh sách 15–49.'
        });

    } catch (err) {
        await client.query('ROLLBACK');

        console.error('Lỗi đồng bộ Bảng 5:', err);

        return res.status(500).json({
            success: false,
            message: err.message
        });
    } finally {
        client.release();
    }
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
                p.ma_dinh_danh, p.ho_ten,
                latest.ma_bptt, latest.ngay_ap_dung,
                COALESCE(
                    ds.ten_bptt,
                    CASE latest.ma_bptt WHEN 'T' THEN 'Thai' WHEN 'S' THEN 'Sanh' ELSE latest.ma_bptt END
                ) AS ten_bptt
            FROM phu_nu_15_49 p
            LEFT JOIN LATERAL (
                SELECT l.ma_bptt, l.ngay_ap_dung
                FROM lich_su_bptt l
                WHERE l.ma_dinh_danh = p.ma_dinh_danh
                ORDER BY l.ngay_ap_dung DESC, l.id DESC
                LIMIT 1
            ) latest ON TRUE
            LEFT JOIN danh_sach_bptt ds ON ds.ma_bptt = latest.ma_bptt
            WHERE TRIM(p.ma_ho) = $1
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
// API 2: THỰC THI GHI DỮ LIỆU & ĐỒNG BỘ PHỤ NỮ 15-49 TỪ BẢNG 7
// ============================================================
app.post('/api/admin/sync-phu-nu-from-table7', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    const client = await pool.connect();
    try {
        const {
            ho_so,
            ho_ten_vo,
            ngay_sinh,
            so_the_bhyt,
            ngay_su_dung,
            bptt_moi,
            so_con_hien_co,
            noi_thuc_hien,
            diabanh
        } = req.body;

        if (!String(ho_so || '').trim() || !String(ho_ten_vo || '').trim() || !bptt_moi || !ngay_su_dung) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập đủ Hộ số, Họ tên người vợ, Ngày sử dụng và Biện pháp tránh thai mới.'
            });
        }

        const hoSoClean = String(ho_so).trim();
        const hoTenClean = String(ho_ten_vo).trim().replace(/\s+/g, ' ');

        const soConText = String(so_con_hien_co ?? '').trim();
        const soConValue = soConText === '' ? null : Number(soConText);

        if (soConValue !== null && (!Number.isInteger(soConValue) || soConValue < 0)) {
            return res.status(400).json({
                success: false,
                message: 'Số con hiện có phải là số nguyên không âm.'
            });
        }

        await client.query('BEGIN');

        // Tìm xem người vợ đã có trong danh sách 15-49 chưa
        const householdRes = await client.query(`
            SELECT ma_dinh_danh, ho_ten 
            FROM phu_nu_15_49 
            WHERE TRIM(ma_ho) = $1
        `, [hoSoClean]);

        const normalizeName = value => String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        const existingWoman = householdRes.rows.find(row =>
            normalizeName(row.ho_ten) === normalizeName(hoTenClean)
        );

        const prefix = String(diabanh || req.session?.user?.diabanh || '101').trim().substring(0, 3);
        const maDinhDanh = existingWoman ? existingWoman.ma_dinh_danh : `${prefix}_${hoSoClean}_${Date.now()}`;

        // 1. Cập nhật / Upsert vào danh sách phu_nu_15_49
        await client.query(`
            INSERT INTO phu_nu_15_49 (ma_dinh_danh, ma_ho, diabanh, ho_ten, ngay_sinh, so_the_bhyt, so_con)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (ma_dinh_danh) DO UPDATE SET
                ho_ten = EXCLUDED.ho_ten,
                ngay_sinh = COALESCE(EXCLUDED.ngay_sinh, phu_nu_15_49.ngay_sinh),
                so_the_bhyt = COALESCE(NULLIF(TRIM(EXCLUDED.so_the_bhyt), ''), phu_nu_15_49.so_the_bhyt),
                so_con = COALESCE(EXCLUDED.so_con, phu_nu_15_49.so_con)
        `, [
            maDinhDanh,
            hoSoClean,
            diabanh || req.session?.user?.diabanh || '101, Xã Lương Hòa',
            hoTenClean,
            ngay_sinh || null,
            so_the_bhyt || null,
            soConValue
        ]);

        // 2. Ghi nhận mốc lịch sử BPTT mới
        await client.query(`
            INSERT INTO lich_su_bptt (ma_dinh_danh, ma_bptt, ngay_ap_dung, noi_thuc_hien)
            VALUES ($1, $2, $3, $4)
        `, [
            maDinhDanh,
            bptt_moi,
            ngay_su_dung,
            noi_thuc_hien || ''
        ]);

        await client.query('COMMIT');

        return res.json({
            success: true,
            message: 'Đồng bộ Phụ nữ 15-49 thành công.',
            ma_dinh_danh: maDinhDanh
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Lỗi đồng bộ Bảng 7:', err);
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});
// API kiểm tra mã hộ: Báo xung đột nếu trùng mã nhưng khác tên, hoặc báo hộ mới nếu chưa có
// API kiểm tra mã hộ dựa tuyệt đối vào địa bàn của tài khoản đang đăng nhập
app.post('/api/admin/check-ma-ho', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const { ho_so, ho_ten } = req.body;
        if (!ho_so || !ho_ten) return res.json({ exists: false, isNew: true });

        const maHoClean = ho_so.trim();
        
        // 🎯 Lấy trực tiếp tiền tố địa bàn từ phiên đăng nhập của tài khoản cộng tác viên (VD: '161')
        const userDiabanh = req.session.user.diabanh || '101';
        const prefix = String(userDiabanh).trim().substring(0, 3);

        // Truy vấn kiểm tra trùng mã hộ TRONG ĐÚNG PHẠM VI ĐỊA BÀN CỦA TÀI KHOẢN ĐĂNG NHẬP
        const check = await pool.query(`
            SELECT ho_ten FROM phu_nu_15_49 
            WHERE ma_ho = $1 AND diabanh LIKE $2
            LIMIT 1
        `, [maHoClean, `${prefix}%`]);

        if (check.rows.length > 0) {
            let tenTrongDb = check.rows[0].ho_ten;
            let nameNormInput = ho_ten.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            let nameNormDb = tenTrongDb.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

            if (nameNormInput !== nameNormDb) {
                return res.json({ 
                    exists: true, 
                    conflict: true, 
                    tenCu: tenTrongDb,
                    message: `Số hộ ${maHoClean} tại địa bàn quản lý của bạn đã có tên chủ hộ/thành viên là "${tenTrongDb}". Nếu đây là hộ mới, vui lòng kiểm tra lại mã hộ!` 
                });
            }
            return res.json({ exists: true, conflict: false, isNew: false });
        }

        res.json({ exists: false, conflict: false, isNew: true });
    } catch (err) {
        console.error('Lỗi kiểm tra mã hộ theo phiên đăng nhập:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// API Xuất Báo Cáo Sổ 12 Tháng Theo Năm (Theo dõi BPTT & Thai sản)
// ==================== API XUẤT BÁO CÁO SỔ 12 THÁNG (PHÂN TRANG 16 NGƯỜI/A4) ====================
app.get('/api/bao-cao-bptt-12-thang', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });

    const year = parseInt(req.query.year) || new Date().getFullYear();
    const ap = req.query.ap || '';
    const diabanh = req.query.diabanh || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 16; // Cố định đúng 16 người cho 1 trang A4
    const offset = (page - 1) * limit;
    const user = req.session.user;

    try {
        let whereClauses = [];
        let params = [];
        let paramIdx = 1;

        let activeAp = (user.role !== 'admin' && user.role !== 'lãnh đạo') ? user.ap : ap;
        let activeDiabanh = (user.role !== 'admin' && user.role !== 'lãnh đạo' && user.diabanh && user.diabanh !== '00') ? user.diabanh : diabanh;

        if (activeDiabanh) {
            whereClauses.push(`pn.diabanh LIKE $${paramIdx}`);
            params.push(`${activeDiabanh}%`);
            paramIdx++;
        } else if (activeAp && activeAp !== 'Tất cả') {
            const dbRes = await pool.query(
                `SELECT DISTINCT diabanh FROM users WHERE ap ILIKE $1 AND diabanh IS NOT NULL AND diabanh != '' AND diabanh != '00'`,
                [`%${activeAp}%`]
            );
            const dbList = dbRes.rows.map(r => r.diabanh).filter(Boolean);
            if (dbList.length > 0) {
                let dbConds = dbList.map(db => {
                    params.push(`${db}%`);
                    return `pn.diabanh LIKE $${paramIdx++}`;
                });
                whereClauses.push(`(${dbConds.join(' OR ')})`);
            } else {
                whereClauses.push(`pn.diabanh ILIKE $${paramIdx}`);
                params.push(`%${activeAp}%`);
                paramIdx++;
            }
        }

        let whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Query đếm tổng số dòng
        const countQuery = `SELECT COUNT(*)::int FROM phu_nu_15_49 pn ${whereSql}`;
        const countRes = await pool.query(countQuery, params);
        const totalRows = countRes.rows[0].count;
        const totalPages = Math.ceil(totalRows / limit) || 1;

        // Query lấy 16 phụ nữ kèm mảng BPTT 12 tháng bằng CROSS JOIN LATERAL (Tốc độ siêu nhanh)
        const dataParams = [...params, limit, offset];
        const dataQuery = `
            SELECT 
                pn.ma_dinh_danh,
                pn.ma_ho,
                pn.ho_ten,
                TO_CHAR(pn.ngay_sinh, 'DD/MM/YYYY') AS ngay_sinh,
                pn.so_con,
                pn.nam_sinh_con,
                pn.ghi_chu,
                bptt.t1, bptt.t2, bptt.t3, bptt.t4, bptt.t5, bptt.t6,
                bptt.t7, bptt.t8, bptt.t9, bptt.t10, bptt.t11, bptt.t12
            FROM phu_nu_15_49 pn
            LEFT JOIN LATERAL (
                SELECT 
                    MAX(CASE WHEN m = 1 THEN ma_bptt END) as t1,
                    MAX(CASE WHEN m = 2 THEN ma_bptt END) as t2,
                    MAX(CASE WHEN m = 3 THEN ma_bptt END) as t3,
                    MAX(CASE WHEN m = 4 THEN ma_bptt END) as t4,
                    MAX(CASE WHEN m = 5 THEN ma_bptt END) as t5,
                    MAX(CASE WHEN m = 6 THEN ma_bptt END) as t6,
                    MAX(CASE WHEN m = 7 THEN ma_bptt END) as t7,
                    MAX(CASE WHEN m = 8 THEN ma_bptt END) as t8,
                    MAX(CASE WHEN m = 9 THEN ma_bptt END) as t9,
                    MAX(CASE WHEN m = 10 THEN ma_bptt END) as t10,
                    MAX(CASE WHEN m = 11 THEN ma_bptt END) as t11,
                    MAX(CASE WHEN m = 12 THEN ma_bptt END) as t12
                FROM generate_series(1, 12) m
                LEFT JOIN LATERAL (
                    SELECT ma_bptt 
                    FROM lich_su_bptt 
                    WHERE ma_dinh_danh = pn.ma_dinh_danh 
                      AND ngay_ap_dung <= (MAKE_DATE(${year}, m, 1) + INTERVAL '1 month - 1 day')::date
                    ORDER BY ngay_ap_dung DESC, id DESC 
                    LIMIT 1
                ) l ON true
            ) bptt ON true
            ${whereSql}
            ORDER BY pn.ma_ho ASC
            LIMIT $${paramIdx++} OFFSET $${paramIdx++};
        `;

        const result = await pool.query(dataQuery, dataParams);
        res.json({
            success: true,
            data: result.rows,
            currentPage: page,
            totalPages: totalPages,
            totalRows: totalRows
        });
    } catch (err) {
        console.error('Lỗi xuất báo cáo 12 tháng:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});





// API IMPORT EXCEL CHO PHỤ NỮ 15-49 VÀ LỊCH SỬ BPTT
app.post("/api/admin/import-phu-nu-15-49", upload.single("excel"), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }

    const client = await pool.connect();
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Chưa chọn file Excel" });
        }

        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        
        const rowsMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rowsMatrix.length, 10); i++) {
            const rowStr = rowsMatrix[i].join(' ').toLowerCase();
            if (rowStr.includes('ho ten') || rowStr.includes('họ tên') || rowStr.includes('so ho') || rowStr.includes('số hộ')) {
                headerRowIndex = i;
                break;
            }
        }

        const rows = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: "" });

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: "File Excel không có dữ liệu!" });
        }

        function parseDateStr(dStr) {
            if (!dStr) return null;
            let str = String(dStr).trim();
            if (!str || str === 'null' || str === 'undefined') return null;
            
            // Xử lý nếu là số serial của Excel
            if (!isNaN(str) && str.length === 5) {
                const d = new Date(Math.round((str - 25569) * 86400 * 1000));
                return d.toISOString().split('T')[0];
            }

            if (/^\d{4}$/.test(str)) return `${str}-01-01`;

            const parts = str.split(/[/.-]/);
            if (parts.length === 3) {
                let [p1, p2, p3] = parts;
                if (p1.length === 4) {
                    let m = (p2 === '00' || p2 === '0') ? '01' : p2.padStart(2, '0');
                    let d = (p3 === '00' || p3 === '0') ? '01' : p3.padStart(2, '0');
                    return `${p1}-${m}-${d}`;
                } else if (p3.length === 4) {
                    let m = (p2 === '00' || p2 === '0') ? '01' : p2.padStart(2, '0');
                    let d = (p1 === '00' || p1 === '0') ? '01' : p1.padStart(2, '0');
                    return `${p3}-${m}-${d}`;
                }
            }
            return null;
        }

        // Xóa sạch dữ liệu cũ của cả bảng nền và bảng lịch sử trước khi nạp mới
        await client.query("BEGIN");
        await client.query("DELETE FROM lich_su_bptt");
        await client.query("DELETE FROM phu_nu_15_49");

        const uniqueRecords = [];
        const historyRecords = [];
        const seenIds = new Set();

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            
            let maHo = String(r["Số hộ"] || r["Mã hộ"] || r["Hộ số"] || r["ma_ho"] || r["ho_so"] || "").trim();
            const hoTen = String(r["Họ tên"] || r["Họ và tên"] || r["ho_ten"] || "").trim();
            const diaBanh = String(r["Địa chỉ"] || r["Địa bàn"] || r["Ấp"] || "101, Xã Lương Hòa").trim();
            
            if (!maHo || !hoTen) continue;

            let partsHo = maHo.split('.');
            let soChinh = partsHo[0];
            if (soChinh.length < 5 && /^\d+$/.test(soChinh)) {
                soChinh = soChinh.padStart(5, '0');
            }
            partsHo[0] = soChinh;
            maHo = partsHo.join('.');

            const prefix = diaBanh.substring(0, 3);
            let maDinhDanh = `${prefix}_${maHo}`;

            let counter = 1;
            let originalMaDinhDanh = maDinhDanh;
            while (seenIds.has(maDinhDanh)) {
                maDinhDanh = `${originalMaDinhDanh}_${counter}`;
                counter++;
            }
            seenIds.add(maDinhDanh);

            const ngaySinh = parseDateStr(r["Ngày sinh"] || r["Năm sinh"] || r["ngay_sinh"]);
            const soTheBhyt = String(r["Số thẻ BHYT"] || r["BHYT"] || r["so_the_bhyt"] || "").trim() || null;
            
            // Đọc thêm 2 cột: Số con và Năm sinh con nhỏ nhất từ Excel
            const soCon = Number(r["Số con"] || r["so_con"] || r["Số Con "] || 0);
            const namSinhCon = String(r["Năm sinh con nhỏ nhất"] || r["Năm sinh con"] || r["nam_sinh_con"] || r["Năm sinh con nhỏ nhất "] || "").trim() || null;

            // Đọc thêm Biện pháp TT và Ngày nhập để đưa vào bảng lịch sử
            const bienPhap = String(r["Biện pháp TT"] || r["bptt_moi"] || "").trim();
            const ngayNhap = parseDateStr(r["Ngày nhập"] || r["ngay_nhap"]) || '2026-01-01';

            uniqueRecords.push({
                maDinhDanh, maHo, diaBanh, hoTen, ngaySinh, soTheBhyt, soCon, namSinhCon
            });

            if (bienPhap) {
                historyRecords.push({
                    maDinhDanh,
                    bienPhap,
                    ngayNhap
                });
            }
        }

        if (uniqueRecords.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "Không tìm thấy dữ liệu hợp lệ để import!" });
        }

        // 1. Batch Insert bảng phu_nu_15_49 (Đã cập nhật đủ 8 tham số bao gồm nam_sinh_con)
        const BATCH_SIZE = 300;
        let batchValues = [];
        let valueStrings = [];
        let countImported = 0;

        for (let i = 0; i < uniqueRecords.length; i++) {
            const item = uniqueRecords[i];
            const currentParamIndex = batchValues.length;
            valueStrings.push(
                `($${currentParamIndex + 1}, $${currentParamIndex + 2}, $${currentParamIndex + 3}, $${currentParamIndex + 4}, $${currentParamIndex + 5}, $${currentParamIndex + 6}, $${currentParamIndex + 7}, $${currentParamIndex + 8})`
            );
            batchValues.push(item.maDinhDanh, item.maHo, item.diaBanh, item.hoTen, item.ngaySinh, item.soTheBhyt, item.soCon, item.namSinhCon);
            countImported++;

            if (valueStrings.length === BATCH_SIZE || i === uniqueRecords.length - 1) {
                if (valueStrings.length > 0) {
                    const queryText = `
                        INSERT INTO phu_nu_15_49 (
                            ma_dinh_danh, ma_ho, diabanh, ho_ten, ngay_sinh, so_the_bhyt, so_con, nam_sinh_con
                        )
                        VALUES ${valueStrings.join(", ")}
                        ON CONFLICT (ma_dinh_danh) DO UPDATE SET
                            ho_ten = EXCLUDED.ho_ten,
                            diabanh = EXCLUDED.diabanh,
                            ngay_sinh = COALESCE(EXCLUDED.ngay_sinh, phu_nu_15_49.ngay_sinh),
                            so_the_bhyt = COALESCE(EXCLUDED.so_the_bhyt, phu_nu_15_49.so_the_bhyt),
                            so_con = EXCLUDED.so_con,
                            nam_sinh_con = EXCLUDED.nam_sinh_con
                    `;
                    await client.query(queryText, batchValues);
                    valueStrings = [];
                    batchValues = [];
                }
            }
        }

        // 2. Batch Insert bảng lịch sử bptt (dựa vào Ngày nhập)
        let histBatchValues = [];
        let histValueStrings = [];
        let countHist = 0;

        for (let i = 0; i < historyRecords.length; i++) {
            const h = historyRecords[i];
            const curIdx = histBatchValues.length;
            histValueStrings.push(`($${curIdx + 1}, $${curIdx + 2}, $${curIdx + 3})`);
            histBatchValues.push(h.maDinhDanh, h.bienPhap, h.ngayNhap);
            countHist++;

            if (histValueStrings.length === BATCH_SIZE || i === historyRecords.length - 1) {
                if (histValueStrings.length > 0) {
                    const histQuery = `
                        INSERT INTO lich_su_bptt (ma_dinh_danh, ma_bptt, ngay_ap_dung)
                        VALUES ${histValueStrings.join(", ")}
                    `;
                    await client.query(histQuery, histBatchValues);
                    histValueStrings = [];
                    histBatchValues = [];
                }
            }
        }

        await client.query("COMMIT");

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.json({ success: true, message: `Import thành công! Đã nạp ${countImported} hồ sơ phụ nữ và ghi nhận ${countHist} mốc lịch sử BPTT từ file Excel.` });
    } catch (err) {
        await client.query("ROLLBACK");
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// API Lấy danh sách phụ nữ bị trùng (Cùng Mã hộ & Địa bàn hoặc Trùng Số thẻ BHYT)
// API Lấy danh sách phụ nữ bị trùng (Cùng Mã hộ & Địa bàn hoặc Trùng Số thẻ BHYT)
app.get('/api/admin/phu-nu-15-49-trung', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    try {
        const query = `
            WITH duplicated AS (
                SELECT ma_dinh_danh FROM phu_nu_15_49 
                WHERE ma_ho IN (
                    SELECT ma_ho FROM phu_nu_15_49 GROUP BY ma_ho, diabanh HAVING COUNT(*) > 1
                )
                OR (so_the_bhyt IS NOT NULL AND so_the_bhyt != '' AND so_the_bhyt IN (
                    SELECT so_the_bhyt FROM phu_nu_15_49 WHERE so_the_bhyt IS NOT NULL AND so_the_bhyt != '' GROUP BY so_the_bhyt HAVING COUNT(*) > 1
                ))
            )
            SELECT p.ma_dinh_danh, p.ma_ho, p.diabanh, p.ho_ten, TO_CHAR(p.ngay_sinh, 'YYYY-MM-DD') AS ngay_sinh, p.so_the_bhyt, p.so_con, p.nam_sinh_con
            FROM phu_nu_15_49 p
            JOIN duplicated d ON p.ma_dinh_danh = d.ma_dinh_danh
            ORDER BY p.ma_ho ASC, p.diabanh ASC;
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Lỗi lấy danh sách trùng:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Xem toàn bộ danh sách 4.062 phụ nữ 15-49 trong CSDL
// API Lấy danh sách mã Địa bàn động dựa theo Ấp được chọn
app.get('/api/admin/danh-sach-dia-ban-by-ap', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const apName = (req.query.ap || '').trim();
        let query = `
            SELECT DISTINCT SUBSTRING(diabanh FROM '^[0-9]+') AS ma_dia_ban 
            FROM phu_nu_15_49 
            WHERE 1=1
        `;
        let params = [];
        if (apName) {
            query += ` AND diabanh ILIKE $1`;
            params.push(`%${apName}%`);
        }
        query += ` ORDER BY ma_dia_ban ASC`;

        const result = await pool.query(query, params);
        const list = result.rows.map(r => r.ma_dia_ban).filter(Boolean);
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
    if (!req.session.user) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    try {
        const user = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const search = (req.query.search || '').trim();
        const bpttFilter = (req.query.bptt || '').trim();
        const apFilter = (req.query.ap || '').trim();
        const diabanhFilter = (req.query.diabanh || '').trim();

        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        // Xử lý Lọc Địa bàn / Ấp theo phân quyền tài khoản
        let activeAp = (user.role !== 'admin' && user.role !== 'lãnh đạo') ? user.ap : apFilter;
        let activeDiabanh = (user.role !== 'admin' && user.role !== 'lãnh đạo' && user.diabanh && user.diabanh !== '00') ? user.diabanh : diabanhFilter;

        if (activeDiabanh) {
            // Nếu có chọn cụ thể 1 địa bàn (ví dụ '137')
            whereClauses.push(`p.diabanh LIKE $${paramIndex}`);
            params.push(`${activeDiabanh}%`);
            paramIndex++;
        } else if (activeAp && activeAp !== 'Tất cả') {
            // Nếu chọn Ấp, tra cứu trong bảng users lấy danh sách tất cả các số địa bàn thuộc Ấp đó
            const dbRes = await pool.query(
                `SELECT DISTINCT diabanh FROM users WHERE ap ILIKE $1 AND diabanh IS NOT NULL AND diabanh != '' AND diabanh != '00'`,
                [`%${activeAp}%`]
            );
            const dbList = dbRes.rows.map(r => r.diabanh).filter(Boolean);

            if (dbList.length > 0) {
                // Lọc p.diabanh nằm trong danh sách mã địa bàn thuộc ấp đó bằng vòng lặp an toàn
                let dbConditions = [];
                for (let db of dbList) {
                    dbConditions.push(`p.diabanh LIKE $${paramIndex}`);
                    params.push(`${db}%`);
                    paramIndex++;
                }
                whereClauses.push(`(${dbConditions.join(' OR ')})`);
            } else {
                // Nếu ấp chưa được cấu hình địa bàn trong users, tìm trực tiếp theo tên ấp
                whereClauses.push(`p.diabanh ILIKE $${paramIndex}`);
                params.push(`%${activeAp}%`);
                paramIndex++;
            }
        }

        // Tìm kiếm theo Họ tên / Mã hộ / Mã định danh
        if (search) {
            whereClauses.push(`(p.ho_ten ILIKE $${paramIndex} OR p.ma_ho ILIKE $${paramIndex} OR p.ma_dinh_danh ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        let baseQuery = `
            FROM phu_nu_15_49 p
            LEFT JOIN LATERAL (
                SELECT ma_bptt FROM lich_su_bptt 
                WHERE ma_dinh_danh = p.ma_dinh_danh 
                ORDER BY ngay_ap_dung DESC, id DESC LIMIT 1
            ) latest_bptt ON true
        `;

        if (bpttFilter !== '') {
            if (bpttFilter === 'NONE') {
                whereClauses.push(`(latest_bptt.ma_bptt IS NULL OR latest_bptt.ma_bptt = '' OR latest_bptt.ma_bptt = '0')`);
            } else {
                whereClauses.push(`latest_bptt.ma_bptt = $${paramIndex}`);
                params.push(bpttFilter);
                paramIndex++;
            }
        }

        let whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countQuery = `SELECT COUNT(*) ${baseQuery} ${whereSql}`;
        const countRes = await pool.query(countQuery, params);
        const totalRows = parseInt(countRes.rows[0].count);

        let limitParam = paramIndex++;
        let offsetParam = paramIndex++;
        params.push(limit, offset);

        const dataQuery = `
            SELECT p.ma_dinh_danh, p.ma_ho, p.diabanh, p.ho_ten, TO_CHAR(p.ngay_sinh, 'YYYY-MM-DD') AS ngay_sinh, p.so_the_bhyt, p.so_con, p.nam_sinh_con, latest_bptt.ma_bptt AS current_bptt
            ${baseQuery}
            ${whereSql}
            ORDER BY p.ma_ho ASC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `;
        const result = await pool.query(dataQuery, params);

        res.json({
            success: true,
            data: result.rows,
            currentPage: page,
            totalPages: Math.ceil(totalRows / limit) || 1,
            totalRows: totalRows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// Cập nhật thông tin 1 phụ nữ 15-49 (Mở rộng cho Admin và Lãnh đạo)
app.put("/api/admin/quan-ly-phu-nu/:ma_dinh_danh",
    async (req, res) => {
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Vui lòng đăng nhập lại."
            });
        }

        if (!coQuyenQuanLyPhuNu(user)) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền sửa hồ sơ."
            });
        }

        try {
            const { ma_dinh_danh } = req.params;
            const {
                ho_ten, ma_ho, diabanh, ngay_sinh,
                so_the_bhyt, so_con, nam_sinh_con
            } = req.body;

            // Đọc địa bàn hiện tại từ database, không tin địa bàn
            // do trình duyệt tự gửi lên.
            const oldRes = await pool.query(
                `SELECT diabanh
                 FROM phu_nu_15_49
                 WHERE ma_dinh_danh = $1`,
                [ma_dinh_danh]
            );

            if (!oldRes.rowCount) {
                return res.status(404).json({
                    success: false,
                    message: "Không tìm thấy hồ sơ."
                });
            }

            if (
                !laQuanLyToanXa(user) &&
                !thuocDiaBanCongTacVien(user, oldRes.rows[0].diabanh)
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Hồ sơ không thuộc địa bàn của bạn."
                });
            }

            // Cộng tác viên không được chuyển hồ sơ sang địa bàn khác.
            const diaBanMoi = laQuanLyToanXa(user)
                ? String(diabanh || '').trim()
                : oldRes.rows[0].diabanh;

            const result = await pool.query(`
                UPDATE phu_nu_15_49
                SET ho_ten = $1,
                    ma_ho = $2,
                    diabanh = $3,
                    ngay_sinh = $4,
                    so_the_bhyt = $5,
                    so_con = $6,
                    nam_sinh_con = $7
                WHERE ma_dinh_danh = $8
                RETURNING ma_dinh_danh
            `, [
                ho_ten,
                ma_ho,
                diaBanMoi,
                ngay_sinh || null,
                so_the_bhyt || '',
                so_con || 0,
                nam_sinh_con || '',
                ma_dinh_danh
            ]);

            await logAction(
                user,
                "Cập nhật hồ sơ phụ nữ 15-49",
                null,
                `Mã ĐD: ${ma_dinh_danh} - ${ho_ten}`
            );

            return res.json({
                success: true,
                message: "Cập nhật hồ sơ thành công!"
            });

        } catch (err) {
            console.error("Lỗi sửa hồ sơ 15-49:", err);

            return res.status(500).json({
                success: false,
                message: "Không thể cập nhật hồ sơ."
            });
        }
    }
);

// Xóa 1 phụ nữ 15-49 (Mở rộng cho Admin và Lãnh đạo)
app.delete("/api/admin/quan-ly-phu-nu/:ma_dinh_danh",
    async (req, res) => {
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Vui lòng đăng nhập lại."
            });
        }

        if (!coQuyenQuanLyPhuNu(user)) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền xóa hồ sơ."
            });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const found = await client.query(`
                SELECT ma_dinh_danh, diabanh, ma_ho, ho_ten
                FROM phu_nu_15_49
                WHERE ma_dinh_danh = $1
                FOR UPDATE
            `, [req.params.ma_dinh_danh]);

            if (!found.rowCount) {
                await client.query('ROLLBACK');

                return res.status(404).json({
                    success: false,
                    message: "Hồ sơ không tồn tại."
                });
            }

            const person = found.rows[0];

            if (
                !laQuanLyToanXa(user) &&
                !thuocDiaBanCongTacVien(user, person.diabanh)
            ) {
                await client.query('ROLLBACK');

                return res.status(403).json({
                    success: false,
                    message: "Hồ sơ không thuộc địa bàn của bạn."
                });
            }

            await client.query(`
                DELETE FROM phu_nu_15_49
                WHERE ma_dinh_danh = $1
            `, [req.params.ma_dinh_danh]);

            await client.query('COMMIT');

            await logAction(
                user,
                "Xóa hồ sơ phụ nữ 15-49",
                null,
                `Mã ĐD: ${person.ma_dinh_danh} - ${person.ho_ten}`
            );

            return res.json({
                success: true,
                message: "Đã xóa hồ sơ thành công!"
            });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error("Lỗi xóa hồ sơ 15-49:", err);

            return res.status(500).json({
                success: false,
                message: "Không thể xóa hồ sơ."
            });
        } finally {
            client.release();
        }
    }
);
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

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập.'
        });
    }

    if (!coQuyenQuanLyPhuNu(user)) {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền xem lịch sử.'
        });
    }

    try {
        const maDinhDanh = String(
            req.query.ma_dinh_danh || ''
        ).trim();

        const params = [];
        const conditions = [];

        if (maDinhDanh) {
            params.push(maDinhDanh);
            conditions.push(`l.ma_dinh_danh = $${params.length}`);
        }

        if (!laQuanLyToanXa(user)) {
            params.push(String(user.diabanh || '').trim());
            conditions.push(`p.diabanh = $${params.length}`);
        }

        const where = conditions.length
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        const result = await pool.query(`
            SELECT
                l.id,
                l.ma_dinh_danh,
                p.ho_ten,
                p.diabanh,
                l.ma_bptt,
                TO_CHAR(l.ngay_ap_dung, 'YYYY-MM-DD')
                    AS ngay_ap_dung,
                l.noi_thuc_hien
            FROM lich_su_bptt l
            JOIN phu_nu_15_49 p
                ON p.ma_dinh_danh = l.ma_dinh_danh
            ${where}
            ORDER BY l.ngay_ap_dung DESC, l.id DESC
            LIMIT 500
        `, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error('Lỗi lấy lịch sử BPTT:', err);
        res.status(500).json({
            success: false,
            message: 'Không tải được lịch sử BPTT.'
        });
    }
});

// Thêm mốc lịch sử BPTT

app.post("/api/admin/quan-ly-lich-su-bptt", async (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Vui lòng đăng nhập!"
        });
    }

    if (!coQuyenQuanLyPhuNu(user)) {
        return res.status(403).json({
            success: false,
            message: "Bạn không có quyền thêm lịch sử BPTT!"
        });
    }

    const client = await pool.connect();

    try {
        const {
            ma_dinh_danh,
            ma_bptt,
            ngay_ap_dung,
            noi_thuc_hien
        } = req.body;

        if (!ma_dinh_danh || !ma_bptt || !ngay_ap_dung) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập đủ thông tin!"
            });
        }

        await client.query("BEGIN");

        const hoSoResult = await client.query(
            `SELECT ma_dinh_danh, ma_ho, ho_ten, diabanh
             FROM phu_nu_15_49
             WHERE ma_dinh_danh = $1
             FOR UPDATE`,
            [ma_dinh_danh]
        );

        if (!hoSoResult.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ phụ nữ!"
            });
        }

        const hoSo = hoSoResult.rows[0];

        // Cộng tác viên chỉ được thao tác trong địa bàn được giao.
        if (
            !laQuanLyToanXa(user) &&
            !thuocDiaBanCongTacVien(user, hoSo.diabanh)
        ) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message: "Hồ sơ không thuộc địa bàn của bạn!"
            });
        }

        await client.query(
            `INSERT INTO lich_su_bptt
                (ma_dinh_danh, ma_bptt, ngay_ap_dung, noi_thuc_hien)
             VALUES ($1, $2, $3, $4)`,
            [
                ma_dinh_danh,
                String(ma_bptt).trim(),
                ngay_ap_dung,
                noi_thuc_hien || ""
            ]
        );

        // Ghi nhận biến động khi thêm lịch sử BPTT.
        await client.query(
            `INSERT INTO bien_dong_phu_nu
                (diabanh, loai_bien_dong, ho_so, ho_ten, nguoi_thuc_hien)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                hoSo.diabanh || "",
                "THEM_BPTT",
                hoSo.ma_ho || hoSo.ma_dinh_danh,
                hoSo.ho_ten || "",
                user.username || user.fullname || ""
            ]
        );

        await client.query("COMMIT");

        await logAction(
            user,
            "Thêm mốc lịch sử BPTT",
            null,
            `Mã định danh: ${ma_dinh_danh}; BPTT: ${ma_bptt}`
        );

        return res.json({
            success: true,
            message: "Thêm mốc lịch sử BPTT thành công!"
        });

    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch (_) {}

        console.error("Lỗi thêm lịch sử BPTT:", err);

        return res.status(500).json({
            success: false,
            message: "Có lỗi khi thêm lịch sử BPTT."
        });
    } finally {
        client.release();
    }
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
                FROM phu_nu_15_49 p
                WHERE p.ma_dinh_danh = lich_su_bptt.ma_dinh_danh
                  AND LOWER(TRIM(p.diabanh)) = LOWER(TRIM($2))
            )`;
        }

        const found = await pool.query(`
            SELECT id, ma_dinh_danh, ma_bptt
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
            `Mã ĐD: ${found.rows[0].ma_dinh_danh}; BPTT: ${found.rows[0].ma_bptt} → ${ma_bptt}`
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
                l.ma_dinh_danh,
                l.ma_bptt,
                p.ma_ho,
                p.ho_ten,
                p.diabanh
             FROM lich_su_bptt l
             JOIN phu_nu_15_49 p
               ON p.ma_dinh_danh = l.ma_dinh_danh
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
                history.ma_ho || history.ma_dinh_danh,
                history.ho_ten || '',
                user.username || user.fullname || ''
            ]
        );

        await client.query('COMMIT');

        await logAction(
            user,
            'Xóa mốc lịch sử BPTT',
            id,
            `Mã định danh: ${history.ma_dinh_danh}; BPTT: ${history.ma_bptt}`
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
app.get("/api/admin/preview-sync-nam-sinh-con", async (req, res) => {
    if (!req.session.user || !['admin', 'lãnh đạo'].includes(String(req.session.user.role || '').toLowerCase())) {
        return res.status(403).json({ success: false, message: "Không có quyền thực hiện chức năng này!" });
    }

    try {
        const previewQuery = `
            WITH normalized_child AS (
                SELECT 
                    t1.ho_so,
                    t1.ngay_sinh_con,
                    t1.noi_de,
                    t1.ho_ten_me,
                    -- Chuẩn hóa mã hộ đủ 5 chữ số (giữ lại phần thập phân nếu có)
                    CASE 
                        WHEN POSITION('.' IN TRIM(t1.ho_so)) > 0 THEN 
                            LPAD(SPLIT_PART(TRIM(t1.ho_so), '.', 1), 5, '0') || '.' || SPLIT_PART(TRIM(t1.ho_so), '.', 2)
                        ELSE 
                            LPAD(TRIM(t1.ho_so), 5, '0')
                    END AS ma_ho_chuan,
                    -- Chuẩn hóa tên mẹ để so sánh chính xác không phân biệt hoa thường/khoảng trắng
                    REGEXP_REPLACE(LOWER(TRIM(t1.ho_ten_me)), '\\s+', ' ', 'g') AS ho_ten_me_norm
                FROM table_1 t1
                WHERE t1.ho_so IS NOT NULL AND t1.ho_so != '' AND t1.ho_ten_me IS NOT NULL AND t1.ho_ten_me != ''
            ),
            child_stats AS (
                SELECT 
                    ma_ho_chuan,
                    ho_ten_me_norm,
                    COUNT(*)::int as total_con,
                    MAX(SUBSTRING(TRIM(ngay_sinh_con::text), 1, 4)) as new_nam_sinh_con
                FROM normalized_child
                GROUP BY ma_ho_chuan, ho_ten_me_norm
            )
            SELECT 
                p.ma_dinh_danh,
                p.ma_ho,
                p.ho_ten,
                p.diabanh,
                p.so_con AS so_con_cu,
                cs.total_con AS so_con_moi,
                p.nam_sinh_con AS nam_sinh_con_cu,
                cs.new_nam_sinh_con AS nam_sinh_con_moi,
                COALESCE(latest_bptt.ma_bptt, '0') AS bptt_cu
            FROM phu_nu_15_49 p
            JOIN child_stats cs ON (
                -- 1. Bắt buộc trùng Mã hộ chuẩn hóa
                (
                    CASE 
                        WHEN POSITION('.' IN TRIM(p.ma_ho)) > 0 THEN 
                            LPAD(SPLIT_PART(TRIM(p.ma_ho), '.', 1), 5, '0') || '.' || SPLIT_PART(TRIM(p.ma_ho), '.', 2)
                        ELSE 
                            LPAD(TRIM(p.ma_ho), 5, '0')
                    END = cs.ma_ho_chuan
                )
                -- 2. Bắt buộc phải trùng khớp Họ tên phụ nữ với Họ tên mẹ ở Bảng 1
                AND REGEXP_REPLACE(LOWER(TRIM(p.ho_ten)), '\\s+', ' ', 'g') = cs.ho_ten_me_norm
            )
            LEFT JOIN LATERAL (
                SELECT ma_bptt FROM lich_su_bptt 
                WHERE ma_dinh_danh = p.ma_dinh_danh 
                ORDER BY ngay_ap_dung DESC, id DESC LIMIT 1
            ) latest_bptt ON true
            WHERE p.so_con IS DISTINCT FROM cs.total_con 
               OR p.nam_sinh_con IS DISTINCT FROM cs.new_nam_sinh_con
               OR COALESCE(latest_bptt.ma_bptt, '0') IS DISTINCT FROM 'S'
            ORDER BY p.ma_ho ASC
            LIMIT 200;
        `;

        const result = await pool.query(previewQuery);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Lỗi xem trước đồng bộ:", err);
        res.status(500).json({ success: false, message: "Lỗi xem trước: " + err.message });
    }
});

// ==================== API THỰC THI ĐỒNG BỘ CHÍNH THỨC ====================
app.post("/api/admin/confirm-sync-nam-sinh-con", async (req, res) => {
    if (!req.session.user || !['admin', 'lãnh đạo'].includes(String(req.session.user.role || '').toLowerCase())) {
        return res.status(403).json({ success: false, message: "Không có quyền thực hiện chức năng này!" });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const syncQuery = `
            WITH normalized_child AS (
                SELECT 
                    t1.ho_so,
                    t1.ngay_sinh_con,
                    t1.noi_de,
                    t1.ho_ten_me,
                    CASE 
                        WHEN POSITION('.' IN TRIM(t1.ho_so)) > 0 THEN 
                            LPAD(SPLIT_PART(TRIM(t1.ho_so), '.', 1), 5, '0') || '.' || SPLIT_PART(TRIM(t1.ho_so), '.', 2)
                        ELSE 
                            LPAD(TRIM(t1.ho_so), 5, '0')
                    END AS ma_ho_chuan,
                    REGEXP_REPLACE(LOWER(TRIM(t1.ho_ten_me)), '\\s+', ' ', 'g') AS ho_ten_me_norm
                FROM table_1 t1
                WHERE t1.ho_so IS NOT NULL AND t1.ho_so != '' AND t1.ho_ten_me IS NOT NULL AND t1.ho_ten_me != ''
            ),
            child_stats AS (
                SELECT 
                    ma_ho_chuan,
                    ho_ten_me_norm,
                    COUNT(*)::int as total_con,
                    MAX(SUBSTRING(TRIM(ngay_sinh_con::text), 1, 4)) as max_nam_sinh_con,
                    MAX(ngay_sinh_con::text) as max_ngay_sinh,
                    MAX(noi_de) as noi_thuc_hien
                FROM normalized_child
                GROUP BY ma_ho_chuan, ho_ten_me_norm
            ),
            updated_women AS (
                UPDATE phu_nu_15_49 p
                SET 
                    so_con = cs.total_con,
                    nam_sinh_con = cs.max_nam_sinh_con
                FROM child_stats cs
                WHERE (
                    CASE 
                        WHEN POSITION('.' IN TRIM(p.ma_ho)) > 0 THEN 
                            LPAD(SPLIT_PART(TRIM(p.ma_ho), '.', 1), 5, '0') || '.' || SPLIT_PART(TRIM(p.ma_ho), '.', 2)
                        ELSE 
                            LPAD(TRIM(p.ma_ho), 5, '0')
                    END = cs.ma_ho_chuan
                )
                AND REGEXP_REPLACE(LOWER(TRIM(p.ho_ten)), '\\s+', ' ', 'g') = cs.ho_ten_me_norm
                RETURNING p.ma_dinh_danh, cs.max_ngay_sinh, cs.noi_thuc_hien
            )
            INSERT INTO lich_su_bptt (ma_dinh_danh, ma_bptt, ngay_ap_dung, noi_thuc_hien)
            SELECT 
                ma_dinh_danh, 
                'S', 
                COALESCE(NULLIF(max_ngay_sinh, '')::date, CURRENT_DATE), 
                COALESCE(NULLIF(noi_thuc_hien, ''), 'Trạm Y tế xã Lương Hòa')
            FROM updated_women
            ON CONFLICT DO NOTHING;
        `;

        await client.query(syncQuery);
        await client.query("COMMIT");

        await logAction(req.session.user, "Xác nhận đồng bộ năm sinh con và cập nhật BPTT 'S'", null, `Đã đồng bộ thành công`);

        res.json({ success: true, message: `Đồng bộ năm sinh con và cập nhật lịch sử BPTT thành công!` });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Lỗi thực thi đồng bộ:", err);
        res.status(500).json({ success: false, message: "Lỗi đồng bộ: " + err.message });
    } finally {
        client.release();
    }
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