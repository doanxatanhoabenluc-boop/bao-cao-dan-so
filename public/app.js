// app.js - Phiên bản hoàn chỉnh: Tích hợp popup xác nhận tài khoản và danh mục Quan hệ động từ Database

let currentTable = "table_1";
let danhSachApOptions = [];
let danhSachBenhVienOptions = [];
let danhSachBptTOptions = [];
let danhSachNoiThucHienOptions = [];
let danhSachQuanHeOptions = []; // 🆕 Thêm biến lưu danh sách quan hệ từ DB

// Danh sách 54 dân tộc Việt Nam chuẩn
const danhSachDanToc = [
    "Kinh", "Tày", "Thái", "Mường", "H'Mông", "Dao", "Khmer", "Nùng", "Gia Rai", 
    "Ê Đê", "Ba Na", "Sán Chay", "Chăm", "Kơ Ho", "Hà Nhì", "Chu Ru", "Xơ Đăng", "Sán Dìu", "H'rê", 
    "Ra Glai", "Mnông", "Thổ", "Stiêng", "Khơ Mú", "Bru - Vân Kiều", "Cơ Tu", "Giáy", "Tà Ôi", "Mạ", 
    "Giẻ Triêng", "Cờ Lao", "La Ha", "Chơ Ro", "Phù La", "La Hủ", "Lự", 
    "Lô Lô", "Chứt", "Mảng", "Pa Thẻn", "Cống", "Pu Péo", "Si La", "Ơ Đô", "Bru", "Rơ Măm", "Pà Thẻn"
];
const uniqueDanToc = [...new Set(danhSachDanToc)];

const trinhDoHocVanOptions = ["Chưa đi học", "Tiểu học", "THCS", "THPT", "Trung cấp", "Cao đẳng", "Đại học", "Trên đại học"];
const tinhTrangHonNhanOptions = ["Chưa kết hôn", "Đang kết hôn", "Ly hôn", "Góa"];

const tableConfigs = {
    "table_1": { title: "1. Danh sách trẻ sinh ra", fields: [
        { name: "search_phunu_helper", label: "🔍 Dò tìm Phụ nữ từ danh sách 15-49 (Nhập Mã hộ hoặc Họ tên)", type: "search-phunu-master" },
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten_con", label: "Họ và tên con", type: "text", required: true },
        { name: "ngay_sinh_con", label: "Ngày sinh của con", type: "date", required: true },
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"], required: true },
        { name: "dan_toc", label: "Dân tộc", type: "select-dantoc", options: uniqueDanToc, required: true },
        { name: "ho_ten_me", label: "Họ và tên mẹ", type: "text", required: true },
        { name: "ngay_sinh_me", label: "Ngày sinh của mẹ", type: "date", required: true },
        { name: "so_the_bhyt_me", label: "Số thẻ BHYT của mẹ", type: "text" },
        { name: "noi_de", label: "Nơi đẻ", type: "select-benhvien", required: true },
        { name: "con_thu_may", label: "Là con thứ mấy của mẹ", type: "number", required: true },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_2": { title: "2. Danh sách SL sơ sinh", fields: [
        { name: "so_ho", label: "Số hộ", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten_tre", label: "Họ tên trẻ", type: "text", required: true },
        { name: "ngay_sinh_tre", label: "Ngày sinh của con", type: "date" }, // 👈 Thêm trường này
        { name: "ho_ten_me", label: "Họ và tên mẹ", type: "text" },          // 👈 Thêm trường này
        { name: "ma_the_bhyt_me", label: "Mã số thẻ BHYT của mẹ", type: "text" },
        { name: "noi_cu_tru", label: "Nơi cư trú (tỉnh, huyện, xã, địa chỉ cụ thể)", type: "text" },
        { name: "nam_sinh_me", label: "Năm sinh của mẹ", type: "date" },
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"] },
        { name: "benh_suy_giap", label: "Bệnh suy giáp trạng bẩm sinh", type: "text" },
        { name: "thieu_men_g6pd", label: "Thiếu men G6PD", type: "text" },
        { name: "tang_san_thuong_than", label: "Tăng sản thượng thận bẩm sinh", type: "text" },
        { name: "khiem_thinh", label: "Khiếm thính bẩm sinh", type: "text" },
        { name: "benh_tim", label: "Bệnh tim bẩm sinh", type: "text" },
        { name: "noi_thuc_hien", label: "Nơi thực hiện", type: "select-benhvien" },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_3": { title: "3. Danh sách người chết", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten", label: "Họ và tên người chết", type: "text", required: true },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date" },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "quan_he", label: "Quan hệ với chủ hộ", type: "select-quanhe", required: true }, // 🔄 Đổi thành select-quanhe
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"], required: true },
        { name: "ngay_chet", label: "Ngày chết", type: "date", required: true },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_4": { title: "4. Danh sách người chuyển đến từ xã khác", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten", label: "Họ tên người đến", type: "text", required: true },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "quan_he", label: "Quan hệ với chủ hộ", type: "select-quanhe", required: true }, // 🔄 Đổi thành select-quanhe
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"], required: true },
        { name: "dan_toc", label: "Dân tộc", type: "select-dantoc", options: uniqueDanToc, required: true },
        { name: "trinh_do_hoc_van", label: "Trình độ học vấn", type: "select", options: trinhDoHocVanOptions },
        { name: "tinh_trang_hon_nhan", label: "Tình trạng hôn nhân", type: "select", options: tinhTrangHonNhanOptions , required: true},
        { name: "ngay_den", label: "Ngày đến", type: "date", required: true },
        { name: "noi_di", label: "Nơi đi", type: "text" },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_5": { title: "5. Danh sách người chuyển đi khỏi xã", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten", label: "Họ tên người đi", type: "text", required: true },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "quan_he", label: "Quan hệ với chủ hộ", type: "select-quanhe", required: true }, // 🔄 Đổi thành select-quanhe
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"], required: true },
        { name: "dan_toc", label: "Dân tộc", type: "select-dantoc", options: uniqueDanToc, required: true },
        { name: "ngay_di", label: "Ngày đi", type: "date", required: true },
        { name: "noi_den", label: "Nơi đến", type: "text" },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_6": { title: "6. Danh sách thay đổi thông tin cơ bản", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten", label: "Họ tên người có thay đổi", type: "text", required: true },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"], required: true },
        { name: "thong_tin_cu", label: "Thông tin cũ", type: "text", required: true },
        { name: "thong_tin_moi", label: "Thông tin mới", type: "text", required: true },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
  "table_7": { title: "7. Vợ chồng mới sử dụng BPTT", fields: [
        { name: "search_phunu_helper", label: "🔍 Dò tìm Phụ nữ từ danh sách 15-49 (Nhập Mã hộ hoặc Họ tên)", type: "search-phunu-master" },
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten_vo", label: "Họ tên người vợ (từ 15-49 tuổi)", type: "text", required: true },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" }, 
        { name: "ngay_su_dung", label: "Ngày sử dụng", type: "date", required: true },
        { name: "bptt_moi", label: "Biện pháp tránh thai mới", type: "select-bptt", required: true },
        { name: "so_con_hien_co", label: "Số con hiện có", type: "number", required: true },
        { name: "noi_thuc_hien", label: "Nơi thực hiện", type: "select-noithuchien", required: false },
        { name: "ghi_chu", label: "Ghi chú", type: "textarea" }
    ]},
   "table_8": { title: "8. Vợ chồng thôi sử dụng BPTT", fields: [
        { name: "search_helper", label: "🔍 Tìm kiếm thông tin từ Bảng 7 (Nhập hộ số hoặc tên vợ)", type: "search-table7" },
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten_vo", label: "Họ tên người vợ (từ 15-49 tuổi)", type: "text", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "ngay_sinh", label: "Năm sinh", type: "date", required: true },
        { name: "ngay_thoi_su_dung", label: "Ngày thôi sử dụng", type: "date", required: true },
        { name: "bptt_thoi", label: "BPTT thôi sử dụng", type: "select-bptt", required: true },
        { name: "noi_thuc_hien", label: "Nơi thực hiện", type: "select-noithuchien", required: false },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_9": { title: "9. Phụ nữ có thông tin thai sản", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ho_ten", label: "Họ tên phụ nữ", type: "text", required: true },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "ngay_su_kien", label: "Ngày có sự kiện", type: "date", required: true },
        { name: "su_kien", label: "Sự kiện thai sản", type: "select", options: ["Mang thai", "Sảy thai", "Phá thai"], required: true },
        { name: "mang_thai_lan_thu", label: "Mang thai lần thứ", type: "number", required: true },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
   "table_10": { title: "10. Sàng lọc trước sinh", fields: [
        { name: "so_ho", label: "Số hộ", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ma_the_bhyt", label: "Mã số thẻ BHYT", type: "text" },
        { name: "ho_ten", label: "Họ tên mẹ", type: "text", required: true },
        { name: "noi_cu_tru", label: "Nơi cư trú", type: "text", required: true },
        { name: "ngay_sinh", label: "Ngày sinh của mẹ", type: "date", required: true },
        { name: "ngay_thang_mang_thai", label: "Ngày đầu kỳ kinh cuối (LMP)", type: "date", required: true },
        
        { name: "mang_thai_tuan_12", label: "Ngày khám Tuần 12", type: "date", required: true },
        { name: "hoi_chung_down_12", label: "Hội chứng Down (T12)", type: "select", options: ["Nguy cơ thấp", "Nguy cơ cao", "Bình thường"] },
        { name: "hoi_chung_edward_12", label: "Hội chứng Edward (T12)", type: "select", options: ["Nguy cơ thấp", "Nguy cơ cao", "Bình thường"] },
        { name: "hoi_chung_patau_12", label: "Hội chứng Patau (T12)", type: "select", options: ["Nguy cơ thấp", "Nguy cơ cao", "Bình thường"] },
        { name: "benh_thalassemia_12", label: "Thalassemia (T12)", type: "select", options: ["Nguy cơ thấp", "Nguy cơ cao", "Bình thường"] },

        { name: "mang_thai_tuan_21", label: "Ngày khám Tuần 21", type: "date", required: true },
        { name: "hoi_chung_down_21", label: "Hội chứng Down (T21)", type: "select", options: ["Nguy cơ thấp", "Nguy cơ cao", "Bình thường"] },
        { name: "hoi_chung_edward_21", label: "Hội chứng Edward (T21)", type: "select", options: ["Nguy cơ thấp", "Nguy cơ cao", "Bình thường"] },
        { name: "hoi_chung_patau_21", label: "Hội chứng Patau (T21)", type: "select", options: ["Nguy cơ thấp", "Nguy cơ cao", "Bình thường"] },
        { name: "benh_thalassemia_21", label: "Thalassemia (T21)", type: "select", options: ["Nguy cơ thấp", "Nguy cơ cao", "Bình thường"] },
        { name: "ghi_chu", label: "Ghi chú (Nơi đẻ)", type: "text" }
    ]},
    "table_11": { title: "11. Người cao tuổi khám sức khỏe", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ghi_chu_ma_ho", label: "Ghi chú mã hộ", type: "text-hidden-dynamic" },
        { name: "ma_so_doi_tuong", label: "Mã số đối tượng", type: "text", required: false },
        { name: "ho_ten", label: "Họ tên người NCT", type: "text", required: true },
        { name: "nam_sinh", label: "Năm sinh", type: "text", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "ngay_kham", label: "Ngày khám", type: "date", required: true },
        { name: "ghi_chu", label: "Ghi chú (Nơi đẻ)", type: "text" }
    ]}
};

