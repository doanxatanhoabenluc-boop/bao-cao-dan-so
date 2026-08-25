/* ============================================================
   BHYT SEARCH - dùng chung cho nhập liệu + cả 2 màn hình sửa dữ liệu
   - Cho phép nhập số thẻ trực tiếp.
   - Có nút Tìm tra cứu CSDL BHYT.
   - Tự gắn lại nút khi đổi Bảng 1 -> 11, không bị mất khi F5/chuyển bảng.
   ============================================================ */
(function () {
    'use strict';

    const TABLE_BHYT_FIELDS = {
        table_1: 'so_the_bhyt_me',
        table_2: 'ma_the_bhyt_me',
        table_3: 'so_the_bhyt',
        table_4: 'so_the_bhyt',
        table_5: 'so_the_bhyt',
        table_6: 'so_the_bhyt',
        table_7: 'so_the_bhyt',
        table_8: 'so_the_bhyt',
        table_9: 'so_the_bhyt',
        table_10: 'ma_the_bhyt',
        table_11: 'so_the_bhyt'
    };

    let modalInstance = null;
    let activeTarget = null;

    function getCurrentTable() {
        return document.getElementById('selectTable')?.value || '';
    }

    function getBhytField(table) {
        const name = TABLE_BHYT_FIELDS[table || getCurrentTable()];
        return name ? { name } : null;
    }

    function getValue(root, name) {
        if (!root) return '';

        const selectorName = `[name="${CSS.escape(name)}"]`;
        const selectorEdit = `#edit_${CSS.escape(name)}`;
        const selectorField = `#edit_field_${CSS.escape(name)}`;

        const el =
            root.querySelector(selectorName) ||
            root.querySelector(selectorEdit) ||
            root.querySelector(selectorField);

        return el ? String(el.value || '').trim() : '';
    }

    function getSearchFields(table, root) {
        table = table || getCurrentTable();

        if (table === 'table_1') {
            return {
                name: getValue(root, 'ho_ten_me'),
                dob: getValue(root, 'ngay_sinh_me')
            };
        }

        if (table === 'table_2') {
            return {
                name: getValue(root, 'ho_ten_me'),
                dob: getValue(root, 'nam_sinh_me')
            };
        }

        if (table === 'table_10') {
            return {
                name: getValue(root, 'ho_ten'),
                dob: getValue(root, 'ngay_sinh')
            };
        }

        if (table === 'table_7' || table === 'table_8') {
            return {
                name: getValue(root, 'ho_ten_vo'),
                dob: getValue(root, 'ngay_sinh')
            };
        }

        if (table === 'table_11') {
            return {
                name: getValue(root, 'ho_ten'),
                dob: getValue(root, 'nam_sinh')
            };
        }

        return {
            name: getValue(root, 'ho_ten'),
            dob: getValue(root, 'ngay_sinh')
        };
    }

    function getYear(value) {
        const m = String(value || '').match(/(19|20)\d{2}/);
        return m ? m[0] : '';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function createModal() {
        if (document.getElementById('bhytSearchModal')) return;

        const el = document.createElement('div');

        el.id = 'bhytSearchModal';
        el.className = 'modal fade';
        el.tabIndex = -1;

        el.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content shadow-lg">

                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fa-solid fa-id-card me-2"></i>
                            Tra cứu số thẻ BHYT
                        </h5>

                        <button
                            type="button"
                            class="btn-close btn-close-white"
                            data-bs-dismiss="modal">
                        </button>
                    </div>

                    <div
                        class="modal-body"
                        id="bhytSearchResults">
                    </div>

                    <div class="modal-footer">
                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-bs-dismiss="modal">
                            Đóng
                        </button>
                    </div>

                </div>
            </div>
        `;

        document.body.appendChild(el);
    }

    async function searchBHYT(target) {
        target = target || activeTarget;

        if (!target?.input) return;

        const info = getSearchFields(
            target.table,
            target.root
        );

        const year = getYear(info.dob);

        if (!info.name && !year) {
            alert(
                '⚠️ Vui lòng nhập Họ tên và năm sinh/ngày sinh trước khi tìm BHYT.'
            );
            return;
        }

        activeTarget = target;

        createModal();

        const modalEl =
            document.getElementById('bhytSearchModal');

        modalInstance =
            bootstrap.Modal.getOrCreateInstance(modalEl);

        modalInstance.show();

        const resultEl =
            document.getElementById('bhytSearchResults');

        resultEl.innerHTML = `
            <div class="text-center py-5">

                <div class="spinner-border text-primary"></div>

                <div class="mt-2">
                    Đang tra cứu CSDL BHYT...
                </div>

            </div>
        `;

        try {
            const params = new URLSearchParams();

            if (info.name) {
                params.set('name', info.name);
            }

            if (year) {
                params.set('year', year);
            }

            const response = await fetch(
                `/api/bhyt/search?${params.toString()}`,
                {
                    credentials: 'same-origin'
                }
            );

            const data =
                await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    `Không thể tra cứu BHYT (HTTP ${response.status}).`
                );
            }

            renderResults(
                data.results || [],
                info.name,
                year
            );

        } catch (err) {

            console.error(
                'Lỗi tra cứu BHYT:',
                err
            );

            resultEl.innerHTML = `
                <div class="alert alert-danger mb-0">

                    <i class="fa-solid fa-triangle-exclamation me-1"></i>

                    ${escapeHtml(err.message)}

                </div>
            `;
        }
    }

    function renderResults(rows, name, year) {

        const resultEl =
            document.getElementById('bhytSearchResults');

        if (!rows.length) {

            resultEl.innerHTML = `
                <div class="alert alert-warning">

                    <i class="fa-solid fa-circle-exclamation me-1"></i>

                    Không tìm thấy người phù hợp trong CSDL BHYT.

                    <div class="small mt-2">
                        Tìm:
                        <b>${escapeHtml(name || '')}</b>
                        -
                        <b>${escapeHtml(year || '')}</b>
                    </div>

                    <div class="small mt-2">
                        Bạn vẫn có thể đóng cửa sổ và nhập số thẻ BHYT
                        trực tiếp vào ô.
                    </div>

                </div>
            `;

            return;
        }

        resultEl.innerHTML = `

            <div class="alert alert-success py-2">

                <i class="fa-solid fa-circle-check me-1"></i>

                Tìm thấy
                <b>${rows.length}</b>
                kết quả.
                Hãy chọn đúng người.

            </div>

            <div class="list-group">

                ${rows.map((r, i) => `

                    <button
                        type="button"
                        class="list-group-item list-group-item-action bhyt-result-item text-start"
                        data-index="${i}">

                        <div class="row align-items-center g-2">

                            <div class="col-md-7">

                                <div class="fw-bold text-primary fs-6">

                                    ${escapeHtml(r.ho_ten)}

                                </div>

                                <div class="small mt-1">

                                    <span class="me-3">

                                        <i class="fa-solid fa-calendar-days me-1"></i>

                                        Ngày sinh:
                                        <b>
                                            ${escapeHtml(
                                                r.ngay_sinh || ''
                                            )}
                                        </b>

                                    </span>

                                    <span>

                                        <i class="fa-solid fa-venus-mars me-1"></i>

                                        ${escapeHtml(
                                            r.gioi_tinh || ''
                                        )}

                                    </span>

                                </div>

                                <div class="small mt-1">

                                    <i class="fa-solid fa-id-card me-1"></i>

                                    CCCD:
                                    <b>
                                        ${escapeHtml(
                                            r.so_cccd || 'Không có'
                                        )}
                                    </b>

                                </div>

                                <div class="small text-muted mt-1">

                                    <i class="fa-solid fa-location-dot me-1"></i>

                                    ${escapeHtml(
                                        r.dia_chi || ''
                                    )}

                                </div>

                            </div>

                            <div class="col-md-5 text-md-end">

                                <div class="small text-muted">
                                    Số thẻ BHYT
                                </div>

                                <div class="fw-bold text-success fs-6">

                                    ${escapeHtml(
                                        r.so_the_bhyt ||
                                        'Không có'
                                    )}

                                </div>

                            </div>

                        </div>

                    </button>

                `).join('')}

            </div>
        `;

        resultEl
            .querySelectorAll('.bhyt-result-item')
            .forEach(btn => {

                btn.addEventListener(
                    'click',
                    () => {

                        selectPerson(
                            rows[
                                Number(btn.dataset.index)
                            ]
                        );

                    }
                );

            });
    }

    function selectPerson(person) {

        const target = activeTarget;

        if (!target?.input) return;

        if (!person.so_the_bhyt) {

            alert(
                '⚠️ Người này không có số thẻ BHYT trong CSDL. ' +
                'Bạn có thể đóng cửa sổ và nhập số thẻ trực tiếp.'
            );

            return;
        }

        const input = target.input;

        input.value =
            person.so_the_bhyt;

        input.dispatchEvent(
            new Event('input', {
                bubbles: true
            })
        );

        input.dispatchEvent(
            new Event('change', {
                bubbles: true
            })
        );

        input.style.backgroundColor =
            '#d1e7dd';

        input.style.borderColor =
            '#198754';

        setTimeout(() => {

            input.style.backgroundColor = '';
            input.style.borderColor = '';

        }, 1500);

        if (modalInstance) {
            modalInstance.hide();
        }
    }

    function decorateInput(
        input,
        buttonId,
        noteId,
        target
    ) {

        if (!input) return;

        input.readOnly = false;

        input.removeAttribute(
            'readonly'
        );

        input.autocomplete = 'off';

        input.placeholder =
            'Nhập trực tiếp hoặc bấm Tìm để tra cứu';

        input.title =
            'Có thể nhập trực tiếp số thẻ BHYT hoặc bấm Tìm để tra cứu.';

        const existing =
            document.getElementById(buttonId);

        if (existing) {

            existing
                .closest('.input-group')
                ?.remove();

        }

        document
            .getElementById(noteId)
            ?.remove();

        const group =
            document.createElement('div');

        group.className =
            'input-group bhyt-search-group';

        input.parentNode.insertBefore(
            group,
            input
        );

        group.appendChild(input);

        const btn =
            document.createElement('button');

        btn.type = 'button';

        btn.id = buttonId;

        btn.className =
            'btn btn-primary bhyt-search-btn fw-bold';

        btn.innerHTML = `
            <i
                class="fa-solid fa-magnifying-glass"
                aria-hidden="true">
            </i>
            <span class="bhyt-search-text">
                Tìm
            </span>
        `;

        btn.addEventListener(
            'click',
            () => searchBHYT(target)
        );

        group.appendChild(btn);

        const note =
            document.createElement('div');

        note.id = noteId;

        note.className =
            'small text-muted mt-1';

        note.innerHTML = `
            <i class="fa-solid fa-circle-info me-1"></i>
            Có thể nhập trực tiếp số thẻ hoặc bấm Tìm để tra cứu.
        `;

        input
            .closest('.col-md-6')
            ?.appendChild(note);
    }

    function createButton() {

        const table =
            getCurrentTable();

        const field =
            getBhytField(table);

        const container =
            document.getElementById(
                'dynamic-fields'
            );

        if (!field || !container) {
            return false;
        }

        if (
            document.getElementById(
                'btnTimBHYT'
            )
        ) {
            return true;
        }

        const input =
            container.querySelector(
                `[name="${CSS.escape(field.name)}"]`
            );

        if (!input) {
            return false;
        }

        decorateInput(
            input,
            'btnTimBHYT',
            'bhytSearchNote',
            {
                table,
                root: container,
                input
            }
        );

        return true;
    }

    function refresh() {

        let tries = 0;

        const run = () => {

            tries++;

            if (
                createButton() ||
                tries >= 10
            ) {
                return;
            }

            requestAnimationFrame(
                run
            );
        };

        requestAnimationFrame(
            run
        );
    }

    function attachEditSearchIndex(table) {

        const field =
            getBhytField(table);

        const root =
            document.getElementById(
                'edit-dynamic-fields'
            );

        if (!field || !root) {
            return false;
        }

        const input =
            root.querySelector(
                `#edit_${CSS.escape(field.name)}`
            ) ||
            root.querySelector(
                `[name="${CSS.escape(field.name)}"]`
            );

        if (!input) {
            return false;
        }

        decorateInput(
            input,
            'btnTimBHYTEditIndex',
            'bhytSearchNoteEditIndex',
            {
                table,
                root,
                input
            }
        );

        return true;
    }

    function attachEditSearchAdmin(table) {

        const field =
            getBhytField(table);

        const root =
            document.getElementById(
                'editDataFieldsContainer'
            );

        if (!field || !root) {
            return false;
        }

        const input =
            root.querySelector(
                `#edit_field_${CSS.escape(field.name)}`
            ) ||
            root.querySelector(
                `[name="${CSS.escape(field.name)}"]`
            );

        if (!input) {
            return false;
        }

        decorateInput(
            input,
            'btnTimBHYTEditAdmin',
            'bhytSearchNoteEditAdmin',
            {
                table,
                root,
                input
            }
        );

        return true;
    }

    window.refreshBHYTSearch =
        refresh;

    window.attachBHYTSearchToIndexEdit =
        attachEditSearchIndex;

    window.attachBHYTSearchToAdminEdit =
        attachEditSearchAdmin;

    function init() {

        createModal();

        const select =
            document.getElementById(
                'selectTable'
            );

        if (select) {

            select.addEventListener(
                'change',
                refresh
            );

        }

        const container =
            document.getElementById(
                'dynamic-fields'
            );

        if (container) {

            new MutationObserver(
                () => refresh()
            ).observe(
                container,
                {
                    childList: true,
                    subtree: true
                }
            );

        }

        refresh();
    }

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init
        );

    } else {

        init();

    }

})();