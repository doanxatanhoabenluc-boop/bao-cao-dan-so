// app.js

let currentTable = "table_1";
let danhSachApOptions = [];
let danhSachBenhVienOptions = [];
let danhSachBptTOptions = [];
let danhSachNoiThucHienOptions = [];

// Danh sách 54 dân tộc Việt Nam chuẩn
const danhSachDanToc = [
    "Kinh", "Tày", "Thái", "Mường", "H'Mông", "Dao", "Khmer", "Nùng", "Mường", "Gia Rai", 
    "Ê Đê", "Ba Na", "Sán Chay", "Chăm", "Kơ Ho", "Hà Nhì", "Chu Ru", "Xơ Đăng", "Sán Dìu", "H'rê", 
    "Ra Glai", "Mnông", "Thổ", "Stiêng", "Khơ Mú", "Bru - Vân Kiều", "Cơ Tu", "Giáy", "Tà Ôi", "Mạ", 
    "Giẻ Triêng", "Cơ Ho", "Cờ Lao", "Bha Lang", "La Ha", "Chơ Ro", "Háng Hì", "Phù La", "La Hủ", "Lự", 
    "Lô Lô", "Chứt", "Mảng", "Pa Thẻn", "Cống", "Giáy", "Pu Péo", "Si La", "Ơ Đô", "Bru", "Rơ Măm", "Lô Lô", "Pà Thẻn", "Mông"
];
const uniqueDanToc = [...new Set(danhSachDanToc)];

const trinhDoHocVanOptions = ["Chưa đi học", "Tiểu học", "THCS", "THPT", "Trung cấp", "Cao đẳng", "Đại học", "Trên đại học"];
const tinhTrangHonNhanOptions = ["Chưa kết hôn", "Đang kết hôn", "Ly hôn", "Góa"];

