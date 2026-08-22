// vietnamese-formatter.js

// Bảng từ điển họ và tên đệm/tên phổ biến (viết thường không dấu để dễ tra cứu)
const vietnameseNameMap = {
    "nguyen": "Nguyễn",
    "tran": "Trần",
    "le": "Lê",
    "pham": "Phạm",
    "hoang": "Hoàng",
    "huynh": "Huỳnh",
    "phan": "Phan",
    "vu": "Vũ",
    "vo": "Võ",
    "danh": "Danh",
    "bui": "Bùi",
    "dang": "Đặng",
    "ho": "Hồ",
    "ngo": "Ngô",
    "duong": "Dương",
    "ly": "Lý",
    
    // Tên đệm và tên phổ biến
    "van": "Văn",
    "thi": "Thị",
    "huu": "Hữu",
    "duc": "Đức",
    "cong": "Công",
    "ngoc": "Ngọc",
    "xuan": "Xuân",
    "thanh": "Thanh",
    "minh": "Minh",
    "quang": "Quang",
    "tuan": "Tuấn",
    "anh": "Anh",
    "linh": "Linh",
    "phuong": "Phương",
    "thao": "Thảo",
    "trang": "Trang",
    "huong": "Hương",
    "mai": "Mai",
    "lan": "Lan",
    "thuan": "Thuận",
    "khanh": "Khánh",
    "dung": "Dũng",
};

// Hàm chuyển đổi chữ cái đầu thành viết hoa (nếu không có trong từ điển)
function capitalizeFirstLetter(string) {
    if (!string) return "";
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

// Khởi tạo lắng nghe sự kiện khi người dùng gõ phím hoặc nhấn khoảng cách (Space)
function initNameFormatter() {
    document.addEventListener('input', function (e) {
        if (e.target && ['ho_ten', 'ho_ten_con', 'ho_ten_me', 'ho_ten_vo', 'fullname'].includes(e.target.name)) {
            let cursorPosition = e.target.selectionStart;
            let rawValue = e.target.value;
            
            // Tách các từ dựa trên khoảng trắng nhưng vẫn giữ nguyên khoảng trắng để người dùng gõ thoải mái
            let words = rawValue.split(" ");
            
            let formattedWords = words.map((word, index) => {
                // Nếu từ đang gõ dở (chưa bấm cách) thì giữ nguyên để người dùng gõ tiếp cho mượt
                if (index === words.length - 1 && word.length > 0 && !rawValue.endsWith(" ")) {
                    return word;
                }
                
                if (!word) return "";
                
                // Chuẩn hóa không dấu để tra cứu trong từ điển
                let cleanWord = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
                
                // Nếu có trong từ điển -> lấy từ có dấu, nếu không -> tự viết hoa chữ cái đầu
                return vietnameseNameMap[cleanWord] || capitalizeFirstLetter(word);
            });

            // Ghép lại chuỗi với khoảng trắng bình thường
            let newValue = formattedWords.join(" ");
            
            // Tránh việc nhảy con trỏ khi đang gõ
            let diff = newValue.length - rawValue.length;
            e.target.value = newValue;
            
            try {
                e.target.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
            } catch (err) {
                // Bỏ qua lỗi nhỏ về vị trí con trỏ trên một số trình duyệt di động cũ
            }
        }
    });
}