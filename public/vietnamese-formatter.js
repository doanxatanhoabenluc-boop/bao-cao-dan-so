// vietnamese-formatter.js
// Bộ chuẩn hóa họ tên tiếng Việt.
// Ưu tiên: 1) ánh xạ cả cụm họ tên trong DB -> 2) ánh xạ từng từ -> 3) viết hoa chữ đầu.
// Điểm quan trọng: nếu người dùng đã gõ chữ có dấu (Phẩm, Ánh...) thì KHÔNG tự đổi dấu đó.

// Chỉ chứa các ánh xạ mặc định tương đối an toàn.
// KHÔNG tự đoán các từ dễ nhầm như: dung -> Dũng, anh -> Anh,
// thanh -> Thanh, minh -> Minh... Những trường hợp này phải để
// người dùng nhập có dấu hoặc cấu hình theo CẢ HỌ TÊN trong Database.
const defaultVietnameseNameMap = {
    "nguyen":"Nguyễn","tran":"Trần","le":"Lê","pham":"Phạm","hoang":"Hoàng","huynh":"Huỳnh",
    "phan":"Phan","vu":"Vũ","vo":"Võ","danh":"Danh","bui":"Bùi","dang":"Đặng","ho":"Hồ",
    "ngo":"Ngô","duong":"Dương","ly":"Lý",
    "van":"Văn","thi":"Thị","huu":"Hữu","duc":"Đức","cong":"Công","ngoc":"Ngọc","xuan":"Xuân",
    "phuong":"Phương","thao":"Thảo","trang":"Trang","huong":"Hương",
    "thuan":"Thuận","khanh":"Khánh","tuan":"Tuấn"
};

// Danh sách các từ dễ có nhiều cách khôi phục khi bỏ dấu.
// Các từ này KHÔNG được tự động đoán từ không dấu.
// Nếu cần một người cụ thể, hãy thêm ánh xạ fullname vào Database.
const ambiguousVietnameseNameWords = {
    "anh": ["Anh", "Ánh"],
    "dung": ["Dung", "Dũng"],
    "pham": ["Phạm", "Phẩm"],
    "thanh": ["Thanh", "Thành"],
    "minh": ["Minh", "Mình"],
    "quang": ["Quang", "Quảng"],
    "linh": ["Linh", "Lĩnh"],
    "mai": ["Mai", "Mài"],
    "lan": ["Lan", "Lân"],
    "trang": ["Trang", "Tràng"],
    "huong": ["Hương", "Hưởng"],
    "thao": ["Thao", "Tháo", "Thảo"],
    "van": ["Văn", "Vân"],
    "tuan": ["Tuân", "Tuấn"],
    "yen": ["Yên", "Yến"]
};

// Giữ tên biến cũ để code khác trong hệ thống không bị ảnh hưởng.
const vietnameseNameMap = { ...defaultVietnameseNameMap };
const vietnameseFullNameMap = {};

function normalizeVietnamese(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/đ/g, 'd')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasVietnameseDiacritics(value) {
    return /[À-ỹ]/i.test(String(value || ''));
}

function capitalizeFirstLetter(string) {
    if (!string) return "";
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

function mergeVietnameseNameMap(items) {
    if (!Array.isArray(items)) return;

    items.forEach(item => {
        const key = normalizeVietnamese(item.tu_khoa || item.key || '');
        const value = String(item.ten_hien_thi || item.value || '').trim();
        if (!key || !value) return;

        if ((item.loai || 'word') === 'fullname') {
            vietnameseFullNameMap[key] = value;
        } else {
            vietnameseNameMap[key] = value;
        }
    });
}

async function loadVietnameseNameMap() {
    try {
        const res = await fetch('/api/vietnamese-name-map', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        mergeVietnameseNameMap(data);
    } catch (err) {
        console.warn('Không tải được vietnameseNameMap từ database:', err);
    }
}

function formatVietnameseName(rawValue) {
    if (!rawValue) return "";

    const original = rawValue.replace(/\s+/g, ' ').trim();
    if (!original) return "";

    // Ưu tiên ánh xạ nguyên cụm tên.
    const fullKey = normalizeVietnamese(original);
    if (vietnameseFullNameMap[fullKey]) {
        return vietnameseFullNameMap[fullKey];
    }

    const words = original.split(' ');
    return words.map(word => {
        if (!word) return "";

        // Người dùng đã gõ dấu thì giữ nguyên dấu của họ.
        if (hasVietnameseDiacritics(word)) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        }

        const cleanWord = normalizeVietnamese(word);
        return vietnameseNameMap[cleanWord] || capitalizeFirstLetter(word);
    }).join(' ');
}

function initNameFormatter() {
    // Tải danh mục DB ngay khi khởi tạo nhưng không chặn việc nhập liệu.
    loadVietnameseNameMap();

    document.addEventListener('input', function (e) {
        if (!e.target || !['ho_ten', 'ho_ten_con', 'ho_ten_me', 'ho_ten_vo', 'fullname'].includes(e.target.name)) {
            return;
        }

        const input = e.target;
        const rawValue = input.value;
        const cursorPosition = input.selectionStart ?? rawValue.length;

        // Chỉ tự động chuẩn hóa khi người dùng vừa kết thúc một từ.
        // Khi đang gõ dở "Pham" -> "Phạm" sẽ không nhảy chữ giữa chừng.
        if (!rawValue.endsWith(' ')) return;

        const formatted = formatVietnameseName(rawValue);
        if (formatted === rawValue) return;

        input.value = formatted + ' ';

        try {
            const newCursor = Math.min(cursorPosition + (formatted.length + 1 - rawValue.length), input.value.length);
            input.setSelectionRange(newCursor, newCursor);
        } catch (err) {}
    });

    // Khi rời khỏi ô nhập, chuẩn hóa lần cuối toàn bộ họ tên.
    document.addEventListener('blur', function (e) {
        if (!e.target || !['ho_ten', 'ho_ten_con', 'ho_ten_me', 'ho_ten_vo', 'fullname'].includes(e.target.name)) {
            return;
        }
        const formatted = formatVietnameseName(e.target.value);
        if (formatted) e.target.value = formatted;
    }, true);
}
