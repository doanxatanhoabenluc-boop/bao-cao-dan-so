// leadership-dashboard.js - Giao diện bảng điều hành dành riêng cho Lãnh đạo.
// Dữ liệu vẫn lấy từ API hiện có trong app.js, không phát sinh truy vấn bổ sung.

function initLeadershipDashboard() {
    const mainContainer = document.getElementById('mainAppContainer')
        || document.querySelector('.container')
        || document.body;

    // Chỉ đổi bố cục khi đăng nhập bằng tài khoản lãnh đạo.
    document.body.classList.add('leader-dashboard-mode');
    mainContainer.className = 'container-fluid leader-dashboard-page py-4 px-3 px-lg-4';
    mainContainer.innerHTML = `
        <div class="leader-dashboard-shell">
            <header class="leader-hero mb-4">
                <div class="leader-hero-content">
                    <div class="leader-kicker"><i class="fa-solid fa-chart-line me-2"></i>BẢNG ĐIỀU HÀNH</div>
                    <h1 class="leader-hero-title">Tổng quan công tác dân số</h1>
                    <div class="leader-unit-line">
                        <i class="fa-solid fa-location-dot me-2"></i>
                        <span id="leaderUnitName">Đang tải thông tin đơn vị...</span>
                    </div>
                    <p class="leader-hero-description mb-0">Theo dõi tình hình tiếp nhận và số trường hợp đã nhập trong 11 biểu mẫu nghiệp vụ.</p>
                </div>
                <div class="leader-account-panel">
                    <div class="leader-account-caption">TÀI KHOẢN ĐANG ĐĂNG NHẬP</div>
                    <div class="leader-account-name" id="leaderDisplayName">Lãnh đạo</div>
                    <div class="leader-account-role" id="leaderDisplayRole">Lãnh đạo</div>
                    <button class="btn btn-sm btn-outline-light mt-3" onclick="logout()">
                        <i class="fa-solid fa-right-from-bracket me-1"></i> Đăng xuất
                    </button>
                </div>
            </header>

            <nav class="leader-quick-actions mb-4" aria-label="Truy cập nhanh">
                <a href="quan-ly-bieu-mau.html" class="leader-action-link action-green">
                    <i class="fa-solid fa-table-list"></i><span>Quản lý 11 biểu mẫu</span><i class="fa-solid fa-arrow-right ms-auto"></i>
                </a>
                <a href="baocao_toanxa.html" class="leader-action-link action-blue">
                    <i class="fa-solid fa-book"></i><span>Quản lý sổ</span><i class="fa-solid fa-arrow-right ms-auto"></i>
                </a>
                <a href="baocao.html" class="leader-action-link action-cyan">
                    <i class="fa-solid fa-file-lines"></i><span>Xem phiếu P0/CTV</span><i class="fa-solid fa-arrow-right ms-auto"></i>
                </a>
                <a href="quanly_phunu_15_49.html" class="leader-action-link action-purple">
                    <i class="fa-solid fa-venus"></i><span>Quản lý Phụ nữ 15–49 &amp; BPTT</span><i class="fa-solid fa-arrow-right ms-auto"></i>
                </a>
                <a href="quan-ly-dan-cu.html" class="leader-action-link action-teal">
                    <i class="fa-solid fa-users"></i><span>Quản lý dân cư</span><i class="fa-solid fa-arrow-right ms-auto"></i>
                </a>
                <a href="admin.html" class="leader-action-link action-amber">
                    <i class="fa-solid fa-user-gear"></i><span>Quản trị hệ thống</span><i class="fa-solid fa-arrow-right ms-auto"></i>
                </a>
            </nav>

            <section class="leader-filter-panel mb-4" aria-labelledby="leaderFilterTitle">
                <div class="leader-filter-heading">
                    <div>
                        <div class="leader-section-kicker">BỘ LỌC BÁO CÁO</div>
                        <h2 id="leaderFilterTitle" class="h5 fw-bold mb-1">Thời gian thống kê</h2>
                        <p class="text-muted small mb-0">Chọn tháng và năm để xem số liệu tương ứng.</p>
                    </div>
                    <span class="leader-filter-icon"><i class="fa-regular fa-calendar-days"></i></span>
                </div>
                <div class="row g-3 align-items-end mt-1">
                    <div class="col-12 col-md-5">
                        <label for="leaderFilterMonth" class="form-label fw-semibold">Tháng</label>
                        <select id="leaderFilterMonth" class="form-select">
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
                        <label for="leaderFilterYear" class="form-label fw-semibold">Năm</label>
                        <select id="leaderFilterYear" class="form-select">
                            <option value="">Tất cả các năm</option>
                        </select>
                    </div>
                    <div class="col-12 col-md-2">
                        <button id="btnResetLeaderFilter" class="btn btn-outline-secondary w-100">
                            <i class="fa-solid fa-rotate-left me-1"></i> Đặt lại
                        </button>
                    </div>
                </div>
                <div class="leader-filter-note mt-3"><i class="fa-solid fa-circle-info me-1"></i> Số liệu được thống kê theo thời điểm nhập hồ sơ vào hệ thống.</div>
            </section>

            <section aria-label="Thống kê biểu mẫu">
                <div id="leaderSummaryLoading" class="leader-loading text-center py-5 text-muted">
                    <div class="spinner-border text-success mb-2" role="status"></div>
                    <div>Đang tổng hợp số liệu...</div>
                </div>
                <div id="leaderSummaryCards" class="row g-3"></div>
                <div id="leaderSummaryFooter" class="mt-4"></div>
            </section>
            <footer class="leader-footer text-center mt-4">Hệ thống Quản lý Dân số · Bảng điều hành dành cho Lãnh đạo</footer>
        </div>
    `;

    // Thông tin đơn vị được lấy từ /api/me đã được app.js gọi trước đó.
    let currentUser = {};
    try { currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}') || {}; } catch (_) {}
    const unitParts = [currentUser.xa, currentUser.tinh].filter(Boolean);
    const unitEl = document.getElementById('leaderUnitName');
    const nameEl = document.getElementById('leaderDisplayName');
    const roleEl = document.getElementById('leaderDisplayRole');
    if (unitEl) unitEl.textContent = unitParts.join(' · ') || 'Đơn vị đang sử dụng';
    if (nameEl) nameEl.textContent = currentUser.fullname || currentUser.username || 'Lãnh đạo';
    if (roleEl) roleEl.textContent = currentUser.role || 'Lãnh đạo';

    if (typeof setupLeadershipDashboard === 'function') setupLeadershipDashboard();
}
