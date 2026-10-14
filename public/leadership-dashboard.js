// leadership-dashboard.js - Xử lý giao diện và logic riêng cho Lãnh đạo / Quản trị

async function initLeadershipDashboard() {
    let mainContainer = document.querySelector('.container') || document.body;
    mainContainer.innerHTML = `
        <div class="card shadow-lg border-0 rounded-4 mb-4 leadership-dashboard">
            <div class="card-body p-4 p-lg-5">
                <div class="mb-4">
                    <div class="text-success fw-bold small text-uppercase mb-1">Báo cáo nhanh</div>
                    <div class="leader-heading-row d-flex flex-wrap align-items-center justify-content-between gap-3">
                        <div class="leader-title-block">
                            <h2 class="fw-bold text-dark mb-1">📊 Tổng hợp dữ liệu 11 biểu mẫu</h2>
                            <p class="text-muted mb-0">Chọn tháng và năm để xem số trường hợp phát sinh trong từng bảng.</p>
                        </div>
                        <div class="leader-quick-actions d-flex flex-wrap gap-2">
                                <a href="quan-ly-bieu-mau.html" class="btn btn-success quick-nav-btn">
                                    <i class="fa-solid fa-table-list me-1"></i> Quản lý 11 Biểu mẫu
                                </a>
                                <a href="baocao_toanxa.html" class="btn btn-primary quick-nav-btn">
                                    <i class="fa-solid fa-book me-1"></i> Quản lý Sổ
                                </a>
                                <a href="baocao.html" class="btn btn-info text-white quick-nav-btn">
                                    <i class="fa-solid fa-file-lines me-1"></i> Xem Phiếu P0/CTV
                                </a>
                                <a href="admin.html" class="btn btn-warning quick-nav-btn">
                                    <i class="fa-solid fa-user-gear me-1"></i> Quản trị
                                </a>
                        </div>
                        <button class="btn btn-outline-danger btn-sm leader-logout-btn" onclick="logout()">
                            <i class="fa-solid fa-right-from-bracket me-1"></i> Đăng xuất
                        </button>
                    </div>
                </div>

                <div class="row g-3 mb-4">
                    <div class="col-12 col-md-5">
                        <label class="form-label fw-bold">📅 Tháng</label>
                        <select id="leaderFilterMonth" class="form-select form-select-lg">
                            <option value="">Tất cả các tháng</option>
                            <option value="01">Tháng 01</option><option value="02">Tháng 02</option>
                            <option value="03">Tháng 03</option><option value="04">Tháng 04</option>
                            <option value="05">Tháng 05</option><option value="06">Tháng 06</option>
                            <option value="07">Tháng 07</option><option value="08">Tháng 08</option>
                            <option value="09">Tháng 09</option><option value="10">Tháng 10</option>
                            <option value="11">Tháng 11</option><option value="12">Tháng 12</option>
                        </select>
                    </div>
                    <div class="col-12 col-md-5">
                        <label class="form-label fw-bold">📆 Năm</label>
                        <select id="leaderFilterYear" class="form-select form-select-lg">
                            <option value="">Tất cả các năm</option>
                        </select>
                    </div>
                    <div class="col-12 col-md-2 d-flex align-items-end">
                        <button id="btnResetLeaderFilter" class="btn btn-outline-secondary btn-lg w-100">
                            <i class="fa-solid fa-rotate-left"></i> Xóa
                        </button>
                    </div>
                </div>

                <div id="leaderSummaryLoading" class="text-center py-4 text-muted">
                    <div class="spinner-border text-success mb-2"></div>
                    <div>Đang tải số liệu...</div>
                </div>
                <div id="leaderSummaryCards" class="row g-3"></div>
                <div id="leaderSummaryFooter" class="mt-4"></div>
            </div>
        </div>
    `;
    setupLeadershipDashboard();
}

