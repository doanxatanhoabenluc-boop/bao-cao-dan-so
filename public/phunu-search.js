/**
 * Module hỗ trợ dò tìm Phụ nữ 15-49 tuổi theo đúng phân quyền khu vực của tài khoản
 */

// 1. Render ô tìm kiếm cho Bảng 7 (Đã tích hợp sẵn CSS riêng, không ảnh hưởng nơi khác)
function renderPhuNuSearchField(field) {
    let col = document.createElement('div');
    col.className = "col-12 w-100 mb-3 bg-light p-3 border rounded position-relative border-success";
    col.innerHTML = `
        <style>
            .phunu-search-wrapper { position: relative; display: block; width: 100%; }
            .phunu-clear-btn {
                position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
                background: #e0e0e0; border: none; border-radius: 50%;
                width: 24px; height: 24px; font-size: 14px; font-weight: bold;
                color: #555; cursor: pointer; display: flex; align-items: center;
                justify-content: center; z-index: 10;
            }
            .phunu-clear-btn:hover { background: #dc3545; color: #fff; }
        </style>
        <label class="fw-bold text-success mb-1">${field.label}</label>
        <div class="phunu-search-wrapper">
            <input type="text" id="inputSearchPhuNu" class="form-control shadow-none pe-5" placeholder="Nhập mã hộ hoặc họ tên để tìm dân cư theo khu vực được phân công..." oninput="handlePhuNuSearchInput(this)">
            <button type="button" id="clearSearchPhuNuBtn" class="phunu-clear-btn" style="display: none;" onclick="clearPhuNuSearch()">&times;</button>
        </div>
        <div id="suggestBoxPhuNu" class="list-group position-absolute shadow-sm w-100" style="z-index: 1050; max-height: 220px; overflow-y: auto;"></div>
        <small class="text-muted mt-1 d-block">💡 Chọn người để tự điền mã hộ, họ tên, ngày sinh và địa chỉ.</small>
    `;
    return col;
}

// Lưu ID nhân khẩu đã chọn vào hidden input của chính biểu mẫu.
// FormData sẽ tự gửi khóa này cùng dữ liệu nghiệp vụ.
function setResidentLinkId(fieldName, residentId) {
    const form = document.getElementById('dynamicForm');
    if (!form || !fieldName) return;
    let input = form.querySelector(`[name="${fieldName}"]`);
    if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = fieldName;
        form.appendChild(input);
    }
    input.value = residentId ? String(residentId) : '';
}

// Xử lý hiển thị/ẩn nút X khi gõ chữ
function handlePhuNuSearchInput(input) {
    let clearBtn = document.getElementById('clearSearchPhuNuBtn');
    if (clearBtn) {
        clearBtn.style.display = input.value.trim() ? 'flex' : 'none';
    }
    // Nếu người nhập gõ lại sau khi đã chọn, bỏ khóa cũ để tránh liên kết nhầm ID.
    if (!String(input.value || '').startsWith('Đã chọn:')) {
        const table = typeof currentTable !== 'undefined' ? currentTable : '';
        if (table === 'table_1') setResidentLinkId('dan_cu_me_id', '');
        else if (['table_3','table_5','table_7','table_9','table_11'].includes(table)) setResidentLinkId('dan_cu_id', '');
    }
    searchPhuNuMasterList(input.value);
}

// Hàm bấm vào nút X để xóa sạch nội dung ô tìm kiếm ngay lập tức
function clearPhuNuSearch() {
    let input = document.getElementById('inputSearchPhuNu');
    let clearBtn = document.getElementById('clearSearchPhuNuBtn');
    let suggestBox = document.getElementById('suggestBoxPhuNu');

    if (input) {
        input.value = '';
        input.style.backgroundColor = '#fff';
        input.focus();
        // Kích hoạt sự kiện để ẩn nút X đi
        input.dispatchEvent(new Event('input'));
    }
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    if (suggestBox) {
        suggestBox.innerHTML = '';
    }
    const table = typeof currentTable !== 'undefined' ? currentTable : '';
    if (table === 'table_1') setResidentLinkId('dan_cu_me_id', '');
    else if (['table_3','table_5','table_7','table_9','table_11'].includes(table)) setResidentLinkId('dan_cu_id', '');
}

// Escape dữ liệu dân cư trước khi đưa vào HTML gợi ý tìm kiếm.
function escapeSearchText(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Xác định trạng thái biến động để cán bộ không chọn nhầm hồ sơ đã chết/chuyển đi.
function getResidentSearchStatus(item) {
    const normalize = value => String(value ?? '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd').replace(/\s+/g, '_');
    const status = normalize(item?.trang_thai_tim_kiem || item?.trang_thai_cu_tru);
    const event = normalize(item?.su_kien_cuoi);
    if (['da_khai_tu', 'da_chet', 'khai_tu'].includes(status) || ['khai_tu', 'da_chet'].includes(event)) {
        return { key: 'dead', label: 'ĐÃ CHẾT', message: 'Hồ sơ đã ghi nhận khai tử' };
    }
    if (status === 'da_chuyen_di' || event === 'chuyen_di') {
        return { key: 'moved', label: 'ĐÃ CHUYỂN ĐI', message: 'Hồ sơ đã ghi nhận chuyển đi' };
    }
    return null;
}

function formatResidentEventDate(value) {
    if (!value) return '';
    const raw = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-');
        return `${d}/${m}/${y}`;
    }
    return raw;
}

