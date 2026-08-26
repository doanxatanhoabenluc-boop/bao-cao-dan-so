// ==================== KHỞI TẠO HỆ THỐNG ====================
document.addEventListener("DOMContentLoaded", () => {
    loadUsers();
    loadApDropdown();

    // Tải dữ liệu mặc định ban đầu cho các bảng đang xuất hiện trên màn hình
    if (document.getElementById('apTableBody')) loadApList();
    if (document.getElementById('bvTableBody')) loadBenhVienList();
    if (document.getElementById('bpttTableBody')) loadBpttList();
    if (document.getElementById('noiThucHienTableBody')) loadNoiThucHienList();
    if (document.getElementById('logsTableBody')) loadLogs();
    if (document.getElementById('moiQuanHeTableBody')) loadMoiQuanHeList();
    if (document.getElementById('nameMapTableBody')) loadVietnameseNameMapList();

    // Lắng nghe sự kiện chuyển tab của Bootstrap để tự động tải lại dữ liệu khi người dùng click
    const tabElements = document.querySelectorAll('button[data-bs-toggle="tab"], a[data-bs-toggle="tab"], .nav-link');
    tabElements.forEach(tab => {
        tab.addEventListener('shown.bs.tab', (event) => {
            const targetId = event.target.getAttribute('data-bs-target') || event.target.getAttribute('href') || '';
            
            if (targetId.includes('ap')) loadApList();
            else if (targetId.includes('benh-vien') || targetId.includes('bv')) loadBenhVienList();
            else if (targetId.includes('bptt')) loadBpttList();
            else if (targetId.includes('noi-thuc-hien')) loadNoiThucHienList();
            else if (targetId.includes('logs')) loadLogs();
            else if (targetId.includes('quan-he')) loadMoiQuanHeList();
            else if (targetId.includes('nameMap')) loadVietnameseNameMapList();
            else if (targetId.includes('user') || targetId.includes('tai-khoan')) loadUsers();
        });
    });
});

// ==================== BẢNG ÁNH XẠ VIỆT HÓA TÊN CỘT ====================
const columnLabels = {
    id: "ID", ho_so: "Số hộ", ho_ten_con: "Họ tên con", ngay_sinh_con: "Ngày sinh con", gioi_tinh: "Giới tính",
    dan_toc: "Dân tộc", ho_ten_me: "Họ tên mẹ", so_the_bhyt_me: "Số thẻ BHYT mẹ", ngay_sinh_me: "Ngày sinh mẹ",
    noi_de: "Nơi đẻ", con_thu_may: "Con thứ mấy", ap: "Ấp", diabanh: "Địa bàn", nguoi_nhap: "Người nhập",
    created_at: "Thời gian tạo", ho_ten: "Họ tên", so_the_bhyt: "Số thẻ BHYT", ma_the_bhyt: "Mã số thẻ BHYT",
    quan_he: "Quan hệ", ngay_sinh: "Ngày sinh", nam_sinh: "Năm sinh", trinh_do_hoc_van: "Trình độ học vấn",
    hoc_van: "Học vấn", tinh_trang_hon_nhan: "Tình trạng hôn nhân", hon_nhan: "Hôn nhân", ngay_den: "Ngày đến",
    noi_di: "Nơi đi", so_con_hien_co: "Số con hiện có", bptt: "Biện pháp tránh thai", noi_thuc_hien: "Nơi thực hiện",
    ma_so_doi_tuong: "Mã số đối tượng", ngay_kham: "Ngày khám", ho_ten_vo: "Họ tên vợ", ngay_su_ung: "Ngày sử dụng",
    bptt_moi: "BPTT mới sử dụng", bptt_thoi: "BPTT thôi sử dụng", ngay_thoi_su_dung: "Ngày thôi sử dụng",
    ngay_chet: "Ngày chết", ghi_chu: "Ghi chú", ngay_di: "Ngày đi", noi_den: "Nơi đến", cong_so_nguoi_co: "Cộng số người có",
    ten_ctv: "Tên CTV", ngay_kinh_cuoi: "Ngày tháng mang thai (Ngày kinh cuối)", tuan_thai: "Mang thai tuần thứ mấy",
    ngay_thuc_hien: "Ngày thực hiện dịch vụ", edward: "Hội chứng Edward", down: "Hội chứng Down", patau: "Hội chứng Patau",
    thalassemia: "Bệnh Thalassemia", noi_cu_tru: "Nơi cư trú (tỉnh, huyện, xã, địa chỉ cụ thể)"
};

