document.addEventListener("DOMContentLoaded", function () {
    fetchUserDataAndInit();
});

let currentUserGlobal = null;
let allDiaBanData = [];

// Hàm hỗ trợ định dạng ngày từ YYYY-MM-DD sang DD/MM/YYYY
function formatDateVN(dateString) {
    if (!dateString) return "";
    let datePart = dateString.split(' ')[0];
    let parts = datePart.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
}

async function fetchUserDataAndInit() {
    try {
        const res = await fetch('/api/me');
        const user = await res.json();
        
        if (!user || !user.id) {
            window.location.href = "index.html";
            return;
        }

        currentUserGlobal = user;

        document.getElementById("lblReporterName").innerText = user.fullname || user.username;
        document.getElementById("signCtvName").innerText = user.fullname || user.username;
        document.getElementById("signAdminName").innerText = user.role === "admin" ? (user.fullname || user.username) : "..............................................";

        const filterApSelect = document.getElementById("filterAp");
        const filterDiaBanSelect = document.getElementById("filterDiaBan");

        await loadApDiaBanStructure();

        if (user.role === "cộng tác viên ấp" || (user.role !== "admin" && user.role !== "lãnh đạo" && user.diabanh)) {
            filterApSelect.innerHTML = `<option value="${user.ap}">${user.ap}</option>`;
            filterApSelect.disabled = true;

            filterDiaBanSelect.innerHTML = `<option value="${user.diabanh}">${user.diabanh}</option>`;
            filterDiaBanSelect.disabled = true;
            
            document.getElementById("txtDiaBan").innerText = user.diabanh || "Chưa phân địa bàn";
            document.getElementById("txtAp").innerText = user.ap || "Chưa phân ấp";
        } else {
            document.getElementById("txtDiaBan").innerText = "Toàn xã";
            document.getElementById("txtAp").innerText = "Toàn xã";
        }

        document.getElementById("txtXa").innerText = user.xa || "Lương Hòa";

        loadReportData();

    } catch (err) {
        console.error("Lỗi khởi tạo báo cáo:", err);
    }
}

async function loadApDiaBanStructure() {
    try {
        const resAp = await fetch('/api/danh-sach-ap');
        const apData = await resAp.json();

        const filterApSelect = document.getElementById("filterAp");
        if (!filterApSelect.disabled && Array.isArray(apData)) {
            let options = `<option value="">Toàn xã (Tất cả các ấp)</option>`;
            apData.forEach(item => {
                let tenAp = item.ten_ap;
                options += `<option value="${tenAp}">${tenAp}</option>`;
            });
            filterApSelect.innerHTML = options;
        }

        const resUsers = await fetch('/api/admin/users');
        const usersData = await resUsers.json();
        
        if (Array.isArray(usersData)) {
            allDiaBanData = usersData; 
        }
    } catch (err) {
        console.error("Lỗi tải danh mục ấp và địa bàn:", err);
    }
}

function onApChange() {
    const selectedAp = document.getElementById("filterAp").value;
    const filterDiaBanSelect = document.getElementById("filterDiaBan");

    let options = `<option value="">Tất cả địa bàn</option>`;
    if (selectedAp) {
        let matchedDiaban = allDiaBanData.filter(x => x.ap === selectedAp);
        let uniqueDiabans = [...new Set(matchedDiaban.map(x => x.diabanh))].filter(Boolean);
        
        uniqueDiabans.forEach(db => {
            options += `<option value="${db}">${db}</option>`;
        });
    } else {
        let allDiabans = [...new Set(allDiaBanData.map(x => x.diabanh))].filter(Boolean);
        allDiabans.forEach(db => {
            options += `<option value="${db}">${db}</option>`;
        });
    }
    filterDiaBanSelect.innerHTML = options;
    loadReportData();
}

