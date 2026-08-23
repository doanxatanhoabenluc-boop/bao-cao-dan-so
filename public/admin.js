document.addEventListener("DOMContentLoaded", () => {
    loadUsers();
    loadApDropdown();
    if (document.getElementById('bpttTableBody')) loadBpttList();
    if (document.getElementById('noiThucHienTableBody')) loadNoiThucHienList();
    
    if (document.getElementById('adminTableBody')) {
        loadTableDataAdmin();
    }
});

// ==================== BẢNG ÁNH XẠ VIỆT HÓA TÊN CỘT ====================
const columnLabels = {
    id: "ID",
    ho_so: "Số hộ",
    ho_ten_con: "Họ tên con",
    ngay_sinh_con: "Ngày sinh con",
    gioi_tinh: "Giới tính",
    dan_toc: "Dân tộc",
    ho_ten_me: "Họ tên mẹ",
    so_the_bhyt_me: "Số thẻ BHYT mẹ",
    ngay_sinh_me: "Ngày sinh mẹ",
    noi_de: "Nơi đẻ",
    con_thu_may: "Con thứ mấy",
    ap: "Ấp",
    diabanh: "Địa bàn",
    nguoi_nhap: "Người nhập",
    created_at: "Thời gian tạo",
    ho_ten: "Họ tên",
    so_the_bhyt: "Số thẻ BHYT",
    ma_the_bhyt: "Mã số thẻ BHYT",
    quan_he: "Quan hệ",
    ngay_sinh: "Ngày sinh",
    nam_sinh: "Năm sinh",
    trinh_do_hoc_van: "Trình độ học vấn",
    hoc_van: "Học vấn",
    tinh_trang_hon_nhan: "Tình trạng hôn nhân",
    hon_nhan: "Hôn nhân",
    ngay_den: "Ngày đến",
    noi_di: "Nơi đi",
    so_con_hien_co: "Số con hiện có",
    bptt: "Biện pháp tránh thai",
    noi_thuc_hien: "Nơi thực hiện",
    ma_so_doi_tuong: "Mã số đối tượng",
    ngay_kham: "Ngày khám",
    ho_ten_vo: "Họ tên vợ",
    ngay_su_ung: "Ngày sử dụng",
    bptt_moi: "BPTT mới sử dụng",
    bptt_thoi:"BPTT thôi sử dụng",
    ngay_thoi_su_dung: "Ngày thôi sử dụng",
    ngay_chet: "Ngày chết",
    ghi_chu: "Ghi chú",
    ngay_di: "Ngày đi",
    noi_den: "Nơi đến",
    cong_so_nguoi_co: "Cộng số người có",
    ten_ctv: "Tên CTV",
    ngay_kinh_cuoi: "Ngày tháng mang thai (Ngày kinh cuối)",
    tuan_thai: "Mang thai tuần thứ mấy",
    ngay_thuc_hien: "Ngày thực hiện dịch vụ",
    edward: "Hội chứng Edward",
    down: "Hội chứng Down",
    patau: "Hội chứng Patau",
    thalassemia: "Bệnh Thalassemia",
    noi_cu_tru: "Nơi cư trú (tỉnh, huyện, xã, địa chỉ cụ thể)",
};