// ==================== HELPER KẾT NỐI API ====================
async function apiCall(url, method = 'GET', data = null) {
    try {
        const options = { method, headers: { 'Content-Type': 'application/json' } };
        if (data) options.body = JSON.stringify(data);
        const res = await fetch(url, options);
        return await res.json();
    } catch (err) {
        console.error(`Lỗi API [${method} ${url}]:`, err);
        return { success: false, message: 'Lỗi kết nối tới máy chủ' };
    }
}

// ==================== TAB 1: QUẢN LÝ TÀI KHOẢN ====================
async function loadUsers() {
    const tbody = document.getElementById("userTableBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="9" class="text-center">Đang tải dữ liệu...</td></tr>`;

    const list = await apiCall('/api/admin/users');
    if (!Array.isArray(list) || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center">${Array.isArray(list) ? 'Chưa có tài khoản nào.' : 'Lỗi tải danh sách tài khoản'}</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map((u, idx) => `
        <tr>
            <td class="text-center">${idx + 1}</td>
            <td><b>${u.fullname || ''}</b></td>
            <td><code>${u.username}</code></td>
            <td class="text-center"><span class="badge bg-secondary">${u.role}</span></td>
            <td>${u.diabanh || ''}</td>
            <td>${u.ap || ''}</td>
            <td>${u.xa || ''}</td>
            <td class="text-center"><span class="badge ${u.active === 1 ? 'bg-success' : 'bg-danger'}">${u.active === 1 ? 'Hoạt động' : 'Đã khóa'}</span></td>
            <td class="text-center text-nowrap">
                <button class="btn btn-sm btn-warning me-1" onclick="openEditUser(${u.id}, '${u.fullname || ''}', '${u.username}', '${u.role}', '${u.diabanh || ''}', '${u.ap || ''}', '${u.xa || ''}')" title="Sửa"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-secondary me-1" onclick="toggleUser(${u.id})" title="Khóa/Mở khóa"><i class="fa-solid fa-lock"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})" title="Xóa tài khoản"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
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
    new bootstrap.Modal(document.getElementById('userModal')).show();
}

async function saveUser(event) {
    event.preventDefault();
    const adminPassword = prompt("Nhập mật khẩu quản trị viên để xác nhận:");
    if (!adminPassword) return;

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

    const result = await apiCall(id ? `/api/admin/users/${id}` : '/api/admin/users', id ? 'PUT' : 'POST', data);
    if (result.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('userModal'));
        if (modal) modal.hide();
        loadUsers();
    } else alert(result.message);
}

async function toggleUser(id) {
    const adminPassword = prompt("Nhập mật khẩu quản trị viên để khóa/mở khóa:");
    if (!adminPassword) return;
    const result = await apiCall(`/api/admin/users/${id}/toggle`, 'POST', { admin_password: adminPassword });
    result.success ? loadUsers() : alert(result.message);
}

async function deleteUser(id) {
    const adminPassword = prompt("Nhập mật khẩu quản trị viên để XÓA vĩnh viễn:");
    if (!adminPassword) return;
    const result = await apiCall(`/api/admin/users/${id}`, 'DELETE', { admin_password: adminPassword });
    result.success ? loadUsers() : alert(result.message);
}

async function loadApDropdown() {
    const select = document.getElementById('ap');
    if (!select) return;
    const list = await apiCall('/api/admin/ap');
    if (Array.isArray(list)) {
        select.innerHTML = '<option value="Tất cả">Tất cả</option>' + 
            list.map(item => `<option value="${item.ten_ap}">${item.ten_ap}</option>`).join('');
    }
}

// ==================== HÀM TỰ ĐỘNG KHỞI TẠO QUẢN LÝ TĨNH ====================
function createCrudManager(config) {
    return {
        async load() {
            const tbody = document.getElementById(config.tableId);
            if (!tbody) return;
            tbody.innerHTML = `<tr><td colspan="${config.cols}" class="text-center">Đang tải dữ liệu...</td></tr>`;
            const list = await apiCall(config.api);
            if (!Array.isArray(list) || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${config.cols}" class="text-center">${Array.isArray(list) ? 'Chưa có dữ liệu.' : 'Lỗi tải dữ liệu'}</td></tr>`;
                return;
            }
            tbody.innerHTML = list.map((item, idx) => config.renderRow(item, idx)).join('');
        },
        async save(event, formInputs, modalId) {
            event.preventDefault();
            const body = {};
            formInputs.forEach(id => body[id] = document.getElementById(id).value);
            const result = await apiCall(config.api, 'POST', body);
            if (result.success) {
                const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
                if (modal) modal.hide();
                formInputs.forEach(id => document.getElementById(id).value = '');
                this.load();
                if (config.onSuccess) config.onSuccess();
            } else alert(result.message);
        },
        async delete(id) {
            if (!confirm('Bạn có chắc chắn muốn xóa không?')) return;
            const result = await apiCall(`${config.api}/${id}`, 'DELETE');
            if (result.success) {
                this.load();
                if (config.onSuccess) config.onSuccess();
            } else alert(result.message);
        }
    };
}

// ==================== TAB 2: QUẢN LÝ ẤP ====================
const apManager = createCrudManager({
    tableId: 'apTableBody', cols: 4, api: '/api/admin/ap', onSuccess: loadApDropdown,
    renderRow: (item, idx) => `<tr>
        <td class="text-center">${idx + 1}</td>
        <td><b>${item.ten_ap}</b></td>
        <td class="text-center"><span class="badge bg-success">Hoạt động</span></td>
        <td class="text-center"><button class="btn btn-sm btn-danger" onclick="deleteAp(${item.id})"><i class="fa-solid fa-trash"></i> Xóa</button></td>
    </tr>`
});
const loadApList = () => apManager.load();
const saveAp = (e) => apManager.save(e, ['ten_ap'], 'apModal');
const deleteAp = (id) => apManager.delete(id);

// ==================== TAB 3: QUẢN LÝ BỆNH VIỆN ====================
const benhVienManager = createCrudManager({
    tableId: 'bvTableBody', cols: 4, api: '/api/admin/benh-vien',
    renderRow: (item, idx) => `<tr>
        <td class="text-center">${idx + 1}</td>
        <td><b>${item.ten_benh_vien}</b></td>
        <td>${item.dia_chi || ''}</td>
        <td class="text-center"><button class="btn btn-sm btn-danger" onclick="deleteBenhVien(${item.id})"><i class="fa-solid fa-trash"></i> Xóa</button></td>
    </tr>`
});
const loadBenhVienList = () => benhVienManager.load();
const saveBenhVien = (e) => benhVienManager.save(e, ['ten_benh_vien', 'dia_chi'], 'bvModal');
const deleteBenhVien = (id) => benhVienManager.delete(id);

// ==================== TAB 4: NHẬT KÝ LOGS ====================
async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Đang tải dữ liệu...</td></tr>`;

    const list = await apiCall('/api/admin/logs');
    if (!Array.isArray(list) || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">${Array.isArray(list) ? 'Chưa có nhật ký hoạt động.' : 'Lỗi tải dữ liệu'}</td></tr>`;
        return;
    }

    const tableLabels = {
        'table_1': 'Biểu mẫu 1: Trẻ sinh ra', 'table_2': 'Biểu mẫu 2: Sàng lọc sơ sinh', 'table_3': 'Biểu mẫu 3: Người chết',
        'table_4': 'Biểu mẫu 4: Người chuyển đến', 'table_5': 'Biểu mẫu 5: Người chuyển đi', 'table_6': 'Biểu mẫu 6: Thay đổi thông tin',
        'table_7': 'Biểu mẫu 7: Vợ chồng mới dùng BPTT', 'table_8': 'Biểu mẫu 8: Vợ chồng thôi dùng BPTT', 'table_9': 'Biểu mẫu 9: Thai sản',
        'table_10': 'Biểu mẫu 10: Sàng lọc trước sinh', 'table_11': 'Biểu mẫu 11: Người cao tuổi khám SK'
    };

    tbody.innerHTML = list.map(item => {
        let actionText = item.action || '';
        for (const [tKey, tName] of Object.entries(tableLabels)) actionText = actionText.split(tKey).join(tName);
        let targetText = (item.target_name || '').replace(/([a-zA-Z_]\w*)\s*:/g, (m, key) => (columnLabels[key] || key) + ':');

        return `<tr>
            <td class="text-center">${item.id}</td>
            <td><b>${item.username || ''}</b></td>
            <td><span class="badge bg-secondary">${actionText}</span></td>
            <td>${targetText}</td>
            <td class="text-center">${item.created_at || ''}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-danger" onclick="deleteLog(${item.id})" title="Xóa dòng này">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// Xóa 1 dòng log theo ID
async function deleteLog(id) {
    if (!confirm(`Bạn có chắc chắn muốn xóa nhật ký có ID là ${id} không?`)) {
        return;
    }

    const result = await apiCall(`/api/admin/logs/${id}`, 'DELETE');
    if (result.success) {
        loadLogs();
    } else {
        alert(result.message || 'Có lỗi xảy ra khi xóa nhật ký.');
    }
}

// Xóa toàn bộ logs
async function clearAllLogs() {
    if (!confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn toàn bộ lịch sử nhật ký hệ thống không? Hành động này không thể hoàn tác!')) {
        return;
    }

    const result = await apiCall('/api/admin/logs', 'DELETE');
    if (result.success) {
        alert(result.message || 'Đã xóa toàn bộ lịch sử thành công!');
        loadLogs();
    } else {
        alert(result.message || 'Có lỗi xảy ra khi xóa nhật ký.');
    }
}

// ==================== TAB 5: QUẢN LÝ DANH MỤC BPTT ====================
const bpttManager = createCrudManager({
    tableId: 'bpttTableBody', cols: 4, api: '/api/admin/bptt',
    renderRow: (item, idx) => `<tr>
        <td class="text-center">${idx + 1}</td>
        <td><code>${item.ma_bptt}</code></td>
        <td><b>${item.ten_bptt}</b></td>
        <td class="text-center">
            <button class="btn btn-sm btn-warning me-1" onclick="openEditBpttModal(${item.id}, '${item.ma_bptt}', '${item.ten_bptt}')"><i class="fa-solid fa-pen"></i> Sửa</button>
            <button class="btn btn-sm btn-danger" onclick="deleteBptt(${item.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
        </td>
    </tr>`
});
const loadBpttList = () => bpttManager.load();
const saveBptt = (e) => bpttManager.save(e, ['ma_bptt', 'ten_bptt'], 'bpttModal');
const deleteBptt = (id) => bpttManager.delete(id);

function openEditBpttModal(id, maBptt, tenBptt) {
    document.getElementById('editBpttId').value = id;
    document.getElementById('editMaBpttInput').value = maBptt;
    document.getElementById('editTenBpttInput').value = tenBptt;
    new bootstrap.Modal(document.getElementById('editBpttModal')).show();
}

async function updateBptt(event) {
    event.preventDefault();
    const id = document.getElementById('editBpttId').value;
    const body = { ma_bptt: document.getElementById('editMaBpttInput').value, ten_bptt: document.getElementById('editTenBpttInput').value };
    const result = await apiCall(`/api/admin/bptt/${id}`, 'PUT', body);
    if (result.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('editBpttModal'));
        if (modal) modal.hide();
        loadBpttList();
    } else alert(result.message);
}

// ==================== TAB 6: QUẢN LÝ NƠI THỰC HIỆN ====================
const noiThucHienManager = createCrudManager({
    tableId: 'noiThucHienTableBody', cols: 3, api: '/api/admin/noi-thuc-hien',
    renderRow: (item, idx) => `<tr>
        <td class="text-center">${idx + 1}</td>
        <td><b>${item.ten_noi_thuc_hien}</b></td>
        <td class="text-center">
            <button class="btn btn-sm btn-warning me-1" onclick="openEditNoiThucHienModal(${item.id}, '${item.ten_noi_thuc_hien}')"><i class="fa-solid fa-pen"></i> Sửa</button>
            <button class="btn btn-sm btn-danger" onclick="deleteNoiThucHien(${item.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
        </td>
    </tr>`
});
const loadNoiThucHienList = () => noiThucHienManager.load();
const saveNoiThucHien = (e) => noiThucHienManager.save(e, ['ten_noi_thuc_hien'], 'noiThucHienModal');
const deleteNoiThucHien = (id) => noiThucHienManager.delete(id);

function openEditNoiThucHienModal(id, tenNoiThucHien) {
    document.getElementById('editNoiThucHienId').value = id;
    document.getElementById('editTenNoiThucHienInput').value = tenNoiThucHien;
    new bootstrap.Modal(document.getElementById('editNoiThucHienModal')).show();
}

async function updateNoiThucHien(event) {
    event.preventDefault();
    const id = document.getElementById('editNoiThucHienId').value;
    const result = await apiCall(`/api/admin/noi-thuc-hien/${id}`, 'PUT', { ten_noi_thuc_hien: document.getElementById('editTenNoiThucHienInput').value });
    if (result.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('editNoiThucHienModal'));
        if (modal) modal.hide();
        loadNoiThucHienList();
    } else alert(result.message);
}

// ==================== TAB 7: QUẢN LÝ MỐI QUAN HỆ ====================
async function loadMoiQuanHeList() {
    const tbody = document.getElementById('moiQuanHeTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Đang tải dữ liệu...</td></tr>';

    const data = await apiCall('/api/danh-sach-quan-he');
    if (!Array.isArray(data)) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Không thể tải dữ liệu.</td></tr>';
        return;
    }

    const activeData = data.filter(item => item.trang_thai === 1);
    if (activeData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Chưa có dữ liệu mối quan hệ.</td></tr>';
        return;
    }

    tbody.innerHTML = activeData.map((item, index) => `
        <tr>
            <td class="text-center">${index + 1}</td>
            <td>${item.ten_quan_he}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditMoiQuanHe(${item.id}, '${item.ten_quan_he}')"><i class="fa-solid fa-pen"></i> Sửa</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteMoiQuanHe(${item.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
            </td>
        </tr>
    `).join('');
}

async function saveMoiQuanHe(event) {
    event.preventDefault();
    const tenQuanHe = document.getElementById('tenMoiQuanHeInput').value.trim();
    const res = await apiCall('/api/danh-sach-quan-he', 'POST', { ten_quan_he: tenQuanHe });
    if (res.success) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('moiQuanHeModal'));
        if (modal) modal.hide();
        document.getElementById('tenMoiQuanHeInput').value = '';
        loadMoiQuanHeList();
        alert('Thêm mối quan hệ thành công!');
    } else alert(res.message || 'Có lỗi xảy ra.');
}

async function openEditMoiQuanHe(id, currentName) {
    let newName = prompt("Cập nhật tên mối quan hệ:", currentName);
    if (newName === null) return;
    newName = newName.trim();
    if (!newName) return alert("Tên mối quan hệ không được để trống!");

    const res = await apiCall(`/api/danh-sach-quan-he/${id}`, 'PUT', { ten_quan_he: newName });
    if (res.success) {
        loadMoiQuanHeList();
        alert('Cập nhật thành công!');
    } else alert(res.message || 'Có lỗi xảy ra.');
}

async function deleteMoiQuanHe(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa mối quan hệ này không?')) return;
    const res = await apiCall(`/api/danh-sach-quan-he/${id}`, 'DELETE');
    if (res.success) {
        loadMoiQuanHeList();
        alert('Xóa thành công!');
    } else alert(res.message || 'Có lỗi xảy ra.');
}

// ==================== TAB: QUẢN LÝ TỪ ĐIỂN TÊN TIẾNG VIỆT ====================
const vietnameseNameMapRecords = {};

function resetVietnameseNameMapForm() {
    document.getElementById('nameMapModalTitle').innerText = 'Thêm ánh xạ tên';
    document.getElementById('nameMapId').value = '';
    document.getElementById('nameMapKey').value = '';
    document.getElementById('nameMapValue').value = '';
    document.getElementById('nameMapType').value = 'word';
}

async function loadVietnameseNameMapList() {
    const tbody = document.getElementById('nameMapTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Đang tải dữ liệu...</td></tr>';
    const list = await apiCall('/api/admin/vietnamese-name-map');

    if (!Array.isArray(list) || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">${Array.isArray(list) ? 'Chưa có dữ liệu.' : 'Lỗi tải dữ liệu.'}</td></tr>`;
        return;
    }

    Object.keys(vietnameseNameMapRecords).forEach(k => delete vietnameseNameMapRecords[k]);

    tbody.innerHTML = list.map((item, idx) => {
        vietnameseNameMapRecords[item.id] = item;
        const typeLabel = item.loai === 'fullname'
            ? '<span class="badge bg-success">Cả họ tên</span>'
            : '<span class="badge bg-secondary">Một từ</span>';

        return `<tr>
            <td class="text-center">${idx + 1}</td>
            <td><code>${escapeHtml(item.tu_khoa)}</code></td>
            <td><b>${escapeHtml(item.ten_hien_thi)}</b></td>
            <td class="text-center">${typeLabel}</td>
            <td class="text-center text-nowrap">
                <button class="btn btn-sm btn-warning me-1" onclick="openEditVietnameseNameMap(${item.id})" title="Sửa">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteVietnameseNameMap(${item.id})" title="Xóa">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
}

function openEditVietnameseNameMap(id) {
    const item = vietnameseNameMapRecords[id];
    if (!item) return;

    document.getElementById('nameMapModalTitle').innerText = 'Chỉnh sửa ánh xạ tên';
    document.getElementById('nameMapId').value = item.id;
    document.getElementById('nameMapKey').value = item.tu_khoa;
    document.getElementById('nameMapValue').value = item.ten_hien_thi;
    document.getElementById('nameMapType').value = item.loai;

    new bootstrap.Modal(document.getElementById('nameMapModal')).show();
}

async function saveVietnameseNameMap(event) {
    event.preventDefault();

    const id = document.getElementById('nameMapId').value;
    const body = {
        tu_khoa: document.getElementById('nameMapKey').value.trim(),
        ten_hien_thi: document.getElementById('nameMapValue').value.trim(),
        loai: document.getElementById('nameMapType').value
    };

    const result = await apiCall(
        id ? `/api/admin/vietnamese-name-map/${id}` : '/api/admin/vietnamese-name-map',
        id ? 'PUT' : 'POST',
        body
    );

    if (!result.success) {
        alert(result.message || 'Không thể lưu ánh xạ tên.');
        return;
    }

    const modal = bootstrap.Modal.getInstance(document.getElementById('nameMapModal'));
    if (modal) modal.hide();

    loadVietnameseNameMapList();

    // Nếu trang nhập liệu đang mở ở tab khác, formatter sẽ tự tải lại khi trang được tải lại.
    alert(result.message || 'Đã lưu ánh xạ tên.');
}

async function deleteVietnameseNameMap(id) {
    const item = vietnameseNameMapRecords[id];
    if (!item) return;

    if (!confirm(`Xóa ánh xạ "${item.tu_khoa}" → "${item.ten_hien_thi}"?`)) return;

    const result = await apiCall(`/api/admin/vietnamese-name-map/${id}`, 'DELETE');
    if (result.success) {
        loadVietnameseNameMapList();
        alert(result.message || 'Đã xóa ánh xạ.');
    } else {
        alert(result.message || 'Không thể xóa ánh xạ.');
    }
}

// ==================== ĐĂNG XUẤT ====================
function logout() {
    apiCall('/api/logout', 'POST').then(() => window.location.href = 'index.html');
}