// Cấu hình các trường nhập liệu tương ứng 11 bảng chuẩn
const tableConfigs = {
    "table_1": { title: "1. Danh sách trẻ sinh ra", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ho_ten_con", label: "Họ và tên con", type: "text", required: true },
        { name: "ngay_sinh_con", label: "Ngày sinh của con", type: "date" },
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"] },
        { name: "dan_toc", label: "Dân tộc", type: "select-dantoc", options: uniqueDanToc },
        { name: "ho_ten_me", label: "Họ và tên mẹ", type: "text" },
        { name: "so_the_bhyt_me", label: "Số thẻ BHYT của mẹ", type: "text" },
        { name: "ngay_sinh_me", label: "Ngày sinh của mẹ", type: "date" },
        { name: "noi_de", label: "Nơi đẻ", type: "select-benhvien" },
        { name: "con_thu_may", label: "Là con thứ mấy của mẹ", type: "number" }
    ]},
    "table_2": { title: "2. Danh sách SL sơ sinh", fields: [
        { name: "so_ho", label: "Số hộ", type: "text", required: true },
        { name: "ho_ten_tre", label: "Họ tên trẻ", type: "text", required: true },
        { name: "benh_suy_giap", label: "Bệnh suy giáp trạng bẩm sinh", type: "text" },
        { name: "thieu_men_g6pd", label: "Thiếu men G6PD", type: "text" },
        { name: "tang_san_thuong_than", label: "Tăng sản thượng thận bẩm sinh", type: "text" },
        { name: "khiem_thinh", label: "Khiếm thính bẩm sinh", type: "text" },
        { name: "benh_tim", label: "Bệnh tim bẩm sinh", type: "text" },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_3": { title: "3. Danh sách người chết", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ho_ten", label: "Họ và tên người chết", type: "text", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "quan_he", label: "Quan hệ với chủ hộ", type: "select", options: ["Chủ hộ", "Vợ","Chồng", "Con", "Bố","Mẹ"] },
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"] },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date" },
        { name: "ngay_chet", label: "Ngày chết", type: "date" },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_4": { title: "4. Danh sách người chuyển đến từ xã khác", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ho_ten", label: "Họ tên người đến", type: "text", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "quan_he", label: "Quan hệ với chủ hộ", type: "select", options: ["Chủ hộ", "Vợ","Chồng", "Con", "Bố","Mẹ"] },
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"] },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date" },
        { name: "dan_toc", label: "Dân tộc", type: "select-dantoc", options: uniqueDanToc },
        { name: "trinh_do_hoc_van", label: "Trình độ học vấn", type: "select", options: trinhDoHocVanOptions },
        { name: "tinh_trang_hon_nhan", label: "Tình trạng hôn nhân", type: "select", options: tinhTrangHonNhanOptions },
        { name: "ngay_den", label: "Ngày đến", type: "date" },
        { name: "noi_di", label: "Nơi đi", type: "text" }
    ]},
    "table_5": { title: "5. Danh sách người chuyển đi khỏi xã", fields: [
        { name: "ho_so", label: "Hộ số", type: "text", required: true },
        { name: "ho_ten", label: "Họ tên người đi", type: "text", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "quan_he", label: "Quan hệ với chủ hộ", type: "select", options: ["Chủ hộ", "Vợ","Chồng", "Con", "Bố","Mẹ"] },
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"] },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date" },
        { name: "ngay_di", label: "Ngày đi", type: "date" },
        { name: "noi_den", label: "Nơi đến", type: "text" },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
    "table_6": { title: "6. Danh sách thay đổi thông tin cơ bản", fields: [
        { name: "ho_so", label: "Hộ số", type: "text" },
        { name: "ho_ten", label: "Họ tên người có thay đổi", type: "text" },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "gioi_tinh", label: "Giới tính", type: "select", options: ["Nam", "Nữ"] },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date" },
        { name: "thong_tin_cu", label: "Thông tin cũ", type: "text" },
        { name: "thong_tin_moi", label: "Thông tin mới", type: "text" },
        { name: "ghi_chu", label: "Ghi chú", type: "text" }
    ]},
   "table_7": { title: "7. Vợ chồng mới sử dụng BPTT", fields: [
        { name: "ho_so", label: "Hộ số", type: "text" },
        { name: "ho_ten_vo", label: "Họ tên người vợ (từ 15-49 tuổi)", type: "text", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date" },
        { name: "ngay_su_dung", label: "Ngày sử dụng", type: "date" },
        { name: "bptt_moi", label: "Biện pháp tránh thai mới", type: "select-bptt" },
        { name: "so_con_hien_co", label: "Số con hiện có", type: "number" },
        { name: "noi_thuc_hien", label: "Nơi thực hiện", type: "select-noithuchien" }
    ]},
   "table_8": { title: "8. Vợ chồng thôi sử dụng BPTT", fields: [
        { name: "search_helper", label: "🔍 Tìm kiếm thông tin từ Bảng 7 (Nhập hộ số hoặc tên vợ)", type: "search-table7" },
        { name: "ho_so", label: "Hộ số", type: "text" },
        { name: "ho_ten_vo", label: "Họ tên người vợ (từ 15-49 tuổi)", type: "text", required: true },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "ngay_sinh", label: "Năm sinh", type: "date" },
        { name: "ngay_thoi_su_dung", label: "Ngày thôi sử dụng", type: "date" },
        { name: "bptt_thoi", label: "BPTT thôi sử dụng", type: "select-bptt" },
        { name: "noi_thuc_hien", label: "Nơi thực hiện", type: "select-noithuchien" }
    ]},
    "table_9": { title: "9. Phụ nữ có thông tin thai sản", fields: [
        { name: "ho_so", label: "Hộ số", type: "text" },
        { name: "ho_ten", label: "Họ tên phụ nữ", type: "text" },
        { name: "so_the_bhyt", label: "Số thẻ BHYT", type: "text" },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date" },
        { name: "ngay_su_kien", label: "Ngày có sự kiện", type: "date" },
        { name: "su_kien", label: "Sự kiện thai sản", type: "select", options: ["Mang thai", "Sảy thai", "Phá thai"] },
        { name: "mang_thai_lan_thu", label: "Mang thai lần thứ", type: "number" }
    ]},
    "table_10": { title: "10. Sàng lọc trước sinh", fields: [
        { name: "so_ho", label: "Số hộ", type: "text" },
        { name: "ma_the_bhyt", label: "Mã số thẻ BHYT", type: "text" },
        { name: "ho_ten", label: "Họ tên", type: "text" },
        { name: "noi_cu_tru", label: "Nơi cư trú", type: "text" },
        { name: "ngay_sinh", label: "Ngày sinh", type: "date" },
        { name: "mang_thai_tuan", label: "Mang thai tuần thứ mấy", type: "number" },
        { name: "ngay_thuc_hien", label: "Ngày thực hiện dịch vụ", type: "date" },
        { name: "ket_qua", label: "Kết quả tầm soát, sàng lọc", type: "select", options: ["Down", "Edward", "Patau", "Thalassemia", "Bình thường"] }
    ]},
    "table_11": { title: "11. Người cao tuổi khám sức khỏe", fields: [
        { name: "ho_so", label: "Hộ số", type: "text" },
        { name: "ma_so_doi_tuong", label: "Mã số đối tượng", type: "text" },
        { name: "ho_ten", label: "Họ tên người NCT", type: "text" },
        { name: "nam_sinh", label: "Năm sinh", type: "number" },
        { name: "ngay_kham", label: "Ngày khám", type: "date" }
    ]}
};

