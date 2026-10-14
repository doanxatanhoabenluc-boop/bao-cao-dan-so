let currentPage = 1;
let currentSearch = '';
let currentAp = '';
let currentDiabanh = '';
let currentBptt = '';
let currentUser = null;
let reportCurrentPage = 1;
let bpttDictionary = {
    "0": "Không sử dụng", "1": "Đặt vòng", "1/1": "Thay vòng", "2": "Triệt sản nam",
    "3": "Triệt sản nữ", "4": "Bao cao su", "5": "Thuốc viên", "6": "Thuốc tiêm",
    "7": "Thuốc cấy", "7/7": "Thay que cấy", "8": "Biện pháp khác", "19": "Mã BPTT 19",
    "79": "Mã BPTT 79", "S": "Vừa sinh con / Mang thai", "T": "Biện pháp T"
};
const pageSize = 50;

document.addEventListener("DOMContentLoaded", async () => {
    await checkUserInfo();
    loadBpttCatalog();
    // Nạp riêng danh mục dùng trong cửa sổ "Quản lý Nhân khẩu & BPTT".
    // Trước đây hai hàm này đã được khai báo nhưng chưa được gọi.
    await Promise.all([
        loadDanhMucBPTT(),
        loadDanhMucNoiThucHien()
    ]);
    loadData(1);
});

async function checkUserInfo() {
    try {
        let res = await fetch('/api/me').then(r => r.json());
        if (res && res.username) {
            currentUser = res;
            let isAdminOrLeader = ['admin', 'lãnh đạo'].includes(String(currentUser.role || '').toLowerCase());
            
            if (isAdminOrLeader) {
                loadApCatalog();
                loadDiaBanhCatalog('');
            } else {
                let apSelect = document.getElementById('apFilterSelect');
                apSelect.innerHTML = `<option value="${currentUser.ap}">${currentUser.ap}</option>`;
                apSelect.disabled = true;
                currentAp = currentUser.ap;

                if (currentUser.diabanh && currentUser.diabanh !== '00' && currentUser.diabanh !== 'Toàn xã') {
                    let dbSelect = document.getElementById('diabanhFilterSelect');
                    dbSelect.innerHTML = `<option value="${currentUser.diabanh}">Địa bàn ${currentUser.diabanh}</option>`;
                    dbSelect.disabled = true;
                    currentDiabanh = currentUser.diabanh;
                } else {
                    loadDiaBanhCatalog(currentUser.ap);
                }

                document.getElementById('tableTitle').textContent = `Danh sách Phụ nữ 15-49 (${currentUser.ap} ${currentUser.diabanh !== '00' ? '- ĐB ' + currentUser.diabanh : ''})`;
            }
        }
    } catch (e) {
        console.error("Lỗi lấy thông tin user:", e);
    }
}

async function loadApCatalog() {
    try {
        let res = await fetch('/api/danh-sach-ap').then(r => r.json());
        let select = document.getElementById('apFilterSelect');
        if (Array.isArray(res)) {
            res.forEach(item => {
                select.innerHTML += `<option value="${item.ten_ap}">${item.ten_ap}</option>`;
            });
        }
    } catch (e) {
        console.error("Lỗi tải danh sách Ấp:", e);
    }
}

async function loadDiaBanhCatalog(apName) {
    try {
        let res = await fetch(`/api/admin/danh-sach-dia-ban-by-ap?ap=${encodeURIComponent(apName)}`).then(r => r.json());
        let select = document.getElementById('diabanhFilterSelect');
        select.innerHTML = `<option value="">-- Tất cả Địa bàn --</option>`;
        if (res.success && Array.isArray(res.data)) {
            res.data.forEach(db => {
                select.innerHTML += `<option value="${db}">Địa bàn ${db}</option>`;
            });
        }
    } catch (e) {
        console.error("Lỗi tải mã Địa bàn:", e);
    }
}

function onApChange() {
    let apVal = document.getElementById('apFilterSelect').value;
    currentAp = apVal;
    currentDiabanh = '';
    loadDiaBanhCatalog(apVal);
    doSearch();
}

async function loadBpttCatalog() {
    try {
        let res = await fetch('/api/danh-sach-bptt').then(r => r.json());
        let select = document.getElementById('bpttFilterSelect');
        if (Array.isArray(res)) {
            res.forEach(item => { bpttDictionary[item.ma_bptt] = item.ten_bptt; });
        }
        Object.keys(bpttDictionary).forEach(key => {
            select.innerHTML += `<option value="${key}">[Mã ${key}] ${bpttDictionary[key]}</option>`;
        });
    } catch (e) {
        console.error("Lỗi tải danh mục BPTT:", e);
    }
}

