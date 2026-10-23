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
            <input type="text" id="inputSearchPhuNu" class="form-control shadow-none pe-5" placeholder="Gõ Mã hộ (vd: 00007) hoặc Họ tên để dò tìm trong khu vực của bạn..." oninput="handlePhuNuSearchInput(this)">
            <button type="button" id="clearSearchPhuNuBtn" class="phunu-clear-btn" style="display: none;" onclick="clearPhuNuSearch()">&times;</button>
        </div>
        <div id="suggestBoxPhuNu" class="list-group position-absolute shadow-sm w-100" style="z-index: 1050; max-height: 220px; overflow-y: auto;"></div>
        <small class="text-muted mt-1 d-block">💡 Chọn từ danh sách gợi ý để tự động điền Mã hộ, Họ tên, Ngày sinh, BHYT.</small>
    `;
    return col;
}

// Xử lý hiển thị/ẩn nút X khi gõ chữ
function handlePhuNuSearchInput(input) {
    let clearBtn = document.getElementById('clearSearchPhuNuBtn');
    if (clearBtn) {
        clearBtn.style.display = input.value.trim() ? 'flex' : 'none';
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
}

// 2. Hàm tìm kiếm dữ liệu từ CSDL thông qua API Server
async function searchPhuNuMasterList(keyword) {
    let suggestBox = document.getElementById('suggestBoxPhuNu');
    if (!keyword || keyword.trim() === "" || keyword.startsWith("Đã chọn:")) {
        if (suggestBox) suggestBox.innerHTML = '';
        return;
    }

    try {
        let res = await fetch(`/api/search-phu-nu-15-49?q=${encodeURIComponent(keyword)}`);
        let data = await res.json();

        if (data.length === 0) {
            suggestBox.innerHTML = `<div class="list-group-item text-muted small">Không tìm thấy phụ nữ phù hợp trong khu vực phân công của bạn</div>`;
            return;
        }

        suggestBox.innerHTML = data.map(item => `
            <button type="button" class="list-group-item list-group-item-action py-2" onclick='selectPhuNuFromMasterList(${JSON.stringify(item)})'>
                <b>Mã hộ:</b> <span class="text-primary">${item.ma_ho}</span> | 
                <b>Họ tên:</b> ${item.ho_ten} | 
                <b>Địa bàn:</b> ${item.diabanh} | 
                <b>Ngày sinh:</b> ${item.ngay_sinh || 'N/A'}
            </button>
        `).join('');
    } catch (e) {
        console.error('Lỗi dò tìm phụ nữ:', e);
    }
}

// 3. Hàm tự động điền thông tin vào các ô input khi cán bộ click chọn
function selectPhuNuFromMasterList(item) {
    let hoSoInput = document.querySelector('[name="ho_so"]');
    
    const isTable1 = typeof currentTable !== 'undefined' && currentTable === 'table_1';
    const isTable9 = typeof currentTable !== 'undefined' && currentTable === 'table_9';

    let hoTenInput = isTable1
        ? document.querySelector('[name="ho_ten_me"]')
        : isTable9
            ? document.querySelector('[name="ho_ten"]')
            : document.querySelector('[name="ho_ten_vo"]');

    let bhytInput = isTable1
        ? document.querySelector('[name="so_the_bhyt_me"]')
        : document.querySelector('[name="so_the_bhyt"]');

    let ngaySinhInput = isTable1
        ? document.querySelector('[name="ngay_sinh_me"]')
        : document.querySelector('[name="ngay_sinh"]');

    if (hoSoInput) hoSoInput.value = item.ma_ho || '';
    if (hoTenInput) hoTenInput.value = item.ho_ten || '';
    if (bhytInput) bhytInput.value = item.so_the_bhyt || '';
    
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