// ==================== TAB 1: QUẢN LÝ TÀI KHOẢN ====================
async function loadUsers() {
    const tbody = document.getElementById("userTableBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="9" class="text-center">Đang tải dữ liệu...</td></tr>`;
    try {
        const res = await fetch('/api/admin/users');
        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center">Chưa có tài khoản nào.</td></tr>`;
            return;
        }
        let html = '';
        list.forEach((u, idx) => {
            const statusBadge = u.active === 1 
                ? `<span class="badge bg-success">Hoạt động</span>` 
                : `<span class="badge bg-danger">Đã khóa</span>`;
            
            html += `<tr>
                <td class="text-center">${idx + 1}</td>
                <td><b>${u.fullname || ''}</b></td>
                <td><code>${u.username}</code></td>
                <td class="text-center"><span class="badge bg-secondary">${u.role}</span></td>
                <td>${u.diabanh || ''}</td>
                <td>${u.ap || ''}</td>
                <td>${u.xa || ''}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center text-nowrap">
                    <button class="btn btn-sm btn-warning me-1" onclick="openEditUser(${u.id}, '${u.fullname || ''}', '${u.username}', '${u.role}', '${u.diabanh || ''}', '${u.ap || ''}', '${u.xa || ''}')" title="Sửa"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-secondary me-1" onclick="toggleUser(${u.id})" title="Khóa/Mở khóa"><i class="fa-solid fa-lock"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})" title="Xóa tài khoản"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Lỗi tải danh sách tài khoản</td></tr>`;
    }
}

function resetUserForm() {
    document.getElementById("modalUserTitle").innerText = "Thêm tài khoản mới";
    document.getElementById("userId").value = "";
    document.getElementById("userForm").reset();
    document.getElementById("passNote").innerText = "*";
    document.getElementById("password").setAttribute("required", "true");
}

function openEditUser(id, fullname, username, role, diabanh, ap, xa) {
    document.getElementById("modalUserTitle").innerText = "Chỉnh sửa tài khoản";
    document.getElementById("userId").value = id;
    document.getElementById("fullname").value = fullname;
    document.getElementById("username").value = username;
    document.getElementById("password").value = "";
    document.getElementById("passNote").innerText = "(Bỏ trống nếu không đổi mật khẩu)";
    document.getElementById("password").removeAttribute("required");
    document.getElementById("role").value = role;
    document.getElementById("diabanh").value = diabanh;
    document.getElementById("ap").value = ap;
    document.getElementById("xa").value = xa;

    var myModal = new bootstrap.Modal(document.getElementById('userModal'));
    myModal.show();
}

async function saveUser(event) {
    event.preventDefault();
    
    const adminPassword = prompt("Nhập mật khẩu quản trị viên để xác nhận:");
    if (adminPassword === null) return;

    const id = document.getElementById("userId").value;
    const data = {
        fullname: document.getElementById("fullname").value,
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
        role: document.getElementById("role").value,
        diabanh: document.getElementById("diabanh").value,
        ap: document.getElementById("ap").value,
        xa: document.getElementById("xa").value,
        admin_password: adminPassword
    };

    const url = id ? `/api/admin/users/${id}` : '/api/admin/users';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
        const modalEl = document.getElementById('userModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        loadUsers();
    } else {
        alert(result.message);
    }
}

async function toggleUser(id) {
    const adminPassword = prompt("Nhập mật khẩu quản trị viên để khóa/mở khóa:");
    if (adminPassword === null) return;

    const res = await fetch(`/api/admin/users/${id}/toggle`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password: adminPassword })
    });
    const result = await res.json();
    if (result.success) {
        loadUsers();
    } else {
        alert(result.message);
    }
}

async function deleteUser(id) {
    const adminPassword = prompt("Nhập mật khẩu quản trị viên để XÓA vĩnh viễn:");
    if (adminPassword === null) return;

    try {
        const res = await fetch(`/api/admin/users/${id}`, { 
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_password: adminPassword })
        });
        const result = await res.json();
        if (result.success) {
            loadUsers();
        } else {
            alert(result.message);
        }
    } catch (err) {
        alert('Lỗi kết nối tới máy chủ');
    }
}

async function loadApDropdown() {
    try {
        const res = await fetch('/api/admin/ap');
        const list = await res.json();
        const select = document.getElementById('ap');
        if(select) {
            let html = '<option value="Tất cả">Tất cả</option>';
            list.forEach(item => {
                html += `<option value="${item.ten_ap}">${item.ten_ap}</option>`;
            });
            select.innerHTML = html;
        }
    } catch(err) { console.error(err); }
}

// ==================== TAB 2: QUẢN LÝ 11 BIỂU MẪU ====================
let allTableData = []; 
let currentPage = 1;   
const rowsPerPage = 10; 

