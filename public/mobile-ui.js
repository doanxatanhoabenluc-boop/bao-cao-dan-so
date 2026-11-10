/* Presentation-only mobile helper. It does not read/write records or intercept app actions. */
(function () {
  'use strict';

  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const pageClasses = {
    'index.html': 'mobile-index',
    'quan-ly-bieu-mau.html': 'mobile-form-admin',
    'admin.html': 'mobile-admin',
    'quan-ly-dan-cu.html': 'mobile-residents',
    'quanly_phunu_15_49.html': 'mobile-women',
    'baocao_toanxa.html': 'mobile-report-all',
    'baocao.html': 'mobile-report'
  };
  document.documentElement.classList.add('mobile-v2');
  document.body.classList.add('mobile-v2', pageClasses[page] || 'mobile-v2-page');

  const selectors = {
    'index.html': '.online-data-panel table',
    'quan-ly-bieu-mau.html': '.table-responsive table',
    'admin.html': '.table-responsive table',
    'quan-ly-dan-cu.html': '#tabDanhSach table, #tabThongBao table',
    'quanly_phunu_15_49.html': '#listSection .table-responsive table, #bienDongPane .table-responsive table'
  };
  const selector = selectors[page];
  const mobileMedia = window.matchMedia ? window.matchMedia('(max-width: 767.98px)') : { matches: window.innerWidth <= 767 };
  const watchedTables = new WeakSet();

  function cleanLabel(cell, index) {
    const text = (cell.innerText || cell.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text;
    if (cell.querySelector('input[type="checkbox"]')) return 'Chọn';
    return `Thông tin ${index + 1}`;
  }

  function decorateTable(table) {
    if (!table || table.closest('.modal') || table.classList.contains('report-table')) return;
    const wrapper = table.closest('.table-responsive');
    const clearCardMode = () => {
      table.classList.remove('mobile-card-table');
      if (wrapper) wrapper.classList.remove('has-mobile-cards');
    };
    const head = table.tHead;
    if (!head || head.rows.length !== 1) {
      clearCardMode();
      return;
    }

    const headerCells = Array.from(head.rows[0].cells);
    if (headerCells.length < 2 || headerCells.some(cell => cell.colSpan > 1)) {
      clearCardMode();
      return;
    }
    const labels = headerCells.map(cleanLabel);

    // Do not convert multi-level/grouped rows: keeping the entire table intact is safer.
    const allRows = Array.from(table.tBodies).flatMap(tbody => Array.from(tbody.rows));
    const hasComplexRows = allRows.some(row => {
      const cells = Array.from(row.cells);
      if (cells.length === 1 && cells[0].colSpan > 1) return false;
      return cells.length !== labels.length || cells.some(cell => cell.colSpan > 1 || cell.rowSpan > 1);
    });
    if (hasComplexRows) {
      clearCardMode();
      return;
    }

    const primaryIndex = labels.findIndex(label =>
      /họ\s*và\s*tên|họ\s*tên|tên\s*(người|trẻ|mẹ|con|ấp|xã|bệnh viện|CTV)/i.test(label)
    );
    const metaIndex = labels.findIndex(label => /^(stt|id|mã hộ|mã hộ gia đình)$/i.test(label));
    table.classList.add('mobile-card-table');
    if (wrapper) wrapper.classList.add('has-mobile-cards');

    allRows.forEach(row => {
      const cells = Array.from(row.cells);
      if (cells.length === 1 && cells[0].colSpan > 1) {
        cells[0].setAttribute('data-mobile-full-row', 'true');
        cells[0].removeAttribute('data-label');
        return;
      }
      cells.forEach((cell, index) => {
        const value = (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
        const hasControl = !!cell.querySelector('input, select, textarea, button, a');
        cell.setAttribute('data-label', labels[index]);
        if (value || hasControl) cell.removeAttribute('data-mobile-empty');
        else cell.setAttribute('data-mobile-empty', 'true');

        if (index === primaryIndex) cell.setAttribute('data-mobile-primary', 'true');
        else cell.removeAttribute('data-mobile-primary');
        if (index === metaIndex) cell.setAttribute('data-mobile-meta', 'true');
        else cell.removeAttribute('data-mobile-meta');

        if (/thao tác|hành động|chức năng/i.test(labels[index])) {
          cell.setAttribute('data-mobile-actions', 'true');
        } else {
          cell.removeAttribute('data-mobile-actions');
        }
        cell.removeAttribute('data-mobile-full-row');
      });
    });
  }

  function initializeTables() {
    if (!selector || !mobileMedia.matches) return;
    document.querySelectorAll(selector).forEach(table => {
      decorateTable(table);
      if (watchedTables.has(table)) return;
      watchedTables.add(table);
      const observer = new MutationObserver(() => decorateTable(table));
      observer.observe(table, { childList: true, subtree: true, characterData: true });
    });
  }

  if (selector) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeTables, { once: true });
    } else {
      initializeTables();
    }
    // Handles tables created later when a user switches tabs or loads another page of data.
    const pageObserver = new MutationObserver(initializeTables);
    pageObserver.observe(document.body, { childList: true, subtree: true });
    if (mobileMedia.addEventListener) mobileMedia.addEventListener('change', initializeTables);
    else if (mobileMedia.addListener) mobileMedia.addListener(initializeTables);
  }

  // Chỉ Admin/Lãnh đạo mới được thấy liên kết đến các trang quản trị và sổ toàn xã.
  // Quyền được xác minh từ phiên máy chủ qua /api/me, không dùng localStorage để tránh dữ liệu vai trò cũ.
  async function applyPrivilegedNavigation() {
    const guardedLinks = Array.from(document.querySelectorAll('[data-requires-role="admin-leader"]'));
    if (!guardedLinks.length) return;

    // Mặc định ẩn ngay từ đầu; chỉ mở sau khi máy chủ xác nhận quyền hợp lệ.
    guardedLinks.forEach(link => {
      link.style.setProperty('display', 'none', 'important');
      link.setAttribute('aria-hidden', 'true');
    });

    try {
      const response = await fetch('/api/me', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) return;

      const user = await response.json();
      const role = String(user && user.role || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
      const canManage = role === 'admin' || role.includes('lanhdao') || role.includes('quantri');
      if (!canManage) return;

      guardedLinks.forEach(link => {
        link.style.removeProperty('display');
        link.setAttribute('aria-hidden', 'false');
      });
    } catch (error) {
      // Fail closed: nếu không xác minh được phiên thì giữ liên kết quản trị ở trạng thái ẩn.
      console.warn('Không xác minh được quyền hiển thị điều hướng quản trị:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPrivilegedNavigation, { once: true });
  } else {
    applyPrivilegedNavigation();
  }

  // Navigation helper only: no form, record, API, or business-rule interception.
  function installBackToTop() {
    if (page === 'index.html') return;
    if (window.matchMedia && !window.matchMedia('(max-width: 767.98px)').matches) return;
    if (document.getElementById('mobileBackToTop')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'mobileBackToTop';
    button.className = 'mobile-v3-back-to-top';
    button.setAttribute('aria-label', 'Về đầu trang');
    button.setAttribute('title', 'Về đầu trang');
    button.innerHTML = '<span aria-hidden="true">↑</span>';
    button.addEventListener('click', () => {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {
        window.scrollTo(0, 0);
      }
    });
    document.body.appendChild(button);

    let scheduled = false;
    const updateVisibility = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        const visible = window.scrollY > 420;
        button.classList.toggle('is-visible', visible);
        button.setAttribute('aria-hidden', visible ? 'false' : 'true');
        scheduled = false;
      });
    };
    window.addEventListener('scroll', updateVisibility, { passive: true });
    updateVisibility();
  }

  function syncBackToTop() {
    if (mobileMedia.matches) {
      installBackToTop();
      return;
    }
    const button = document.getElementById('mobileBackToTop');
    if (button) button.remove();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncBackToTop, { once: true });
  } else {
    syncBackToTop();
  }
  if (mobileMedia.addEventListener) mobileMedia.addEventListener('change', syncBackToTop);
  else if (mobileMedia.addListener) mobileMedia.addListener(syncBackToTop);
})();