window.onload = async function() {
    let authCheck = await fetch('/api/me');
    if(authCheck.status === 401) {
        window.location.href = 'login.html';
        return;
    }

    let currentUser = await authCheck.json().catch(() => null);
    if (currentUser) {
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        const role = (currentUser.role || "").trim().toLowerCase();
        // Nếu là Lãnh đạo/Admin thì gọi file/hàm riêng của Lãnh đạo và dừng lại
       if (role.includes("lãnh đạo") || role.includes("lanh dao")) {
            if (typeof initLeadershipDashboard === 'function') {
                initLeadershipDashboard();
            }
            return;
        }

        showLoginWelcomeModal(currentUser);
    }

    // Lấy danh sách ấp
    let resAp = await fetch('/api/danh-sach-ap');
    let dataAp = await resAp.json();
    danhSachApOptions = dataAp.map(item => item.ten_ap);

    // Lấy danh sách Bệnh viện
    try {
        let resBv = await fetch('/api/danh-sach-benh-vien');
        let dataBv = await resBv.json();
        danhSachBenhVienOptions = dataBv.map(item => item.ten_benh_vien);
    } catch(e) {
        danhSachBenhVienOptions = ["Bệnh viện Đa khoa", "Trạm Y tế xã"];
    }

    // Lấy danh sách BPTT
    try {
        let resBptt = await fetch('/api/danh-sach-bptt');
        let dataBptt = await resBptt.json();
        danhSachBptTOptions = dataBptt; 
    } catch(e) {
        danhSachBptTOptions = [
            { ma_bptt: '1', ten_bptt: 'Vòng tránh thai' },
            { ma_bptt: '2', ten_bptt: 'Triệt sản nam' },
            { ma_bptt: '3', ten_bptt: 'Triệt sản nữ' },
            { ma_bptt: '4', ten_bptt: 'Bao cao su' },
            { ma_bptt: '5', ten_bptt: 'Thuốc uống tránh thai' }
        ];
    }

    // Lấy danh sách Nơi thực hiện
    try {
        let resNth = await fetch('/api/danh-sach-noi-thuc-hien');
        let dataNth = await resNth.json();
        danhSachNoiThucHienOptions = dataNth.map(item => item.ten_noi_thuc_hien);
    } catch(e) {
        danhSachNoiThucHienOptions = ["Trạm Y tế xã Lương Hòa", "Bệnh viện Đa khoa Bến Lức"];
    }

    // 🆕 Lấy danh sách Quan hệ với chủ hộ từ Database (Phòng hờ nếu chưa có API thì dùng mặc định)
    try {
        let resQh = await fetch('/api/danh-sach-quan-he');
        let dataQh = await resQh.json();
        danhSachQuanHeOptions = dataQh.map(item => item.ten_quan_he || item);
    } catch(e) {
        danhSachQuanHeOptions = ["Chủ hộ", "Vợ", "Chồng", "Con", "Bố", "Mẹ"];
    }

    if (typeof initNameFormatter === 'function') {
        initNameFormatter();
    }

    switchTableForm();
};