async function loadLeadershipSummary() {
    const monthInput = document.getElementById('leaderFilterMonth')?.value || '';
    const yearInput = document.getElementById('leaderFilterYear')?.value || '';
    
    // Chuẩn hóa giá trị tháng luôn đủ 2 chữ số (VD: '3' -> '03')
    const month = monthInput ? String(monthInput).padStart(2, '0') : '';
    const year = yearInput.trim();

    const cards = document.getElementById('leaderSummaryCards');
    const loading = document.getElementById('leaderSummaryLoading');
    const footer = document.getElementById('leaderSummaryFooter');
    if (!cards) return;

    loading?.classList.remove('d-none');
    cards.innerHTML = '';
    if (footer) footer.innerHTML = '';

    try {
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);

        const res = await fetch(`/api/dashboard/summary${params.toString() ? '?' + params.toString() : ''}`);
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || 'Không thể tải thống kê');

        // Cập nhật danh sách Năm chỉ khi danh sách hiện tại đang rỗng (tránh bị reset khi chọn Tháng)
        const yearSelect = document.getElementById('leaderFilterYear');
        if (yearSelect && result.years && Array.isArray(result.years) && result.years.length > 0) {
            const currentSelectedYear = yearSelect.value;
            // Nếu chưa khởi tạo danh sách năm (chỉ có 1 option) thì mới nạp danh sách
            if (yearSelect.options.length <= 1) {
                yearSelect.innerHTML = '<option value="">Tất cả các năm</option>' +
                    result.years.map(y => `<option value="${y}">Năm ${y}</option>`).join('');
                if (currentSelectedYear) yearSelect.value = currentSelectedYear;
            }
        }

        // Tách làm 2 nhóm biểu mẫu
        const group1Indices = [0, 1, 2, 3, 4, 5]; // Bảng 1 đến 6
        const group2Indices = [6, 7, 8, 9, 10];   // Bảng 7 đến 11
        let allCounts = result.counts || [];

        let htmlGroup1 = allCounts.filter((_, idx) => group1Indices.includes(idx)).map((item) => {
            let originalIndex = allCounts.indexOf(item);
            return `
                <div class="col-12 col-md-6 col-xl-4">
                    <div class="card h-100 border-0 shadow-sm leadership-stat-card">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-start gap-2">
                                <div class="d-flex gap-2">
                                    <div class="leadership-stat-number">${originalIndex + 1}</div>
                                    <div>
                                        <div class="fw-bold text-dark">${item.title}</div>
                                        <div class="text-muted small">${month || year ? `Dữ liệu đã nhập ${month ? `tháng ${month}` : ''}${month && year ? '/' : ''}${year || ''}` : 'Tất cả dữ liệu đã nhập'}</div>
                                    </div>
                                </div>
                                <div class="leadership-stat-value">${Number(item.total || 0).toLocaleString('vi-VN')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        let htmlGroup2 = allCounts.filter((_, idx) => group2Indices.includes(idx)).map((item) => {
            let originalIndex = allCounts.indexOf(item);
            return `
                <div class="col-12 col-md-6 col-xl-4">
                    <div class="card h-100 border-0 shadow-sm leadership-stat-card">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-start gap-2">
                                <div class="d-flex gap-2">
                                    <div class="leadership-stat-number">${originalIndex + 1}</div>
                                    <div>
                                        <div class="fw-bold text-dark">${item.title}</div>
                                        <div class="text-muted small">${month || year ? `Dữ liệu đã nhập ${month ? `tháng ${month}` : ''}${month && year ? '/' : ''}${year || ''}` : 'Tất cả dữ liệu đã nhập'}</div>
                                    </div>
                                </div>
                                <div class="leadership-stat-value">${Number(item.total || 0).toLocaleString('vi-VN')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        cards.innerHTML = `
            <div class="col-12 mt-2 mb-2">
                <h5 class="fw-bold text-success border-bottom pb-2">
                    <i class="fa-solid fa-users-rectangle me-2"></i> I. Nhóm Biến động dân số & Khai báo cơ bản (Bảng 1 - 6)
                </h5>
            </div>
            <div class="row g-3 mb-4">${htmlGroup1}</div>
            
            <div class="col-12 mt-3 mb-2">
                <h5 class="fw-bold text-primary border-bottom pb-2">
                    <i class="fa-solid fa-heart-pulse me-2"></i> II. Nhóm Chăm sóc sức khỏe & KHHGĐ (Bảng 7 - 11)
                </h5>
            </div>
            <div class="row g-3">${htmlGroup2}</div>
        `;

        if (footer) {
            footer.innerHTML = `
                <div class="alert alert-success d-flex flex-wrap justify-content-between align-items-center gap-2 mb-0">
                    <strong><i class="fa-solid fa-chart-column me-2"></i>Tổng cộng 11 bảng</strong>
                    <span class="fs-5 fw-bold">${Number(result.grandTotal || 0).toLocaleString('vi-VN')} trường hợp</span>
                </div>
            `;
        }
    } catch (error) {
        console.error(error);
        cards.innerHTML = `<div class="col-12"><div class="alert alert-danger">${error.message || 'Không tải được thống kê.'}</div></div>`;
    } finally {
        loading?.classList.add('d-none');
    }
}

function setupLeadershipDashboard() {
    const month = document.getElementById('leaderFilterMonth');
    const year = document.getElementById('leaderFilterYear');
    const reset = document.getElementById('btnResetLeaderFilter');

    if (month) month.addEventListener('change', loadLeadershipSummary);
    if (year) year.addEventListener('change', loadLeadershipSummary);
    if (reset) reset.addEventListener('click', () => {
        if (month) month.value = '';
        if (year) year.value = '';
        loadLeadershipSummary();
    });

    loadLeadershipSummary();
}