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

let allTableData = []; 
let currentPage = 1;   
const rowsPerPage = 10; 

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById('adminTableBody')) {
        loadTableDataAdmin();
    }

    const selectEl = document.getElementById('selectManagedTable');
    if (selectEl) {
        selectEl.addEventListener('change', () => {
            window.currentTableLoaded = false;
            const searchInput = document.getElementById('adminSearchInput');
            if (searchInput) searchInput.value = '';
            loadTableDataAdmin(1);
        });
    }
});

// ==================== KHỞI TẠO & LOAD DỮ LIỆU BẢNG ====================
async function loadTableDataAdmin(page = 1) {
    currentPage = page;
    const selectEl = document.getElementById('selectManagedTable');
    if (!selectEl) return;
    
    const tableName = selectEl.value;
    const searchKeyword = (document.getElementById('adminSearchInput')?.value || '').trim().toLowerCase();
    const headerRow = document.getElementById('adminTableHeader');
    const bodyRow = document.getElementById('adminTableBody');
    const paginationContainer = document.getElementById('adminPaginationContainer');
    
    if (!window.currentTableLoaded || window.currentLoadedTableName !== tableName) {
        if (headerRow) headerRow.innerHTML = `<tr><th colspan="17" class="text-center">Đang tải cấu trúc bảng...</th></tr>`;
        if (bodyRow) bodyRow.innerHTML = `<tr><td class="text-center">Đang tải dữ liệu...</td></tr>`;
        if (paginationContainer) paginationContainer.innerHTML = '';

        try {
            const response = await fetch(`/api/data/${tableName}`);
            const data = await response.json();

            if (!Array.isArray(data)) {
                if (bodyRow) bodyRow.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Lỗi tải dữ liệu từ máy chủ</td></tr>`;
                return;
            }

            allTableData = data;
            window.currentTableLoaded = true;
            window.currentLoadedTableName = tableName;
        } catch (err) {
            console.error(err);
            if (bodyRow) bodyRow.innerHTML = `<tr><td colspan="17" class="text-center text-danger py-3">Lỗi kết nối máy chủ khi tải dữ liệu</td></tr>`;
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
        if (headerRow) headerRow.innerHTML = `<tr><th>Thông báo</th></tr>`;
        if (bodyRow) bodyRow.innerHTML = `<tr><td class="text-center py-3 text-muted">Không tìm thấy bản ghi nào khớp với từ khóa "${searchKeyword}".</td></tr>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
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
        if (headerRow) headerRow.innerHTML = headerHtml;

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
        if (bodyRow) bodyRow.innerHTML = bodyHtml;
    } else if (tableName === 'table_2' || tableName.includes('2')) {
        let headerHtml = `
            <tr>
                <th rowspan="2" class="align-middle text-center">TT</th>
                <th rowspan="2" class="align-middle text-center">Tên CTV</th>
                <th rowspan="2" class="align-middle text-center">Số hộ</th>
                <th rowspan="2" class="align-middle text-center">Mã số thẻ BHYT</th>
                <th rowspan="2" class="align-middle text-center">Họ và tên mẹ</th>
                <th rowspan="2" class="align-middle text-center">Nơi cư trú<br><small>(tỉnh, huyện, xã, địa chỉ cụ thể)</small></th>
                <th rowspan="2" class="align-middle text-center">Năm sinh của mẹ</th>
                <th rowspan="2" class="align-middle text-center">Họ và tên con</th>
                <th colspan="2" class="text-center bg-light">Ngày sinh của con (Giới tính)</th>
                <th colspan="5" class="text-center bg-light">Kết quả tầm soát, sàng lọc</th>
                <th rowspan="2" class="align-middle text-center">Nơi thực hiện</th>
                <th rowspan="2" class="align-middle text-center">Người nhập</th>
                <th rowspan="2" class="align-middle text-center">Thời gian tạo</th>
                <th rowspan="2" class="align-middle text-center">Thao tác</th>
            </tr>
            <tr>
                <th class="text-center">Nam</th>
                <th class="text-center">Nữ</th>
                <th class="text-center">Bệnh suy giáp bẩm sinh</th>
                <th class="text-center">Bệnh thiếu men G6PD</th>
                <th class="text-center">Tăng sản thượng thận bẩm sinh</th>
                <th class="text-center">Khiếm thính bẩm sinh</th>
                <th class="text-center">Bệnh tim bẩm sinh</th>
            </tr>
        `;
        if (headerRow) headerRow.innerHTML = headerHtml;

        let bodyHtml = '';
        paginatedData.forEach((row, index) => {
            const absoluteIndex = startIndex + index + 1;
            const nguoiNhap = row.nguoi_nhap || row.user_nhap || row.created_by || '';
            const thoiGianNhap = row.created_at || row.ngay_nhap || row.time_stamp || '';

            const soHo = row.so_ho || row.ho_so || '';
            const maBhytMe = row.ma_the_bhyt_me || row.so_the_bhyt_me || row.so_the_bhyt || '';
            const hoTenMe = row.ho_ten_me || row.ten_me || row.hoten_me || '';
            const noiCuTru = row.noi_cu_tru || row.dia_chi || '';
            const namSinhMe = row.nam_sinh_me || row.ngay_sinh_me || '';
            const hoTenTre = row.ho_ten_tre || row.ho_ten_con || '';
            
            const ngaySinhTre = row.ngay_sinh_tre || row.ngay_sinh_con || row.ngay_sinh || '';
            const gioiTinh = (row.gioi_tinh || '').toString().trim().toLowerCase();
            
            const ngaySinhNam = gioiTinh === 'nam' ? ngaySinhTre : '';
            const ngaySinhNu = (gioiTinh === 'nữ' || gioiTinh === 'nu') ? ngaySinhTre : '';

            bodyHtml += `
                <tr>
                    <td class="text-center align-middle">${absoluteIndex}</td>
                    <td class="align-middle">${row.ten_ctv || row.ctv || ''}</td>
                    <td class="text-center align-middle">${soHo}</td>
                    <td class="text-center align-middle">${maBhytMe}</td>
                    <td class="align-middle">${hoTenMe}</td>
                    <td class="align-middle">${noiCuTru}</td>
                    <td class="text-center align-middle">${namSinhMe}</td>
                    <td class="align-middle">${hoTenTre}</td>
                    <td class="text-center align-middle text-primary fw-semibold">${ngaySinhNam}</td>
                    <td class="text-center align-middle text-danger fw-semibold">${ngaySinhNu}</td>
                    <td class="text-center align-middle">${row.benh_suy_giap || ''}</td>
                    <td class="text-center align-middle">${row.thieu_men_g6pd || ''}</td>
                    <td class="text-center align-middle">${row.tang_san_thuong_than || ''}</td>
                    <td class="text-center align-middle">${row.khiem_thinh || ''}</td>
                    <td class="text-center align-middle">${row.benh_tim || ''}</td>
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
        if (bodyRow) bodyRow.innerHTML = bodyHtml;
    } else {
        const columns = Object.keys(paginatedData[0]).filter(col => col !== 'id');
        
        let headerHtml = '<tr><th class="text-center" style="width: 60px;">STT</th>';
        columns.forEach(col => {
            let displayName = (typeof columnLabels !== 'undefined' && columnLabels[col]) ? columnLabels[col] : col.replace(/_/g, ' ');
            headerHtml += `<th>${displayName}</th>`;
        });
        headerHtml += '<th class="text-center" style="width: 120px;">Thao tác</th></tr>';
        if (headerRow) headerRow.innerHTML = headerHtml;

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
        if (bodyRow) bodyRow.innerHTML = bodyHtml;
    }

    if (paginationContainer) renderPagination(totalPages, currentPage, paginationContainer);
}

// ==================== HÀM PHÂN TRANG ====================
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

// ==================== CHỈNH SỬA & XÓA BẢN GHI ====================
async function openEditRecordModal(tableName, encodedRowJson) {
    const row = JSON.parse(decodeURIComponent(encodedRowJson));
    document.getElementById('editRecordId').value = row.id || '';
    const container = document.getElementById('editDataFieldsContainer');
    container.innerHTML = '';

    let apList = [], benhVienList = [], bpttList = [], noiThucHienList = [], quanHeList = [];
    let danTocList = ["Kinh", "Tày", "Thái", "Hoa", "Khmer", "Mường", "Nùng", "Dao", "Gia Rai", "Ê Đê", "Ba Na", "Sán Chay", "H'Mông", "Chăm"];
    let gioiTinhList = ["Nam", "Nữ"];
    let hocVanList = ["Tiểu học", "THCS", "THPT", "Trung cấp", "Cao đẳng", "Đại học", "Sau đại học", "Khác"];
    let honNhanList = ["Chưa kết hôn", "Đang kết hôn", "Ly hôn", "Góa"];

    try {
        let [resAp, resBv, resBptt, resNth, resQuanHe] = await Promise.all([
            fetch('/api/danh-sach-ap').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-benh-vien').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-bptt').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-noi-thuc-hien').catch(() => ({ json: () => [] })),
            fetch('/api/danh-sach-quan-he').catch(() => ({ json: () => [] }))
        ]);

        let dAp = await resAp.json();
        apList = Array.isArray(dAp) ? dAp.map(item => item.ten_ap || item) : [];

        let dBv = await resBv.json();
        benhVienList = Array.isArray(dBv) ? dBv.map(item => item.ten_benh_vien || item) : [];

        let dBptt = await resBptt.json();
        bpttList = Array.isArray(dBptt) ? dBptt : [];

        let dNth = await resNth.json();
        noiThucHienList = Array.isArray(dNth) ? dNth.map(item => item.ten_noi_thuc_hien || item) : [];

        let dQuanHe = await resQuanHe.json();
        quanHeList = Array.isArray(dQuanHe) ? dQuanHe.map(item => item.ten_quan_he || item) : ["Chủ hộ", "Vợ", "Chồng", "Con", "Bố", "Mẹ", "Khác"];

    } catch (e) {
        console.error("Lỗi tải danh mục cho modal sửa:", e);
    }

    let keys = Object.keys(row).filter(key => key !== 'id');
    
    if (tableName === 'table_10' || tableName.includes('10')) {
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

    // Đồng bộ chức năng Tìm BHYT trong cửa sổ sửa dữ liệu của trang Quản lý biểu mẫu.
    if (typeof window.attachBHYTSearchToAdminEdit === 'function') {
        window.attachBHYTSearchToAdminEdit(tableName);
    }

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

            window.currentTableLoaded = false; 
            window.currentLoadedTableName = null; 

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
            window.currentTableLoaded = false; 
            window.currentLoadedTableName = null; 
            loadTableDataAdmin(currentPage || 1);
        } else {
            alert(result.message);
        }
    } catch(err) {
        alert('Lỗi kết nối tới máy chủ');
    }
}