/* --- XỬ LÝ TAB & BÁO CÁO 12 THÁNG (A4 - 16 NGƯỜI) --- */
async function switchTab(tab) {
    const listSec = document.getElementById('listSection');
    const reportSec = document.getElementById('reportSection');
    const bienDongSec = document.getElementById('bienDongPane');
    const buttons = {
        list: document.getElementById('tabListBtn'),
        report: document.getElementById('tabReportBtn'),
        bienDong: document.getElementById('tabBienDong')
    };

    // Dùng chung một cơ chế chuyển tab; tránh trộn tab Bootstrap với tab tự viết.
    if (listSec) listSec.style.display = tab === 'list' ? 'block' : 'none';
    if (reportSec) reportSec.style.display = tab === 'report' ? 'block' : 'none';
    if (bienDongSec) bienDongSec.style.display = tab === 'bienDong' ? 'block' : 'none';
    Object.entries(buttons).forEach(([key, button]) => {
        if (button) button.classList.toggle('active', key === tab);
    });

    if (tab === 'report') {
        const isAdminOrLeader = currentUser && ['admin', 'lãnh đạo'].includes(String(currentUser.role || '').trim().toLowerCase());
        if (isAdminOrLeader) {
            await loadReportApCatalog();
            const apSelect = document.getElementById('reportApSelect');
            if (apSelect) apSelect.value = '';
            await loadReportDiabanhCatalog('');
        } else {
            const apContainer = document.getElementById('reportApContainer');
            const dbContainer = document.getElementById('reportDiabanhContainer');
            if (apContainer) apContainer.style.display = 'none';
            if (dbContainer) dbContainer.style.display = 'none';
            await loadReportDiabanhCatalog('');
        }
        loadReportData(1);
    } else if (tab === 'bienDong') {
        // Chỉ tạo biểu đồ khi canvas đã hiện để Chart.js lấy đúng kích thước.
        await loadBienDong();
        if (bdChartDiaBan) bdChartDiaBan.resize();
        if (bdChartLoai) bdChartLoai.resize();
    }
}

async function loadReportApCatalog() {
    try {
        let res = await fetch('/api/danh-sach-ap').then(r => r.json());
        let select = document.getElementById('reportApSelect');
        select.innerHTML = `<option value="">-- Tất cả các Ấp --</option>`;
        if (Array.isArray(res)) {
            res.forEach(item => {
                select.innerHTML += `<option value="${item.ten_ap}">${item.ten_ap}</option>`;
            });
        }
    } catch (e) {
        console.error("Lỗi tải ấp báo cáo:", e);
    }
}

async function loadReportDiabanhCatalog(apName) {
    try {
        let select = document.getElementById('reportDiabanhSelect');
        select.innerHTML = `<option value="">-- Tất cả Địa bàn --</option>`;

        let url = apName ? `/api/admin/danh-sach-dia-ban-by-ap?ap=${encodeURIComponent(apName)}` : `/api/admin/danh-sach-dia-ban-by-ap?ap=`;
        let res = await fetch(url).then(r => r.json());
        
        // Nếu API trên lấy theo ấp truyền rỗng không trả về hết, ta gọi API lấy tất cả địa bàn
        if (!res.success || !res.data || res.data.length === 0) {
            let allDbRes = await fetch('/api/admin/danh-sach-dia-ban-by-ap?ap=').then(r => r.json());
            if (allDbRes.success) res = allDbRes;
        }

        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            res.data.forEach(db => {
                select.innerHTML += `<option value="${db}">Địa bàn ${db}</option>`;
            });
            // TỰ ĐỘNG CHỌN NGAY ĐỊA BÀN ĐẦU TIÊN TRONG DANH SÁCH (VD: 101) ĐỂ LOAD NHANH
            select.value = res.data[0];
        }
    } catch (e) {
        console.error("Lỗi tải địa bàn báo cáo:", e);
    }
}

async function onReportApChange() {
    let apVal = document.getElementById('reportApSelect').value;
    await loadReportDiabanhCatalog(apVal);
    loadReportData(1);
}