async function loadReportData() {
    const month = document.getElementById("filterMonth").value;
    const year = document.getElementById("filterYear").value;
    const selectedAp = document.getElementById("filterAp").value;
    const selectedDiaBan = document.getElementById("filterDiaBan").value;

    document.getElementById("txtMonth").innerText = month;
    document.getElementById("txtYear").innerText = year;
    
    document.getElementById("txtAp").innerText = selectedAp || (currentUserGlobal.ap || "Toàn xã");
    document.getElementById("txtDiaBan").innerText = selectedDiaBan || (currentUserGlobal.diabanh || "Toàn xã");

    // 🕒 Lấy ngày tháng năm hiện tại của hệ thống
    const today = new Date();
    const signDayEl = document.getElementById("signDay");
    const signMonthEl = document.getElementById("signMonth");
    const signYearEl = document.getElementById("signYear");

    if (signDayEl) signDayEl.innerText = today.getDate();
    if (signMonthEl) signMonthEl.innerText = today.getMonth() + 1;
    if (signYearEl) signYearEl.innerText = today.getFullYear();

    for (let i = 1; i <= 11; i++) {
        fetchAndRenderTable(i, month, year, selectedAp, selectedDiaBan);
    }
}
async function fetchAndRenderTable(tableIndex, month, year, filterAp, filterDiaBan) {
    const tbody = document.getElementById(`tbl${tableIndex}_body`);
    if (!tbody) return;

    try {
        const res = await fetch(`/api/data/table_${tableIndex}`);
        const data = await res.json();
        
        if (!Array.isArray(data)) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-danger">Lỗi dữ liệu trả về từ server</td></tr>`;
            return;
        }

        let filtered = data.filter(item => {
            if (filterAp && item.ap && item.ap.trim() !== filterAp.trim()) {
                return false;
            }
            if (filterDiaBan && item.diabanh && item.diabanh.trim() !== filterDiaBan.trim()) {
                return false;
            }

            let dateVal = item.created_at || item.ngay_sinh_con || item.ngay_sinh || item.ngay_nhap || item.ngay_chet || item.ngay_den || item.ngay_di || item.ngay_su_dung || item.ngay_thoi_su_dung || item.ngay_su_kien || item.ngay_kham || "";
            if (dateVal) {
                let matchYear = dateVal.includes(year);
                let matchMonth = false;
                
                let parts = dateVal.includes("-") ? dateVal.split("-") : dateVal.split("/");
                if (parts.length >= 2) {
                    let mPart = parts[1];
                    if (parseInt(mPart) === parseInt(month)) matchMonth = true;
                } else if (dateVal.includes(`/${month}/`) || dateVal.includes(`-${month}-`)) {
                    matchMonth = true;
                }

                if (matchYear && matchMonth) return true;
                return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            let colCount = getColumnCount(tableIndex);
            tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-muted fst-italic">Không có phát sinh trong tháng ${month}/${year} theo khu vực này</td></tr>`;
            return;
        }

        let html = "";
        filtered.forEach((row, index) => {
            html += generateRowHtml(tableIndex, row, index + 1);
        });
        tbody.innerHTML = html;

    } catch (err) {
        console.error(`Lỗi tải dữ liệu bảng table_${tableIndex}:`, err);
    }
}

function getColumnCount(idx) {
    const counts = {1: 10, 2: 8, 3: 8, 4: 11, 5: 9, 6: 8, 7: 6, 8: 6, 9: 7, 10: 12, 11: 6};
    return counts[idx] || 5;
}

function generateRowHtml(idx, r, stt) {
    switch(idx) {
        case 1:
            let isNam = r.gioi_tinh === 'Nam';
            let ngaySinhConFormatted = formatDateVN(r.ngay_sinh_con);
            return `<tr>
                <td>${r.ho_so || stt}</td>
                <td class="text-left">${r.ho_ten_con || ''}</td>
                <td>${isNam ? ngaySinhConFormatted : ''}</td>
                <td>${!isNam ? ngaySinhConFormatted : ''}</td>
                <td>${r.dan_toc || 'Kinh'}</td>
                <td class="text-left">${r.ho_ten_me || ''}</td>
                <td>${r.so_the_bhyt_me || ''}</td>
                <td>${formatDateVN(r.ngay_sinh_me)}</td>
                <td class="text-left">${r.noi_de || ''}</td>
                <td>${r.con_thu_may || '1'}</td>
            </tr>`;
        case 2:
            return `<tr>
                <td>${r.so_ho || stt}</td>
                <td class="text-left">${r.ho_ten_tre || r.ho_ten_con || ''}</td>
                <td>${r.suy_giap || r.benh_suy_giap || ''}</td>
                <td>${r.g6pd || r.thieu_men_g6pd || ''}</td>
                <td>${r.thuong_than || r.tang_san_thuong_than || ''}</td>
                <td>${r.khiem_thinh || ''}</td>
                <td>${r.tim_bam_sinh || r.benh_tim || ''}</td>
                <td class="text-left">${r.noi_thuc_hien || r.ghi_chu || ''}</td>
            </tr>`;
        case 3:
            return `<tr>
                <td>${r.ho_so || stt}</td>
                <td class="text-left">${r.ho_ten || ''}</td>
                <td>${r.so_the_bhyt || ''}</td>
                <td>${r.quan_he || ''}</td>
                <td>${r.gioi_tinh || ''}</td>
                <td>${formatDateVN(r.ngay_sinh)}</td>
                <td>${formatDateVN(r.ngay_chet)}</td>
                <td class="text-left">${r.ghi_chu || ''}</td>
            </tr>`;
        case 4:
            return `<tr>
                <td>${r.ho_so || stt}</td>
                <td class="text-left">${r.ho_ten || ''}</td>
                <td>${r.so_the_bhyt || ''}</td>
                <td>${r.quan_he || ''}</td>
                <td>${r.gioi_tinh || ''}</td>
                <td>${formatDateVN(r.ngay_sinh)}</td>
                <td>${r.dan_toc || ''}</td>
                <td>${r.trinh_do_hoc_van || ''}</td>
                <td>${r.tinh_trang_hon_nhan || ''}</td>
                <td>${formatDateVN(r.ngay_den)}</td>
                <td class="text-left">${r.noi_di || ''}</td>
            </tr>`;
        case 5:
            return `<tr>
                <td>${r.ho_so || stt}</td>
                <td class="text-left">${r.ho_ten || ''}</td>
                <td>${r.so_the_bhyt || ''}</td>
                <td>${r.quan_he || ''}</td>
                <td>${r.gioi_tinh || ''}</td>
                <td>${formatDateVN(r.ngay_sinh)}</td>
                <td>${formatDateVN(r.ngay_di)}</td>
                <td class="text-left">${r.noi_den || ''}</td>
                <td class="text-left">${r.ghi_chu || ''}</td>
            </tr>`;
        case 6:
            return `<tr>
                <td>${r.ho_so || stt}</td>
                <td class="text-left">${r.ho_ten || ''}</td>
                <td>${r.so_the_bhyt || ''}</td>
                <td>${r.gioi_tinh || ''}</td>
                <td>${formatDateVN(r.ngay_sinh)}</td>
                <td class="text-left">${r.thong_tin_cu || ''}</td>
                <td class="text-left">${r.thong_tin_moi || ''}</td>
                <td class="text-left">${r.ghi_chu || ''}</td>
            </tr>`;
        case 7:
            return `<tr>
                <td>${r.ho_so || stt}</td>
                <td class="text-left">${r.ho_ten_vo || ''}</td>
                <td>${r.so_the_bhyt || ''}</td>
                <td>${formatDateVN(r.ngay_sinh)}</td>
                <td>${formatDateVN(r.ngay_su_dung)}</td>
                <td>${r.bptt_moi || ''}</td>
            </tr>`;
        case 8:
            return `<tr>
                <td>${r.ho_so || stt}</td>
                <td class="text-left">${r.ho_ten_vo || ''}</td>
                <td>${r.so_the_bhyt || ''}</td>
                <td>${formatDateVN(r.ngay_sinh)}</td>
                <td>${formatDateVN(r.ngay_thoi_su_dung)}</td>
                <td>${r.bptt_thoi || ''}</td>
            </tr>`;
        case 9:
            return `<tr>
                <td>${r.ho_so || stt}</td>
                <td class="text-left">${r.ho_ten || ''}</td>
                <td>${r.so_the_bhyt || ''}</td>
                <td>${formatDateVN(r.ngay_sinh)}</td>
                <td>${formatDateVN(r.ngay_su_kien)}</td>
                <td>${r.su_kien || ''}</td>
                <td>${r.mang_thai_lan_thu || ''}</td>
            </tr>`;
        case 10:
            // Tách riêng ngày thực hiện cho mốc 12 tuần và 21 tuần từ database
            let ngayThucHien12 = formatDateVN(r.ngay_thuc_hien_12 || r.ngay_kham_12 || r.ngay_sieu_am_12 || r.ngay_thuc_hien_dich_vu_12 || r.ngay_thuc_hien || r.ngay_thuc_hien_dich_vu || r.mang_thai_tuan_12);
            let ngayThucHien21 = formatDateVN(r.ngay_thuc_hien_21 || r.ngay_kham_21 || r.ngay_sieu_am_21 || r.ngay_thuc_hien_dich_vu_21 || r.mang_thai_tuan_21);
            let noiThucHien = r.noi_thuc_hien || r.ghi_chu || '';
            
            // Dòng 1: Tuần 12 (Đã bổ sung biến ${ngayThucHien12} vào ô tương ứng)
            let row1 = `<tr>
                <td rowspan="2">${r.so_ho || stt}</td>
                <td rowspan="2">${r.ma_the_bhyt || r.so_the_bhyt || ''}</td>
                <td rowspan="2" class="text-left">${r.ho_ten || ''}</td>
                <td rowspan="2" class="text-left">${r.noi_cu_tru || ''}</td>
                <td rowspan="2">${formatDateVN(r.ngay_sinh)}</td>
                <td>12 tuần</td>
                <td>${ngayThucHien12}</td>
                <td>${r.ket_qua_edward || r.edward || r.hoi_chung_edward || 'Bình thường'}</td>
                <td>${r.ket_qua_down || r.down || r.hoi_chung_down || 'Bình thường'}</td>
                <td>${r.ket_qua_patau || r.patau || r.hoi_chung_patau || 'Bình thường'}</td>
                <td>${r.ket_qua_thalassemia || r.thalassemia || r.benh_thalassemia || 'Bình thường'}</td>
                <td rowspan="2" class="text-left">${noiThucHien}</td>
                <td rowspan="2"></td>
            </tr>`;

            // Dòng 2: Tuần 21 (Đã bổ sung cột ngày thực hiện ${ngayThucHien21})
            let row2 = `<tr>
                <td>21 tuần</td>
                <td>${ngayThucHien21}</td>
                <td>${r.ket_qua_edward_21 || r.edward_21 || 'Bình thường'}</td>
                <td>${r.ket_qua_down_21 || r.down_21 || 'Bình thường'}</td>
                <td>${r.ket_qua_patau_21 || r.patau_21 || 'Bình thường'}</td>
                <td>${r.ket_qua_thalassemia_21 || r.thalassemia_21 || 'Bình thường'}</td>
            </tr>`;

            return row1 + row2;
       case 11:
        return `<tr>
            <td>${r.ho_so || stt}</td>
            <td>${r.ma_so_doi_tuong || ''}</td>
            <td class="text-left">${r.ho_ten || ''}</td>
            <td>${r.nam_sinh || ''}</td>
            <td>${formatDateVN(r.ngay_kham)}</td>
            <td class="text-left">${r.ghi_chu || ''}</td>
        </tr>`;
        default:
            return `<tr><td>${stt}</td><td colspan="5">Dữ liệu bảng ${idx}</td></tr>`;
    }
}
// Hàm xuất nội dung báo cáo ra file Word (đã tối ưu chiều rộng cột để tiêu đề không bị xuống dòng vô lý)
function exportToWord() {
    const reporterName = document.getElementById("lblReporterName").innerText || "........................................";
    const month = document.getElementById("filterMonth").value;
    const year = document.getElementById("filterYear").value;
    const diaBan = document.getElementById("txtDiaBan").innerText || "Toàn xã";
    const ap = document.getElementById("txtAp").innerText || "Toàn xã";
    const xa = document.getElementById("txtXa").innerText || "Lương Hòa";
    const adminSignName = document.getElementById("signAdminName").innerText || "..............................................";
    const ctvSignName = document.getElementById("signCtvName").innerText || reporterName;

    // Lấy nội dung báo cáo gốc và tối ưu lại các bảng cho Word
    const reportPageEl = document.querySelector('.report-page').cloneNode(true);
    
    // Gắn cố định chiều rộng (width) cho các ô tiêu đề bảng
    const tables = reportPageEl.querySelectorAll('table');
    tables.forEach((tbl, idx) => {
        tbl.setAttribute("border", "1");
        tbl.setAttribute("cellpadding", "4");
        tbl.setAttribute("cellspacing", "0");
        tbl.style.cssText = "border-collapse: collapse; width: 100%; font-size: 10pt; font-family: 'Times New Roman', Times, serif;";
    });

    // 1. Tạo Header dạng bảng ẩn không viền cho Word
    const headerTableHtml = `
        <table style="width: 100%; border: none !important; margin-bottom: 15px; font-family: 'Times New Roman', Times, serif; font-size: 11pt;">
            <tr style="border: none !important;">
                <td style="width: 55%; text-align: left; vertical-align: top; border: none !important; padding: 0;">
                    <p style="margin: 0; font-weight: bold;">Phiếu P0/CTV (tờ 1)</p>
                    <p style="margin: 0; font-style: italic; font-size: 10pt;">(Ban hành kèm theo Thông tư số 01/2022/TT-BYT)</p>
                    <p style="margin: 0; font-size: 10pt;">Thời điểm lập: Ngày 01 của tháng sau tháng báo cáo</p>
                </td>
                <td style="width: 45%; text-align: right; vertical-align: top; border: none !important; padding: 0; font-size: 10pt;">
                    <p style="margin: 0;">Người báo cáo: ${reporterName}</p>
                    <p style="margin: 0;">Nơi nhận báo cáo: Trạm Y Tế Xã Lương Hòa</p>
                </td>
            </tr>
        </table>
        <div style="text-align: center; margin: 15px 0;">
            <h3 style="margin: 0; font-weight: bold; font-size: 13pt; text-transform: uppercase;">PHIẾU THU TIN VỀ DÂN SỐ THÁNG ${month} NĂM ${year}</h3>
            <p style="margin: 5px 0 0 0; font-size: 10.5pt;">
                Địa bàn: ${diaBan} &nbsp;&nbsp;&nbsp; 
                Thôn: ${ap} &nbsp;&nbsp;&nbsp; 
                Xã: ${xa}
            </p>
        </div>
    `;

    // 2. Tạo Footer (Chữ ký) dạng bảng ẩn không viền cho Word
  const today = new Date();
    const curDay = today.getDate();
    const curMonth = today.getMonth() + 1;
    const curYear = today.getFullYear();

    const footerTableHtml = `
        <table style="width: 100%; border: none !important; margin-top: 30px; font-family: 'Times New Roman', Times, serif; font-size: 11pt;">
            <tr style="border: none !important;">
                <td style="width: 50%; text-align: center; vertical-align: top; border: none !important; padding: 0;">
                    <p style="margin: 0; font-weight: bold;">Cán bộ dân số xã thẩm định</p>
                    <p style="margin: 0; font-style: italic; font-size: 10pt;">(Ký, ghi rõ họ và tên)</p>
                    <div style="height: 70px;"></div>
                    <p style="margin: 0; font-weight: bold;">${adminSignName}</p>
                </td>
                <td style="width: 50%; text-align: center; vertical-align: top; border: none !important; padding: 0;">
                    <p style="margin: 0; font-size: 10pt; font-style: italic;">Lương Hòa, ngày ${curDay} tháng ${curMonth} năm ${curYear}</p>
                    <p style="margin: 2px 0 0 0; font-weight: bold;">Cộng tác viên dân số lập phiếu</p>
                    <p style="margin: 0; font-style: italic; font-size: 10pt;">(Ký, ghi rõ họ và tên)</p>
                    <div style="height: 70px;"></div>
                    <p style="margin: 0; font-weight: bold;">${ctvSignName}</p>
                </td>
            </tr>
        </table>
    `;
    // Xóa các phần thừa trong bản sao
    const oldHeaderDiv = reportPageEl.querySelector('.row.mb-3');
    const oldTitleDiv = reportPageEl.querySelector('.text-center.my-3');
    const oldFooterDiv = reportPageEl.querySelector('.row.mt-5');
    
    if (oldHeaderDiv) oldHeaderDiv.remove();
    if (oldTitleDiv) oldTitleDiv.remove();
    if (oldFooterDiv) oldFooterDiv.remove();

    const finalBodyContent = headerTableHtml + reportPageEl.innerHTML + footerTableHtml;

    // Đóng gói thành file tài liệu Word hoàn chỉnh với khổ ngang (Landscape)
    // Đóng gói thành file tài liệu Word hoàn chỉnh với khổ ngang (Landscape)
    const htmlHeader = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' 
              xmlns:w='urn:schemas-microsoft-com:office:word' 
              xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>Phiếu P0/CTV</title>
            <!-- Đoạn XML này ép buộc Microsoft Word hiển thị khổ ngang -->
            <xml>
                <w:WordDocument>
                    <w:View>Print</w:View>
                    <w:DoNotOptimizeForBrowser/>
                </w:WordDocument>
            </xml>
            <style>
                @page {
                    size: 29.7cm 21cm;
                    mso-page-orientation: landscape;
                    margin: 1.5cm;
                }
                /* Định nghĩa class để Word áp dụng khổ ngang */
                @page Section1 {
                    size: 29.7cm 21cm;
                    mso-page-orientation: landscape;
                }
                div.Section1 { page: Section1; }

                body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; }
                table { border-collapse: collapse; width: 100%; margin-top: 10px; margin-bottom: 20px; mso-table-lspace:0pt; mso-table-rspace:0pt; }
                th, td { border: 1px solid black; padding: 5px 6px; text-align: center; vertical-align: middle; }
                th { white-space: nowrap; background-color: #f2f2f2; font-weight: bold; }
                .text-left { text-align: left; }
            </style>
        </head>
        <body>
            <div class="Section1">
    `;
    const htmlFooter = "</div></body></html>"; // Đóng thẻ div Section1
    const completeHtml = htmlHeader + finalBodyContent + htmlFooter;

    const blob = new Blob(['\ufeff' + completeHtml], {
        type: 'application/msword'
    });
    
    const filename = `Phieu_P0_CTV_Thang_${month}_Nam_${year}.doc`;
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}