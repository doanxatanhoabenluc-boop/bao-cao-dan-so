function formatDate(dateStr) {
    if (!dateStr) return '';
    let timeMatch = dateStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (timeMatch) {
        let d = timeMatch[1].padStart(2, '0');
        let m = timeMatch[2].padStart(2, '0');
        let y = timeMatch[3];
        return `${d}/${m}/${y}`;
    }
    let altMatch = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (altMatch) {
        let y = altMatch[1];
        let m = altMatch[2].padStart(2, '0');
        let d = altMatch[3].padStart(2, '0');
        return `${d}/${m}/${y}`;
    }
    return dateStr; 
}

function doiLoaiBaoCao() {
    const loai = document.getElementById('filterLoaiBaoCao').value;
    document.getElementById('wrapper_sinh').style.display = (loai === 'sinh') ? 'block' : 'none';
    document.getElementById('wrapper_sang_loc_so_sinh').style.display = (loai === 'sang_loc_so_sinh') ? 'block' : 'none';
    document.getElementById('wrapper_tu').style.display = (loai === 'tu') ? 'block' : 'none';
    document.getElementById('wrapper_di_den').style.display = (loai === 'di_den') ? 'block' : 'none';
    document.getElementById('wrapper_bptt').style.display = (loai === 'bptt') ? 'block' : 'none';
    document.getElementById('wrapper_sang_loc_truoc_sinh').style.display = (loai === 'sang_loc_truoc_sinh') ? 'block' : 'none';
    loadData();
}