async function loadReportData(page = 1) {
    reportCurrentPage = page;
    let year = document.getElementById('reportYear').value;
    document.getElementById('lblReportYear').textContent = year;
    
    let isAdminOrLeader = currentUser && ['admin', 'lãnh đạo'].includes(String(currentUser.role || '').toLowerCase());
    let ap = isAdminOrLeader ? document.getElementById('reportApSelect').value : currentUser.ap;
    let db = isAdminOrLeader ? document.getElementById('reportDiabanhSelect').value : currentUser.diabanh;

    let url = `/api/bao-cao-bptt-12-thang?year=${year}&page=${page}`;
    if (ap) url += `&ap=${encodeURIComponent(ap)}`;
    if (db && db !== '00') url += `&diabanh=${encodeURIComponent(db)}`;

    let tbody = document.getElementById('tblReportBody');
    tbody.innerHTML = `<tr><td colspan="18" class="text-center text-muted">Đang tải dữ liệu...</td></tr>`;

    try {
        let res = await fetch(url).then(r => r.json());
        if (res.success) {
            tbody.innerHTML = "";
            if (!res.data || res.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="18" class="text-center text-muted">Không có dữ liệu báo cáo.</td></tr>`;
                renderReportPagination(1, 1, 0);
                return;
            }

            res.data.forEach((item) => {
                tbody.innerHTML += `
                    <tr>
                        <td class="fw-bold">${item.ma_ho}</td>
                        <td class="text-left fw-bold">${item.ho_ten}</td>
                        <td>${item.ngay_sinh || ''}</td>
                        <td>${item.so_con || ''}</td>
                        <td>${item.nam_sinh_con || ''}</td>
                        <td>${item.t1 || ''}</td>
                        <td>${item.t2 || ''}</td>
                        <td>${item.t3 || ''}</td>
                        <td>${item.t4 || ''}</td>
                        <td>${item.t5 || ''}</td>
                        <td>${item.t6 || ''}</td>
                        <td>${item.t7 || ''}</td>
                        <td>${item.t8 || ''}</td>
                        <td>${item.t9 || ''}</td>
                        <td>${item.t10 || ''}</td>
                        <td>${item.t11 || ''}</td>
                        <td>${item.t12 || ''}</td>
                        <td>${item.ghi_chu || ''}</td>
                    </tr>
                `;
            });

            // Đệm đủ 16 dòng cho 1 trang A4
            let emptyRowsCount = 16 - res.data.length;
            for (let i = 0; i < emptyRowsCount; i++) {
                tbody.innerHTML += `
                    <tr>
                        <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                        <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                        <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                        <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                    </tr>
                `;
            }

            renderReportPagination(res.currentPage, res.totalPages, res.totalRows);
        }
    } catch (err) {
        console.error("Lỗi tải báo cáo:", err);
        tbody.innerHTML = `<tr><td colspan="18" class="text-center text-danger">Lỗi kết nối tải báo cáo.</td></tr>`;
    }
}

function renderReportPagination(page, totalPages, totalRows) {
    document.getElementById('reportPageInfo').textContent = `Trang A4 số ${page} / ${totalPages || 1} (Tổng số: ${totalRows} phụ nữ)`;

    let nav = document.getElementById('reportPaginationNav');
    nav.innerHTML = '';
    if (totalPages <= 1) return;

    nav.innerHTML += `
        <li class="page-item ${page === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="loadReportData(${page - 1})">Trước</button>
        </li>
    `;

    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, page + 2);

    for (let i = start; i <= end; i++) {
        nav.innerHTML += `
            <li class="page-item ${i === page ? 'active' : ''}">
                <button class="page-link" onclick="loadReportData(${i})">Trang ${i}</button>
            </li>
        `;
    }

    nav.innerHTML += `
        <li class="page-item ${page === totalPages ? 'disabled' : ''}">
            <button class="page-link" onclick="loadReportData(${page + 1})">Sau</button>
        </li>
    `;
}
/* ----------------------------------------------------- */

async function loadData(page = 1) {
    currentPage = page;
    let url = `/api/admin/phu-nu-15-49-list?page=${currentPage}&limit=${pageSize}`;
    if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
    if (currentAp) url += `&ap=${encodeURIComponent(currentAp)}`;
    if (currentDiabanh) url += `&diabanh=${encodeURIComponent(currentDiabanh)}`;
    if (currentBptt) url += `&bptt=${encodeURIComponent(currentBptt)}`;

    try {
        let res = await fetch(url).then(r => r.json());
        if (res.success) {
            renderTable(res.data);
            renderPagination(res.currentPage, res.totalPages, res.totalRows);
        }
    } catch (err) {
        console.error("Lỗi tải dữ liệu:", err);
    }
}

function renderTable(data) {
    let tbody = document.getElementById('tblPhuNuBody');
    tbody.innerHTML = "";

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Không tìm thấy dữ liệu phù hợp.</td></tr>`;
        return;
    }

    data.forEach(item => {
        let bpttBadge = `<span class="badge bg-secondary">Không dùng / Trống</span>`;
        if (item.current_bptt && item.current_bptt !== '0') {
            let tenBptt = bpttDictionary[item.current_bptt] || `Mã ${item.current_bptt}`;
            bpttBadge = `<span class="badge bg-success" title="${tenBptt}">Mã: ${item.current_bptt}</span> <small class="text-muted">${tenBptt}</small>`;
        }

        tbody.innerHTML += `
            <tr>
                <td class="text-center">${item.ma_ho}</td>
                <td class="fw-bold">${item.ho_ten}</td>
                <td class="text-center">${item.ngay_sinh || ''}</td>
                <td>${item.diabanh}</td>
                <td class="text-center">${item.so_con}</td>
                <td class="text-center">${item.nam_sinh_con || ''}</td>
                <td class="text-center">${item.so_the_bhyt || ''}</td>
                <td class="text-center">${bpttBadge}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning mb-1" onclick='openEditModal(${JSON.stringify(item)})'>Sửa & Lịch sử</button>
                    <button class="btn btn-sm btn-danger mb-1" onclick='deletePhuNu("${item.ma_dinh_danh}")'>Xóa</button>
                </td>
            </tr>
        `;
    });
}

function renderPagination(page, totalPages, totalRows) {
    document.getElementById('totalInfo').textContent = `Tổng số: ${totalRows} hồ sơ`;
    document.getElementById('pageInfo').textContent = `Trang ${page} / ${totalPages || 1}`;

    let paginationNav = document.getElementById('paginationNav');
    paginationNav.innerHTML = '';

    if (totalPages <= 1) return;

    paginationNav.innerHTML += `
        <li class="page-item ${page === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="loadData(${page - 1})">Trước</button>
        </li>
    `;

    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, page + 2);

    for (let i = startPage; i <= endPage; i++) {
        paginationNav.innerHTML += `
            <li class="page-item ${i === page ? 'active' : ''}">
                <button class="page-link" onclick="loadData(${i})">${i}</button>
            </li>
        `;
    }

    paginationNav.innerHTML += `
        <li class="page-item ${page === totalPages ? 'disabled' : ''}">
            <button class="page-link" onclick="loadData(${page + 1})">Sau</button>
        </li>
    `;
}

function doSearch() {
    currentSearch = document.getElementById('searchInput').value.trim();
    let apEl = document.getElementById('apFilterSelect');
    currentAp = apEl ? apEl.value : '';
    let dbEl = document.getElementById('diabanhFilterSelect');
    currentDiabanh = dbEl ? dbEl.value : '';
    currentBptt = document.getElementById('bpttFilterSelect').value;
    loadData(1);
}

function resetSearch() {
    document.getElementById('searchInput').value = '';
    if (currentUser && ['admin', 'lãnh đạo'].includes(String(currentUser.role || '').toLowerCase())) {
        document.getElementById('apFilterSelect').value = '';
        document.getElementById('diabanhFilterSelect').value = '';
        currentAp = '';
        currentDiabanh = '';
        loadDiaBanhCatalog('');
    }
    document.getElementById('bpttFilterSelect').value = '';
    currentSearch = '';
    currentBptt = '';
    loadData(1);
}

function handleSearchKeyup(e) {
    if (e.key === 'Enter') doSearch();
}
function exportExcelReport() {
    let year = document.getElementById('reportYear').value;
    let tenTieuDe = `THEO DÕI PHỤ NỮ ĐỘ TUỔI 15-49 CÓ CHỒNG`;
    let tieuDeThoiGian = `Năm: ${year}`;
    
    // Lấy nguyên bảng báo cáo 12 tháng theo class chuẩn trên giao diện
    let table = document.querySelector('.report-table');
    if (!table) {
        alert("Không tìm thấy dữ liệu bảng báo cáo để xuất!");
        return;
    }

    let htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <style>
                table { border-collapse: collapse; width: 100%; font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
                th, td { border: 0.5pt solid #000000; padding: 5px; vertical-align: middle; text-align: center; }
                th { background-color: #f2f2f2; font-weight: bold; }
                .title { font-size: 14pt; font-weight: bold; text-align: center; border: none; }
                .year-label { font-size: 12pt; font-weight: bold; text-align: right; border: none; }
                .text-left { text-align: left !important; padding-left: 6px !important; }
            </style>
        </head>
        <body>
            <table>
                <tr><td colspan="18" class="title">${tenTieuDe}</td></tr>
                <tr><td colspan="18" class="year-label">${tieuDeThoiGian}</td></tr>
                <tr><td colspan="18" style="border:none;"></td></tr>
            </table>
            ${table.outerHTML}
            <br><br>
            <table>
                <tr>
                    <td colspan="5" style="border:none; text-align:left;"><b>N2:</b> Nạo hút thai do không sử dụng BPTT</td>
                    <td colspan="6" style="border:none; text-align:left;"><b>1:</b> Đặt vòng<br><b>1/1:</b> Thay vòng<br><b>2:</b> Triệt sản nam<br><b>3:</b> Triệt sản nữ<br><b>4:</b> Bao cao su</td>
                    <td colspan="7" style="border:none; text-align:left;"><b>5:</b> Thuốc viên<br><b>6:</b> Thuốc tiêm<br><b>7:</b> Thuốc cấy<br><b>7/7:</b> Thay que cấy<br><b>8:</b> Biện pháp khác</td>
                </tr>
                <tr>
                    <td colspan="5" style="border:none; text-align:left;"><b>TS1:</b> Sàng lọc trước sinh lần 1</td>
                    <td colspan="13" style="border:none;"></td>
                </tr>
                <tr>
                    <td colspan="5" style="border:none; text-align:left;"><b>TS2:</b> Sàng lọc trước sinh lần 2</td>
                    <td colspan="13" style="border:none;"></td>
                </tr>
            </table>
        </body>
        </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `So_Theo_Doi_15_49_${year}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
let currentMaDinhDanh = '';
async function openEditModal(item) {
    currentMaDinhDanh = item.ma_dinh_danh;
    document.getElementById('editMaDinhDanh').value = item.ma_dinh_danh;
    document.getElementById('editHoTen').value = item.ho_ten;
    document.getElementById('editMaHo').value = item.ma_ho;
    document.getElementById('editNgaySinh').value = item.ngay_sinh || '';
    document.getElementById('editSoCon').value = item.so_con;
    document.getElementById('editNamSinhCon').value = item.nam_sinh_con || '';

    await loadHistory(item.ma_dinh_danh);
    new bootstrap.Modal(document.getElementById('editModal')).show();
}

async function loadHistory(maDinhDanh) {
    const tbody = document.getElementById('tblHistoryBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Đang tải lịch sử BPTT...</td></tr>';

    try {
        const response = await fetch(
            `/api/admin/quan-ly-lich-su-bptt?ma_dinh_danh=${encodeURIComponent(maDinhDanh)}`
        );
        const res = await response.json();
        if (!response.ok || !res.success) {
            throw new Error(res.message || 'Không tải được lịch sử BPTT.');
        }

        const rows = Array.isArray(res.data) ? res.data : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Chưa có mốc lịch sử BPTT nào.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        rows.forEach(h => {
            const tr = document.createElement('tr');
            [h.ma_bptt, h.ngay_ap_dung, h.noi_thuc_hien || ''].forEach(value => {
                const td = document.createElement('td');
                td.textContent = value == null ? '' : String(value);
                tr.appendChild(td);
            });
            const action = document.createElement('td');
            action.className = 'text-center text-nowrap';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn btn-sm btn-outline-primary py-0 px-2 me-1';
            edit.textContent = 'Sửa';
            edit.addEventListener('click', () => editHistory(h.id, h.ma_bptt, h.ngay_ap_dung, h.noi_thuc_hien));
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn btn-sm btn-outline-danger py-0 px-2';
            del.textContent = 'Xóa';
            del.addEventListener('click', () => deleteHistory(h.id));
            action.append(edit, del);
            tr.appendChild(action);
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Lỗi tải lịch sử BPTT:', err);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">${escapeHtmlBienDong(err.message || 'Không tải được lịch sử BPTT.')}</td></tr>`;
    }
}

async function savePhuNu() {
    let data = {
        ho_ten: document.getElementById('editHoTen').value,
        ma_ho: document.getElementById('editMaHo').value,
        diabanh: "101, Xã Lương Hòa",
        ngay_sinh: document.getElementById('editNgaySinh').value,
        so_con: document.getElementById('editSoCon').value,
        nam_sinh_con: document.getElementById('editNamSinhCon').value
    };

    let res = await fetch(`/api/admin/quan-ly-phu-nu/${currentMaDinhDanh}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).then(r => r.json());

    alert(res.message);
    if (res.success) {
        bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
        loadData(currentPage);
    }
}

async function addHistory() {
    const data = {
        ma_dinh_danh: currentMaDinhDanh,
        ma_bptt: document.getElementById('newMaBptt')?.value || '',
        ngay_ap_dung: document.getElementById('newNgayApDung')?.value || '',
        noi_thuc_hien: document.getElementById('newNoiThucHien')?.value || ''
    };

    if (!data.ma_dinh_danh || !data.ma_bptt || !data.ngay_ap_dung) {
        alert('Vui lòng chọn Mã BPTT và nhập Ngày áp dụng.');
        return;
    }

    try {
        const response = await fetch('/api/admin/quan-ly-lich-su-bptt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const res = await response.json();
        if (!response.ok || !res.success) {
            alert(res.message || 'Không thể thêm lịch sử BPTT.');
            return;
        }

        alert(res.message || 'Đã thêm lịch sử BPTT.');
        document.getElementById('newMaBptt').value = '';
        document.getElementById('newNgayApDung').value = '';
        document.getElementById('newNoiThucHien').value = '';
        await loadHistory(currentMaDinhDanh);
        await loadData(currentPage);
        if (typeof loadBienDong === 'function') await loadBienDong();
    } catch (err) {
        console.error('Lỗi thêm lịch sử BPTT:', err);
        alert('Lỗi kết nối khi thêm lịch sử BPTT.');
    }
}

async function editHistory(id, maBpttCu, ngayCu, noiCu) {
    const ma_bptt = prompt('Nhập mã BPTT:', maBpttCu || '');
    if (ma_bptt === null) return;
    const ngay_ap_dung = prompt('Nhập ngày áp dụng (YYYY-MM-DD):', ngayCu || '');
    if (ngay_ap_dung === null) return;
    const noi_thuc_hien = prompt('Nhập nơi thực hiện:', noiCu || '');
    if (noi_thuc_hien === null) return;
    if (!ma_bptt.trim() || !ngay_ap_dung.trim()) {
        alert('Mã BPTT và ngày áp dụng không được để trống.');
        return;
    }
    try {
        const response = await fetch(`/api/admin/quan-ly-lich-su-bptt/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ma_bptt: ma_bptt.trim(), ngay_ap_dung: ngay_ap_dung.trim(), noi_thuc_hien: noi_thuc_hien.trim() })
        });
        const result = await response.json();
        alert(result.message || (response.ok ? 'Đã cập nhật lịch sử.' : 'Không thể sửa lịch sử.'));
        if (response.ok && result.success) {
            await loadHistory(currentMaDinhDanh);
            await loadData(currentPage);
        }
    } catch (err) {
        console.error('Lỗi sửa lịch sử BPTT:', err);
        alert('Lỗi kết nối khi sửa lịch sử BPTT.');
    }
}

