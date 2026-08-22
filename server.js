require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');

const app = express();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'dan-so-luong-hoa-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function getVietnamTimestamp() {
    return new Date().toLocaleString("vi-VN");
}

// Tự động khởi tạo CSDL và cập nhật các bảng, cột thiếu
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

            -- Thêm lại các cột đúng chuẩn cho từng bảng
            ALTER TABLE table_1 ADD COLUMN IF NOT EXISTS ho_so TEXT, ADD COLUMN IF NOT EXISTS ho_ten_con TEXT, ADD COLUMN IF NOT EXISTS ngay_sinh_con TEXT, ADD COLUMN IF NOT EXISTS gioi_tinh TEXT, ADD COLUMN IF NOT EXISTS dan_toc TEXT, ADD COLUMN IF NOT EXISTS ho_ten_me TEXT, ADD COLUMN IF NOT EXISTS so_the_bhyt_me TEXT, ADD COLUMN IF NOT EXISTS ngay_sinh_me TEXT, ADD COLUMN IF NOT EXISTS noi_de TEXT, ADD COLUMN IF NOT EXISTS con_thu_may TEXT;
            
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
            ALTER TABLE table_8 DROP COLUMN IF EXISTS bptt; -- Xóa cột tên cũ nếu lỡ tạo
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS ho_so TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS ho_ten_vo TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS so_the_bhyt TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS ngay_sinh TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS ngay_thoi_su_dung TEXT;
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS bptt_thoi TEXT; -- Đổi thành bptt_thoi_su_dung cho khớp app.js
            ALTER TABLE table_8 ADD COLUMN IF NOT EXISTS noi_thuc_hien TEXT;

            -- Bảng 11: Khám sức khỏe / Đối tượng khác (Đã chuẩn hóa các cột theo yêu cầu)
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
initDatabase();

// ==================== API XÁC THỰC & NGƯỜI DÙNG ====================
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
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/me", (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    res.json(req.session.user);
});