// 2. Hàm tìm kiếm dữ liệu từ CSDL thông qua API Server
async function searchPhuNuMasterList(keyword) {
    let suggestBox = document.getElementById('suggestBoxPhuNu');
    if (!keyword || keyword.trim() === "" || keyword.startsWith("Đã chọn:")) {
        if (suggestBox) suggestBox.innerHTML = '';
        return;
    }

    try {
        const table = typeof currentTable !== 'undefined' ? currentTable : '';
        const womanMode = ['table_1', 'table_7', 'table_9'].includes(table);
        const params = new URLSearchParams({ q: keyword, mode: womanMode ? 'woman' : 'all' });
        let res = await fetch(`/api/dan-cu/search?${params.toString()}`);
        if (!res.ok) throw new Error('Không thể tìm kiếm danh sách dân cư');
        let data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            suggestBox.innerHTML = `<div class="list-group-item text-muted small">${womanMode ? 'Không tìm thấy phụ nữ 15–49 tuổi có vợ/có chồng phù hợp.' : 'Không tìm thấy người dân phù hợp trong danh sách dân cư.'}</div>`;
            return;
        }

        suggestBox.innerHTML = data.map(item => {
            const status = getResidentSearchStatus(item);
            const eventDate = formatResidentEventDate(item.ngay_su_kien);
            const statusHtml = status
                ? `<div class="small fw-bold text-danger mt-1"><i class="fa fa-exclamation-triangle me-1"></i>${status.label} — ${status.message}${eventDate ? ` (${escapeSearchText(eventDate)})` : ''}</div>`
                : '';
            const rowClass = status ? 'resident-search-warning border-danger bg-light' : '';
            const residentInfo = `
                <b>Mã hộ:</b> <span class="text-primary">${escapeSearchText(item.ma_ho)}</span> |
                <b>Họ tên:</b> <span class="${status ? 'text-danger fw-bold' : ''}">${escapeSearchText(item.ho_ten)}</span> |
                <b>Giới tính:</b> ${escapeSearchText(item.gioi_tinh || 'N/A')} |
                <b>Ngày sinh:</b> ${escapeSearchText(item.ngay_sinh || 'N/A')} |
                <b>Địa chỉ:</b> ${escapeSearchText(item.dia_chi || 'Chưa có địa chỉ')}
                ${statusHtml}
            `;

            // Hồ sơ đã chết/chuyển đi vẫn hiển thị để tra cứu, nhưng không tạo nút chọn.
            if (status) {
                return `
                    <div class="list-group-item py-2 ${rowClass} resident-search-readonly" role="note" aria-disabled="true" title="Hồ sơ chỉ xem, không thể chọn vào biểu mẫu">
                        ${residentInfo}
                        <div class="small text-danger mt-1"><i class="fa fa-eye me-1"></i>Chỉ xem — không thể chọn nhân khẩu này</div>
                    </div>
                `;
            }

            return `
                <button type="button" class="list-group-item list-group-item-action py-2 ${rowClass}" onclick='selectPhuNuFromMasterList(${JSON.stringify(item).replace(/'/g, '&#39;')})'>
                    ${residentInfo}
                </button>
            `;
        }).join('');
    } catch (e) {
        console.error('Lỗi dò tìm phụ nữ:', e);
    }
}