async function deleteHistory(id) {
    if (!confirm("Bạn có chắc muốn xóa mốc lịch sử này?")) return;
    try {
        const response = await fetch(`/api/admin/quan-ly-lich-su-bptt/${id}`, { method: 'DELETE' });
        const res = await response.json();
        alert(res.message || (response.ok ? 'Đã xóa lịch sử.' : 'Không thể xóa lịch sử.'));
        if (response.ok && res.success) {
            await loadHistory(currentMaDinhDanh);
            await loadData(currentPage);
            if (typeof loadBienDong === 'function') await loadBienDong();
        }
    } catch (err) {
        console.error('Lỗi xóa lịch sử BPTT:', err);
        alert('Lỗi kết nối khi xóa lịch sử BPTT.');
    }
}

async function deletePhuNu(maDinhDanh) {
    if (!confirm("Cảnh báo: Xóa hồ sơ này sẽ đồng thời xóa toàn bộ lịch sử BPTT liên quan. Bạn có chắc chắn?")) return;
    let res = await fetch(`/api/admin/quan-ly-phu-nu/${maDinhDanh}`, { method: 'DELETE' }).then(r => r.json());
    alert(res.message);
    if (res.success) loadData(currentPage);
}

async function openPreviewSyncModal() {
    let tbody = document.getElementById('tblPreviewBody');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Đang phân tích dữ liệu đối chiếu từ Bảng 1...</td></tr>`;
    
    new bootstrap.Modal(document.getElementById('previewSyncModal')).show();

    try {
        let res = await fetch('/api/admin/preview-sync-nam-sinh-con').then(r => r.json());
        if (res.success) {
            tbody.innerHTML = "";
            if (res.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Không có dữ liệu thay đổi nào mới cần cập nhật.</td></tr>`;
                return;
            }

            res.data.forEach(item => {
                let bpttText = `<span class="badge bg-secondary">${item.bptt_cu}</span> ➔ <span class="badge bg-success">S</span>`;
                tbody.innerHTML += `
                    <tr>
                        <td class="text-center fw-bold">${item.ma_ho}</td>
                        <td>${item.ho_ten}</td>
                        <td>${item.diabanh}</td>
                        <td class="text-center">
                            <span class="text-danger">${item.so_con_cu || 0}</span> ➔ <span class="text-success fw-bold">${item.so_con_moi}</span>
                        </td>
                        <td class="text-center">
                            <span class="text-danger">${item.nam_sinh_con_cu || '(Trống)'}</span> ➔ <span class="text-success fw-bold">${item.nam_sinh_con_moi || '(Trống)'}</span>
                        </td>
                        <td class="text-center">${bpttText}</td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Lỗi tải dữ liệu xem trước.</td></tr>`;
        }
    } catch (e) {
        console.error("Lỗi preview:", e);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Đã xảy ra lỗi kết nối.</td></tr>`;
    }
}
async function loadDanhMucBPTT() {
    const select = document.getElementById('newMaBptt');
    if (!select) return;

    try {
        const res = await fetch('/api/admin/danh-muc-bptt');
        const json = await res.json();

        if (!res.ok || !json.success) {
            throw new Error(json.message || 'Không tải được BPTT');
        }

        select.innerHTML =
            '<option value="">-- Chọn BPTT --</option>';

        json.data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.ma_bptt;
            option.textContent =
                `${item.ma_bptt} - ${item.ten_bptt}`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error(err);
        alert('Không tải được danh mục BPTT.');
    }
}

async function loadDanhMucNoiThucHien() {
    const select = document.getElementById('newNoiThucHien');
    if (!select) return;

    try {
        const res = await fetch(
            '/api/admin/danh-muc-noi-thuc-hien'
        );
        const json = await res.json();

        if (!res.ok || !json.success) {
            throw new Error(
                json.message || 'Không tải được nơi thực hiện'
            );
        }

        select.innerHTML =
            '<option value="">-- Chọn nơi thực hiện --</option>';

        json.data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.ten_noi_thuc_hien;
            option.textContent = item.ten_noi_thuc_hien;
            select.appendChild(option);
        });
    } catch (err) {
        console.error(err);
        alert('Không tải được danh mục nơi thực hiện.');
    }
}
let bdChartDiaBan = null;
let bdChartLoai = null;

async function loadBienDong() {
    await loadThongKeBienDong();
    await loadChiTietBienDong();
}

async function loadThongKeBienDong() {
    try {
        const response = await fetch('/api/admin/bien-dong-phu-nu/thong-ke');
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.message || 'Không tải được thống kê');

        const rows = json.data || [];
        const inputDiaBan = document.getElementById('bdDiaBan');
        const diaBanFilter = (inputDiaBan?.value || '').trim().toLocaleLowerCase('vi');
        const loaiFilter = (document.getElementById('bdLoai')?.value || '').trim();
        const isAdminOrLeader = currentUser && ['admin', 'lãnh đạo'].includes(String(currentUser.role || '').trim().toLowerCase());
        const phamVi = document.getElementById('bdPhamViThongKe');
        if (phamVi) {
            if (isAdminOrLeader) {
                phamVi.textContent = diaBanFilter
                    ? `Phạm vi thống kê: toàn xã, đang lọc địa bàn có tên chứa “${inputDiaBan.value.trim()}”.`
                    : 'Phạm vi thống kê: toàn xã, tổng hợp tất cả ấp/địa bàn.';
            } else {
                const ap = currentUser?.ap || '';
                const db = currentUser?.diabanh || '';
                phamVi.textContent = `Phạm vi thống kê: địa bàn được phân quyền${ap ? ' (' + ap + ')' : ''}${db && db !== '00' && db !== 'Toàn xã' ? ' – ' + db : ''}.`;
            }
        }

        const filtered = rows.filter(row => {
            const db = String(row.dia_ban || '').toLocaleLowerCase('vi');
            return db.includes(diaBanFilter) && (!loaiFilter || row.loai_bien_dong === loaiFilter);
        });
        const tongHop = {};
        filtered.forEach(row => {
            const db = row.dia_ban || 'Chưa xác định';
            if (!tongHop[db]) tongHop[db] = { them: 0, xoa: 0 };
            const n = Number(row.so_luong) || 0;
            if (row.loai_bien_dong === 'THEM_MOI') tongHop[db].them += n;
            else if (row.loai_bien_dong === 'XOA_BO') tongHop[db].xoa += n;
        });
        const diaBans = Object.keys(tongHop).sort((a, b) => a.localeCompare(b, 'vi'));
        const themMoi = diaBans.map(db => tongHop[db].them);
        const xoaBo = diaBans.map(db => tongHop[db].xoa);
        const tongThem = themMoi.reduce((a, b) => a + b, 0);
        const tongXoa = xoaBo.reduce((a, b) => a + b, 0);
        const tongLuot = tongThem + tongXoa;
        const chenhLech = tongThem - tongXoa;
        const fmt = n => Number(n || 0).toLocaleString('vi-VN');
        const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = fmt(value); };
        setText('bdTongLuot', tongLuot);
        setText('bdTongThemMoi', tongThem);
        setText('bdTongXoaBo', tongXoa);
        setText('bdChenhLech', chenhLech > 0 ? '+' + fmt(chenhLech) : fmt(chenhLech));

        const tbody = document.getElementById('bdTongHopBody');
        if (tbody) {
            if (!diaBans.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Không có dữ liệu biến động theo bộ lọc đã chọn.</td></tr>';
            } else {
                tbody.innerHTML = diaBans.map(db => {
                    const them = tongHop[db].them, xoa = tongHop[db].xoa;
                    const tong = them + xoa, lech = them - xoa;
                    return `<tr><td class="fw-semibold">${escapeHtmlBienDong(db)}</td><td class="text-end text-success fw-semibold">${fmt(them)}</td><td class="text-end text-danger fw-semibold">${fmt(xoa)}</td><td class="text-end fw-bold">${fmt(tong)}</td><td class="text-end ${lech > 0 ? 'text-success' : lech < 0 ? 'text-danger' : ''}">${lech > 0 ? '+' : ''}${fmt(lech)}</td></tr>`;
                }).join('') + `<tr class="table-light fw-bold"><td>TỔNG CỘNG</td><td class="text-end text-success">${fmt(tongThem)}</td><td class="text-end text-danger">${fmt(tongXoa)}</td><td class="text-end">${fmt(tongLuot)}</td><td class="text-end">${chenhLech > 0 ? '+' : ''}${fmt(chenhLech)}</td></tr>`;
            }
        }

        if (bdChartDiaBan) bdChartDiaBan.destroy();
        if (bdChartLoai) bdChartLoai.destroy();
        const canvasDiaBan = document.getElementById('bdChartDiaBan');
        const canvasLoai = document.getElementById('bdChartLoai');
        if (!window.Chart || !canvasDiaBan || !canvasLoai) throw new Error('Thiếu Chart.js hoặc phần tử biểu đồ.');

        bdChartDiaBan = new Chart(canvasDiaBan, {
            type: 'bar',
            data: { labels: diaBans, datasets: [
                { label: 'Hồ sơ thêm mới', data: themMoi, backgroundColor: '#198754' },
                { label: 'Hồ sơ xóa bỏ', data: xoaBo, backgroundColor: '#dc3545' }
            ] },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.raw)} hồ sơ` } }
                },
                scales: {
                    x: { title: { display: true, text: 'Ấp / địa bàn' } },
                    y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Số lượt hồ sơ' } }
                }
            }
        });
        bdChartLoai = new Chart(canvasLoai, {
            type: 'doughnut',
            data: { labels: ['Hồ sơ thêm mới', 'Hồ sơ xóa bỏ'], datasets: [{ data: [tongThem, tongXoa], backgroundColor: ['#198754', '#dc3545'] }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: c => `${c.label}: ${fmt(c.raw)} lượt` } }
                }
            }
        });
        const tomTat = document.getElementById('bdTomTatLoai');
        if (tomTat) tomTat.innerHTML = `<div class="d-flex justify-content-between"><span>🟢 Thêm mới</span><strong>${fmt(tongThem)} hồ sơ</strong></div><div class="d-flex justify-content-between"><span>🔴 Xóa bỏ</span><strong>${fmt(tongXoa)} hồ sơ</strong></div><hr class="my-2"><div class="d-flex justify-content-between"><span>Tổng cộng</span><strong>${fmt(tongLuot)} lượt</strong></div>`;
    } catch (err) {
        console.error(err);
        alert('Không tải được thống kê biến động: ' + (err.message || 'Lỗi không xác định'));
    }
}