window.onload = async function() {
    let authCheck = await fetch('/api/me');
    if(authCheck.status === 401) {
        window.location.href = 'login.html';
        return;
    }

    let resAp = await fetch('/api/danh-sach-ap');
    let dataAp = await resAp.json();
    danhSachApOptions = dataAp.map(item => item.ten_ap);

    // Lấy danh sách Bệnh viện riêng
    try {
        let resBv = await fetch('/api/danh-sach-benh-vien');
        let dataBv = await resBv.json();
        danhSachBenhVienOptions = dataBv.map(item => item.ten_benh_vien);
    } catch(e) {
        danhSachBenhVienOptions = ["Bệnh viện Đa khoa", "Trạm Y tế xã"];
    }

    // Lấy danh mục Biện pháp tránh thai (dùng cho bảng 7 & 8)
    try {
        let resBptt = await fetch('/api/danh-sach-bptt');
        let dataBptt = await resBptt.json();
        danhSachBptTOptions = dataBptt; // [{ma_bptt, ten_bptt}]
    } catch(e) {
        danhSachBptTOptions = [
            { ma_bptt: '1', ten_bptt: 'Vòng tránh thai' },
            { ma_bptt: '2', ten_bptt: 'Triệt sản nam' },
            { ma_bptt: '3', ten_bptt: 'Triệt sản nữ' },
            { ma_bptt: '4', ten_bptt: 'Bao cao su' },
            { ma_bptt: '5', ten_bptt: 'Thuốc uống tránh thai' }
        ];
    }

    // Lấy danh sách Nơi thực hiện riêng
    try {
        let resNth = await fetch('/api/danh-sach-noi-thuc-hien');
        let dataNth = await resNth.json();
        danhSachNoiThucHienOptions = dataNth.map(item => item.ten_noi_thuc_hien);
    } catch(e) {
        danhSachNoiThucHienOptions = ["Trạm Y tế xã Lương Hòa", "Bệnh viện Đa khoa Bến Lức"];
    }

    if (typeof initNameFormatter === 'function') {
        initNameFormatter();
    }

    switchTableForm();
};