async function loadTableDataAdmin(page = 1) {
    currentPage = page;
    const tableName = document.getElementById('selectManagedTable').value;
    const searchKeyword = document.getElementById('adminSearchInput').value.trim().toLowerCase();
    const headerRow = document.getElementById('adminTableHeader');
    const bodyRow = document.getElementById('adminTableBody');
    const paginationContainer = document.getElementById('adminPaginationContainer');
    
    if (!window.currentTableLoaded || window.currentLoadedTableName !== tableName) {
        headerRow.innerHTML = `<tr><th colspan="17" class="text-center">Đang tải cấu trúc bảng...</th></tr>`;
        bodyRow.innerHTML = `<tr><td class="text-center">Đang tải dữ liệu...</td></tr>`;
        paginationContainer.innerHTML = '';

        try {
            const response = await fetch(`/api/data/${tableName}`);
            const data = await response.json();

            if (!Array.isArray(data)) {
                bodyRow.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Lỗi tải dữ liệu từ máy chủ</td></tr>`;
                return;
            }

            allTableData = data;
            window.currentTableLoaded = true;
            window.currentLoadedTableName = tableName;
        } catch (err) {
            console.error(err);
            bodyRow.innerHTML = `<tr><td colspan="17" class="text-center text-danger py-3">Lỗi kết nối máy chủ khi tải dữ liệu</td></tr>`;
            return;
        }
    }

    let filteredData = allTableData;
    if (searchKeyword) {
        const keywords = searchKeyword.split(/\s+/).filter(Boolean);
        filteredData = allTableData.filter(row => {
            const rowString = Object.values(row)
                .filter(val => val !== null && val !== undefined)
                .join(' ')
                .toLowerCase();
            return keywords.every(keyword => rowString.includes(keyword));
        });
    }

    if (filteredData.length === 0) {
        headerRow.innerHTML = `<tr><th>Thông báo</th></tr>`;
        bodyRow.innerHTML = `<tr><td class="text-center py-3 text-muted">Không tìm thấy bản ghi nào khớp với từ khóa "${searchKeyword}".</td></tr>`;
        paginationContainer.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    if (tableName === 'table_10' || tableName.includes('10')) {
        let headerHtml = `
            <tr>
                <th rowspan="2" class="align-middle text-center">TT</th>
                <th rowspan="2" class="align-middle text-center">Tên CTV</th>
                <th rowspan="2" class="align-middle text-center">Số hộ</th>
                <th rowspan="2" class="align-middle text-center">Mã số thẻ BHYT</th>
                <th rowspan="2" class="align-middle text-center">Họ và tên</th>
                <th rowspan="2" class="align-middle text-center">Nơi cư trú<br><small>(tỉnh, huyện, xã, địa chỉ cụ thể)</small></th>
                <th rowspan="2" class="align-middle text-center">Ngày tháng mang thai<br><small>(Ngày kinh cuối)</small></th>
                <th colspan="5" class="text-center bg-light">Kết quả tuần 12</th>
                <th colspan="5" class="text-center bg-light">Kết quả tuần 21</th>
                <th rowspan="2" class="align-middle text-center">Nơi thực hiện</th>
                <th rowspan="2" class="align-middle text-center">Người nhập</th>
                <th rowspan="2" class="align-middle text-center">Thời gian nhập</th>
                <th rowspan="2" class="align-middle text-center">Thao tác</th>
            </tr>
            <tr>
                <th class="text-center">Mang thai tuần 12</th>
                <th class="text-center">Down</th>
                <th class="text-center">Edward</th>
                <th class="text-center">Patau</th>
                <th class="text-center">Thalassemia</th>
                <th class="text-center">Mang thai tuần 21</th>
                <th class="text-center">Down</th>
                <th class="text-center">Edward</th>
                <th class="text-center">Patau</th>
                <th class="text-center">Thalassemia</th>
            </tr>
        `;
        headerRow.innerHTML = headerHtml;

        let bodyHtml = '';
        paginatedData.forEach((row, index) => {
            const absoluteIndex = startIndex + index + 1;
            const nguoiNhap = row.nguoi_nhap || row.user_nhap || row.created_by || '';
            const thoiGianNhap = row.created_at || row.ngay_nhap || row.time_stamp || row.updated_at || '';

            bodyHtml += `
                <tr>
                    <td class="text-center align-middle">${absoluteIndex}</td>
                    <td class="align-middle">${row.ten_ctv || row.ctv || ''}</td>
                    <td class="text-center align-middle">${row.so_ho || row.ho_so || ''}</td>
                    <td class="text-center align-middle">${row.ma_the_bhyt || ''}</td>
                    <td class="align-middle">${row.ho_ten || ''}</td>
                    <td class="align-middle">${row.noi_cu_tru || row.dia_chi || ''}</td>
                    <td class="text-center align-middle">${row.ngay_thang_mang_thai || row.ngay_kinh_cuoi || ''}</td>
                    <td class="text-center align-middle">${row.mang_thai_tuan_12 || ''}</td>
                    <td class="text-center align-middle">${row.hoi_chung_down_12 || ''}</td>
                    <td class="text-center align-middle">${row.hoi_chung_edward_12 || ''}</td>
                    <td class="text-center align-middle">${row.hoi_chung_patau_12 || ''}</td>
                    <td class="text-center align-middle">${row.benh_thalassemia_12 || ''}</td>
                    <td class="text-center align-middle">${row.mang_thai_tuan_21 || ''}</td>
                    <td class="text-center align-middle">${row.hoi_chung_down_21 || ''}</td>
                    <td class="text-center align-middle">${row.hoi_chung_edward_21 || ''}</td>
                    <td class="text-center align-middle">${row.hoi_chung_patau_21 || ''}</td>
                    <td class="text-center align-middle">${row.benh_thalassemia_21 || ''}</td>
                    <td class="align-middle">${row.noi_thuc_hien || ''}</td>
                    <td class="align-middle">${nguoiNhap}</td>
                    <td class="text-center align-middle">${thoiGianNhap}</td>
                    <td class="text-center align-middle text-nowrap">
                        <button class="btn btn-sm btn-warning me-1" onclick="openEditRecordModal('${tableName}', '${encodeURIComponent(JSON.stringify(row))}')" title="Sửa"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteRecord('${tableName}', ${row.id})" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
        bodyRow.innerHTML = bodyHtml;

    } else {
        const columns = Object.keys(paginatedData[0]).filter(col => col !== 'id');
        
        let headerHtml = '<tr><th class="text-center" style="width: 60px;">STT</th>';
        columns.forEach(col => {
            let displayName = (typeof columnLabels !== 'undefined' && columnLabels[col]) ? columnLabels[col] : col.replace(/_/g, ' ');
            headerHtml += `<th>${displayName}</th>`;
        });
        headerHtml += '<th class="text-center" style="width: 120px;">Thao tác</th></tr>';
        headerRow.innerHTML = headerHtml;

        let bodyHtml = '';
        paginatedData.forEach((row, index) => {
            const absoluteIndex = startIndex + index + 1;
            bodyHtml += `<tr><td class="text-center align-middle">${absoluteIndex}</td>`;
            
            columns.forEach(col => {
                let cellVal = row[col];
                bodyHtml += `<td class="align-middle">${cellVal !== null && cellVal !== undefined ? cellVal : ''}</td>`;
            });

            const rowJson = encodeURIComponent(JSON.stringify(row));
            bodyHtml += `
                <td class="text-center align-middle text-nowrap">
                    <button class="btn btn-sm btn-warning me-1" onclick="openEditRecordModal('${tableName}', '${rowJson}')" title="Sửa"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteRecord('${tableName}', ${row.id})" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        bodyRow.innerHTML = bodyHtml;
    }

    renderPagination(totalPages, currentPage, paginationContainer);
}

function renderPagination(totalPages, currentPage, container) {
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `<nav><ul class="pagination pagination-sm mb-0">`;
    
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                <button class="page-link" onclick="loadTableDataAdmin(${currentPage - 1})">Trước</button>
             </li>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
                        <button class="page-link" onclick="loadTableDataAdmin(${i})">${i}</button>
                     </li>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }

    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <button class="page-link" onclick="loadTableDataAdmin(${currentPage + 1})">Sau</button>
             </li>`;

    html += `</ul></nav>`;
    container.innerHTML = html;
}

document.getElementById('selectManagedTable').addEventListener('change', () => {
    window.currentTableLoaded = false;
    document.getElementById('adminSearchInput').value = '';
    loadTableDataAdmin(1);
});

// ==================== CHỈNH SỬA BẢN GHI (ĐÃ TỐI ƯU CHO BẢNG 10) ====================
async function openEditRecordModal(tableName, encodedRowJson) {
    const row = JSON.parse(decodeURIComponent(encodedRowJson));
    document.getElementById('editRecordId').value = row.id || '';
    const container = document.getElementById('editDataFieldsContainer');
    container.innerHTML = '';

    let apList = [];
    let benhVienList = [];
    let bpttList = [];
    let noiThucHienList = [];
    let danTocList = [];
    let gioiTinhList = ["Nam", "Nữ"];
    let quanHeList = [];
    let hocVanList = [];
    let honNhanList = [];

    try {
        let [resAp, resBv, resBptt, resNth, resDanToc, resQuanHe, resHocVan, resHonNhan] = await Promise.all([
            fetch('/api/danh-sach-ap').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-benh-vien').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-bptt').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-noi-thuc-hien').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-dan-toc').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-quan-he').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-hoc-van').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-hon-nhan').catch(() => ({ json: () => [] }))
        ]);

        let dAp = await resAp.json();
        apList = Array.isArray(dAp) ? dAp.map(item => item.ten_ap || item) : [];

        let dBv = await resBv.json();
        benhVienList = Array.isArray(dBv) ? dBv.map(item => item.ten_benh_vien || item) : [];

        let dBptt = await resBptt.json();
        bpttList = Array.isArray(dBptt) ? dBptt : [];

        let dNth = await resNth.json();
        noiThucHienList = Array.isArray(dNth) ? dNth.map(item => item.ten_noi_thuc_hien || item) : [];

        let dDanToc = await resDanToc.json();
        danTocList = Array.isArray(dDanToc) ? dDanToc.map(item => item.ten_dan_toc || item) : ["Kinh", "Tày", "Thái", "Hoa", "Khmer", "Mường", "Nùng"];

        let dQuanHe = await resQuanHe.json();
        quanHeList = Array.isArray(dQuanHe) ? dQuanHe.map(item => item.ten_quan_he || item) : ["Chủ hộ", "Vợ", "Chồng", "Con", "Bố", "Mẹ", "Khác"];

        let dHocVan = await resHocVan.json();
        hocVanList = Array.isArray(dHocVan) ? dHocVan.map(item => item.ten_hoc_van || item) : ["Tiểu học", "THCS", "THPT", "Đại học", "Khác"];

        let dHonNhan = await resHonNhan.json();
        honNhanList = Array.isArray(dHonNhan) ? dHonNhan.map(item => item.ten_hon_nhan || item) : ["Chưa kết hôn", "Đang kết hôn", "Ly hôn", "Góa"];

    } catch (e) {
        console.error("Lỗi tải danh mục cho modal sửa:", e);
    }

    // Lọc bỏ các trường hệ thống không cần sửa trực tiếp và loại bỏ các trường trùng lặp thừa thãi
    let keys = Object.keys(row).filter(key => key !== 'id');
    
    if (tableName === 'table_10' || tableName.includes('10')) {
        // Chỉ giữ lại các trường chuẩn của bảng 10, loại bỏ các trường rác/trùng lặp cũ
        const allowedTable10Keys = [
            'ten_ctv', 'so_ho', 'ho_so', 'ma_the_bhyt', 'so_the_bhyt', 'ho_ten', 
            'noi_cu_tru', 'dia_chi', 'ngay_thang_mang_thai', 'ngay_kinh_cuoi',
            'mang_thai_tuan_12', 'hoi_chung_down_12', 'hoi_chung_edward_12', 'hoi_chung_patau_12', 'benh_thalassemia_12',
            'mang_thai_tuan_21', 'hoi_chung_down_21', 'hoi_chung_edward_21', 'hoi_chung_patau_21', 'benh_thalassemia_21',
            'noi_thuc_hien'
        ];
        keys = keys.filter(key => allowedTable10Keys.includes(key));
    }

    window.currentEditingKeys = keys;

    keys.forEach(key => {
        let val = row[key] !== null && row[key] !== undefined ? row[key] : '';
        let labelText = columnLabels[key] || key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
        const lowerKey = key.toLowerCase();
        let inputHtml = '';

        if (lowerKey === 'ap') {
            let options = `<option value="">-- Chọn ấp --</option>`;
            apList.forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        } 
        else if (lowerKey === 'noi_thuc_hien') {
            let options = `<option value="">-- Chọn nơi thực hiện --</option>`;
            noiThucHienList.forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey === 'noi_de') {
            let options = `<option value="">-- Chọn bệnh viện --</option>`;
            benhVienList.forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey.includes('bptt')) {
            let options = `<option value="">-- Chọn biện pháp tránh thai --</option>`;
            bpttList.forEach(item => {
                let ma = item.ma_bptt || '';
                let ten = item.ten_bptt || item;
                let displayVal = ma ? `${ma} - ${ten}` : ten;
                let selected = (val === ma || val === ten || val === displayVal) ? 'selected' : '';
                options += `<option value="${ma || ten}" ${selected}>${displayVal}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey.includes('dan_toc')) {
            let options = `<option value="">-- Chọn dân tộc --</option>`;
            danTocList.forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey.includes('gioi_tinh')) {
            let options = `<option value="">-- Chọn giới tính --</option>`;
            gioiTinhList.forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey.includes('quan_he')) {
            let options = `<option value="">-- Chọn quan hệ --</option>`;
            quanHeList.forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey.includes('hoc_van') || lowerKey.includes('trinh_do')) {
            let options = `<option value="">-- Chọn trình độ học vấn --</option>`;
            hocVanList.forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey.includes('hon_nhan')) {
            let options = `<option value="">-- Chọn tình trạng hôn nhân --</option>`;
            honNhanList.forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey.includes('edward') || lowerKey.includes('down') || lowerKey.includes('patau') || lowerKey.includes('thalassemia') || lowerKey.includes('hoi_chung')) {
            let options = `<option value="">-- Chọn kết quả --</option>`;
            ["Bình thường", "Bất thường", "Nguy cơ thấp", "Nguy cơ cao", "Có", "Không"].forEach(item => {
                let selected = (val === item) ? 'selected' : '';
                options += `<option value="${item}" ${selected}>${item}</option>`;
            });
            inputHtml = `<select class="form-select" id="edit_field_${key}">${options}</select>`;
        }
        else if (lowerKey.includes('ngay') || lowerKey.includes('date')) {
            let formattedDate = val ? val.toString().split('T')[0] : '';
            inputHtml = `<input type="date" class="form-control" id="edit_field_${key}" value="${formattedDate}">`;
        } 
        else {
            inputHtml = `<input type="text" class="form-control" id="edit_field_${key}" value="${val}">`;
        }

        const colDiv = document.createElement('div');
        colDiv.className = "col-md-6 mb-3";
        colDiv.innerHTML = `
            <label class="form-label fw-semibold text-secondary small">${labelText}</label>
            ${inputHtml}
        `;
        container.appendChild(colDiv);
    });

    const editModal = new bootstrap.Modal(document.getElementById('editDataModal'));
    editModal.show();
}
async function saveRecordData(event) {
    event.preventDefault();
    const tableName = document.getElementById('selectManagedTable').value;
    const recordId = document.getElementById('editRecordId').value;
    
    const updatedData = {};
    if (window.currentEditingKeys) {
        window.currentEditingKeys.forEach(key => {
            const inputEl = document.getElementById(`edit_field_${key}`);
            if (inputEl) {
                updatedData[key] = inputEl.value;
            }
        });
    }

    try {
        const response = await fetch(`/api/data/${tableName}/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });

        if (response.ok) {
            const modalEl = document.getElementById('editDataModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();

            alert('Cập nhật thông tin thành công!');

            // RESET TOÀN BỘ TRẠNG THÁI CACHE CỦA BẢNG ĐỂ ÉP TẢI LẠI MỚI HOÀN TOÀN
            window.currentTableLoaded = false; 
            window.currentLoadedTableName = null; 

            // Gọi lại hàm load dữ liệu cho đúng bảng hiện tại
            if (typeof loadTableDataAdmin === 'function') {
                loadTableDataAdmin(currentPage || 1); 
            } else {
                location.reload();
            }
        } else {
            alert('Lỗi khi cập nhật dữ liệu từ máy chủ.');
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối máy chủ!');
    }
}
async function deleteRecord(table, id) {
    if(!confirm('Bạn có chắc chắn muốn xóa bản ghi dữ liệu này?')) return;
    try {
        const res = await fetch(`/api/data/${table}/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) {
            loadTableDataAdmin();
        } else {
            alert(result.message);
        }
    } catch(err) {
        alert('Lỗi kết nối tới máy chủ');
    }
}

// ==================== TAB 3: QUẢN LÝ ẤP ====================
async function loadApList() {
    const tbody = document.getElementById('apTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Đang tải dữ liệu...</td></tr>`;
    try {
        const res = await fetch('/api/admin/ap');
        const list = await res.json();
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center">Chưa có ấp nào.</td></tr>`;
            return;
        }
        let html = '';
        list.forEach((item, idx) => {
            html += `<tr>
                <td class="text-center">${idx + 1}</td>
                <td><b>${item.ten_ap}</b></td>
                <td class="text-center"><span class="badge bg-success">Hoạt động</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-danger" onclick="deleteAp(${item.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>`;
    }
}

async function saveAp(event) {
    event.preventDefault();
    const ten_ap = document.getElementById('tenApInput').value;
    const res = await fetch('/api/admin/ap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ten_ap })
    });
    const result = await res.json();
    if(result.success) {
        const modalEl = document.getElementById('apModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        document.getElementById('tenApInput').value = '';
        loadApList();
        loadApDropdown();
    } else {
        alert(result.message);
    }
}

async function deleteAp(id) {
    if(!confirm('Bạn có chắc muốn xóa ấp này?')) return;
    try {
        const res = await fetch(`/api/admin/ap/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) {
            loadApList();
            loadApDropdown();
        } else {
            alert(result.message);
        }
    } catch(err) {
        alert('Lỗi kết nối tới máy chủ');
    }
}

// ==================== TAB 4: QUẢN LÝ BỆNH VIỆN ====================
async function loadBenhVienList() {
    const tbody = document.getElementById('bvTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Đang tải dữ liệu...</td></tr>`;
    try {
        const res = await fetch('/api/admin/benh-vien');
        const list = await res.json();
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center">Chưa có bệnh viện nào.</td></tr>`;
            return;
        }
        let html = '';
        list.forEach((item, idx) => {
            html += `<tr>
                <td class="text-center">${idx + 1}</td>
                <td><b>${item.ten_benh_vien}</b></td>
                <td>${item.dia_chi || ''}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-danger" onclick="deleteBenhVien(${item.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>`;
    }
}

async function saveBenhVien(event) {
    event.preventDefault();
    const ten_benh_vien = document.getElementById('tenBvInput').value;
    const dia_chi = document.getElementById('diaChiBvInput').value;
    const res = await fetch('/api/admin/benh-vien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ten_benh_vien, dia_chi })
    });
    const result = await res.json();
    if(result.success) {
        const modalEl = document.getElementById('bvModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        document.getElementById('tenBvInput').value = '';
        document.getElementById('diaChiBvInput').value = '';
        loadBenhVienList();
    } else {
        alert(result.message);
    }
}

async function deleteBenhVien(id) {
    if(!confirm('Bạn có chắc muốn xóa cơ sở này?')) return;
    try {
        const res = await fetch(`/api/admin/benh-vien/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) {
            loadBenhVienList();
        } else {
            alert(result.message);
        }
    } catch(err) {
        alert('Lỗi kết nối tới máy chủ');
    }
}

// ==================== TAB 5: NHẬT KÝ LOGS ====================
async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">Đang tải dữ liệu...</td></tr>`;
    try {
        const res = await fetch('/api/admin/logs');
        const list = await res.json();
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">Chưa có nhật ký hoạt động.</td></tr>`;
            return;
        }

        const tableLabels = {
            'table_1': 'Biểu mẫu 1: Trẻ sinh ra',
            'table_2': 'Biểu mẫu 2: Sàng lọc sơ sinh',
            'table_3': 'Biểu mẫu 3: Người chết',
            'table_4': 'Biểu mẫu 4: Người chuyển đến',
            'table_5': 'Biểu mẫu 5: Người chuyển đi',
            'table_6': 'Biểu mẫu 6: Thay đổi thông tin',
            'table_7': 'Biểu mẫu 7: Vợ chồng mới dùng BPTT',
            'table_8': 'Biểu mẫu 8: Vợ chồng thôi dùng BPTT',
            'table_9': 'Biểu mẫu 9: Thai sản',
            'table_10': 'Biểu mẫu 10: Sàng lọc trước sinh',
            'table_11': 'Biểu mẫu 11: Người cao tuổi khám SK'
        };

        let html = '';
        list.forEach((item) => {
            let actionText = item.action || '';
            for (const [tKey, tName] of Object.entries(tableLabels)) {
                actionText = actionText.split(tKey).join(tName);
            }

            let targetText = item.target_name || '';
            targetText = targetText.replace(/([a-zA-Z_]\w*)\s*:/g, (match, key) => {
                return (columnLabels[key] || key) + ':';
            });

            html += `<tr>
                <td class="text-center">${item.id}</td>
                <td><b>${item.username || ''}</b></td>
                <td><span class="badge bg-secondary">${actionText}</span></td>
                <td>${targetText}</td>
                <td class="text-center">${item.created_at || ''}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        console.error("Lỗi load logs:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>`;
    }
}

// ==================== TAB 6: QUẢN LÝ DANH MỤC BPTT ====================
async function loadBpttList() {
    const tbody = document.getElementById('bpttTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Đang tải dữ liệu...</td></tr>`;
    try {
        const res = await fetch('/api/admin/bptt');
        const list = await res.json();
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center">Chưa có dữ liệu BPTT.</td></tr>`;
            return;
        }
        let html = '';
        list.forEach((item, idx) => {
            html += `<tr>
                <td class="text-center">${idx + 1}</td>
                <td><code>${item.ma_bptt}</code></td>
                <td><b>${item.ten_bptt}</b></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning me-1" onclick="openEditBpttModal(${item.id}, '${item.ma_bptt}', '${item.ten_bptt}')">
                        <i class="fa-solid fa-pen"></i> Sửa
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBptt(${item.id})">
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>`;
    }
}

function openEditBpttModal(id, maBptt, tenBptt) {
    document.getElementById('editBpttId').value = id;
    document.getElementById('editMaBpttInput').value = maBptt;
    document.getElementById('editTenBpttInput').value = tenBptt;
    
    let myModal = new bootstrap.Modal(document.getElementById('editBpttModal'));
    myModal.show();
}

async function saveBptt(event) {
    event.preventDefault();
    const ma_bptt = document.getElementById('maBpttInput').value;
    const ten_bptt = document.getElementById('tenBpttInput').value;
    const res = await fetch('/api/admin/bptt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma_bptt, ten_bptt })
    });
    const result = await res.json();
    if(result.success) {
        const modalEl = document.getElementById('bpttModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        document.getElementById('maBpttInput').value = '';
        document.getElementById('tenBpttInput').value = '';
        loadBpttList();
    } else {
        alert(result.message);
    }
}

async function updateBptt(event) {
    event.preventDefault();
    const id = document.getElementById('editBpttId').value;
    const ma_bptt = document.getElementById('editMaBpttInput').value;
    const ten_bptt = document.getElementById('editTenBpttInput').value;

    const res = await fetch(`/api/admin/bptt/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma_bptt, ten_bptt })
    });
    const result = await res.json();
    if(result.success) {
        const modalEl = document.getElementById('editBpttModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        loadBpttList();
    } else {
        alert(result.message);
    }
}

async function deleteBptt(id) {
    if(!confirm('Bạn có chắc muốn xóa biện pháp tránh thai này?')) return;
    try {
        const res = await fetch(`/api/admin/bptt/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) {
            loadBpttList();
        } else {
            alert(result.message);
        }
    } catch(err) {
        alert('Lỗi kết nối tới máy chủ');
    }
}

// ==================== TAB 7: QUẢN LÝ NƠI THỰC HIỆN ====================
async function loadNoiThucHienList() {
    const tbody = document.getElementById('noiThucHienTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3" class="text-center">Đang tải dữ liệu...</td></tr>`;
    try {
        const res = await fetch('/api/admin/noi-thuc-hien');
        const list = await res.json();
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center">Chưa có nơi thực hiện nào.</td></tr>`;
            return;
        }
        let html = '';
        list.forEach((item, idx) => {
            html += `<tr>
                <td class="text-center">${idx + 1}</td>
                <td><b>${item.ten_noi_thuc_hien}</b></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning me-1" onclick="openEditNoiThucHienModal(${item.id}, '${item.ten_noi_thuc_hien}')">
                        <i class="fa-solid fa-pen"></i> Sửa
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteNoiThucHien(${item.id})">
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>`;
    }
}

function openEditNoiThucHienModal(id, tenNoiThucHien) {
    document.getElementById('editNoiThucHienId').value = id;
    document.getElementById('editTenNoiThucHienInput').value = tenNoiThucHien;
    
    let myModal = new bootstrap.Modal(document.getElementById('editNoiThucHienModal'));
    myModal.show();
}

async function saveNoiThucHien(event) {
    event.preventDefault();
    const ten_noi_thuc_hien = document.getElementById('tenNoiThucHienInput').value;
    const res = await fetch('/api/admin/noi-thuc-hien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ten_noi_thuc_hien })
    });
    const result = await res.json();
    if(result.success) {
        const modalEl = document.getElementById('noiThucHienModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        document.getElementById('tenNoiThucHienInput').value = '';
        loadNoiThucHienList();
    } else {
        alert(result.message);
    }
}

async function updateNoiThucHien(event) {
    event.preventDefault();
    const id = document.getElementById('editNoiThucHienId').value;
    const ten_noi_thuc_hien = document.getElementById('editTenNoiThucHienInput').value;

    const res = await fetch(`/api/admin/noi-thuc-hien/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ten_noi_thuc_hien })
    });
    const result = await res.json();
    if(result.success) {
        const modalEl = document.getElementById('editNoiThucHienModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        loadNoiThucHienList();
    } else {
        alert(result.message);
    }
}

async function deleteNoiThucHien(id) {
    if(!confirm('Bạn có chắc muốn xóa nơi thực hiện này?')) return;
    try {
        const res = await fetch(`/api/admin/noi-thuc-hien/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) {
            loadNoiThucHienList();
        } else {
            alert(result.message);
        }
    } catch(err) {
        alert('Lỗi kết nối tới máy chủ');
    }
}

// Đăng xuất hệ thống
function logout() {
    fetch('/api/logout', { method: 'POST' })
        .then(() => window.location.href = 'index.html');
}