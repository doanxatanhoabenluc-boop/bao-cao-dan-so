require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');

const app = express();

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
        `);

        // Đảm bảo tất cả các bảng từ table_1 đến table_11 đều có cột cơ bản
        for (let i = 1; i <= 11; i++) {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS table_${i} (id SERIAL PRIMARY KEY);
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS ap TEXT;
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS diabanh TEXT;
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS nguoi_nhap TEXT;
                ALTER TABLE table_${i} ADD COLUMN IF NOT EXISTS created_at TEXT;
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

            -- Bảng 10: Sàng lọc trước sinh (Tách riêng các cột kết quả cho Tuần 12 và Tuần 21)
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
            ALTER TABLE table_11 ADD COLUMN IF NOT EXISTS cong_so_nguoi_co TEXT;
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

// API Đọc dữ liệu các bảng nghiệp vụ (Lọc chuẩn theo Ấp và Địa bàn / Khu vực)
app.get("/api/data/:table", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const tableName = req.params.table;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    try {
        let user = req.session.user;
        let query = `SELECT * FROM ${tableName}`;
        let params = [];

        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            query += ` WHERE (ap = $1 AND diabanh = $2) OR nguoi_nhap ILIKE $3`;
            params.push(user.ap, user.diabanh, `%${user.username}%`);
        }

        query += ` ORDER BY id DESC LIMIT 200`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
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
        delete dataObj.created_at;

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