function showLoginWelcomeModal(currentUser) {
    let name = currentUser.fullname || currentUser.username || "";
    let userRole = currentUser.role || "Cộng tác viên";
    let locationText = "Toàn xã";
    
    let parts = [];
    if (currentUser.diabanh && currentUser.diabanh !== "Tất cả") {
        parts.push(currentUser.diabanh);
    }
    if (currentUser.ap && currentUser.ap !== "Tất cả") {
        let apName = currentUser.ap.toLowerCase().startsWith('ấp') ? currentUser.ap : `Ấp ${currentUser.ap}`;
        parts.push(apName);
    }
    
    if (parts.length > 0) {
        locationText = parts.join(" - ");
    }

    let modalHtml = `
        <div class="modal fade" id="loginWelcomeModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
          <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content border-0 shadow-lg rounded-4 mx-2">
              <div class="modal-header bg-success text-white rounded-top-4 py-2">
                <h6 class="modal-title fw-bold"><i class="fa-solid fa-circle-user me-1"></i> Xác nhận tài khoản</h6>
              </div>
              <div class="modal-body text-center px-3 py-2">
                <div class="mb-1 text-success">
                    <i class="fa-solid fa-id-card fa-2x"></i>
                </div>
                <h5 class="fw-bold text-dark mb-1" style="font-size: 1.1rem;">Xin chào, ${name}!</h5>
                <p class="text-muted small mb-2" style="font-size: 0.85rem;">Bạn đang đăng nhập với tư cách:</p>
                
                <div class="bg-light p-2 rounded-3 text-start border mb-2 small">
                    <div class="mb-1"><strong>Vai trò:</strong> <span class="badge bg-primary">${userRole}</span></div>
                    <div><strong>Khu vực:</strong> <span class="text-danger fw-bold">${locationText}</span></div>
                </div>

                <div class="alert alert-warning small p-2 mb-0 text-start" style="font-size: 0.78rem;">
                    ⚠️ Nếu không phải tài khoản của bạn, hãy bấm <b>Đăng xuất</b>!
                </div>
              </div>
              <div class="modal-footer bg-light rounded-bottom-4 py-2 justify-content-between">
                <button type="button" class="btn btn-outline-danger btn-sm px-2 py-1" style="font-size: 0.8rem;" onclick="logout()">
                    <i class="fa-solid fa-right-from-bracket me-1"></i> Đăng xuất
                </button>
                <button type="button" class="btn btn-success btn-sm px-3 py-1 fw-bold" style="font-size: 0.85rem;" data-bs-dismiss="modal">
                    <i class="fa-solid fa-check me-1"></i> Đúng là tôi
                </button>
              </div>
            </div>
          </div>
        </div>
    `;

    let oldModal = document.getElementById('loginWelcomeModal');
    if (oldModal) oldModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    let modalElement = document.getElementById('loginWelcomeModal');
    let modal = new bootstrap.Modal(modalElement);
    modal.show();
}
function switchTableForm() {
    currentTable = document.getElementById('selectTable').value;
    let config = tableConfigs[currentTable];
    if (!config) return;
    
    document.getElementById('form-title').innerText = "📝 Nhập liệu: " + (config.title || '');

    let container = document.getElementById('dynamic-fields');
    container.innerHTML = '';

    let submitBtn = document.querySelector('#dynamicForm button[type="submit"]');
    let isTable10 = (currentTable === 'table_10');

    // 🔒 Nếu là Bảng 2 hoặc Bảng 10: Ẩn nút lưu và hiển thị thông báo hướng dẫn
    const isReadOnlyTable = (currentTable === 'table_2' || isTable10);

    if (isReadOnlyTable) {
        if (submitBtn) submitBtn.style.display = 'none';
        
        let noticeDiv = document.createElement('div');
        noticeDiv.className = "col-12 mb-3";
        noticeDiv.innerHTML = `
            <div class="alert alert-info border-info shadow-sm p-3 mb-2">
                <i class="fa-solid fa-circle-info me-2"></i> 
                <b>Lưu ý:</b> Không cần nhập bảng này vì đã tự động đồng bộ với <b>Bảng 1 (Danh sách trẻ sinh ra)</b>.
            </div>
        `;
        container.appendChild(noticeDiv);
    } else {
        if (submitBtn) submitBtn.style.display = 'inline-block';
    }

    if (!config.fields) return;

    config.fields.forEach(field => {
        let col = document.createElement('div');
        col.className = "col-md-6 mb-3";

        if (field.type === 'date') {
            let yearsOptions = '<option value="">-- Năm --</option>';
            for (let y = 2030; y >= 1900; y--) {
                yearsOptions += `<option value="${y}">${y}</option>`;
            }

            let monthsOptions = '<option value="">-- Tháng --</option>';
            for (let m = 1; m <= 12; m++) {
                let mVal = m < 10 ? '0' + m : m;
                monthsOptions += `<option value="${mVal}">Tháng ${m}</option>`;
            }

            let daysOptions = '<option value="">-- Ngày --</option>';
            for (let d = 1; d <= 31; d++) {
                let dVal = d < 10 ? '0' + d : d;
                daysOptions += `<option value="${dVal}">Ngày ${d}</option>`;
            }

            let isDisabled = ((currentTable === 'table_8' && field.name === 'ngay_sinh') || isTable10) ? 'disabled style="background-color: #e9ecef; cursor: not-allowed;"' : '';

            col.innerHTML = `
                <label>${field.label} ${field.required && !isTable10 ? '<span class="text-danger">*</span>' : ''}</label>
                <div class="row g-2 mb-2">
                    <div class="col-4">
                        <select class="form-select select-day" ${isDisabled} onchange="updateDateValue('${field.name}')">
                            ${daysOptions}
                        </select>
                    </div>
                    <div class="col-4">
                        <select class="form-select select-month" ${isDisabled} onchange="updateDateValue('${field.name}')">
                            ${monthsOptions}
                        </select>
                    </div>
                    <div class="col-4">
                        <select class="form-select select-year" ${isDisabled} onchange="updateDateValue('${field.name}')">
                            ${yearsOptions}
                        </select>
                    </div>
                </div>
                <input type="date" id="${field.name}" class="form-control" name="${field.name}" ${isTable10 ? 'readonly style="background-color: #e9ecef; cursor: not-allowed;"' : (field.required ? 'required' : '')}>
            `;
        } else if (field.type === 'select') {
            col.innerHTML = `<label>${field.label} ${field.required && !isTable10 ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            if (field.required && !isTable10) select.required = true;
            if (isTable10) {
                select.disabled = true;
                select.style.backgroundColor = '#e9ecef';
            }
            select.innerHTML = `<option value="">-- Chọn --</option>` + (field.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        }
        else if (field.type === 'text-hidden-dynamic') {
            col.id = `wrapper_${field.name}`;
            col.style.display = 'none'; // Ẩn mặc định ban đầu
            col.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <label class="text-danger small fw-bold mb-0">${field.label}</label>
                    <button type="button" class="btn btn-link btn-sm text-muted p-0 text-decoration-none" style="font-size: 0.75rem;" onclick="anHienGhiChuMaHo('${field.name}', false)">✖ Đóng</button>
                </div>
                <input type="text" class="form-control form-control-sm border-danger" id="input_${field.name}" name="${field.name}" placeholder="Ký hiệu phụ của mã hộ...">
            `;
            container.appendChild(col);
            return;
        }
        else if (field.type === 'select-dantoc') {
            col.innerHTML = `<label>${field.label} ${field.required && !isTable10 ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            if (field.required && !isTable10) select.required = true;
            if (isTable10) {
                select.disabled = true;
                select.style.backgroundColor = '#e9ecef';
            }
            select.innerHTML = `<option value="">-- Chọn dân tộc --</option>` + (field.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'select-benhvien') {
            col.innerHTML = `<label>${field.label} ${field.required && !isTable10 ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            if (field.required && !isTable10) select.required = true;
            if (isTable10) {
                select.disabled = true;
                select.style.backgroundColor = '#e9ecef';
            }
            select.innerHTML = `<option value="">-- Chọn bệnh viện --</option>` + (typeof danhSachBenhVienOptions !== 'undefined' ? danhSachBenhVienOptions : []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'select-bptt') {
            col.innerHTML = `<label>${field.label} ${field.required && !isTable10 ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            if (field.required && !isTable10) select.required = true;
            if (isTable10) {
                select.disabled = true;
                select.style.backgroundColor = '#e9ecef';
            }
            let optsHtml = `<option value="">-- Chọn biện pháp tránh thai --</option>` + 
                (typeof danhSachBptTOptions !== 'undefined' ? danhSachBptTOptions : []).map(item => `<option value="${item.ma_bptt}">${item.ma_bptt} - ${item.ten_bptt}</option>`).join('');
            select.innerHTML = optsHtml;
            col.appendChild(select);
        } else if (field.type === 'select-noithuchien') {
            col.innerHTML = `<label>${field.label} ${field.required && !isTable10 ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            if (field.required && !isTable10) select.required = true;
            if (isTable10) {
                select.disabled = true;
                select.style.backgroundColor = '#e9ecef';
            }
            select.innerHTML = `<option value="">-- Chọn nơi thực hiện --</option>` + (typeof danhSachNoiThucHienOptions !== 'undefined' ? danhSachNoiThucHienOptions : []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'select-quanhe') {
            col.innerHTML = `<label>${field.label} ${field.required && !isTable10 ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            if (field.required && !isTable10) select.required = true;
            if (isTable10) {
                select.disabled = true;
                select.style.backgroundColor = '#e9ecef';
            }
            select.innerHTML = `<option value="">-- Chọn quan hệ --</option>` + (typeof danhSachQuanHeOptions !== 'undefined' ? danhSachQuanHeOptions : []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'search-phunu-master') {
            if (typeof renderPhuNuSearchField === 'function') {
                let colSearch = renderPhuNuSearchField(field);
                container.appendChild(colSearch);
            }
            return; // Dừng vòng lặp turn này để các ô bên dưới tự xếp vào dòng col-md-6 mới
        }else if (field.type === 'search-table7') {
            col.className = "col-12 mb-3 bg-light p-3 border rounded position-relative";
            col.innerHTML = `
                <label class="fw-bold text-danger mb-1">${field.label}</label>
                <input type="text" id="inputSearchT7" class="form-control" placeholder="Gõ hộ số hoặc tên vợ để tìm kiếm..." oninput="searchDataFromTable7(this.value)">
                <div id="suggestBoxT7" class="list-group position-absolute shadow-sm w-100" style="z-index: 1050; max-height: 200px; overflow-y: auto;"></div>
                <small class="text-muted mt-1 d-block">💡 Nhập thông tin để gợi ý kết quả từ Bảng 7, sau đó click chọn để hệ thống tự động điền các ô bên dưới.</small>
            `;
        } else {
    // Bảng 2 và Bảng 10 vẫn đồng bộ dữ liệu từ Bảng 1,
    // nhưng riêng ô BHYT luôn cho phép nhập/sửa trực tiếp khi CSDL BHYT không có kết quả.
    const isReadOnlyTable = (currentTable === 'table_2' || isTable10);
    const isBhytField = ['so_the_bhyt', 'so_the_bhyt_me', 'ma_the_bhyt', 'ma_the_bhyt_me'].includes(field.name);

    if (field.name === 'ho_ten_con' || field.name === 'ho_ten_tre' || field.name === 'ho_ten') {
        col.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="mb-0">${field.label} ${field.required && !isReadOnlyTable ? '<span class="text-danger">*</span>' : ''}</label>
                ${field.name !== 'ho_ten' && !isReadOnlyTable ? `
                <div class="form-check form-check-inline m-0">
                    <input class="form-check-input" type="checkbox" id="check_${field.name}" onchange="toggleChuaDatTen('${field.name}')">
                    <label class="form-check-label small text-primary fw-semibold" for="check_${field.name}" style="cursor: pointer;">Chưa đặt tên</label>
                </div>` : ''}
            </div>
            <input type="${field.type || 'text'}" class="form-control" id="input_${field.name}" name="${field.name}" ${isReadOnlyTable ? 'readonly style="background-color: #e9ecef; cursor: not-allowed;" placeholder="🔒 Đã tự động đồng bộ từ Bảng 1..."' : (field.required ? 'required' : '')}>
        `;
    } else {
        col.innerHTML = `<label>${field.label} ${field.required && !isReadOnlyTable ? '<span class="text-danger">*</span>' : ''}</label>`;
        let input = document.createElement('input');
        input.type = field.type || 'text';
        input.className = "form-control";
        input.id = `input_${field.name}`;
        input.name = field.name;

        if (field.required && !isReadOnlyTable) input.required = true;

        // 🔒 Khóa các trường được đồng bộ từ Bảng 7 của Bảng 8.
        // Riêng BHYT không khóa để cán bộ có thể nhập tay nếu không tra cứu được.
        if (currentTable === 'table_8' && ['ho_so', 'ho_ten_vo', 'ngay_sinh'].includes(field.name)) {
            input.setAttribute('readonly', true);
            input.readOnly = true;
            input.style.backgroundColor = '#e9ecef';
            input.style.cursor = 'not-allowed';
            input.placeholder = '🔒 Chọn từ Bảng 7 phía trên...';
            input.onkeydown = (e) => e.preventDefault();
            input.onpaste = (e) => e.preventDefault();
        }

        // 🔒 Khóa các input đồng bộ của Bảng 2/Bảng 10, nhưng luôn chừa ô BHYT để nhập tay.
        if (isReadOnlyTable && !isBhytField) {
            input.setAttribute('readonly', true);
            input.readOnly = true;
            input.style.backgroundColor = '#e9ecef';
            input.style.cursor = 'not-allowed';
            input.placeholder = '🔒 Đã tự động đồng bộ từ Bảng 1...';
            input.onkeydown = (e) => e.preventDefault();
            input.onpaste = (e) => e.preventDefault();
        }

        col.appendChild(input);
    }
}
        container.appendChild(col);
    });

    // BHYT: sau khi đổi bảng, gắn lại ô nhập + nút Tìm sau khi form đã render xong.
    if (typeof window.refreshBHYTSearch === 'function') {
        window.refreshBHYTSearch();
    }

    if (currentTable === 'table_1') {
        let extraCol = document.createElement('div');
        extraCol.className = "col-md-6 mb-3 bg-white p-3 border rounded shadow-sm border-success";
        extraCol.innerHTML = `
            <label class="fw-bold text-success mb-1"><i class="fa-solid fa-house-chimney me-1"></i> Nơi cư trú của mẹ (Dùng cho Sàng lọc trước sinh) <span class="text-danger">*</span></label>
            <input type="text" id="input_noi_cu_tru_me" class="form-control mb-2" placeholder="Nhập địa chỉ nơi cư trú của mẹ..." required>
            <div class="form-check">
                <input class="form-check-input" type="checkbox" id="check_nguoi_dia_phuong" onchange="toggleNguoiDiaPruong()">
                <label class="form-check-label small text-primary fw-semibold" for="check_nguoi_dia_phuong" style="cursor: pointer;">
                    🏠 Người địa phương (Tự động điền theo khu vực cán bộ)
                </label>
            </div>
        `;
        container.appendChild(extraCol);
    }

    if (typeof fetchTableData === 'function') {
        fetchTableData(currentTable);
    }
}
function toggleNguoiDiaPruong() {
    let checkbox = document.getElementById('check_nguoi_dia_phuong');
    let input = document.getElementById('input_noi_cu_tru_me');
    if (!checkbox || !input) return;

    if (checkbox.checked) {
        let currentUser = JSON.parse(localStorage.getItem("currentUser")) || {};
        let diabanh = currentUser.diabanh && currentUser.diabanh !== 'Tất cả' ? currentUser.diabanh : '';
        let apRaw = currentUser.ap && currentUser.ap !== 'Tất cả' ? currentUser.ap : '';
        
        let ap = '';
        if (apRaw) {
            ap = apRaw.toLowerCase().startsWith('ấp') ? apRaw : `Ấp ${apRaw}`;
        }
        
        let xa = currentUser.xa ? `Xã ${currentUser.xa.replace(/^(xã\s*)/i, '')}` : 'Xã Lương Hòa';
        let tinh = "Tỉnh Tây Ninh";

        let diaChiDefault = [diabanh, ap, xa, tinh].filter(Boolean).join(", ");
        
        input.value = diaChiDefault || "Xã Lương Hòa,Tỉnh Tây Ninh";
        input.setAttribute('readonly', true);
        input.style.backgroundColor = '#e9ecef';
    } else {
        input.value = '';
        input.removeAttribute('readonly');
        input.style.backgroundColor = '#fff';
    }
}

function toggleChuaDatTen(fieldName) {
    const checkbox = document.getElementById(`check_${fieldName}`);
    const inputField = document.getElementById(`input_${fieldName}`);
    
    if (checkbox.checked) {
        inputField.value = "Chưa đặt tên";
        inputField.setAttribute("readonly", true);
        inputField.dispatchEvent(new Event('input'));
    } else {
        inputField.value = "";
        inputField.removeAttribute("readonly");
    }
}

function updateDateValue(fieldKey) {
    const container = document.getElementById(fieldKey).closest('.col-md-6');
    const day = container.querySelector('.select-day').value;
    const month = container.querySelector('.select-month').value;
    const year = container.querySelector('.select-year').value;
    
    const inputDate = document.getElementById(fieldKey);
    if (year && month && day) {
        inputDate.value = `${year}-${month}-${day}`;
    } else if (year || month || day) {
        inputDate.value = `${year || '1900'}-${month || '01'}-${day || '01'}`;
    } else {
        inputDate.value = '';
    }
}

function isValidPastDate(dateString) {
    if (!dateString) return true;
    let inputDate = new Date(dateString);
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    return inputDate < today;
}

function showPreviewModal(dataObj, configFields) {
    return new Promise((resolve) => {
        let modalHtml = `
            <div class="modal fade" id="previewModal" tabindex="-1" aria-hidden="true">
              <div class="modal-dialog modal-lg">
                <div class="modal-content">
                  <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title">📋 Xem lại dữ liệu trước khi lưu</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                  </div>
                  <div class="modal-body">
                    <p class="text-muted">Vui lòng kiểm tra lại thông tin bên dưới trước khi bấm <b>"Đồng ý lưu"</b>:</p>
                    <table class="table table-bordered table-striped">
                      <tbody>
        `;

        configFields.forEach(f => {
            let val = dataObj[f.name] !== undefined && dataObj[f.name] !== null ? dataObj[f.name] : '';
            if (f.name === 'search_helper') return;
            modalHtml += `<tr><th style="width: 35%;">${f.label}</th><td>${val}</td></tr>`;
        });

        if (currentTable === 'table_1') {
            let noiCuTru = document.getElementById('input_noi_cu_tru_me') ? document.getElementById('input_noi_cu_tru_me').value : '';
            modalHtml += `<tr><th>Nơi cư trú của mẹ (Sàng lọc trước sinh)</th><td>${noiCuTru}</td></tr>`;
        }

        // BỔ SUNG XEM TRƯỚC THÔNG TIN QUẢN LÝ PHỤ NỮ 15–49
        // Chỉ hiển thị khi Bảng 4 đủ điều kiện và phần thông tin đang mở.
        if (currentTable === 'table_4') {
            const extraContainer = document.getElementById('table_4_extra_fields');

            if (extraContainer && extraContainer.style.display !== 'none') {
                const extraFields = [
                    {
                        name: 'bptt_moi',
                        label: 'Biện pháp tránh thai đang dùng'
                    },
                    {
                        name: 'so_con',
                        label: 'Số con hiện có'
                    },
                    {
                        name: 'nam_sinh_con',
                        label: 'Năm sinh con nhỏ nhất'
                    }
                ];

                modalHtml += `
                    <tr>
                        <th colspan="2" class="table-primary">
                            Thông tin quản lý Phụ nữ 15–49
                            (Dành cho người đã có chồng - Bắt buộc)
                        </th>
                    </tr>
                `;

                extraFields.forEach(field => {
                    const input = extraContainer.querySelector(
                        `[name="${field.name}"]`
                    );

                    const value = input ? input.value.trim() : '';

                    modalHtml += `
                        <tr>
                            <th style="width: 35%;">${field.label}</th>
                            <td>${value || '(Chưa nhập)'}</td>
                        </tr>
                    `;
                });
            }
        }

        modalHtml += `
                      </tbody>
                    </table>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" id="btnCancelSave" data-bs-dismiss="modal">Hủy bỏ</button>
                    <button type="button" class="btn btn-success px-4 fw-bold" id="btnConfirmSave">✅ Đồng ý lưu</button>
                  </div>
                </div>
              </div>
            </div>
        `;

        let oldModal = document.getElementById('previewModal');
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        let modalElement = document.getElementById('previewModal');
        let modal = new bootstrap.Modal(modalElement);
        modal.show();

        document.getElementById('btnConfirmSave').onclick = function() {
            modal.hide();
            resolve(true);
        };

        document.getElementById('btnCancelSave').onclick = function() {
            resolve(false);
        };
        
        modalElement.addEventListener('hidden.bs.modal', function () {
            resolve(false);
        }, { once: true });
    });
}

// Hàm hiển thị Popup Modal cảnh báo trùng mã hộ rõ ràng, dễ nhìn
function showConflictModal(message) {
    return new Promise((resolve) => {
        let modal = document.getElementById('conflictModal');
        let textEl = document.getElementById('conflictModalText');
        let btnCancel = document.getElementById('conflictBtnCancel');

        textEl.innerHTML = message;
        modal.style.display = 'flex';

        let handleCancel = () => {
            modal.style.display = 'none';
            btnCancel.removeEventListener('click', handleCancel);
            resolve(false); // Luôn trả về false để chặn đứng việc lưu
        };

        btnCancel.addEventListener('click', handleCancel);
    });
}

/**
 * Popup xác nhận dùng chung mã hộ.
 * Chỉ dùng cho Bảng 3 và Bảng 5.
 * Bắt buộc tích ô xác nhận mới được tiếp tục.
 */
function showSharedHouseholdConfirmModal(hoSo, tenCu, tenMoi) {
    return new Promise((resolve) => {
        // Xóa popup cũ nếu còn tồn tại.
        const oldModal = document.getElementById(
            'sharedHouseholdConfirmModal'
        );

        if (oldModal) oldModal.remove();

        // Chỉ chứa HTML tĩnh; dữ liệu người dùng sẽ gán bằng textContent.
        const wrapper = document.createElement('div');

        wrapper.innerHTML = `
            <div class="modal fade"
                 id="sharedHouseholdConfirmModal"
                 tabindex="-1"
                 aria-hidden="true"
                 data-bs-backdrop="static"
                 data-bs-keyboard="false">

                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow">

                        <div class="modal-header bg-warning">
                            <h5 class="modal-title fw-bold">
                                ⚠️ Xác nhận dùng chung hộ
                            </h5>
                        </div>

                        <div class="modal-body">

                            <p>
                                Mã hộ
                                <strong id="sharedHouseholdCode"></strong>
                                đã tồn tại nhưng tên người không trùng khớp.
                            </p>

                            <div class="alert alert-secondary">
                                <div class="mb-2">
                                    <strong>Tên đã có:</strong>
                                    <div id="sharedHouseholdOldName"
                                         class="text-primary fw-bold"></div>
                                </div>

                                <div>
                                    <strong>Tên đang nhập:</strong>
                                    <div id="sharedHouseholdNewName"
                                         class="text-danger fw-bold"></div>
                                </div>
                            </div>

                            <div class="form-check border rounded p-3">
                                <input
                                    class="form-check-input ms-0 me-2"
                                    type="checkbox"
                                    id="sharedHouseholdCheckbox">

                                <label
                                    class="form-check-label fw-semibold"
                                    for="sharedHouseholdCheckbox">

                                    Người này cùng chung hộ với người đã có.
                                    Tôi đã kiểm tra và xác nhận thông tin.
                                </label>
                            </div>

                            <div class="small text-muted mt-2">
                                Chỉ xác nhận mã hộ dùng chung.
                                Các bước kiểm tra dữ liệu, lưu và đồng bộ
                                vẫn được thực hiện như bình thường.
                            </div>

                        </div>

                        <div class="modal-footer">
                            <button type="button"
                                    class="btn btn-secondary"
                                    id="sharedHouseholdCancel">
                                Quay lại kiểm tra
                            </button>

                            <button type="button"
                                    class="btn btn-primary"
                                    id="sharedHouseholdContinue"
                                    disabled>
                                Tiếp tục
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper.firstElementChild);

        const modalElement = document.getElementById(
            'sharedHouseholdConfirmModal'
        );

        // Hiển thị dữ liệu an toàn, không chèn tên người vào HTML.
        document.getElementById('sharedHouseholdCode').textContent =
            String(hoSo || '');

        document.getElementById('sharedHouseholdOldName').textContent =
            String(tenCu || '');

        document.getElementById('sharedHouseholdNewName').textContent =
            String(tenMoi || '');

        const checkbox = document.getElementById(
            'sharedHouseholdCheckbox'
        );

        const continueBtn = document.getElementById(
            'sharedHouseholdContinue'
        );

        const cancelBtn = document.getElementById(
            'sharedHouseholdCancel'
        );

        const modal = new bootstrap.Modal(modalElement);

        let settled = false;

        function finish(confirmed) {
            if (settled) return;

            settled = true;
            resolve(confirmed);
            modal.hide();
        }

        // Chỉ bật nút Tiếp tục sau khi tích xác nhận.
        checkbox.addEventListener('change', function () {
            continueBtn.disabled = !checkbox.checked;
        });

        continueBtn.addEventListener('click', function () {
            if (!checkbox.checked) return;
            finish(true);
        });

        cancelBtn.addEventListener('click', function () {
            finish(false);
        });

        modalElement.addEventListener(
            'hidden.bs.modal',
            function () {
                if (!settled) {
                    settled = true;
                    resolve(false);
                }

                modal.dispose();
                modalElement.remove();
            },
            { once: true }
        );

        modal.show();
    });
}

// HÀM SAVE DỮ LIỆU VÀO SERVER
async function saveData(e) {
    e.preventDefault();

    const form = document.getElementById('dynamicForm');
    if (!form) {
        alert('❌ Không tìm thấy biểu mẫu nhập liệu!');
        return;
    }

    const formData = new FormData(form);
    const dataObj = {};

    formData.forEach((val, key) => {
        dataObj[key] = val;
    });

    // =========================================================
    // HÀM HỖ TRỢ: ĐỌC PHẢN HỒI API AN TOÀN
    // Không giả định mọi phản hồi đều là JSON hợp lệ.
    // =========================================================
    async function readApiResponse(response) {
        const rawText = await response.text();
        let result;

        try {
            result = rawText ? JSON.parse(rawText) : {};
        } catch (_) {
            throw new Error(
                `Máy chủ trả về dữ liệu không hợp lệ (HTTP ${response.status}).`
            );
        }

        if (!response.ok) {
            throw new Error(
                result.message ||
                `Yêu cầu thất bại (HTTP ${response.status}).`
            );
        }

        if (result.success === false) {
            throw new Error(
                result.message || 'Máy chủ không thể xử lý yêu cầu.'
            );
        }

        return result;
    }

    // =========================================================
    // KIỂM TRA NGÀY TƯƠNG LAI - DÙNG NGÀY ĐỊA PHƯƠNG VIỆT NAM
    // Giữ nguyên quy tắc kiểm tra ngày và năm của bạn.
    // =========================================================
    const now = new Date();

    const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');

    const currentYear = now.getFullYear();

    for (const key in dataObj) {
        if (
            (key.includes('ngay') ||
             key.includes('nam') ||
             key.includes('sinh')) &&
            dataObj[key]
        ) {
            const val = String(dataObj[key]).trim();

            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                // Kiểm tra cả tính hợp lệ của ngày, tránh ngày ảo.
                const parts = val.split('-').map(Number);
                const checkDate = new Date(
                    parts[0],
                    parts[1] - 1,
                    parts[2]
                );

                const validDate =
                    checkDate.getFullYear() === parts[0] &&
                    checkDate.getMonth() === parts[1] - 1 &&
                    checkDate.getDate() === parts[2];

                if (!validDate) {
                    alert(`❌ Ngày của trường "${key}" không hợp lệ!`);
                    const errInput =
                        form.querySelector(`[name="${key}"]`);
                    if (errInput) errInput.focus();
                    return;
                }

                if (val > todayStr) {
                    alert(
                        `❌ Lỗi: Trường dữ liệu (${key}) ` +
                        'không được lớn hơn ngày hiện tại!'
                    );

                    const errInput =
                        form.querySelector(`[name="${key}"]`);
                    if (errInput) errInput.focus();
                    return;
                }
            } else if (/^\d{4}$/.test(val)) {
                if (parseInt(val, 10) > currentYear) {
                    alert(
                        `❌ Lỗi: Năm của trường (${key}) không được ` +
                        `lớn hơn năm hiện tại (${currentYear})!`
                    );

                    const errInput =
                        form.querySelector(`[name="${key}"]`);
                    if (errInput) errInput.focus();
                    return;
                }
            }
        }
    }

    // =========================================================
    // 1. TỰ ĐỘNG CHUẨN HÓA MÃ HỘ
    // =========================================================
    const hoSoFieldKey = dataObj.hasOwnProperty('ho_so')
        ? 'ho_so'
        : (
            dataObj.hasOwnProperty('so_ho')
                ? 'so_ho'
                : null
        );

    if (hoSoFieldKey && dataObj[hoSoFieldKey]) {
        const originalHoSo = String(dataObj[hoSoFieldKey]);
        const checkHoSo = chuanHoaHoSo(originalHoSo);

        if (checkHoSo.error) {
            const confirmText =
                `${checkHoSo.error}\n\n` +
                'Bạn có muốn tự động chuẩn hóa phần số và đưa ' +
                'các ký tự chữ thừa xuống ô "Ghi chú" không?';

            if (!confirm(confirmText)) {
                const inputEl =
                    form.querySelector(`[name="${hoSoFieldKey}"]`);
                if (inputEl) inputEl.focus();
                return;
            }

            // Giữ nguyên cách tách phần số và chữ thừa của bạn.
            const matchNum = originalHoSo.match(/[\d.]+/);

            if (!matchNum) {
                alert('❌ Không tìm thấy số hộ hợp lệ để chuẩn hóa!');
                const inputEl =
                    form.querySelector(`[name="${hoSoFieldKey}"]`);
                if (inputEl) inputEl.focus();
                return;
            }

            const cleanNum = matchNum[0];
            const textPhu = originalHoSo
                .replace(cleanNum, '')
                .trim();

            const formattedObj = chuanHoaHoSo(cleanNum);

            if (formattedObj.error) {
                alert(
                    '❌ Không thể chuẩn hóa mã hộ: ' +
                    formattedObj.error
                );
                const inputEl =
                    form.querySelector(`[name="${hoSoFieldKey}"]`);
                if (inputEl) inputEl.focus();
                return;
            }

            dataObj[hoSoFieldKey] = formattedObj.value;

            const hoSoInput =
                form.querySelector(`[name="${hoSoFieldKey}"]`);

            if (hoSoInput) {
                hoSoInput.value = formattedObj.value;
            }

            if (textPhu) {
                dataObj.ghi_chu_ma_ho = textPhu;

                const ghiChuMaHoInput = form.querySelector('[name="ghi_chu_ma_ho"]');
                if (ghiChuMaHoInput) {
                    ghiChuMaHoInput.value = textPhu;
                    // Bật hiện thị ô ghi chú mã hộ lên nếu nó đang ẩn
                    let wrapper = document.getElementById('wrapper_ghi_chu_ma_ho');
                    if (wrapper) wrapper.style.display = 'block';
                }
            }
        } else {
            dataObj[hoSoFieldKey] = checkHoSo.value;

            const inputEl =
                form.querySelector(`[name="${hoSoFieldKey}"]`);

            if (inputEl) {
                inputEl.value = checkHoSo.value;
            }
        }
    }

    // =========================================================
    // 2. KIỂM TRA TRÙNG MÃ HỘ NHƯNG KHÁC TÊN
    // BẮT BUỘC QUAY LẠI SỬA, KHÔNG CHO XÁC NHẬN BỎ QUA.
    // =========================================================
    const hoSoVal = String(
        dataObj.ho_so || dataObj.so_ho || ''
    ).trim();

    let hoTenVal =
        dataObj.ho_ten_me ||
        dataObj.ho_ten ||
        dataObj.ho_ten_con ||
        dataObj.ho_ten_nguoi_vo ||
        dataObj.ho_ten_tre ||
        dataObj.ho_ten_nguoi_nct ||
        dataObj.ho_ten_nguoi_chet ||
        dataObj.ho_ten_nguoi_den ||
        dataObj.ho_ten_nguoi_di ||
        '';

    if (!hoTenVal) {
        for (const key in dataObj) {
            if (
                (key.includes('ho_ten') || key === 'ten') &&
                dataObj[key]
            ) {
                hoTenVal = dataObj[key];
                break;
            }
        }
    }

    if (currentTable !== 'table_11' && hoSoVal && hoTenVal) {
        try {
            const checkRes = await fetch('/api/admin/check-ma-ho', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ho_so: hoSoVal,
                    ho_ten: hoTenVal
                })
            });

            const checkResult = await readApiResponse(checkRes);

            
if (checkResult.conflict) {

    // Chỉ Bảng 3 và Bảng 5 được xác nhận dùng chung hộ.
    const allowSharedHousehold = [
        'table_3',
        'table_5'
    ].includes(currentTable);

    if (allowSharedHousehold) {

        // Hiển thị tên cũ và tên mới để người nhập kiểm tra.
        const confirmed = await showSharedHouseholdConfirmModal(
            hoSoVal,
            checkResult.tenCu || '',
            hoTenVal
        );

        // Không xác nhận thì dừng, không lưu dữ liệu.
        if (!confirmed) {
            const hoSoInput = hoSoFieldKey
                ? form.querySelector(`[name="${hoSoFieldKey}"]`)
                : null;

            if (hoSoInput) {
                hoSoInput.focus();
                hoSoInput.select?.();
            }

            return;
        }

        // Đã xác nhận dùng chung hộ:
        // Cho phép đi tiếp đến các bước kiểm tra,
        // xem trước, lưu và đồng bộ hiện có.
        console.log(
            `[${currentTable}] Đã xác nhận dùng chung mã hộ:`,
            hoSoVal,
            'Tên đã có:', checkResult.tenCu,
            'Tên đang nhập:', hoTenVal
        );

    } else {

        // Các bảng khác giữ nguyên cách kiểm tra hiện tại.
        const formattedMsg =
            `Số hộ <b style="color:#dc3545;font-size:16px;">` +
            `${hoSoVal}</b> tại địa bàn của bạn đã có tên là: ` +
            `<br><b style="color:#0056b3;font-size:16px;">` +
            `"${checkResult.tenCu || ''}"</b>.` +
            `<br><br>Nhưng tên bạn vừa nhập là: ` +
            `<b style="color:#d9534f;font-size:16px;">` +
            `"${hoTenVal}"</b>.` +
            `<br><br><b>Vui lòng quay lại sửa mã hộ hoặc họ tên. ` +
            `Hệ thống không cho phép bỏ qua cảnh báo này.</b>`;

        await showConflictModal(formattedMsg);

        const hoSoInput = hoSoFieldKey
            ? form.querySelector(`[name="${hoSoFieldKey}"]`)
            : null;

        if (hoSoInput) {
            hoSoInput.focus();
            hoSoInput.select?.();
        }

        return;
    }
}

        } catch (err) {
            console.error('Lỗi kiểm tra mã hộ:', err);

            alert(
                '❌ Không thể kiểm tra mã hộ với máy chủ. ' +
                'Vui lòng kiểm tra kết nối và thử lại. ' +
                'Hệ thống chưa lưu dữ liệu.\n\n' +
                (err.message || '')
            );

            return;
        }
    }

    // =========================================================
    // 3. KIỂM TRA CÁC TRƯỜNG BẮT BUỘC
    // =========================================================
    const config = tableConfigs[currentTable];

    if (!config) {
        alert('❌ Không tìm thấy cấu hình bảng dữ liệu!');
        return;
    }

    const fields = config.fields || [];
    
const extraFields = document.getElementById('table_4_extra_fields');

if (
    currentTable === 'table_4' &&
    extraFields &&
    extraFields.style.display !== 'none'
) {
    const requiredExtraFields = [
        {
            name: 'bptt_moi',
            label: 'Biện pháp tránh thai đang dùng'
        },
        {
            name: 'so_con',
            label: 'Số con hiện có'
        },
        {
            name: 'nam_sinh_con',
            label: 'Năm sinh con nhỏ nhất'
        }
    ];

    for (const field of requiredExtraFields) {
        const input = extraFields.querySelector(
            `[name="${field.name}"]`
        );

        if (!input || String(input.value).trim() === '') {
            alert(`❌ Vui lòng nhập "${field.label}"!`);

            if (input) {
                input.focus();
            }

            return;
        }
    }

    // Số con phải là số nguyên không âm.
    const soConInput = extraFields.querySelector('[name="so_con"]');
    const soCon = Number(soConInput.value);

    if (!Number.isInteger(soCon) || soCon < 0) {
        alert('❌ Số con hiện có phải là số nguyên không âm!');
        soConInput.focus();
        return;
    }

    // Năm sinh con nhỏ nhất phải có 4 chữ số,
    // không được lớn hơn năm hiện tại.
    const namSinhInput = extraFields.querySelector(
        '[name="nam_sinh_con"]'
    );

    const namSinh = String(namSinhInput.value).trim();
    const currentYear = new Date().getFullYear();

    if (!/^\d{4}$/.test(namSinh) ||
        Number(namSinh) > currentYear ||
        Number(namSinh) < 1900) {
        alert(
            `❌ Năm sinh con nhỏ nhất phải từ 1900 đến ${currentYear}!`
        );
        namSinhInput.focus();
        return;
    }
}


    for (const f of fields) {
        if (
            f.required &&
            (
                dataObj[f.name] === undefined ||
                dataObj[f.name] === null ||
                String(dataObj[f.name]).trim() === ''
            )
        ) {
            alert(`❌ Lỗi: Trường "${f.label}" không được để trống!`);

            const inputEl =
                form.querySelector(`[name="${f.name}"]`);

            if (inputEl) inputEl.focus();
            return;
        }
    }
// =========================================================
  // =========================================================
    // =========================================================
    // 3.5. BẢNG 7 -> KIỂM TRA ĐIỀU KIỆN TRƯỚC KHI PREVIEW
    // =========================================================
    if (currentTable === 'table_7') {
        const tenVoVal = dataObj.ho_ten_vo || dataObj.ho_ten || dataObj.ho_ten_nguoi_vo || dataObj.ho_ten_me || '';

        const syncTable7Data = {
            ho_so: dataObj.ho_so || dataObj.so_ho || '',
            ho_ten_vo: tenVoVal,
            ngay_sinh: dataObj.ngay_sinh || '',
            so_the_bhyt: dataObj.so_the_bhyt || dataObj.ma_the_bhyt || '',
            ngay_su_dung: dataObj.ngay_su_dung || '',
            bptt_moi: dataObj.bptt_moi || '',
            so_con_hien_co: dataObj.so_con_hien_co || dataObj.so_con || '',
            noi_thuc_hien: dataObj.noi_thuc_hien || '',
            diabanh: dataObj.diabanh || ''
        };

        try {
            const checkRes = await fetch('/api/admin/check-table-7-eligibility', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(syncTable7Data)
            });
            await readApiResponse(checkRes);
        } catch (err) {
            console.error('❌ Lỗi kiểm tra điều kiện Bảng 7:', err);
            
            // 🎨 THAY THẾ BẰNG GIAO DIỆN MODAL ĐẸP MẮT
            const formattedErrorMsg = `
                <div style="text-align: left; padding: 5px;">
                    <b style="color: #dc3545; font-size: 16px;">❌ KHÔNG THỂ NHẬP BẢNG 7</b>
                    <p style="margin-top: 10px; font-size: 14px; line-height: 1.5; color: #333;">
                        ${err.message || 'Chưa đủ điều kiện y tế.'}
                    </p>
                    <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 10px; margin-top: 12px; font-size: 13px; color: #721c24;">
                        💡 <b>Quy định chuyên môn:</b> Hệ thống kiểm tra chặt chẽ thời hạn sau sinh hoặc các biện pháp tránh thai đang hiệu lực để đảm bảo số liệu báo cáo dân số chính xác.
                    </div>
                </div>
            `;

            // Gọi cùng hàm hiển thị modal đang dùng cho phần cảnh báo mã hộ
            if (typeof showConflictModal === 'function') {
                await showConflictModal(formattedErrorMsg);
            } else {
                alert(`❌ KHÔNG THỂ NHẬP BẢNG 7:\n\n${err.message || 'Chưa đủ điều kiện.'}`);
            }

            return; // Dừng lại ngay lập tức, không cho hiện bảng Xem trước
        }
    }
    // =========================================================
    // 4. XEM TRƯỚC DỮ LIỆU TRƯỚC KHI LƯU
    // =========================================================
    const isConfirmed = await showPreviewModal(dataObj, fields);

    if (!isConfirmed) return;

  
    // =========================================================
    // 5. LẤY ĐỦ DỮ LIỆU PHỤ BẢNG 4
    // Đọc trực tiếp từ biểu mẫu, kể cả trường hợp nằm ngoài
    // FormData hoặc chưa được đưa vào dataObj.
    // =========================================================
    function getTable4Value(...names) {
        for (const name of names) {
            const input =
                form.querySelector(`[name="${name}"]`) ||
                document.querySelector(
                    `#table_4_extra_fields [name="${name}"]`
                );

            if (input && String(input.value ?? '').trim() !== '') {
                return String(input.value).trim();
            }

            if (
                Object.prototype.hasOwnProperty.call(dataObj, name) &&
                String(dataObj[name] ?? '').trim() !== ''
            ) {
                return String(dataObj[name]).trim();
            }
        }

        return '';
    }

    let table4ExtraData = {};

    if (currentTable === 'table_4') {
        table4ExtraData = {
            bptt_moi: getTable4Value('bptt_moi'),
            so_con: getTable4Value('so_con'),
            nam_sinh_con: getTable4Value(
                'nam_sinh_con',
                'nam_sinh_con_gan_nhat'
            ),
            so_the_bhyt: getTable4Value(
                'so_the_bhyt',
                'ma_the_bhyt',
                'so_bhyt'
            )
        };

        // Không gửi các trường phụ vào API lưu bảng chính
        // nếu chúng không phải cột của Bảng 4.
        delete dataObj.bptt_moi;
        delete dataObj.so_con;
        delete dataObj.nam_sinh_con;
    } else {
        delete dataObj.table_4_extra_fields;
    }


    // =========================================================
    // 6. LƯU BẢNG CHÍNH
    // Chỉ tiếp tục đồng bộ khi API chính lưu thành công.
    // =========================================================
    let result;

    try {
        const response = await fetch(`/api/data/${currentTable}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataObj)
        });

        result = await readApiResponse(response);
    } catch (err) {
        console.error('Lỗi lưu dữ liệu:', err);

        alert(
            '❌ Không thể lưu dữ liệu: ' +
            (err.message || 'Lỗi kết nối máy chủ.')
        );

        return;
    }

    if (!result.success) {
        alert(
            '❌ Lỗi: ' +
            (result.message || 'Máy chủ chưa xác nhận lưu thành công.')
        );
        return;
    }


    
    // XÓA TRẠNG THÁI GHI CHÚ MÃ HỘ SAU KHI LƯU THÀNH CÔNG
    const ghiChuWrapper = document.getElementById('wrapper_ghi_chu_ma_ho');
    const ghiChuInput = document.getElementById('input_ghi_chu_ma_ho');

    if (ghiChuInput) {
        ghiChuInput.value = '';
    }

    if (ghiChuWrapper) {
        ghiChuWrapper.style.display = 'none';
    }

    // =========================================================
    // 7. ĐỒNG BỘ DỮ LIỆU
    // Kiểm tra từng phản hồi, không chỉ kiểm tra fetch có lỗi mạng.
    // =========================================================
    const syncErrors = [];

    async function runSync(label, url, body) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            await readApiResponse(response);
        } catch (err) {
            console.error(`Lỗi đồng bộ ${label}:`, err);
            syncErrors.push(
                `${label}: ${err.message || 'Lỗi không xác định'}`
            );
        }
    }

    // ---------------------------------------------------------
    // BẢNG 1 -> BẢNG 2, BẢNG 10, PHỤ NỮ 15–49
    // ---------------------------------------------------------
    if (currentTable === 'table_1') {
        const noiCuTruVal =
            document.getElementById('input_noi_cu_tru_me')
                ? document.getElementById('input_noi_cu_tru_me').value
                : '';

        const ngaySinhCon = dataObj.ngay_sinh_con;

        const table2Obj = {
            so_ho: dataObj.ho_so || '',
            ghi_chu_ma_ho: dataObj.ghi_chu_ma_ho || '',
            ho_ten_tre: dataObj.ho_ten_con || '',
            ngay_sinh_tre: dataObj.ngay_sinh_con || '',
            ho_ten_me: dataObj.ho_ten_me || '',
            ma_the_bhyt_me: dataObj.so_the_bhyt_me || '',
            noi_cu_tru: noiCuTruVal,
            nam_sinh_me: dataObj.ngay_sinh_me || '',
            gioi_tinh: dataObj.gioi_tinh || '',
            benh_suy_giap: 'Bình thường',
            thieu_men_g6pd: 'Bình thường',
            tang_san_thuong_than: 'Bình thường',
            khiem_thinh: 'Bình thường',
            benh_tim: 'Bình thường',
            noi_thuc_hien: dataObj.noi_de || '',
            ghi_chu: ''
        };

        let ngayKinhCuoiStr = '';
        let ngayTuan12Str = '';
        let ngayTuan21Str = '';

        // Dùng ngày theo giờ địa phương để tránh lệch ngày.
        function formatLocalDate(date) {
            return [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0'),
                String(date.getDate()).padStart(2, '0')
            ].join('-');
        }

        if (ngaySinhCon) {
            const birthParts = String(ngaySinhCon)
                .split('-')
                .map(Number);

            const birthDate = new Date(
                birthParts[0],
                birthParts[1] - 1,
                birthParts[2]
            );

            if (!isNaN(birthDate.getTime())) {
                const lmpDate = new Date(birthDate);
                lmpDate.setDate(lmpDate.getDate() - 280);

                ngayKinhCuoiStr = formatLocalDate(lmpDate);

                function getRandomDateInExactWeek(lmp, targetWeek) {
                    const startDay = targetWeek * 7;
                    const randomOffset =
                        startDay + Math.floor(Math.random() * 7);

                    const resultDate = new Date(lmp);
                    resultDate.setDate(
                        resultDate.getDate() + randomOffset
                    );

                    return formatLocalDate(resultDate);
                }

                ngayTuan12Str =
                    getRandomDateInExactWeek(lmpDate, 12);

                ngayTuan21Str =
                    getRandomDateInExactWeek(lmpDate, 21);
            }
        }

        const table10Obj = {
            so_ho: dataObj.ho_so || '',
            ghi_chu_ma_ho: dataObj.ghi_chu_ma_ho || '',
            ma_the_bhyt: dataObj.so_the_bhyt_me || '',
            ho_ten: dataObj.ho_ten_me || '',
            ngay_sinh: dataObj.ngay_sinh_me || '',
            noi_cu_tru: noiCuTruVal,
            ngay_thang_mang_thai: ngayKinhCuoiStr,
            mang_thai_tuan_12: ngayTuan12Str,
            mang_thai_tuan_21: ngayTuan21Str,
            hoi_chung_down_12: 'Bình thường',
            hoi_chung_edward_12: 'Bình thường',
            hoi_chung_patau_12: 'Bình thường',
            benh_thalassemia_12: 'Bình thường',
            hoi_chung_down_21: 'Bình thường',
            hoi_chung_edward_21: 'Bình thường',
            hoi_chung_patau_21: 'Bình thường',
            benh_thalassemia_21: 'Bình thường',
            ghi_chu: dataObj.noi_de || ''
        };

        const syncPhuNuObj = {
            ho_so: dataObj.ho_so || '',
            ho_ten_me: dataObj.ho_ten_me || '',
            ngay_sinh_me: dataObj.ngay_sinh_me || '',
            so_the_bhyt_me: dataObj.so_the_bhyt_me || '',
            ngay_sinh_con: dataObj.ngay_sinh_con || '',
            noi_de: dataObj.noi_de || '',
            diabanh: noiCuTruVal,
            con_thu_may: dataObj.con_thu_may || ''
        };

        await Promise.all([
            runSync(
                'Bảng 2',
                '/api/data/table_2',
                table2Obj
            ),
            runSync(
                'Bảng 10',
                '/api/data/table_10',
                table10Obj
            ),
            runSync(
                'Phụ nữ 15–49 từ Bảng 1',
                '/api/admin/sync-phu-nu-from-table1',
                syncPhuNuObj
            )
        ]);
    }

    // ---------------------------------------------------------
    // BẢNG 3 -> PHỤ NỮ 15–49
    // ---------------------------------------------------------
    if (currentTable === 'table_3') {
        await runSync(
            'Phụ nữ 15–49 từ Bảng 3',
            '/api/admin/sync-phu-nu-from-table3',
            {
                ho_so: dataObj.ho_so || dataObj.so_ho || '',
                ho_ten: hoTenVal
            }
        );
    }

    
    // ---------------------------------------------------------
    // BẢNG 4 -> PHỤ NỮ 15–49
    // ---------------------------------------------------------
    if (currentTable === 'table_4') {
        const syncTable4Data = {
            ho_so: getTable4Value('ho_so', 'so_ho'),
            ho_ten: getTable4Value(
                'ho_ten',
                'ho_ten_nguoi_vo',
                'ho_ten_me'
            ),
            ngay_sinh: getTable4Value('ngay_sinh'),
            gioi_tinh: getTable4Value('gioi_tinh'),
            tinh_trang_hon_nhan: getTable4Value(
                'tinh_trang_hon_nhan'
            ),
            so_the_bhyt: table4ExtraData.so_the_bhyt,
            noi_cu_tru: getTable4Value(
                'noi_den',
                'noi_cu_tru',
                'diabanh'
            ),
            bptt_moi: table4ExtraData.bptt_moi,
            so_con: table4ExtraData.so_con,
            nam_sinh_con: table4ExtraData.nam_sinh_con
        };

        console.log(
            '[Đồng bộ Bảng 4 -> 15–49]',
            syncTable4Data
        );

        await runSync(
            'Phụ nữ 15–49 từ Bảng 4',
            '/api/admin/sync-phu-nu-from-table4',
            syncTable4Data
        );
    }


    // ---------------------------------------------------------
    // BẢNG 5 -> PHỤ NỮ 15–49
    // ---------------------------------------------------------
    if (currentTable === 'table_5') {
        await runSync(
            'Phụ nữ 15–49 từ Bảng 5',
            '/api/admin/sync-phu-nu-from-table5',
            {
                ho_so: dataObj.ho_so || dataObj.so_ho || '',
                ho_ten: hoTenVal
            }
        );
    }

  // ---------------------------------------------------------
   // ---------------------------------------------------------
   // ---------------------------------------------------------
    // BẢNG 7 -> PHỤ NỮ 15–49 & LỊCH SỬ BPTT
    // ---------------------------------------------------------
    if (currentTable === 'table_7') {
        let currentUser = JSON.parse(localStorage.getItem("currentUser")) || {};
        let diaBanhUser = dataObj.diabanh || currentUser.diabanh || currentUser.ap || '';
        const tenVoVal = dataObj.ho_ten_vo || dataObj.ho_ten || dataObj.ho_ten_nguoi_vo || dataObj.ho_ten_me || '';

        const syncTable7Data = {
            ho_so: dataObj.ho_so || dataObj.so_ho || '',
            ho_ten_vo: tenVoVal,
            ngay_sinh: dataObj.ngay_sinh || '',
            so_the_bhyt: dataObj.so_the_bhyt || dataObj.ma_the_bhyt || '',
            ngay_su_dung: dataObj.ngay_su_dung || '',
            bptt_moi: dataObj.bptt_moi || '',
            so_con_hien_co: dataObj.so_con_hien_co || dataObj.so_con || '',
            noi_thuc_hien: dataObj.noi_thuc_hien || '',
            diabanh: diaBanhUser 
        };

        await runSync(
            'Phụ nữ 15–49 từ Bảng 7',
            '/api/admin/sync-phu-nu-from-table7',
            syncTable7Data
        );
    }
    // =========================================================
    // 8. THÔNG BÁO KẾT QUẢ
    // Bảng chính đã lưu; nếu đồng bộ lỗi thì báo rõ để xử lý.
    // =========================================================
    if (syncErrors.length > 0) {
        alert(
            '⚠️ Dữ liệu bảng chính đã lưu thành công, nhưng có ' +
            'lỗi đồng bộ dữ liệu:\n\n' +
            syncErrors.map((item, index) =>
                `${index + 1}. ${item}`
            ).join('\n') +
            '\n\nVui lòng kiểm tra các bảng liên quan trước khi ' +
            'thực hiện lưu lại, để tránh tạo dữ liệu trùng.'
        );
    } else {
        alert('✅ Lưu thành công và đồng bộ dữ liệu hoàn tất!');
    }

    // Bảng chính đã lưu thành công nên giữ hành vi cũ:
    // đặt lại biểu mẫu và tải lại dữ liệu.
    form.reset();

    document.querySelectorAll('input[type="checkbox"]')
        .forEach(cb => cb.checked = false);

    document.querySelectorAll('input[readonly]')
        .forEach(inp => inp.removeAttribute('readonly'));

    fetchTableData(currentTable);
}
// // ============================================================
// DỮ LIỆU TRỰC TUYẾN - PHÂN TRANG + LỌC THÁNG/NĂM
// ============================================================
let onlineDataAll = [];
let onlineDataFiltered = [];
let onlineDataPage = 1;
const ONLINE_DATA_PAGE_SIZE = 10;

async function updateOnlineDataYearOptions() {
    const yearSelect = document.getElementById('filterYear');
    if (!yearSelect || !currentTable) return;

    const current = yearSelect.value;
    try {
        const res = await fetch(`/api/data/${currentTable}/years`);
        const result = await res.json();
        const years = result.years || [];
        yearSelect.innerHTML = '<option value="">Tất cả các năm</option>' +
            years.map(y => `<option value="${y}">Năm ${y}</option>`).join('');
        const yearStrings = years.map(String);
        if (current && yearStrings.includes(String(current))) {
            yearSelect.value = String(current);
        } else {
            const currentYear = String(new Date().getFullYear());
            if (yearStrings.includes(currentYear)) yearSelect.value = currentYear;
        }
    } catch (e) {
        console.error('Không tải được danh sách năm:', e);
    }
}

function applyOnlineDataFilter(resetPage = true) {
    // Bộ lọc được xử lý tại server để không bị giới hạn bởi 200 bản ghi.
    if (resetPage) onlineDataPage = 1;
    fetchTableData(currentTable);
}

function setupOnlineDataFilters() {
    const month = document.getElementById('filterMonth');
    const year = document.getElementById('filterYear');
    const reset = document.getElementById('btnResetDataFilter');

    if (month && !month.dataset.bound) {
        month.addEventListener('change', () => applyOnlineDataFilter(true));
        month.dataset.bound = '1';
    }

    if (year && !year.dataset.bound) {
        year.addEventListener('change', () => applyOnlineDataFilter(true));
        year.dataset.bound = '1';
    }

    if (reset && !reset.dataset.bound) {
        reset.addEventListener('click', () => {
            if (month) month.value = '';
            if (year) year.value = '';
            applyOnlineDataFilter(true);
        });
        reset.dataset.bound = '1';
    }
}

function renderOnlineDataPage() {
    const body = document.getElementById('tableBody');
    const pagination = document.getElementById('onlineDataPagination');
    const totalInfo = document.getElementById('dataTotalInfo');

    if (!body) return;

    const config = tableConfigs[currentTable];
    const total = onlineDataFiltered.length;
    const totalPages = Math.max(1, Math.ceil(total / ONLINE_DATA_PAGE_SIZE));

    if (onlineDataPage > totalPages) onlineDataPage = totalPages;
    if (onlineDataPage < 1) onlineDataPage = 1;

    const start = (onlineDataPage - 1) * ONLINE_DATA_PAGE_SIZE;
    const pageData = onlineDataFiltered.slice(start, start + ONLINE_DATA_PAGE_SIZE);

    if (totalInfo) {
        totalInfo.textContent = `${total} dữ liệu`;
    }

    if (!pageData.length) {
        body.innerHTML =
            `<tr><td colspan="${config.fields.length + 2}" class="text-center py-4 text-muted">
                Không có dữ liệu phù hợp với bộ lọc
            </td></tr>`;
    } else {
        body.innerHTML = pageData.map((item, idx) => {
            const stt = start + idx + 1;
            let rowHtml = `<tr><td>${stt}</td>`;

            config.fields
                .filter(f => !f.type.startsWith('search-')) // 👈 Lọc bỏ các ô search trợ giúp
                .forEach(f => {
                    const val = item[f.name];
                    rowHtml += `<td>${val !== undefined && val !== null ? val : ''}</td>`;
                });

            rowHtml += `<td>
                <button class="btn btn-sm btn-warning text-white fw-bold" onclick="openEditModal('${item.id}')">
                    <i class="fa-solid fa-pen-to-square"></i> Sửa
                </button>
            </td></tr>`;

            return rowHtml;
        }).join('');
    }

    if (pagination) {
        if (total <= ONLINE_DATA_PAGE_SIZE) {
            pagination.innerHTML = '';
            return;
        }

        const maxButtons = 7;
        let first = Math.max(1, onlineDataPage - 3);
        let last = Math.min(totalPages, first + maxButtons - 1);
        first = Math.max(1, last - maxButtons + 1);

        let html = `
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div class="text-muted small">
                    Hiển thị <strong>${total ? start + 1 : 0}</strong> -
                    <strong>${Math.min(start + ONLINE_DATA_PAGE_SIZE, total)}</strong>
                    / <strong>${total}</strong>
                </div>
                <nav aria-label="Phân trang dữ liệu">
                    <ul class="pagination pagination-sm mb-0">
                        <li class="page-item ${onlineDataPage === 1 ? 'disabled' : ''}">
                            <button class="page-link" onclick="goOnlineDataPage(${onlineDataPage - 1})" ${onlineDataPage === 1 ? 'disabled' : ''}>
                                ‹ Trước
                            </button>
                        </li>`;

        if (first > 1) {
            html += `<li class="page-item">
                <button class="page-link" onclick="goOnlineDataPage(1)">1</button>
            </li>`;
            if (first > 2) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        }

        for (let p = first; p <= last; p++) {
            html += `<li class="page-item ${p === onlineDataPage ? 'active' : ''}">
                <button class="page-link" onclick="goOnlineDataPage(${p})">${p}</button>
            </li>`;
        }

        if (last < totalPages) {
            if (last < totalPages - 1) {
                html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
            }
            html += `<li class="page-item">
                <button class="page-link" onclick="goOnlineDataPage(${totalPages})">${totalPages}</button>
            </li>`;
        }

        html += `
                        <li class="page-item ${onlineDataPage === totalPages ? 'disabled' : ''}">
                            <button class="page-link" onclick="goOnlineDataPage(${onlineDataPage + 1})" ${onlineDataPage === totalPages ? 'disabled' : ''}>
                                Sau ›
                            </button>
                        </li>
                    </ul>
                </nav>
            </div>`;

        pagination.innerHTML = html;
    }
}

function goOnlineDataPage(page) {
    const totalPages = Math.max(1, Math.ceil(onlineDataFiltered.length / ONLINE_DATA_PAGE_SIZE));
    onlineDataPage = Math.min(Math.max(1, page), totalPages);
    renderOnlineDataPage();

    const tableCard = document.getElementById('onlineDataPagination');
    if (tableCard) {
        tableCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

async function fetchTableData(tableName) {
    const header = document.getElementById('tableHeader');
    const body = document.getElementById('tableBody');
    if (!header || !body) return;

    header.innerHTML = '';
    body.innerHTML = '<tr><td colspan="10" class="text-center">Đang tải...</td></tr>';

    const config = tableConfigs[tableName];
    if (!config) return;

    try {
        // Cập nhật danh sách năm trước khi đọc giá trị bộ lọc để khi đổi bảng,
        // năm cũ không làm bảng mới bị lọc nhầm.
        await updateOnlineDataYearOptions();

        const month = document.getElementById('filterMonth')?.value || '';
        const year = document.getElementById('filterYear')?.value || '';
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);

        const url = `/api/data/${tableName}${params.toString() ? '?' + params.toString() : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Không thể tải dữ liệu');
        const data = await res.json();

        currentTableDataCache = data || [];
        onlineDataAll = data || [];
        onlineDataFiltered = [...onlineDataAll];
        onlineDataPage = 1;

        header.innerHTML = `<tr><th>STT</th>` +
            config.fields
                .filter(f => !f.type.startsWith('search-')) // 👈 Lọc bỏ các ô search trợ giúp
                .map(f => `<th>${f.label}</th>`).join('') +
            `<th>Thao tác</th></tr>`;

        setupOnlineDataFilters();
        renderOnlineDataPage();
    } catch (error) {
        console.error(error);
        body.innerHTML = `<tr><td colspan="${config.fields.length + 2}" class="text-center text-danger py-4">Lỗi tải dữ liệu</td></tr>`;
    }
}

function removeAccents(str) {
    if (!str) return '';
    return str.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd').replace(/Đ/g, 'D')
              .toLowerCase();
}

function selectDataFromTable7(item) {
    let hoSoInput = document.querySelector('[name="ho_so"]');
    let hoTenInput = document.querySelector('[name="ho_ten_vo"]');
    let bhytInput = document.querySelector('[name="so_the_bhyt"]');
    let ngaySinhInput = document.querySelector('[name="ngay_sinh"]');

    // Đồng bộ từ Bảng 7: các thông tin nhận diện vẫn khóa,
    // riêng BHYT chỉ tự điền nếu có nhưng luôn cho phép cán bộ sửa/nhập tay.
    const lockedFields = [
        { el: hoSoInput, val: item.ho_so },
        { el: hoTenInput, val: item.ho_ten_vo },
        { el: ngaySinhInput, val: item.ngay_sinh }
    ];

    lockedFields.forEach(field => {
        if (field.el) {
            field.el.removeAttribute('readonly');
            field.el.readOnly = false;
            field.el.value = field.val || '';
            field.el.setAttribute('readonly', true);
            field.el.readOnly = true;
            field.el.style.backgroundColor = '#e9ecef';
            field.el.style.cursor = 'not-allowed';
            field.el.onkeydown = (e) => e.preventDefault();
            field.el.onpaste = (e) => e.preventDefault();
        }
    });

    if (bhytInput) {
        bhytInput.readOnly = false;
        bhytInput.removeAttribute('readonly');
        bhytInput.value = item.so_the_bhyt || '';
        bhytInput.style.backgroundColor = '';
        bhytInput.style.cursor = '';
        bhytInput.onkeydown = null;
        bhytInput.onpaste = null;
    }

    if (ngaySinhInput && item.ngay_sinh) {
        let parts = item.ngay_sinh.split('-'); 
        if (parts.length === 3) {
            let container = ngaySinhInput.closest('.col-md-6');
            if (container) {
                let sDay = container.querySelector('.select-day');
                let sMonth = container.querySelector('.select-month');
                let sYear = container.querySelector('.select-year');
                
                if (sDay) sDay.value = parts[2];
                if (sMonth) sMonth.value = parts[1];
                if (sYear) sYear.value = parts[0];
            }
        }
    }

    let suggestBox = document.getElementById('suggestBoxT7');
    let searchInput = document.getElementById('inputSearchT7');
    if (suggestBox) suggestBox.innerHTML = '';
    if (searchInput) {
        searchInput.value = `Đã chọn: ${item.ho_ten_vo} (Hộ số: ${item.ho_so || 'N/A'})`;
        searchInput.style.backgroundColor = '#fff';
    }
}

function chuanHoaHoSo(inputVal) {
    if (!inputVal) return { value: '', error: null, textPhu: '' };
    let raw = String(inputVal).trim();

    // 🎯 Tách thông minh: Chỉ lấy cụm số/chấm ở đầu làm mã hộ, phần còn lại (chứa chữ, ngoặc...) đẩy vào textPhu
    let matchNum = raw.match(/^([\d.]+)([\s\S]*)$/);
    if (!matchNum) {
        return { value: '', textPhu: raw, error: '❌ Mã hộ không hợp lệ!' };
    }

    let numPart = matchNum[1].trim(); // Phần số ở đầu (VD: "5", "05", "00005")
    let textPhu = matchNum[2].trim(); // Phần ký hiệu/chữ/ngoặc phía sau (VD: "(db 126)")

    // Tách phần số chính và phần phụ (nếu có dấu chấm, ví dụ: 00012.1)
    let parts = numPart.split('.');
    let phanChinh = parts[0].replace(/\D/g, ''); // Chỉ lấy số của phần chính
    let phanPhu = parts.slice(1).join('.');

    // Kiểm tra nếu phần chính vượt quá 5 chữ số
    if (phanChinh.length > 5) {
        return { 
            value: '', 
            error: `❌ Lỗi: Mã hộ phần chính ("${phanChinh}") không được vượt quá 5 chữ số! (Bạn đang nhập ${phanChinh.length} số).`,
            textPhu: ''
        };
    }

    if (phanChinh) {
        phanChinh = phanChinh.padStart(5, '0'); // Đệm đủ 5 số (VD: 5 -> 00005, 05 -> 00005)
    }

    let finalVal = phanPhu ? `${phanChinh}.${phanPhu}` : phanChinh;

    // Tự động bật ô ghi chú mã hộ và điền chữ vào nếu có text phụ phát sinh
    let ghiChuWrapper = document.getElementById('wrapper_ghi_chu_ma_ho');
    let ghiChuInput = document.getElementById('input_ghi_chu_ma_ho');
    if (textPhu && ghiChuWrapper && ghiChuInput) {
        ghiChuWrapper.style.display = 'block'; // Hiện ô ghi chú mã hộ lên
        ghiChuInput.value = textPhu;
    }

    return { value: finalVal, textPhu: textPhu, error: null };
}

// TỰ ĐỘNG TÁCH MÃ HỘ VÀ GHI CHÚ MÃ HỘ
// Không xóa ký tự người dùng đang gõ giữa chừng.
document.addEventListener('input', function(e) {
    const target = e.target;

    if (
        !target ||
        !['ho_so', 'so_ho'].includes(target.name)
    ) {
        return;
    }

    const raw = String(target.value || '').trim();

    const ghiChuInput = document.getElementById(
        'input_ghi_chu_ma_ho'
    );
    const ghiChuWrapper = document.getElementById(
        'wrapper_ghi_chu_ma_ho'
    );

    if (!raw) {
        if (ghiChuInput) ghiChuInput.value = '';
        if (ghiChuWrapper) ghiChuWrapper.style.display = 'none';
        return;
    }

    // Chỉ tách khi có phần số ở đầu.
    const match = raw.match(/^(\d+(?:\.\d+)?)(.*)$/);

    if (!match) return;

    const maHoGoc = match[1];
    const kyHieuPhu = match[2].trim();

    // Chuẩn hóa phần mã hộ chính.
    const parts = maHoGoc.split('.');
    const phanChinh = parts[0];

    if (phanChinh.length > 5) return;

    const maHoChuan = phanChinh.padStart(5, '0') +
        (parts.length > 1 ? '.' + parts.slice(1).join('.') : '');

    // Chỉ cập nhật ghi chú trong lúc nhập.
    if (kyHieuPhu) {
        if (ghiChuInput) ghiChuInput.value = kyHieuPhu;
        if (ghiChuWrapper) ghiChuWrapper.style.display = 'block';
    } else {
        if (ghiChuInput) ghiChuInput.value = '';
        if (ghiChuWrapper) ghiChuWrapper.style.display = 'none';
    }

    // Chưa đổi giá trị ô mã hộ khi đang gõ.
    // Mã hộ sẽ được chuẩn hóa khi lưu dữ liệu.
});

// Hàm phụ trợ đóng/mở thủ công nếu cán bộ muốn
function anHienGhiChuMaHo(fieldName, forceShow = true) {
    let wrapper = document.getElementById(`wrapper_${fieldName}`);
    if (!wrapper) return;
    if (forceShow) {
        wrapper.style.display = 'block';
    } else {
        wrapper.style.display = 'none';
        let inp = document.getElementById(`input_${fieldName}`);
        if (inp) inp.value = ''; // Xóa trắng khi đóng
    }
}

// --- HÀM KIỂM TRA VÀ BẬT/TẮT 3 Ô BỔ SUNG (CHỈ ÁP DỤNG RIÊNG CHO BẢNG 4) ---
function checkAndToggleTable4ExtraFields() {
    let extraContainer = document.getElementById('table_4_extra_fields');
    if (!extraContainer) return;

    // 🛑 QUAN TRỌNG: Nếu KHÔNG PHẢI Bảng 4 thì ẩn ngay và DỪNG LẠI NGAY LẬP TỨC, không làm ảnh hưởng bảng khác
    if (typeof currentTable === 'undefined' || currentTable !== 'table_4') {
        extraContainer.style.display = 'none';
        extraContainer.querySelectorAll('input, select').forEach(inp => {
            inp.removeAttribute('required');
            inp.value = '';
        });
        return;
    }

    let allInputs = document.querySelectorAll('#dynamicForm select, #dynamicForm input');
    let gioiTinhVal = '';
    let ngaySinhStr = '';
    let honNhanVal = '';

    let dayVal = '', monthVal = '', yearVal = '';

    allInputs.forEach(el => {
        let name = (el.name || '').toLowerCase();
        let id = (el.id || '').toLowerCase();

        // 1. Quét Giới tính
        if (name.includes('gioi_tinh') || id.includes('gioi_tinh')) {
            gioiTinhVal = (el.value || '').toLowerCase();
        }

        // 2. Quét Tình trạng hôn nhân
        if (name.includes('hon_nhan') || id.includes('hon_nhan')) {
            honNhanVal = (el.value || '').toLowerCase();
        }

        // 3. Quét Ngày sinh
        if (name.includes('ngay_sinh') && !name.includes('con') && !name.includes('me')) {
            if (el.value) ngaySinhStr = el.value;
        }

        if (name.includes('day') || name.includes('ngay_select') || id.includes('day')) dayVal = el.value;
        if (name.includes('month') || name.includes('thang_select') || id.includes('month')) monthVal = el.value;
        if (name.includes('year') || name.includes('nam_select') || id.includes('year')) yearVal = el.value;
    });

    if (yearVal && monthVal && dayVal) {
        let padMonth = String(monthVal).padStart(2, '0');
        let padDay = String(dayVal).padStart(2, '0');
        ngaySinhStr = `${yearVal}-${padMonth}-${padDay}`;
    }

    // --- KIỂM TRA 3 ĐIỀU KIỆN ---

    // Điều kiện 1: Nữ
    let isNu = gioiTinhVal.includes('nữ') || gioiTinhVal === 'nu' || gioiTinhVal === 'f';

    // Điều kiện 2: Ngày sinh hợp lệ (<= ngày hiện tại) và độ tuổi từ 15 đến 49
    let isValidAge = false;
    let age = null;
    if (ngaySinhStr) {
        let birthDate = new Date(ngaySinhStr);
        let today = new Date();
        
        // Chặn ngày sinh ở tương lai
        if (!isNaN(birthDate.getTime()) && birthDate <= today) {
            age = today.getFullYear() - birthDate.getFullYear();
            let m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            if (age >= 15 && age <= 49) {
                isValidAge = true;
            }
        }
    }

    // Điều kiện 3: Đang kết hôn / Có chồng (loại trừ chưa kết hôn)
    let isMarried = false;
    if (honNhanVal) {
        if ((honNhanVal.includes('kết hôn') || honNhanVal.includes('có chồng')) && !honNhanVal.includes('chưa')) {
            isMarried = true;
        }
    }

    // ĐỦ CẢ 3 ĐIỀU KIỆN MỚI CHO HIỆN
    let showExtra = isNu && isValidAge && isMarried;

    if (showExtra) {
        extraContainer.style.display = 'block';
        extraContainer.querySelectorAll('input, select').forEach(inp => inp.setAttribute('required', 'true'));
    } else {
        extraContainer.style.display = 'none';
        extraContainer.querySelectorAll('input, select').forEach(inp => {
            inp.removeAttribute('required');
            inp.value = ''; // Xóa dữ liệu cũ khi ẩn đi
        });
    }
}

// --- BẮT TOÀN BỘ SỰ KIỆN TƯƠNG TÁC TRÊN MỌI THẺ (INPUT, SELECT) TRÊN FORM ---
document.addEventListener('change', function(e) {
    if (e.target && e.target.closest('#dynamicForm')) {
        checkAndToggleTable4ExtraFields();
    }
});

document.addEventListener('input', function(e) {
    if (e.target && e.target.closest('#dynamicForm')) {
        checkAndToggleTable4ExtraFields();
    }
})

async function searchDataFromTable7(keyword) {
    let suggestBox = document.getElementById('suggestBoxT7');
    if (!keyword || keyword.trim() === "" || keyword.startsWith("Đã chọn:")) {
        suggestBox.innerHTML = '';
        return;
    }

    try {
        let res = await fetch(`/api/data/table_7`);
        let data = await res.json();
        
        let keywordNormalized = removeAccents(keyword);

        let filtered = data.filter(item => {
            let hoSo = removeAccents(item.ho_so);
            let hoTen = removeAccents(item.ho_ten_vo);
            let bhyt = removeAccents(item.so_the_bhyt);
            
            return hoSo.includes(keywordNormalized) || 
                   hoTen.includes(keywordNormalized) || 
                   bhyt.includes(keywordNormalized);
        });

        if (filtered.length === 0) {
            suggestBox.innerHTML = `<div class="list-group-item list-group-item-action text-muted">Không tìm thấy kết quả phù hợp ở Bảng 7</div>`;
            return;
        }

        suggestBox.innerHTML = filtered.map(item => `
            <button type="button" class="list-group-item list-group-item-action" onclick='selectDataFromTable7(${JSON.stringify(item)})'>
                <b>Hộ số:</b> ${item.ho_so || 'N/A'} | <b>Vợ:</b> ${item.ho_ten_vo} | <b>BHYT:</b> ${item.so_the_bhyt || 'Không có'} | <b>Ngày sinh:</b> ${item.ngay_sinh || 'N/A'}
            </button>
        `).join('');
    } catch(e) {
        console.error(e);
    }
}

async function loadLeadershipSummary() {
    const month = document.getElementById('leaderFilterMonth')?.value || '';
    const year = document.getElementById('leaderFilterYear')?.value || '';
    const cards = document.getElementById('leaderSummaryCards');
    const loading = document.getElementById('leaderSummaryLoading');
    const footer = document.getElementById('leaderSummaryFooter');
    if (!cards) return;

    loading?.classList.remove('d-none');
    cards.innerHTML = '';
    if (footer) footer.innerHTML = '';

    try {
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        const res = await fetch(`/api/dashboard/summary${params.toString() ? '?' + params.toString() : ''}`);
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || 'Không thể tải thống kê');

        const yearSelect = document.getElementById('leaderFilterYear');
        if (yearSelect) {
            const current = yearSelect.value;
            yearSelect.innerHTML = '<option value="">Tất cả các năm</option>' +
                (result.years || []).map(y => `<option value="${y}">Năm ${y}</option>`).join('');
            if ((result.years || []).includes(current)) yearSelect.value = current;
        }

        cards.innerHTML = (result.counts || []).map((item, index) => `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="card h-100 border-0 shadow-sm leadership-stat-card">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-start gap-2">
                            <div class="d-flex gap-2">
                                <div class="leadership-stat-number">${index + 1}</div>
                                <div>
                                    <div class="fw-bold text-dark">${item.title}</div>
                                    <div class="text-muted small">${month || year ? `Dữ liệu đã nhập ${month ? `tháng ${month}` : ''}${month && year ? '/' : ''}${year || ''}` : 'Tất cả dữ liệu đã nhập'}</div>
                                </div>
                            </div>
                            <div class="leadership-stat-value">${Number(item.total || 0).toLocaleString('vi-VN')}</div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        if (footer) {
            footer.innerHTML = `
                <div class="alert alert-success d-flex flex-wrap justify-content-between align-items-center gap-2 mb-0">
                    <strong><i class="fa-solid fa-chart-column me-2"></i>Tổng cộng 11 bảng</strong>
                    <span class="fs-5 fw-bold">${Number(result.grandTotal || 0).toLocaleString('vi-VN')} trường hợp</span>
                </div>
            `;
        }
    } catch (error) {
        console.error(error);
        cards.innerHTML = `<div class="col-12"><div class="alert alert-danger">${error.message || 'Không tải được thống kê.'}</div></div>`;
    } finally {
        loading?.classList.add('d-none');
    }
}

function setupLeadershipDashboard() {
    const month = document.getElementById('leaderFilterMonth');
    const year = document.getElementById('leaderFilterYear');
    const reset = document.getElementById('btnResetLeaderFilter');

    if (month) month.addEventListener('change', loadLeadershipSummary);
    if (year) year.addEventListener('change', loadLeadershipSummary);
    if (reset) reset.addEventListener('click', () => {
        if (month) month.value = '';
        if (year) year.value = '';
        loadLeadershipSummary();
    });

    loadLeadershipSummary();
}

document.addEventListener("DOMContentLoaded", async function() {
    let currentUser = JSON.parse(localStorage.getItem("currentUser"));
    
    if (!currentUser) {
        try {
            let res = await fetch('/api/me');
            if (res.ok) {
                currentUser = await res.json();
                localStorage.setItem("currentUser", JSON.stringify(currentUser));
            }
        } catch (e) {
            console.error("Lỗi lấy thông tin user:", e);
        }
    }

    if (currentUser) {
        const role = (currentUser.role || "").trim().toLowerCase();
        const adminBtn = document.getElementById("btnAdmin");
        const baocaoBtn = document.getElementById("btnBaocaoToanXa");
        const quanLyBieuMauBtn = document.getElementById("btnQuanLyBieuMau"); // 🆕 Khai báo nút Quản lý 11 biểu mẫu
        const userInfoSpan = document.getElementById("userInfo");

        if (userInfoSpan) {
            const name = currentUser.fullname || currentUser.username || "";
            const userRole = currentUser.role || "";
            let locationInfo = "";
            if (currentUser.diabanh && currentUser.diabanh !== "Tất cả") {
                locationInfo = ` - ${currentUser.diabanh}`;
            } else if (currentUser.ap && currentUser.ap !== "Tất cả") {
                locationInfo = ` - Ấp ${currentUser.ap}`;
            }
            userInfoSpan.textContent = `${name} (${userRole}${locationInfo})`;
        }

        if (role.includes("admin") || role.includes("lãnh đạo") || role.includes("lanh dao") || role.includes("quan tri")) {
            if (adminBtn) adminBtn.style.setProperty("display", "inline-block", "important");
            if (baocaoBtn) baocaoBtn.style.setProperty("display", "inline-block", "important");
            if (quanLyBieuMauBtn) quanLyBieuMauBtn.style.setProperty("display", "inline-block", "important"); // 🆕 Hiển thị nút cho Admin/Lãnh đạo
        } else {
            if (adminBtn) adminBtn.style.setProperty("display", "none", "important");
            if (baocaoBtn) adminBtn.style.setProperty("display", "none", "important");
            if (quanLyBieuMauBtn) quanLyBieuMauBtn.style.setProperty("display", "none", "important"); // 🆕 Ẩn nút đối với tài khoản thường
        }
    }
});

async function logout() {
    await fetch('/api/logout', {method: 'POST'});
    localStorage.removeItem("currentUser");
    window.location.href = 'login.html';
}