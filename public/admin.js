document.addEventListener("DOMContentLoaded", () => {
    loadUsers();
    loadApDropdown();
    if (document.getElementById('bpttTableBody')) loadBpttList();
    if (document.getElementById('noiThucHienTableBody')) loadNoiThucHienList();
});

// ==================== BẢNG ÁNH XẠ VIỆT HÓA TÊN CỘT ====================
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
    // Bổ sung các cột cho các bảng biểu mẫu khác (như Bảng 4, 7, 8, 11...)
    ho_ten: "Họ tên",
    so_the_bhyt: "Số thẻ BHYT",
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
                    <button class="btn btn-sm btn-warning me-1" onclick="openEditUser(${u.id}, '${u.fullname || ''}', '${u.username}', '${u.role}', '${u.diabanh || ''}', '${u.ap || ''}', '${u.xa || ''}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="toggleUser(${u.id})" title="Khóa/Mở khóa"><i class="fa-solid fa-lock"></i></button>
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
    const id = document.getElementById("userId").value;
    const data = {
        fullname: document.getElementById("fullname").value,
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
        role: document.getElementById("role").value,
        diabanh: document.getElementById("diabanh").value,
        ap: document.getElementById("ap").value,
        xa: document.getElementById("xa").value
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
        location.reload();
    } else {
        alert(result.message);
    }
}

async function toggleUser(id) {
    if (!confirm('Bạn có chắc muốn đổi trạng thái khóa/mở khóa tài khoản này?')) return;
    const res = await fetch(`/api/admin/users/${id}/toggle`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
        loadUsers();
    } else {
        alert(result.message);
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
async function loadTableDataAdmin() {
    const tableName = document.getElementById('selectManagedTable').value;
    const headerRow = document.getElementById('adminTableHeader');
    const bodyRow = document.getElementById('adminTableBody');
    
    headerRow.innerHTML = `<tr><th colspan="10" class="text-center">Đang tải cấu trúc bảng...</th></tr>`;
    bodyRow.innerHTML = `<tr><td class="text-center">Đang tải dữ liệu...</td></tr>`;

    try {
        const response = await fetch(`/api/data/${tableName}`);
        const data = await response.json();

        if (!Array.isArray(data)) {
            bodyRow.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>`;
            return;
        }

        if (data.length === 0) {
            headerRow.innerHTML = `<tr><th>Thông báo</th></tr>`;
            bodyRow.innerHTML = `<tr><td class="text-center">Chưa có dữ liệu trong bảng này.</td></tr>`;
            return;
        }

        const columns = Object.keys(data[0]);
        let headerHtml = '<tr><th>STT</th>';
        columns.forEach(col => {
            const displayName = columnLabels[col] || col.replace(/_/g, ' ');
            headerHtml += `<th>${displayName}</th>`;
        });
        headerHtml += '<th>Thao tác</th></tr>';
        headerRow.innerHTML = headerHtml;

        let bodyHtml = '';
        data.forEach((row, index) => {
            bodyHtml += `<tr><td class="text-center">${index + 1}</td>`;
            columns.forEach(col => {
                bodyHtml += `<td>${row[col] !== null ? row[col] : ''}</td>`;
            });
            const rowJson = encodeURIComponent(JSON.stringify(row));
            bodyHtml += `<td class="text-center text-nowrap">
                <button class="btn btn-sm btn-warning me-1" onclick="openEditRecordModal('${tableName}', '${rowJson}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteRecord('${tableName}', ${row.id})"><i class="fa-solid fa-trash"></i></button>
            </td></tr>`;
        });
        bodyRow.innerHTML = bodyHtml;

    } catch (err) {
        console.error(err);
        bodyRow.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Lỗi kết nối máy chủ</td></tr>`;
    }
}

function openEditRecordModal(table, rowJsonStr) {
    const row = JSON.parse(decodeURIComponent(rowJsonStr));
    document.getElementById('editRecordId').value = row.id;
    const container = document.getElementById('editDataFieldsContainer');
    let html = '';

    for (const [key, value] of Object.entries(row)) {
        if (key === 'id' || key === 'created_at') continue;
        const displayName = columnLabels[key] || key.replace(/_/g, ' ');
        html += `<div class="mb-3 col-md-6">
            <label class="form-label fw-semibold">${displayName}</label>
            <input type="text" class="form-control" name="${key}" value="${value !== null ? value : ''}">
        </div>`;
    }
    container.innerHTML = html;
    document.getElementById('editDataForm').setAttribute('data-table', table);

    var myModal = new bootstrap.Modal(document.getElementById('editDataModal'));
    myModal.show();
}

async function saveRecordData(event) {
    event.preventDefault();
    const form = document.getElementById('editDataForm');
    const table = form.getAttribute('data-table');
    const id = document.getElementById('editRecordId').value;

    const inputs = form.querySelectorAll('input[name]');
    const data = {};
    inputs.forEach(input => {
        data[input.name] = input.value;
    });

    try {
        const res = await fetch(`/api/data/${table}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            location.reload();
        } else {
            alert(result.message);
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ');
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
        location.reload();
    } else {
        alert(result.message);
    }
}

async function deleteAp(id) {
    if(!confirm('Bạn có chắc muốn xóa ấp này?')) return;
    await fetch(`/api/admin/ap/${id}`, { method: 'DELETE' });
    loadApList();
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
        location.reload();
    } else {
        alert(result.message);
    }
}

async function deleteBenhVien(id) {
    if(!confirm('Bạn có chắc muốn xóa cơ sở này?')) return;
    await fetch(`/api/admin/benh-vien/${id}`, { method: 'DELETE' });
    loadBenhVienList();
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
        location.reload();
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
        location.reload();
    } else {
        alert(result.message);
    }
}

async function deleteBptt(id) {
    if(!confirm('Bạn có chắc muốn xóa biện pháp tránh thai này?')) return;
    await fetch(`/api/admin/bptt/${id}`, { method: 'DELETE' });
    loadBpttList();
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
        location.reload();
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
        location.reload();
    } else {
        alert(result.message);
    }
}

async function deleteNoiThucHien(id) {
    if(!confirm('Bạn có chắc muốn xóa nơi thực hiện này?')) return;
    await fetch(`/api/admin/noi-thuc-hien/${id}`, { method: 'DELETE' });
    loadNoiThucHienList();
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
        let html = '';
        list.forEach((item) => {
            html += `<tr>
                <td class="text-center">${item.id}</td>
                <td><b>${item.username || ''}</b></td>
                <td><span class="badge bg-secondary">${item.action || ''}</span></td>
                <td>${item.target_name || ''}</td>
                <td class="text-center">${item.created_at || ''}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>`;
    }
}

// Đăng xuất hệ thống
function logout() {
    fetch('/api/logout', { method: 'POST' })
        .then(() => window.location.href = 'index.html');
}