function switchTableForm() {
    currentTable = document.getElementById('selectTable').value;
    let config = tableConfigs[currentTable];
    if (!config) return;
    
    document.getElementById('form-title').innerText = "📝 Nhập liệu: " + (config.title || '');

    let container = document.getElementById('dynamic-fields');
    container.innerHTML = '';

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

            // 🔒 Khóa 3 ô chọn Ngày/Tháng/Năm nếu là Bảng 8 và là trường ngay_sinh
            let isDisabled = (currentTable === 'table_8' && field.name === 'ngay_sinh') ? 'disabled style="background-color: #e9ecef; cursor: not-allowed;"' : '';

            col.innerHTML = `
                <label>${field.label} ${field.required ? '*' : ''}</label>
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
                <input type="date" id="${field.name}" class="form-control" name="${field.name}" ${field.required ? 'required' : ''}>
            `;
        } else if (field.type === 'select') {
            col.innerHTML = `<label>${field.label} ${field.required ? '*' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            select.innerHTML = `<option value="">-- Chọn --</option>` + (field.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'select-dantoc') {
            col.innerHTML = `<label>${field.label} ${field.required ? '*' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            select.innerHTML = `<option value="">-- Chọn dân tộc --</option>` + (field.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'select-benhvien') {
            col.innerHTML = `<label>${field.label} ${field.required ? '*' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            select.innerHTML = `<option value="">-- Chọn bệnh viện --</option>` + (typeof danhSachBenhVienOptions !== 'undefined' ? danhSachBenhVienOptions : []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'select-bptt') {
            col.innerHTML = `<label>${field.label} ${field.required ? '*' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            let optsHtml = `<option value="">-- Chọn biện pháp tránh thai --</option>` + 
                (typeof danhSachBptTOptions !== 'undefined' ? danhSachBptTOptions : []).map(item => `<option value="${item.ma_bptt}">${item.ma_bptt} - ${item.ten_bptt}</option>`).join('');
            select.innerHTML = optsHtml;
            col.appendChild(select);
        } else if (field.type === 'select-noithuchien') {
            col.innerHTML = `<label>${field.label} ${field.required ? '*' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            select.innerHTML = `<option value="">-- Chọn nơi thực hiện --</option>` + (typeof danhSachNoiThucHienOptions !== 'undefined' ? danhSachNoiThucHienOptions : []).map(o => `<option value="${o}">${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'search-table7') {
            col.className = "col-12 mb-3 bg-light p-3 border rounded position-relative";
            col.innerHTML = `
                <label class="fw-bold text-danger mb-1">${field.label}</label>
                <input type="text" id="inputSearchT7" class="form-control" placeholder="Gõ hộ số hoặc tên vợ để tìm kiếm..." oninput="searchDataFromTable7(this.value)">
                <div id="suggestBoxT7" class="list-group position-absolute shadow-sm w-100" style="z-index: 1050; max-height: 200px; overflow-y: auto;"></div>
                <small class="text-muted mt-1 d-block">💡 Nhập thông tin để gợi ý kết quả từ Bảng 7, sau đó click chọn để hệ thống tự động điền các ô bên dưới.</small>
            `;
        } else {
            if (field.name === 'ho_ten_con' || field.name === 'ho_ten_tre' || field.name === 'ho_ten') {
                col.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <label class="mb-0">${field.label} ${field.required ? '*' : ''}</label>
                        ${field.name !== 'ho_ten' ? `
                        <div class="form-check form-check-inline m-0">
                            <input class="form-check-input" type="checkbox" id="check_${field.name}" onchange="toggleChuaDatTen('${field.name}')">
                            <label class="form-check-label small text-primary fw-semibold" for="check_${field.name}" style="cursor: pointer;">Chưa đặt tên</label>
                        </div>` : ''}
                    </div>
                    <input type="${field.type || 'text'}" class="form-control" id="input_${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>
                `;
            } else {
                col.innerHTML = `<label>${field.label} ${field.required ? '*' : ''}</label>`;
                let input = document.createElement('input');
                input.type = field.type || 'text';
                input.className = "form-control";
                input.name = field.name;
                if (field.required) input.required = true;

                // 🔒 Khóa riêng cho Bảng 8
                if (currentTable === 'table_8' && ['ho_so', 'ho_ten_vo', 'so_the_bhyt', 'ngay_sinh'].includes(field.name)) {
                    input.setAttribute('readonly', true);
                    input.readOnly = true;
                    input.style.backgroundColor = '#e9ecef';
                    input.style.cursor = 'not-allowed';
                    input.placeholder = '🔒 Chọn từ Bảng 7 phía trên...';
                    input.onkeydown = (e) => e.preventDefault();
                    input.onpaste = (e) => e.preventDefault();
                }

                col.appendChild(input);
            }
        }
        container.appendChild(col);
    });

    if (typeof fetchTableData === 'function') {
        fetchTableData(currentTable);
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

async function saveData(e) {
    e.preventDefault();
    let form = document.getElementById('dynamicForm');
    let formData = new FormData(form);
    let dataObj = {};
    formData.forEach((val, key) => dataObj[key] = val);

    let res = await fetch(`/api/data/${currentTable}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(dataObj)
    });
    let result = await res.json();
    if(result.success) {
        alert("✅ Lưu thành công!");
        form.reset();
        
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('input[readonly]').forEach(inp => inp.removeAttribute('readonly'));

        fetchTableData(currentTable);
    } else {
        alert("❌ Lỗi: " + result.message);
    }
}

async function fetchTableData(tableName) {
    let header = document.getElementById('tableHeader');
    let body = document.getElementById('tableBody');
    header.innerHTML = '';
    body.innerHTML = '<tr><td colspan="10" class="text-center">Đang tải...</td></tr>';

    let config = tableConfigs[tableName];
    let res = await fetch(`/api/data/${tableName}`);
    let data = await res.json();

    header.innerHTML = `<tr><th>STT</th>` + config.fields.map(f => `<th>${f.label}</th>`).join('') + `</tr>`;
    
    if(!data || data.length === 0) {
        body.innerHTML = `<tr><td colspan="${config.fields.length + 1}" class="text-center">Chưa có dữ liệu</td></tr>`;
        return;
    }

    body.innerHTML = data.map((item, idx) => {
        return `<tr><td>${idx + 1}</td>` + config.fields.map(f => {
            let val = item[f.name];
            // Nếu là trường BPTT, nếu cần hiển thị tên thay vì mã ký hiệu trên bảng, bạn có thể map lại ở đây nếu server trả về mã
            return `<td>${val !== undefined && val !== null ? val : ''}</td>`;
        }).join('') + `</tr>`;
    }).join('');
}
// Hàm chuyển đổi tiếng Việt có dấu sang không dấu để tìm kiếm tương đối dễ hơn
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

    let fieldsToFill = [
        { el: hoSoInput, val: item.ho_so },
        { el: hoTenInput, val: item.ho_ten_vo },
        { el: bhytInput, val: item.so_the_bhyt },
        { el: ngaySinhInput, val: item.ngay_sinh }
    ];

    fieldsToFill.forEach(field => {
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

    // 🔒 Tự động chọn và khóa 3 ô dropdown Ngày / Tháng / Năm phía trên của trường ngày sinh
    if (ngaySinhInput && item.ngay_sinh) {
        let parts = item.ngay_sinh.split('-'); // Giả sử định dạng YYYY-MM-DD
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
document.addEventListener("DOMContentLoaded", async function() {
    let currentUser = JSON.parse(localStorage.getItem("currentUser"));
    
    // Nếu trong localStorage chưa có, gọi API /api/me để lấy trực tiếp từ session server
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
        // In ra F12 (Console) để xem chính xác role của bạn là gì
        console.log("Current User Role:", currentUser.role); 

        const role = (currentUser.role || "").trim().toLowerCase();
        
        const adminBtn = document.getElementById("btnAdmin");
        const baocaoBtn = document.getElementById("btnBaocaoToanXa");
        const userInfoSpan = document.getElementById("userInfo"); // Thẻ hiển thị thông tin user

        // Hiển thị tên và thông tin chi tiết lên giao diện nếu tìm thấy thẻ userInfo (đã bỏ icon 👤)
        if (userInfoSpan) {
            const name = currentUser.fullname || currentUser.username || "";
            const userRole = currentUser.role || "";
            // Nếu có thông tin địa bàn/ấp thì hiển thị kèm theo cho rõ ràng
            let locationInfo = "";
            if (currentUser.diabanh && currentUser.diabanh !== "Tất cả") {
                locationInfo = ` - ${currentUser.diabanh}`;
            } else if (currentUser.ap && currentUser.ap !== "Tất cả") {
                locationInfo = ` - Ấp ${currentUser.ap}`;
            }
            
            userInfoSpan.textContent = `${name} (${userRole}${locationInfo})`;
        }

        // Kiểm tra linh hoạt các dạng tên gọi của admin và lãnh đạo
        if (role.includes("admin") || role.includes("lãnh đạo") || role.includes("lanh dao") || role.includes("quan tri")) {
            if (adminBtn) adminBtn.style.setProperty("display", "inline-block", "important");
            if (baocaoBtn) baocaoBtn.style.setProperty("display", "inline-block", "important");
        } else {
            if (adminBtn) adminBtn.style.setProperty("display", "none", "important");
            if (baocaoBtn) baocaoBtn.style.setProperty("display", "none", "important");
        }
    }
});
async function logout() {
    await fetch('/api/logout', {method: 'POST'});
    localStorage.removeItem("currentUser");
    window.location.href = 'login.html';
}