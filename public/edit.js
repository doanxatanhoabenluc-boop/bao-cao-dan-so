// edit.js - Đã fix lỗi cú pháp, kiểm tra thông minh và hỗ trợ chọn quan hệ

let currentTableDataCache = []; // Lưu trữ cache dữ liệu
let pendingEditData = {};       // Lưu tạm dữ liệu chờ xác nhận

// Tự động chèn HTML Modal Sửa dữ liệu vào cuối trang khi load file
document.addEventListener("DOMContentLoaded", function() {
    injectEditModalHTML();
});

function injectEditModalHTML() {
    if (document.getElementById('editModal')) return;
    let modalHTML = `
    <div class="modal fade" id="editModal" tabindex="-1" aria-labelledby="editModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title" id="editModalLabel"><i class="fa-solid fa-pen-to-square me-2"></i> Chỉnh sửa dữ liệu</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <!-- Form nhập liệu chính -->
            <form id="editForm">
                <input type="hidden" id="edit_record_id">
                <div id="edit-dynamic-fields" class="row"></div>
            </form>

            <!-- Khu vực xem lại thông tin (Ẩn mặc định, hiện lên khi bấm Lưu để rà soát) -->
            <div id="editReviewSection" style="display: none;">
                <div class="alert alert-warning border-2 shadow-sm" role="alert">
                    <h4 class="alert-heading fs-5 fw-bold text-dark"><i class="fa-solid fa-triangle-exclamation text-warning me-2"></i> Vui lòng kiểm tra lại thông tin!</h4>
                    <p class="mb-0 text-secondary">Hãy đọc kỹ các thông tin bên dưới trước khi đồng ý lưu. Nếu có chỗ nào chưa đúng, hãy bấm nút <b>"Sửa lại"</b>.</p>
                </div>
                <div id="edit-review-content" class="card p-3 bg-light border"></div>
            </div>
          </div>
          <div class="modal-footer">
            <!-- Các nút khi đang ở chế độ nhập/sửa -->
            <div id="edit-mode-buttons">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Hủy bỏ</button>
                <button type="button" class="btn btn-success px-4" onclick="switchToReviewMode()"><i class="fa-solid fa-eye me-1"></i> Xem lại trước khi lưu</button>
            </div>
            <!-- Các nút khi đang ở chế độ xem lại -->
            <div id="review-mode-buttons" style="display: none;">
                <button type="button" class="btn btn-outline-secondary" onclick="backToEditForm()"><i class="fa-solid fa-arrow-left me-1"></i> Sửa lại</button>
                <button type="button" class="btn btn-primary px-4 fw-bold" onclick="submitEditData()"><i class="fa-solid fa-circle-check me-1"></i> Xác nhận đúng và Lưu</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Cập nhật giá trị ngày tháng trong form Sửa
function updateEditDateValue(fieldKey) {
    const container = document.getElementById(`edit_${fieldKey}`).closest('.col-md-6');
    const day = container.querySelector('.edit-select-day').value;
    const month = container.querySelector('.edit-select-month').value;
    const year = container.querySelector('.edit-select-year').value;
    
    const inputDate = document.getElementById(`edit_${fieldKey}`);
    if (year && month && day) {
        inputDate.value = `${year}-${month}-${day}`;
    } else if (year || month || day) {
        inputDate.value = `${year || '1900'}-${month || '01'}-${day || '01'}`;
    } else {
        inputDate.value = '';
    }
}

// Hàm kiểm tra xem một trường có phải là trường bắt buộc dựa trên tên hoặc nhãn hiển thị không
function isMandatoryField(fieldName, fieldLabel) {
    let name = (fieldName || '').toLowerCase();
    let label = (fieldLabel || '').toLowerCase();

    let keywords = ['so_ho', 'hộ số', 'số hộ', 'họ và tên', 'ho_ten', 'ten', 'ngày sinh', 'ngay_sinh', 'năm sinh', 'nam_sinh', 'dân tộc', 'dan_toc', 'giới tính', 'gioi_tinh', 'con thứ', 'con_thu', 'nơi đẻ', 'noi_de', 'nơi thực hiện', 'noi_thuc_hien', 'quan hệ', 'quan_he'];

    for (let kw of keywords) {
        if (name.includes(kw) || label.includes(kw)) {
            return true;
        }
    }
    return false;
}

// Mở cửa sổ Modal Sửa và đổ dữ liệu cũ vào
function openEditModal(recordId) {
    injectEditModalHTML();

    document.getElementById('editForm').style.display = 'block';
    document.getElementById('editReviewSection').style.display = 'none';
    document.getElementById('edit-mode-buttons').style.display = 'block';
    document.getElementById('review-mode-buttons').style.display = 'none';

    let item = currentTableDataCache.find(r => r.id == recordId);
    if (!item) {
        alert("Không tìm thấy dữ liệu bản ghi trong bộ nhớ tạm!");
        return;
    }

    document.getElementById('edit_record_id').value = item.id;
    let config = tableConfigs[currentTable];
    let container = document.getElementById('edit-dynamic-fields');
    container.innerHTML = '';

    config.fields.forEach(field => {
        let col = document.createElement('div');
        col.className = "col-md-6 mb-3";
        let val = item[field.name] !== undefined && item[field.name] !== null ? item[field.name] : '';
        let isSpecial = isMandatoryField(field.name, field.label);

        if (field.type === 'date') {
            let parts = String(val).split('-');
            let dSel = parts[2] || '';
            let mSel = parts[1] || '';
            let ySel = parts[0] || '';

            col.innerHTML = `
                <label class="fw-semibold">${field.label} ${isSpecial ? '<span class="text-danger">*</span>' : ''}</label>
                <div class="row g-2 mb-2">
                    <div class="col-4">
                        <select class="form-select edit-select-day" onchange="updateEditDateValue('${field.name}')">
                            <option value="">-- Ngày --</option>
                            ${Array.from({length: 31}, (_, i) => {
                                let d = i + 1; let dv = d < 10 ? '0' + d : '' + d;
                                return `<option value="${dv}" ${dSel === dv ? 'selected' : ''}>Ngày ${d}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="col-4">
                        <select class="form-select edit-select-month" onchange="updateEditDateValue('${field.name}')">
                            <option value="">-- Tháng --</option>
                            ${Array.from({length: 12}, (_, i) => {
                                let m = i + 1; let mv = m < 10 ? '0' + m : '' + m;
                                return `<option value="${mv}" ${mSel === mv ? 'selected' : ''}>Tháng ${m}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="col-4">
                        <select class="form-select edit-select-year" onchange="updateEditDateValue('${field.name}')">
                            <option value="">-- Năm --</option>
                            ${Array.from({length: 131}, (_, i) => {
                                let y = 2030 - i;
                                return `<option value="${y}" ${ySel == y ? 'selected' : ''}>${y}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <input type="date" id="edit_${field.name}" class="form-control" name="${field.name}" value="${val}">
            `;
        } else if (field.type === 'select-quanhe') {
            col.innerHTML = `<label class="fw-semibold">${field.label} ${isSpecial ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            select.id = `edit_${field.name}`;
            
            let opts = typeof danhSachQuanHeOptions !== 'undefined' ? danhSachQuanHeOptions : ["Chủ hộ", "Vợ", "Chồng", "Con đẻ", "Con nuôi", "Bố đẻ", "Mẹ đẻ"];
            select.innerHTML = `<option value="">-- Chọn quan hệ --</option>` + opts.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'select' || field.type === 'select-dantoc' || field.type === 'select-benhvien' || field.type === 'select-noithuchien') {
            col.innerHTML = `<label class="fw-semibold">${field.label} ${isSpecial ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            select.id = `edit_${field.name}`;
            
            let opts = field.options || (field.type === 'select-dantoc' ? uniqueDanToc : field.type === 'select-benhvien' ? danhSachBenhVienOptions : danhSachNoiThucHienOptions);
            select.innerHTML = `<option value="">-- Chọn --</option>` + (opts || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
            col.appendChild(select);
        } else if (field.type === 'select-bptt') {
            col.innerHTML = `<label class="fw-semibold">${field.label} ${isSpecial ? '<span class="text-danger">*</span>' : ''}</label>`;
            let select = document.createElement('select');
            select.className = "form-select";
            select.name = field.name;
            select.id = `edit_${field.name}`;
            select.innerHTML = `<option value="">-- Chọn biện pháp tránh thai --</option>` + 
                (typeof danhSachBptTOptions !== 'undefined' ? danhSachBptTOptions : []).map(item => `<option value="${item.ma_bptt}" ${val === item.ma_bptt ? 'selected' : ''}>${item.ma_bptt} - ${item.ten_bptt}</option>`).join('');
            col.appendChild(select);
        } else {
            col.innerHTML = `
                <label class="fw-semibold">${field.label} ${isSpecial ? '<span class="text-danger">*</span>' : ''}</label>
                <input type="${field.type || 'text'}" id="edit_${field.name}" class="form-control" name="${field.name}" value="${val}">
            `;
        }
        container.appendChild(col);
    });

    // Đồng bộ chức năng Tìm BHYT trong cửa sổ sửa dữ liệu của trang Dữ liệu trực tuyến.
    if (typeof window.attachBHYTSearchToIndexEdit === 'function') {
        window.attachBHYTSearchToIndexEdit(currentTable);
    }

    let modalElement = document.getElementById('editModal');
    let myModal = new bootstrap.Modal(modalElement);
    myModal.show();
}

// Chuyển sang chế độ xem lại thông tin trước khi gửi
function switchToReviewMode() {
    let form = document.getElementById('editForm');
    let formData = new FormData(form);
    pendingEditData = {};
    formData.forEach((val, key) => pendingEditData[key] = val);
    delete pendingEditData.edit_record_id;

    let config = tableConfigs[currentTable];

    for (let field of config.fields) {
        if (isMandatoryField(field.name, field.label)) {
            let val = pendingEditData[field.name];
            if (!val || String(val).trim() === '') {
                alert(`❌ Lỗi: Trường "${field.label}" không được để trống!`);
                let inputEl = document.getElementById(`edit_${field.name}`) || document.querySelector(`[name="${field.name}"]`);
                if (inputEl) inputEl.focus();
                return;
            }
        }
    }

    let birthDateVal = pendingEditData['ngay_sinh'] || pendingEditData['nam_sinh'];
    if (birthDateVal) {
        let currentDate = new Date();
        let inputDate = new Date(birthDateVal);
        
        if (isNaN(inputDate.getTime()) || inputDate >= currentDate) {
            alert("❌ Lỗi: Ngày sinh hoặc năm sinh phải nhỏ hơn ngày tháng năm hiện tại!");
            let dateInput = document.getElementById('edit_ngay_sinh') || document.getElementById('edit_nam_sinh');
            if (dateInput) dateInput.focus();
            return;
        }
    }

    let reviewHtml = '<div class="row g-2">';
    config.fields.forEach(field => {
        let val = pendingEditData[field.name] || '<span class="text-muted fst-italic">(Trống)</span>';
        reviewHtml += `
            <div class="col-md-6 border-bottom pb-2 mb-2">
                <span class="text-muted d-block small">${field.label}:</span>
                <strong class="text-dark fs-6">${val}</strong>
            </div>`;
    });
    reviewHtml += '</div>';

    document.getElementById('edit-review-content').innerHTML = reviewHtml;

    form.style.display = 'none';
    document.getElementById('editReviewSection').style.display = 'block';
    document.getElementById('edit-mode-buttons').style.display = 'none';
    document.getElementById('review-mode-buttons').style.display = 'block';
}

function backToEditForm() {
    document.getElementById('editForm').style.display = 'block';
    document.getElementById('editReviewSection').style.display = 'none';
    document.getElementById('edit-mode-buttons').style.display = 'block';
    document.getElementById('review-mode-buttons').style.display = 'none';
}

async function submitEditData() {
    let recordId = document.getElementById('edit_record_id').value; // Đã sửa lại dấu ngoặc tròn chuẩn

    let res = await fetch(`/api/data/${currentTable}/${recordId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(pendingEditData)
    });
    let result = await res.json();

    if (result.success) {
        alert("✅ Cập nhật dữ liệu thành công!");
        let modalEl = document.getElementById('editModal');
        let modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
        fetchTableData(currentTable);
    } else {
        alert("❌ Lỗi: " + result.message);
    }
}