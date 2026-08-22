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
    document.getElementById('wrapper_tu').style.display = (loai === 'tu') ? 'block' : 'none';
    document.getElementById('wrapper_di_den').style.display = (loai === 'di_den') ? 'block' : 'none';
    document.getElementById('wrapper_bptt').style.display = (loai === 'bptt') ? 'block' : 'none';
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

    if (loai === 'tu') {
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

        // Xử lý các bảng khác (sinh, tử, đi đến)
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
            } else if (loai === 'tu') {
                let rawCTV = item.nguoi_nhap || '';
                let tenCTV = rawCTV.replace(/\s*\(.*?\)\s*/g, '').trim();
                let tenAp = item.ap || '';
                let apDisplay = tenAp ? "Ấp " + tenAp.replace(/^ấp\s+/i, '').trim() : "";

                // Lấy đúng các trường dữ liệu chuẩn từ table_3
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

    if (loai === 'tu') {
        tableId = 'tbl_tu';
        tenFile = 'Bao_Cao_Tu';
        tenTieuDe = 'PHẦN THEO DÕI TỬ VONG';
    } else if (loai === 'di_den') {
        tableId = 'tbl_di_den';
        tenFile = 'Bao_Cao_Di_Den';
        tenTieuDe = 'PHẦN THEO DÕI ĐI ĐẾN';
    }
    else if (loai === 'bptt') {
        tableId = 'tbl_bptt';
        tenFile = 'Bao_Cao_Bien_Phap_Tranh_Thai';
        tenTieuDe = 'SỔ THEO DÕI BIỆN PHÁP TRÁNH THAI';
    }
    const table = document.getElementById(tableId);
    const ws = XLSX.utils.table_to_sheet(table);
    
    let tieuDeThoiGian = (thang && nam) ? `Tháng ${thang}/${nam}` : (nam ? `Năm ${nam}` : "Tất cả các tháng");

    XLSX.utils.sheet_add_aoa(ws, [
        [tenTieuDe],
        [tieuDeThoiGian],
        [""] 
    ], { origin: "A1" });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${tenFile}_Thang_${thang || 'All'}_${nam}.xlsx`);
}

window.onload = loadData;