// 3. Hàm tự động điền thông tin vào các ô input khi cán bộ click chọn
function selectPhuNuFromMasterList(item) {
    // Chặn ở cả phía hàm chọn: không cho hồ sơ đã chết/chuyển đi được chọn,
    // kể cả khi hàm bị gọi thủ công từ console hoặc một đoạn mã cũ.
    if (getResidentSearchStatus(item)) {
        console.warn('Không thể chọn nhân khẩu đã chết hoặc đã chuyển đi. Hồ sơ chỉ được xem.');
        return false;
    }

    if (typeof currentTable !== 'undefined' && currentTable === 'table_6') {
        if (typeof selectResidentForTable6 === 'function') selectResidentForTable6(item);
        const suggest = document.getElementById('suggestBoxPhuNu');
        const search = document.getElementById('inputSearchPhuNu');
        if (suggest) suggest.innerHTML = '';
        if (search) { search.value = `Đã chọn: ${item.ho_ten} (Mã hộ: ${item.ma_ho || ''})`; search.style.backgroundColor = '#e8f5e9'; }
        return;
    }
    const selectedTable = typeof currentTable !== 'undefined' ? currentTable : '';
    if (selectedTable === 'table_1') setResidentLinkId('dan_cu_me_id', item.id);
    else if (['table_3','table_5','table_7','table_9','table_11'].includes(selectedTable)) setResidentLinkId('dan_cu_id', item.id);

    let hoSoInput = document.querySelector('[name="ho_so"]');
    
    const isTable1 = typeof currentTable !== 'undefined' && currentTable === 'table_1';

    const isTable9 = typeof currentTable !== 'undefined' && currentTable === 'table_9';
    const isTable7 = typeof currentTable !== 'undefined' && currentTable === 'table_7';
    const isTable11 = typeof currentTable !== 'undefined' && currentTable === 'table_11';

    let hoTenInput = isTable1
        ? document.querySelector('[name="ho_ten_me"]')
        : isTable7
            ? document.querySelector('[name="ho_ten_vo"]')
            : document.querySelector('[name="ho_ten"]');

    let bhytInput = isTable1
        ? document.querySelector('[name="so_the_bhyt_me"]')
        : document.querySelector('[name="so_the_bhyt"]');

    let ngaySinhInput = isTable1
        ? document.querySelector('[name="ngay_sinh_me"]')
        : document.querySelector('[name="ngay_sinh"]');

    if (hoSoInput) hoSoInput.value = item.ma_ho || '';
    if (hoTenInput) hoTenInput.value = item.ho_ten || '';
    if (bhytInput) bhytInput.value = item.ma_bhyt || '';

    // Khi chọn nhân khẩu từ dan_cu ở Bảng 3/5, tự điền các thông tin đã có.
    // Đây là các ô của biểu mẫu biến động; không cập nhật ngược dữ liệu dân cư tại bước chọn.
    const isTable3Or5 = ['table_3', 'table_5'].includes(typeof currentTable !== 'undefined' ? currentTable : '');
    if (isTable3Or5) {
        const setSelectedValue = (name, value) => {
            const field = document.querySelector(`[name="${name}"]`);
            if (!field) return;
            field.value = value === undefined || value === null ? '' : String(value);
            field.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setSelectedValue('dan_toc', item.dan_toc);
        setSelectedValue('gioi_tinh', item.gioi_tinh);
        setSelectedValue('quan_he', item.quan_he);
    }

    // Bảng 7 lấy số con hiện có trực tiếp từ dan_cu.so_con.
    if (isTable7) {
        const soConInput = document.querySelector('[name="so_con_hien_co"]');
        if (soConInput) {
            soConInput.value = item.so_con === undefined || item.so_con === null ? '' : String(item.so_con);
            soConInput.dispatchEvent(new Event('input', { bubbles: true }));
            soConInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    if (isTable11) {
        const yearInput = document.querySelector('[name="nam_sinh"]');
        if (yearInput && item.ngay_sinh) yearInput.value = item.ngay_sinh.slice(0, 4) === '0000' ? '' : item.ngay_sinh.slice(0, 4);
    }
    
    if (ngaySinhInput && item.ngay_sinh) {
        ngaySinhInput.value = item.ngay_sinh;
        let parts = item.ngay_sinh.split('-');
        if (parts.length === 3) {
            let container = ngaySinhInput.closest('.col-md-6') || ngaySinhInput.closest('div');
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

    let suggestBox = document.getElementById('suggestBoxPhuNu');
    let searchInput = document.getElementById('inputSearchPhuNu');
    
    if (suggestBox) suggestBox.innerHTML = '';
    if (searchInput) {
        searchInput.value = `Đã chọn: ${item.ho_ten} (Mã hộ: ${item.ma_ho})`;
        searchInput.style.backgroundColor = '#e8f5e9';
        // 🌟 KÍCH HOẠT SỰ KIỆN ĐỂ NÚT X HIỆN RA NGAY LẬP TỨC
        searchInput.dispatchEvent(new Event('input'));
    }
}

/* Hồ sơ đã có biến động kết thúc được đánh dấu đỏ trong mọi danh sách tìm kiếm dân cư. */
const residentSearchStatusStyle = document.createElement('style');
residentSearchStatusStyle.textContent = `
    .resident-search-warning { border-left: 4px solid #dc3545 !important; background: #fff5f5 !important; }
    .resident-search-warning:hover, .resident-search-warning:focus { background: #ffe8e8 !important; }
    .resident-search-readonly { cursor: not-allowed; opacity: .92; user-select: text; }
    .resident-search-readonly * { cursor: inherit; }
`;
if (!document.getElementById('residentSearchStatusStyle')) {
    residentSearchStatusStyle.id = 'residentSearchStatusStyle';
    document.head.appendChild(residentSearchStatusStyle);
}