app.post("/api/logout", (req, res) => {
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

// API Lấy danh sách bệnh viện
app.get("/api/danh-sach-benh-vien", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM danh_sach_benh_vien WHERE trang_thai = 1 ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API Lấy danh sách Biện pháp tránh thai (BPTT) kèm mã ký hiệu
app.get("/api/danh-sach-bptt", async (req, res) => {
    try {
        const result = await pool.query("SELECT id, ma_bptt, ten_bptt FROM danh_sach_bptt WHERE trang_thai = 1 ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API Lấy danh sách Nơi thực hiện
app.get("/api/danh-sach-noi-thuc-hien", async (req, res) => {
    try {
        const result = await pool.query("SELECT id, ten_noi_thuc_hien FROM danh_sach_noi_thuc_hien WHERE trang_thai = 1 ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API Thêm bệnh viện mới (dành cho Admin quản lý)
app.post("/api/admin/danh-sach-benh-vien", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    try {
        const { ten_benh_vien, dia_chi } = req.body;
        if (!ten_benh_vien) return res.status(400).json({ success: false, message: "Tên bệnh viện không được để trống" });

        await pool.query("INSERT INTO danh_sach_benh_vien (ten_benh_vien, dia_chi) VALUES ($1, $2)", [ten_benh_vien, dia_chi]);
        res.json({ success: true, message: "Thêm bệnh viện thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API Đọc dữ liệu các bảng nghiệp vụ
// API Đọc dữ liệu các bảng nghiệp vụ (Lọc chuẩn theo Ấp và Địa bàn / Khu vực)
app.get("/api/data/:table", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const tableName = req.params.table;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    try {
        let user = req.session.user;
        let query = `SELECT * FROM ${tableName}`;
        let params = [];

        // Nếu không phải admin hoặc lãnh đạo, chỉ thấy dữ liệu đúng ấp + đúng địa bàn của mình, hoặc do chính mình nhập
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

// API Thêm dữ liệu vào các bảng nghiệp vụ
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

        await pool.query(`INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`, values);
        res.json({ success: true, message: "Lưu dữ liệu thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// API Xóa dữ liệu
app.delete("/api/data/:table/:id", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const tableName = req.params.table;
    const recordId = req.params.id;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    try {
        let user = req.session.user;

        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            let checkRecord = await pool.query(`SELECT ap FROM ${tableName} WHERE id = $1`, [recordId]);
            if (checkRecord.rows.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi" });
            
            if (checkRecord.rows[0].ap !== user.ap) {
                return res.status(403).json({ success: false, message: "Bạn không có quyền xóa dữ liệu của ấp khác!" });
            }
        }

        await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [recordId]);
        res.json({ success: true, message: "Đã xóa dữ liệu thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== API CẬP NHẬT DỮ LIỆU BẢNG ====================
app.put("/api/data/:table/:id", async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    const tableName = req.params.table;
    const recordId = req.params.id;
    if (!/^table_([1-9]|1[01])$/.test(tableName)) return res.status(400).json({ success: false, message: "Bảng không hợp lệ" });

    try {
        let user = req.session.user;
        let dataObj = req.body;

        if (user.role !== 'admin' && user.role !== 'lãnh đạo') {
            let checkRecord = await pool.query(`SELECT ap FROM ${tableName} WHERE id = $1`, [recordId]);
            if (checkRecord.rows.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi" });
            if (checkRecord.rows[0].ap !== user.ap) {
                return res.status(403).json({ success: false, message: "Bạn không có quyền sửa dữ liệu của ấp khác!" });
            }
            delete dataObj.ap;
        }

        delete dataObj.id;
        delete dataObj.created_at;

        const keys = Object.keys(dataObj);
        const values = Object.values(dataObj);
        
        if (keys.length === 0) return res.status(400).json({ success: false, message: "Không có dữ liệu cập nhật" });

        const setString = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");
        values.push(recordId);

        await pool.query(`UPDATE ${tableName} SET ${setString} WHERE id = $${values.length}`, values);
        res.json({ success: true, message: "Cập nhật dữ liệu thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== QUẢN LÝ DANH MỤC ẤP ====================
app.get("/api/admin/ap", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM danh_sach_ap ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/admin/ap", async (req, res) => {
    try {
        let { ten_ap } = req.body;
        await pool.query("INSERT INTO danh_sach_ap (ten_ap, trang_thai) VALUES ($1, 1)", [ten_ap]);
        res.json({ success: true, message: "Thêm ấp thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete("/api/admin/ap/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM danh_sach_ap WHERE id = $1", [req.params.id]);
        res.json({ success: true, message: "Xóa ấp thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== QUẢN LÝ DANH MỤC BỆNH VIỆN ====================
app.get("/api/admin/benh-vien", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM danh_sach_benh_vien ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/admin/benh-vien", async (req, res) => {
    try {
        let { ten_benh_vien, dia_chi } = req.body;
        await pool.query("INSERT INTO danh_sach_benh_vien (ten_benh_vien, dia_chi, trang_thai) VALUES ($1, $2, 1)", [ten_benh_vien, dia_chi]);
        res.json({ success: true, message: "Thêm bệnh viện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete("/api/admin/benh-vien/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM danh_sach_benh_vien WHERE id = $1", [req.params.id]);
        res.json({ success: true, message: "Xóa bệnh viện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== XEM NHẬT KÝ HỆ THỐNG (LOGS) ====================
app.get("/api/admin/logs", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM logs ORDER BY id DESC LIMIT 100");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== API QUẢN TRỊ NGƯỜI DÙNG (ADMIN) ====================
app.get("/api/admin/users", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
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
    try {
        const { fullname, username, password, role, diabanh, ap, xa } = req.body;
        await pool.query(
            `INSERT INTO users (fullname, username, password, role, diabanh, ap, xa, active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)`,
            [fullname, username, password, role, diabanh, ap, xa, getVietnamTimestamp()]
        );
        res.json({ success: true, message: "Thêm người dùng thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/admin/users/:id", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    try {
        const userId = req.params.id;
        const { fullname, username, password, role, diabanh, ap, xa } = req.body;

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
        res.json({ success: true, message: "Cập nhật thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/admin/users/:id/toggle", async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Not allowed" });
    }
    try {
        const userId = req.params.id;
        const userRes = await pool.query("SELECT active FROM users WHERE id = $1", [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });

        const newActive = userRes.rows[0].active === 1 ? 0 : 1;
        await pool.query("UPDATE users SET active = $1 WHERE id = $2", [newActive, userId]);
        res.json({ success: true, message: "Đổi trạng thái thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// ==================== QUẢN LÝ DANH MỤC BPTT ====================
app.get("/api/admin/bptt", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM danh_sach_bptt ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/admin/bptt", async (req, res) => {
    try {
        let { ma_bptt, ten_bptt } = req.body;
        await pool.query("INSERT INTO danh_sach_bptt (ma_bptt, ten_bptt, trang_thai) VALUES ($1, $2, 1)", [ma_bptt, ten_bptt]);
        res.json({ success: true, message: "Thêm BPTT thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete("/api/admin/bptt/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM danh_sach_bptt WHERE id = $1", [req.params.id]);
        res.json({ success: true, message: "Xóa BPTT thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== QUẢN LÝ DANH MỤC NƠI THỰC HIỆN ====================
app.get("/api/admin/noi-thuc-hien", async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM danh_sach_noi_thuc_hien ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/admin/noi-thuc-hien", async (req, res) => {
    try {
        let { ten_noi_thuc_hien } = req.body;
        await pool.query("INSERT INTO danh_sach_noi_thuc_hien (ten_noi_thuc_hien, trang_thai) VALUES ($1, 1)", [ten_noi_thuc_hien]);
        res.json({ success: true, message: "Thêm nơi thực hiện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete("/api/admin/noi-thuc-hien/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM danh_sach_noi_thuc_hien WHERE id = $1", [req.params.id]);
        res.json({ success: true, message: "Xóa nơi thực hiện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
// Cập nhật Biện pháp tránh thai (BPTT)
app.put("/api/admin/bptt/:id", async (req, res) => {
    try {
        let { ma_bptt, ten_bptt } = req.body;
        await pool.query("UPDATE danh_sach_bptt SET ma_bptt = $1, ten_bptt = $2 WHERE id = $3", [ma_bptt, ten_bptt, req.params.id]);
        res.json({ success: true, message: "Cập nhật BPTT thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Cập nhật Nơi thực hiện
app.put("/api/admin/noi-thuc-hien/:id", async (req, res) => {
    try {
        let { ten_noi_thuc_hien } = req.body;
        await pool.query("UPDATE danh_sach_noi_thuc_hien SET ten_noi_thuc_hien = $1 WHERE id = $2", [ten_noi_thuc_hien, req.params.id]);
        res.json({ success: true, message: "Cập nhật nơi thực hiện thành công!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Khởi chạy server
app.listen(3000, () => console.log("==> Server đang chạy tại http://localhost:3000"));