function escapeHtmlBienDong(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function loadChiTietBienDong() {
    const tbody = document.getElementById('bdDetailBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center">
                Đang tải dữ liệu...
            </td>
        </tr>
    `;

    try {
        const params = new URLSearchParams();

        const diaBan = (
            document.getElementById('bdDiaBan')?.value || ''
        ).trim();

        const loai = (
            document.getElementById('bdLoai')?.value || ''
        ).trim();

        // Chỉ truyền tham số địa bàn khi người dùng đã nhập.
        if (diaBan) params.set('diabanh', diaBan);
        if (loai) params.set('loai', loai);

        const response = await fetch(
            '/api/admin/bien-dong-phu-nu?' + params.toString()
        );
        const json = await response.json();

        if (!response.ok || !json.success) {
            throw new Error(
                json.message || 'Không tải được chi tiết'
            );
        }

        tbody.replaceChildren();

        if (!json.data.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted">
                        Chưa có dữ liệu biến động.
                    </td>
                </tr>
            `;
            return;
        }

        const tenLoai = {
            THEM_MOI: 'Thêm mới hồ sơ',
            XOA_BO: 'Xóa hồ sơ',
            THEM_BPTT: 'Thêm lịch sử BPTT',
            XOA_BPTT: 'Xóa lịch sử BPTT',
            CAP_NHAT: 'Cập nhật hồ sơ',
            KHAC: 'Khác'
        };

        json.data.forEach(row => {
            const tr = document.createElement('tr');

            const values = [
                row.id,
                row.diabanh,
                tenLoai[row.loai_bien_dong] ||
                    row.loai_bien_dong,
                row.ho_so,
                row.ho_ten,
                row.nguoi_thuc_hien,
                row.created_at
            ];

            values.forEach(value => {
                const td = document.createElement('td');
                td.textContent = value == null
                    ? ''
                    : String(value);
                tr.appendChild(td);
            });

            const action = document.createElement('td');
            const btn = document.createElement('button');

            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-danger';
            btn.textContent = 'Xóa';

            btn.addEventListener('click', () => {
                xoaDongBienDong(row.id);
            });

            action.appendChild(btn);
            tr.appendChild(action);
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);

        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-danger">
                    Không tải được dữ liệu biến động.
                </td>
            </tr>
        `;
    }
}

async function xoaDongBienDong(id) {
    if (!confirm(
        `Bạn có chắc muốn xóa dòng biến động ID ${id}?`
    )) return;

    try {
        const response = await fetch(
            `/api/admin/bien-dong-phu-nu/${encodeURIComponent(id)}`,
            { method: 'DELETE' }
        );

        const json = await response.json();

        if (!response.ok || !json.success) {
            alert(json.message || 'Không thể xóa dòng biến động.');
            return;
        }

        alert(json.message);
        await loadBienDong();
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối khi xóa biến động.');
    }
}
async function confirmSyncData() {
    if (!confirm("Bạn đã kiểm tra danh sách và chắc chắn muốn ghi đè các thông tin này vào bảng 15-49 chứ?")) {
        return;
    }

    try {
        let res = await fetch('/api/admin/confirm-sync-nam-sinh-con', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }).then(r => r.json());

        alert(res.message);
        if (res.success) {
            bootstrap.Modal.getInstance(document.getElementById('previewSyncModal')).hide();
            loadData(currentPage);
        }
    } catch (err) {
        console.error("Lỗi xác nhận đồng bộ:", err);
        alert("Đã xảy ra lỗi kết nối khi ghi đè dữ liệu.");
    }
}


function xuatExcel() {
    const loai = document.getElementById('filterLoaiBaoCao').value;
    const thang = document.getElementById('filterThang').value;
    const nam = document.getElementById('filterNam').value;
    
    let tableId = 'tbl_sinh';
    let tenFile = 'Bao_Cao_Sinh';
    let tenTieuDe = 'PHẦN THEO DÕI SINH';
    let colSpanVal = 11;

    if (loai === 'sang_loc_so_sinh') {
        tableId = 'tbl_sang_loc_so_sinh';
        tenFile = 'Bao_Cao_Sang_Loc_So_Sinh';
        tenTieuDe = 'SỔ SÀNG LỌC SƠ SINH';
        colSpanVal = 16;
    } else if (loai === 'tu') {
        tableId = 'tbl_tu';
        tenFile = 'Bao_Cao_Tu';
        tenTieuDe = 'PHẦN THEO DÕI TỬ VONG';
        colSpanVal = 10;
    } else if (loai === 'di_den') {
        tableId = 'tbl_di_den';
        tenFile = 'Bao_Cao_Di_Den';
        tenTieuDe = 'PHẦN THEO DÕI ĐI ĐẾN';
        colSpanVal = 12;
    } else if (loai === 'bptt') {
        tableId = 'tbl_bptt';
        tenFile = 'Bao_Cao_Bien_Phap_Tranh_Thai';
        tenTieuDe = 'SỔ THEO DÕI BIỆN PHÁP TRÁNH THAI';
        colSpanVal = 13;
    } else if (loai === 'sang_loc_truoc_sinh') {
        tableId = 'tbl_sang_loc_truoc_sinh';
        tenFile = 'Bao_Cao_Sang_Loc_Truoc_Sinh';
        tenTieuDe = 'SỔ SÀNG LỌC TRƯỚC SINH';
        colSpanVal = 15;
    } else if (loai === 'phu_nu_15_49') {
        tenFile = 'Bao_Cao_Phu_Nu_15_49';
        tenTieuDe = 'THEO DÕI PHỤ NỮ ĐỘ TUỔI 15-49 CÓ CHỒNG';
        colSpanVal = 18;
    }
    
    let tieuDeThoiGian = `Năm: ${document.getElementById('reportYear') ? document.getElementById('reportYear').value : (nam || new Date().getFullYear())}`;
    
    // Lấy đúng bảng báo cáo 12 tháng đang hiển thị ở tab báo cáo
    let table = (loai === 'phu_nu_15_49') ? document.querySelector('#reportSection table') : document.getElementById(tableId);

    let htmlContent = '';
    if (loai === 'phu_nu_15_49') {
        htmlContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <style>
                    table { border-collapse: collapse; width: 100%; font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
                    th, td { border: 0.5pt solid #000000; padding: 5px; vertical-align: middle; text-align: center; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    .title { font-size: 14pt; font-weight: bold; text-align: center; border: none; }
                    .year-label { font-size: 12pt; font-weight: bold; text-align: right; border: none; }
                    .text-start, .text-left { text-align: left !important; padding-left: 6px !important; }
                    .fw-bold { font-weight: bold; }
                </style>
            </head>
            <body>
                <table>
                    <tr><td colspan="18" class="title">${tenTieuDe}</td></tr>
                    <tr><td colspan="18" class="year-label">${tieuDeThoiGian}</td></tr>
                    <tr><td colspan="18" style="border:none;"></td></tr>
                </table>
                ${table ? table.outerHTML : ''}
                <br><br>
                <table>
                    <tr>
                        <td colspan="5" style="border:none; text-align:left;"><b>N2:</b> Nạo hút thai do không sử dụng BPTT</td>
                        <td colspan="6" style="border:none; text-align:left;"><b>1:</b> Đặt vòng<br><b>1/1:</b> Thay vòng<br><b>2:</b> Triệt sản nam<br><b>3:</b> Triệt sản nữ<br><b>4:</b> Bao cao su</td>
                        <td colspan="7" style="border:none; text-align:left;"><b>5:</b> Thuốc viên<br><b>6:</b> Thuốc tiêm<br><b>7:</b> Thuốc cấy<br><b>7/7:</b> Thay que cấy<br><b>8:</b> Biện pháp khác</td>
                    </tr>
                    <tr>
                        <td colspan="5" style="border:none; text-align:left;"><b>TS1:</b> Sàng lọc trước sinh lần 1</td>
                        <td colspan="13" style="border:none;"></td>
                    </tr>
                    <tr>
                        <td colspan="5" style="border:none; text-align:left;"><b>TS2:</b> Sàng lọc trước sinh lần 2</td>
                        <td colspan="13" style="border:none;"></td>
                    </tr>
                </table>
            </body>
            </html>
        `;
    } else {
        htmlContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <style>
                    table { border-collapse: collapse; width: 100%; font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
                    th, td { border: 0.5pt solid #000000; padding: 6px; vertical-align: middle; }
                    th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
                    .text-center { text-align: center; }
                    .text-start { text-align: left; }
                    .fw-bold { font-weight: bold; }
                    .title { font-size: 14pt; font-weight: bold; text-align: center; border: none; }
                    .subtitle { font-size: 12pt; text-align: center; border: none; }
                </style>
            </head>
            <body>
                <table>
                    <tr><td colspan="${colSpanVal}" class="title">${tenTieuDe}</td></tr>
                    <tr><td colspan="${colSpanVal}" class="subtitle">${tieuDeThoiGian}</td></tr>
                    <tr><td colspan="${colSpanVal}" style="border:none;"></td></tr>
                </table>
                ${table ? table.outerHTML : ''}
            </body>
            </html>
        `;
    }

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tenFile}_${nam || 'All'}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}