async function loadData() {
    const loai = document.getElementById('filterLoaiBaoCao').value;
    const thang = document.getElementById('filterThang').value; 
    const nam = document.getElementById('filterNam').value;    

    let apiEndpoints = [];
    let tableId = '#tbl_sinh';
    let colSpanNum = 11;
    let tenBaoCao = 'PHẦN THEO DÕI SINH';

    if (loai === 'sang_loc_so_sinh') {
        apiEndpoints = ['/api/data/table_2'];
        tableId = '#tbl_sang_loc_so_sinh';
        colSpanNum = 16;
        tenBaoCao = 'SỔ SÀNG LỌC SƠ SINH';
    } else if (loai === 'tu') {
        apiEndpoints = ['/api/data/table_3'];
        tableId = '#tbl_tu';
        colSpanNum = 10;
        tenBaoCao = 'PHẦN THEO DÕI TỬ VONG';
    } else if (loai === 'di_den') {
        apiEndpoints = ['/api/data/table_4', '/api/data/table_5'];
        tableId = '#tbl_di_den';
        colSpanNum = 12;
        tenBaoCao = 'PHẦN THEO DÕI ĐI ĐẾN';
    } else if (loai === 'bptt') {
        tableId = '#tbl_bptt';
        colSpanNum = 13;
        tenBaoCao = 'SỔ THEO DÕI BIỆN PHÁP TRÁNH THAI';
    } else if (loai === 'sang_loc_truoc_sinh') {
        apiEndpoints = ['/api/data/table_10'];
        tableId = '#tbl_sang_loc_truoc_sinh';
        colSpanNum = 15;
        tenBaoCao = 'SỔ SÀNG LỌC TRƯỚC SINH';
    } else {
        apiEndpoints = ['/api/data/table_1'];
    }

    let titleWeb = document.getElementById('dynamicWebTitle');
    if (!titleWeb) {
        let container = document.querySelector(tableId).parentNode;
        titleWeb = document.createElement('div');
        titleWeb.id = 'dynamicWebTitle';
        titleWeb.className = 'text-center my-3';
        container.insertBefore(titleWeb, document.querySelector(tableId));
    }
    let textThoiGian = (thang && nam) ? `Tháng ${thang}/${nam}` : (nam ? `Năm ${nam}` : "Tất cả các tháng");
    titleWeb.innerHTML = `
        <h4 class="fw-bold text-uppercase m-0">${tenBaoCao}</h4>
        <h5 class="text-secondary mt-1">${textThoiGian}</h5>
    `;

    const tbody = document.querySelector(`${tableId} tbody`);
    tbody.innerHTML = "";

    try {
        // Xử lý đặc biệt gộp Bảng 7 và Bảng 8 cho Sổ BPTT
        if (loai === 'bptt') {
            let res7 = await fetch('/api/data/table_7').then(r => r.json()).catch(() => []);
            let res8 = await fetch('/api/data/table_8').then(r => r.json()).catch(() => []);

            const filterByTime = (item) => {
                let createdAt = item.created_at || '';
                if (!createdAt) return false;
                let m = '', y = '';
                let dateMatch = createdAt.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
                if (dateMatch) {
                    m = dateMatch[2]; y = dateMatch[3];
                } else {
                    let altMatch = createdAt.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
                    if (altMatch) { y = altMatch[1]; m = altMatch[2]; }
                }
                if (!m || !y) return false;
                let matchThang = !thang || parseInt(m, 10) === parseInt(thang, 10);
                let matchNam = !nam || parseInt(y, 10) === parseInt(nam, 10);
                return matchThang && matchNam;
            };

            let list7 = Array.isArray(res7) ? res7.filter(filterByTime) : [];
            let list8 = Array.isArray(res8) ? res8.filter(filterByTime) : [];

            let mapData = new Map();

           // Đưa dữ liệu Bảng 7 vào map với key kết hợp đầy đủ: Hộ số + Địa bàn + Ấp + Họ tên vợ
            list7.forEach(item => {
                let hoSo = (item.so_ho || item.ho_so || '').trim();
                let diaBan = (item.dia_ban || item.to || '').trim();
                let ap = (item.ap || '').trim();
                let hoTen = (item.ho_ten_vo || '').trim();
                
                let key = `${hoSo}_${diaBan}_${ap}_${hoTen}`.toLowerCase();
                mapData.set(key, {
                    ...item,
                    bptt_moi: item.bptt_moi || '',
                    ngay_su_dung: item.ngay_su_dung || '',
                    noi_thuc_hien_moi: item.noi_thuc_hien || '',
                    bptt_thoi: '',
                    ngay_thoi_su_dung: '',
                    noi_thuc_hien_thoi: ''
                });
            });

            // Gộp dữ liệu Bảng 8 vào chung key tương ứng
            list8.forEach(item => {
                let hoSo = (item.so_ho || item.ho_so || '').trim();
                let diaBan = (item.dia_ban || item.to || '').trim();
                let ap = (item.ap || '').trim();
                let hoTen = (item.ho_ten_vo || '').trim();
                
                let key = `${hoSo}_${diaBan}_${ap}_${hoTen}`.toLowerCase();
                if (mapData.has(key)) {
                    let existing = mapData.get(key);
                    existing.bptt_thoi = item.bptt_thoi || '';
                    existing.ngay_thoi_su_dung = item.ngay_thoi_su_dung || '';
                    existing.noi_thuc_hien_thoi = item.noi_thuc_hien || item.noi_thuc_hien || '';
                    if (!existing.so_con_hien_co) existing.so_con_hien_co = item.so_con_hien_co || '';
                } else {
                    mapData.set(key, {
                        ...item,
                        bptt_moi: '',
                        ngay_su_dung: '',
                        noi_thuc_hien_moi: '',
                        bptt_thoi: item.bptt_thoi || '',
                        ngay_thoi_su_dung: item.ngay_thoi_su_dung || '',
                        noi_thuc_hien_thoi: item.noi_thuc_hien || ''
                    });
                }
            });

            let combinedBPTT = Array.from(mapData.values());

            if (combinedBPTT.length === 0) {
                tbody.innerHTML = `<tr><td colspan='${colSpanNum}' class='text-center text-warning'>Không có dữ liệu trong tháng ${thang || 'tất cả'} năm ${nam}</td></tr>`;
                return;
            }

            combinedBPTT.forEach((item, index) => {
                let rawCTV = item.nguoi_nhap || '';
                let tenCTV = rawCTV.replace(/\s*\(.*?\)\s*/g, '').trim();
                let tenAp = item.ap || '';
                let apDisplay = tenAp ? "Ấp " + tenAp.replace(/^ấp\s+/i, '').trim() : "";

                // Chỉ lấy nơi thực hiện của bảng 7
                let noiThucHienMoi = item.noi_thuc_hien_moi || '';
                
                // Chỉ lấy nơi thực hiện của bảng 8 (nếu không có dữ liệu bảng 8 thì để trống)
                let noiThucHienThoi = item.bptt_thoi ? (item.noi_thuc_hien_thoi || '') : '';

                let row = `<tr>
                    <td>${index + 1}</td>
                    <td>${item.so_ho || item.ho_so || ''}</td>
                    <td class="text-center">
                        <div class="fw-bold">${tenCTV}</div>
                        <div class="text-muted small">${apDisplay}</div>
                    </td>
                    <td class="fw-bold">${item.ho_ten_vo || ''}</td>
                    <td>${item.ngay_sinh || ''}</td>
                    <td>${item.so_con_hien_co || ''}</td>
                    <td>${item.bptt_moi}</td>
                    <td>${formatDate(item.ngay_su_dung)}</td>
                    <td>${noiThucHienMoi}</td>
                    <td>${item.bptt_thoi}</td>
                    <td>${formatDate(item.ngay_thoi_su_dung)}</td>
                    <td>${noiThucHienThoi}</td>
                    <td>${item.ghi_chu || ''}</td>
                </tr>`;
                tbody.innerHTML += row;
            });
            return;
        }

        // Xử lý các bảng khác (sinh, sàng lọc sơ sinh, tử, đi đến, sàng lọc trước sinh)
        let combinedData = [];
        for (let endpoint of apiEndpoints) {
            try {
                let res = await fetch(endpoint);
                let json = await res.json();
                if (Array.isArray(json)) combinedData = combinedData.concat(json);
            } catch (e) { console.error(e); }
        }

        if (combinedData.length === 0) {
            tbody.innerHTML = `<tr><td colspan='${colSpanNum}' class='text-center text-muted'>Chưa có dữ liệu</td></tr>`;
            return;
        }

        const filteredData = combinedData.filter(item => {
            let createdAt = item.created_at || '';
            if (!createdAt) return false;
            let m = '', y = '';
            let dateMatch = createdAt.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
            if (dateMatch) { m = dateMatch[2]; y = dateMatch[3]; }
            else {
                let altMatch = createdAt.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
                if (altMatch) { y = altMatch[1]; m = altMatch[2]; }
            }
            if (!m || !y) return false;
            return (!thang || parseInt(m, 10) === parseInt(thang, 10)) && (!nam || parseInt(y, 10) === parseInt(nam, 10));
        });

        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan='${colSpanNum}' class='text-center text-warning'>Không có dữ liệu trong thời gian này</td></tr>`;
            return;
        }

        filteredData.forEach((item, index) => {
            let row = '';
            if (loai === 'sinh') {
                let rawCTV = item.nguoi_nhap || '';
                let tenCTV = rawCTV.replace(/\s*\(.*?\)\s*/g, '').trim();
                let tenAp = item.ap || '';
                let apDisplay = tenAp ? "Ấp " + tenAp.replace(/^ấp\s+/i, '').trim() : "";
                row = `<tr>
                    <td>${index + 1}</td>
                    <td>${item.so_ho || item.ho_so || ''}</td>
                    <td class="text-center"><div class="fw-bold">${tenCTV}</div><div class="text-muted small">${apDisplay}</div></td>
                    <td>${item.ho_ten_me || ''}</td>
                    <td>${formatDate(item.ngay_sinh_me)}</td>
                    <td>${item.ho_ten_con || ''}</td>
                    <td>${item.gioi_tinh || ''}</td>
                    <td>${formatDate(item.ngay_sinh_con)}</td>
                    <td>${item.con_thu_may || ''}</td>
                    <td>${item.noi_de || ''}</td>
                    <td>${item.ghi_chu || ''}</td>
                </tr>`;
            } else if (loai === 'sang_loc_so_sinh') {
                let rawCTV = item.nguoi_nhap || '';
                let tenCTV = rawCTV.replace(/\s*\(.*?\)\s*/g, '').trim();
                let tenAp = item.ap || '';
                let apDisplay = tenAp ? "Ấp " + tenAp.replace(/^ấp\s+/i, '').trim() : "";
                
                let gioiTinh = (item.gioi_tinh || '').toLowerCase();
                let ngaySinhCon = formatDate(item.ngay_sinh_con || item.ngay_sinh_tre);
                let namSuDungNam = (gioiTinh === 'nam' || gioiTinh === '1') ? ngaySinhCon : '';
                let namSuDungNu = (gioiTinh === 'nữ' || gioiTinh === 'nu' || gioiTinh === '2') ? ngaySinhCon : '';

                row = `<tr>
                    <td>${index + 1}</td>
                    <td>
                        <div class="fw-bold">${tenCTV}</div>
                        <div class="text-muted small">${apDisplay}</div>
                    </td>
                    <td>${item.so_ho || item.ho_so || ''}</td>
                    <td>${item.ma_the_bhyt_me || item.ma_the_bhyt || ''}</td>
                    <td class="fw-bold text-start">${item.ho_ten_me || ''}</td>
                    <td class="text-start">${item.noi_cu_tru || ''}</td>
                    <td>${item.nam_sinh_me || ''}</td>
                    <td class="fw-bold text-start">${item.ho_ten_tre || item.ho_ten_con || ''}</td>
                    <td>${namSuDungNam}</td>
                    <td>${namSuDungNu}</td>
                    <td>${item.suy_giap || item.benh_suy_giap || 'Bình thường'}</td>
                    <td>${item.g6pd || item.benh_g6pd || 'Bình thường'}</td>
                    <td>${item.thuong_than || item.tang_san_thuong_than || 'Bình thường'}</td>
                    <td>${item.khiem_thinh || 'Bình thường'}</td>
                    <td>${item.tim_bam_sinh || 'Bình thường'}</td>
                    <td>${item.noi_thuc_hien || item.ghi_chu || ''}</td>
                </tr>`;
            } else if (loai === 'tu') {
                let rawCTV = item.nguoi_nhap || '';
                let tenCTV = rawCTV.replace(/\s*\(.*?\)\s*/g, '').trim();
                let tenAp = item.ap || '';
                let apDisplay = tenAp ? "Ấp " + tenAp.replace(/^ấp\s+/i, '').trim() : "";

                let hoTen = item.ho_ten || '';
                let ngaySinh = item.ngay_sinh || '';
                let gioiTinh = item.gioi_tinh || '';
                let quanHe = item.quan_he || '';
                let ngayChet = item.ngay_chet || '';

                row = `<tr>
                    <td>${index + 1}</td>
                    <td>${item.so_ho || item.ho_so || ''}</td>
                    <td class="text-center">
                        <div class="fw-bold">${tenCTV}</div>
                        <div class="text-muted small">${apDisplay}</div>
                    </td>
                    <td class="fw-bold">${hoTen}</td>
                    <td>${ngaySinh}</td>
                    <td>${gioiTinh}</td>
                    <td>${quanHe}</td>
                    <td>${formatDate(ngayChet)}</td>
                    <td>${item.ghi_chu || ''}</td>
                </tr>`;
            } else if (loai === 'di_den') {
                let hoTen = item.ho_ten || item.ho_va_ten || '';
                let ngaySinh = formatDate(item.ngay_sinh) || item.ngay_sinh || '';
                let ngayDi = formatDate(item.ngay_di) || item.ngay_di || '';
                let diDau = item.di_dau || item.noi_den || ''; 
                let ngayDen = formatDate(item.ngay_den) || item.ngay_den || '';
                let dauDen = item.noi_di || item.dau_den || ''; 
                let diaBan = item.dia_ban || item.dia_ban_to || '';
                row = `<tr>
                    <td>${index + 1}</td>
                    <td>${item.so_ho || item.ho_so || ''}</td>
                    <td>${diaBan}</td>
                    <td class="fw-bold">${hoTen}</td>
                    <td>${ngaySinh}</td>
                    <td>${item.gioi_tinh || ''}</td>
                    <td>${item.tinh_trang_hon_nhan || item.quan_he || ''}</td>
                    <td>${ngayDi}</td>
                    <td>${diDau}</td>
                    <td>${ngayDen}</td>
                    <td>${dauDen}</td>
                    <td>${item.ly_do || item.ghi_chu || ''}</td>
                </tr>`;
            } else if (loai === 'sang_loc_truoc_sinh') {
                let rawCTV = item.nguoi_nhap || '';
                let tenCTV = rawCTV.replace(/\s*\(.*?\)\s*/g, '').trim();
                let tenAp = item.ap || '';
                let apDisplay = tenAp ? "Ấp " + tenAp.replace(/^ấp\s+/i, '').trim() : "";
                
                let soHo = item.so_ho || '';
                let maBhyt = item.ma_the_bhyt || '';
                let hoTen = item.ho_ten || '';
                let noiCuTru = item.noi_cu_tru || '';
                let ngayKinhCuoi = formatDate(item.ngay_thang_mang_thai);
                let noiThucHien = item.ghi_chu || '';

                // Dòng 1: Tuần 12
                row += `<tr>
                    <td rowspan="2">${index + 1}</td>
                    <td rowspan="2">
                        <div class="fw-bold">${tenCTV}</div>
                        <div class="text-muted small">${apDisplay}</div>
                    </td>
                    <td rowspan="2">${soHo}</td>
                    <td rowspan="2">${maBhyt}</td>
                    <td rowspan="2" class="fw-bold text-start">${hoTen}</td>
                    <td rowspan="2" class="text-start">${noiCuTru}</td>
                    <td rowspan="2">${ngayKinhCuoi}</td>
                    <td>12 tuần</td>
                    <td>${formatDate(item.mang_thai_tuan_12)}</td>
                    <td>${item.hoi_chung_edward_12 || item.hoi_chung_edward || ''}</td>
                    <td>${item.hoi_chung_down_12 || item.hoi_chung_down || ''}</td>
                    <td>${item.hoi_chung_patau_12 || item.hoi_chung_patau || ''}</td>
                    <td>${item.benh_thalassemia_12 || item.benh_thalassemia || ''}</td>
                    <td rowspan="2">${noiThucHien}</td>
                </tr>`;

                // Dòng 2: Tuần 21
                row += `<tr>
                    <td>21 tuần</td>
                    <td>${formatDate(item.mang_thai_tuan_21)}</td>
                    <td>${item.hoi_chung_edward_21 || ''}</td>
                    <td>${item.hoi_chung_down_21 || ''}</td>
                    <td>${item.hoi_chung_patau_21 || ''}</td>
                    <td>${item.benh_thalassemia_21 || ''}</td>
                </tr>`;
            }
            tbody.innerHTML += row;
        });
    } catch (err) {
        console.error("Lỗi tải dữ liệu:", err);
        tbody.innerHTML = `<tr><td colspan='${colSpanNum}' class='text-center text-danger'>Lỗi kết nối tới Server!</td></tr>`;
    }
}

function xuatExcel() {
    const loai = document.getElementById('filterLoaiBaoCao').value;
    const thang = document.getElementById('filterThang').value;
    const nam = document.getElementById('filterNam').value;
    
    let tableId = 'tbl_sinh';
    let tenFile = 'Bao_Cao_Sinh';
    let tenTieuDe = 'PHẦN THEO DÕI SINH';
    let colSpanVal = 11; // Mặc định cho sổ sinh

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
    }
    
    let tieuDeThoiGian = (thang && nam) ? `Tháng ${thang}/${nam}` : (nam ? `Năm ${nam}` : "Tất cả các tháng");
    const table = document.getElementById(tableId);

    // Tạo cấu trúc HTML kèm CSS kẻ viền và canh lề chuẩn khi mở bằng Microsoft Excel
    let htmlContent = `
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

    // Xuất file dưới định dạng .xls tương thích hoàn toàn với Excel
    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tenFile}_Thang_${thang || 'All'}_${nam}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.onload = loadData;