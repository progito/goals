// ============================================================
//  GOALS APP v1.3.0 — Lazy-loaded, optimized
// ============================================================

const APP_VERSION = '1.3.0';
const SK = 'goals_app_data';
const TK = 'goals_app_theme';
const AEK = 'goals_app_autoexport';
const LEK = 'goals_app_last_export';
const AE_DAYS = 20;
const PAGE_SIZE = 20;

let goals = [];
let statusFilter = 'all';   // all | active | completed
let catFilter = 'all';      // all | category name | __none__
let searchQuery = '';
let tempPhotos = [];
let displayCount = PAGE_SIZE;
let filteredCache = [];
let reviewIndex = 0;
let reviewGoals = [];
let autoTimer = null;
let observer = null;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    loadTheme();
    loadAutoExportState();
    setupObserver();
    render();
    bindEvents();
    checkAutoExport();
});

function bindEvents() {
    let debounceTimer;
    document.getElementById('searchInput').addEventListener('input', e => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            searchQuery = e.target.value.toLowerCase().trim();
            resetPagination();
            render();
        }, 200);
    });

    document.getElementById('photoFileInput').addEventListener('change', handlePhotoUpload);
    document.getElementById('importFileInput').addEventListener('change', handleImport);

    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.addEventListener('mousedown', e => {
            if (e.target === ov) ov.classList.remove('active');
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            stopReview();
        }
        if (document.getElementById('reviewOverlay').classList.contains('active')) {
            if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextReview(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); prevReview(); }
        }
    });

    const zone = document.getElementById('uploadZone');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent)'; });
    zone.addEventListener('dragleave', () => zone.style.borderColor = '');
    zone.addEventListener('drop', e => {
        e.preventDefault(); zone.style.borderColor = '';
        processFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
    });
}

// ============================================================
//  INTERSECTION OBSERVER — Infinite scroll
// ============================================================
function setupObserver() {
    const sentinel = document.getElementById('sentinel');
    observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && displayCount < filteredCache.length) {
            loadMore();
        }
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
}

function loadMore() {
    const prev = displayCount;
    displayCount = Math.min(displayCount + PAGE_SIZE, filteredCache.length);
    appendCards(prev, displayCount);
    updateListInfo();
}

function resetPagination() {
    displayCount = PAGE_SIZE;
}

// ============================================================
//  STORAGE
// ============================================================
function loadData() {
    try { const r = localStorage.getItem(SK); if (r) goals = JSON.parse(r); } catch(_) { goals = []; }
}

function saveData() {
    localStorage.setItem(SK, JSON.stringify(goals));
}

// ============================================================
//  THEME
// ============================================================
function loadTheme() {
    const d = localStorage.getItem(TK) === 'dark';
    if (d) document.documentElement.setAttribute('data-theme', 'dark');
    const t = document.getElementById('themeToggle');
    if (t) t.checked = d;
}

function toggleTheme() {
    const d = document.getElementById('themeToggle').checked;
    document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
    localStorage.setItem(TK, d ? 'dark' : 'light');
}

// ============================================================
//  AUTO-EXPORT
// ============================================================
function loadAutoExportState() {
    const on = localStorage.getItem(AEK) === '1';
    const t = document.getElementById('autoExportToggle');
    if (t) t.checked = on;
    updateAutoExportInfo();
}

function toggleAutoExport() {
    const on = document.getElementById('autoExportToggle').checked;
    localStorage.setItem(AEK, on ? '1' : '0');
    if (on && !localStorage.getItem(LEK)) localStorage.setItem(LEK, Date.now().toString());
    updateAutoExportInfo();
    showToast(on ? 'Авто-экспорт включён' : 'Авто-экспорт выключен', 'info');
}

function updateAutoExportInfo() {
    const el = document.getElementById('autoExportInfo');
    if (!el) return;
    if (localStorage.getItem(AEK) !== '1') { el.textContent = ''; return; }
    const last = parseInt(localStorage.getItem(LEK) || '0');
    if (!last) { el.textContent = 'Ещё не было экспортов'; return; }
    const next = new Date(last + AE_DAYS * 864e5);
    const days = Math.max(0, Math.ceil((next - Date.now()) / 864e5));
    el.textContent = days === 0 ? 'Экспорт сегодня' : `Через ${days} дн. (${fmtDate(next)})`;
}

function checkAutoExport() {
    if (localStorage.getItem(AEK) !== '1' || !goals.length) return;
    const last = parseInt(localStorage.getItem(LEK) || '0');
    if (Date.now() - last >= AE_DAYS * 864e5) doAutoExport();
}

function doAutoExport() {
    const d = { version: APP_VERSION, exportDate: new Date().toISOString(), autoExport: true, goals };
    dlFile(JSON.stringify(d, null, 2), `goals_auto_${ds()}.json`, 'application/json');
    localStorage.setItem(LEK, Date.now().toString());
    updateAutoExportInfo();
    showToast('Авто-экспорт выполнен', 'success');
}

// ============================================================
//  CATEGORIES
// ============================================================
function getCats() {
    return [...new Set(goals.map(g => g.category).filter(Boolean))].sort();
}

function fillCatSelect() {
    const s = document.getElementById('categorySelect');
    s.innerHTML = '<option value="">Выберите</option>' + getCats().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

// ============================================================
//  STATS
// ============================================================
function getStats() {
    const t = goals.length;
    const c = goals.filter(g => g.completed).length;
    return { total: t, completed: c, active: t - c, pct: t ? Math.round(c / t * 100) : 0 };
}

function renderStatsBar() {
    const s = getStats();
    document.getElementById('statsBar').innerHTML = `
        <div class="stat-card"><div class="stat-dot purple"><svg class="icon icon-lg"><use href="#ico-target"/></svg></div><div><div class="stat-val">${s.total}</div><div class="stat-lbl">Всего</div></div></div>
        <div class="stat-card"><div class="stat-dot orange"><svg class="icon icon-lg"><use href="#ico-trending-up"/></svg></div><div><div class="stat-val">${s.active}</div><div class="stat-lbl">Активных</div></div></div>
        <div class="stat-card"><div class="stat-dot green"><svg class="icon icon-lg"><use href="#ico-check-circle"/></svg></div><div><div class="stat-val">${s.completed}</div><div class="stat-lbl">Выполнено</div></div></div>
        <div class="stat-card"><div class="stat-dot red"><svg class="icon icon-lg"><use href="#ico-award"/></svg></div><div><div class="stat-val">${s.pct}%</div><div class="stat-lbl">Прогресс</div></div></div>`;
}

function openStatsModal() {
    const s = getStats();
    const cc = {}, cd = {};
    goals.forEach(g => {
        const c = g.category || 'Без категории';
        cc[c] = (cc[c] || 0) + 1;
        if (g.completed) cd[c] = (cd[c] || 0) + 1;
    });

    const sk = Object.keys(cc).sort((a, b) => cc[b] - cc[a]);
    const mx = Math.max(...Object.values(cc), 1);

    const catRows = sk.map(c => `
        <div class="cs-row">
            <div class="cs-name">${esc(c)}</div>
            <div class="cs-bar-w"><div class="cs-bar" style="width:${Math.round(cc[c]/mx*100)}%"></div></div>
            <div class="cs-cnt">${cd[c]||0}/${cc[c]}</div>
        </div>`).join('');

    const recent = goals.filter(g => g.completed && g.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 5);
    const recentHtml = recent.length ? `
        <div class="sg-title" style="margin-top:18px">Последние выполненные</div>
        ${recent.map(g => `
            <div class="cs-row">
                <svg class="icon icon-sm" style="color:var(--success);flex-shrink:0"><use href="#ico-check-circle"/></svg>
                <div class="cs-name">${esc(g.goal)}</div>
                <div class="cs-cnt" style="min-width:auto;font-size:10px;color:var(--text-muted)">${fmtDate(new Date(g.completedAt))}</div>
            </div>`).join('')}` : '';

    document.getElementById('statsModalBody').innerHTML = `
        <div class="sd-grid">
            <div class="sd-card a"><div class="sd-v">${s.total}</div><div class="sd-l">Всего</div></div>
            <div class="sd-card o"><div class="sd-v">${s.active}</div><div class="sd-l">Активных</div></div>
            <div class="sd-card g"><div class="sd-v">${s.completed}</div><div class="sd-l">Выполнено</div></div>
            <div class="sd-card r"><div class="sd-v">${s.pct}%</div><div class="sd-l">Прогресс</div></div>
        </div>
        <div class="sg-title">По категориям</div>
        <div class="cat-stats">${catRows || '<p style="color:var(--text-muted);font-size:12px">Нет данных</p>'}</div>
        ${recentHtml}`;

    openModal('statsModal');
}

// ============================================================
//  FILTERING & RENDERING
// ============================================================
function render() {
    renderStatsBar();
    renderTabs();
    renderChips();
    buildFilteredCache();
    renderGoalsChunk();
    updateListInfo();
}

function renderTabs() {
    const s = getStats();
    const tabs = [
        { id: 'all', label: 'Все', count: s.total, icon: 'ico-layers' },
        { id: 'active', label: 'Активные', count: s.active, icon: 'ico-trending-up' },
        { id: 'completed', label: 'Выполненные', count: s.completed, icon: 'ico-check-circle' }
    ];

    document.getElementById('tabBar').innerHTML = tabs.map(t => `
        <button class="tab-btn${statusFilter === t.id ? ' active' : ''}" onclick="setStatus('${t.id}')">
            <svg class="icon icon-sm"><use href="#${t.icon}"/></svg>
            ${t.label}
            <span class="tab-count">${t.count}</span>
        </button>`).join('');
}

function renderChips() {
    const cats = getCats();
    const counts = {};
    const filtered = statusFilter === 'active' ? goals.filter(g => !g.completed)
        : statusFilter === 'completed' ? goals.filter(g => g.completed) : goals;

    filtered.forEach(g => { counts[g.category || ''] = (counts[g.category || ''] || 0) + 1; });

    let html = `<button class="chip${catFilter === 'all' ? ' active' : ''}" onclick="setCat('all')">Все <span class="chip-n">${filtered.length}</span></button>`;
    cats.forEach(c => {
        if (counts[c]) html += `<button class="chip${catFilter === c ? ' active' : ''}" onclick="setCat('${escAttr(c)}')">${esc(c)} <span class="chip-n">${counts[c]}</span></button>`;
    });
    if (counts['']) html += `<button class="chip${catFilter === '__none__' ? ' active' : ''}" onclick="setCat('__none__')">Без категории <span class="chip-n">${counts['']}</span></button>`;

    document.getElementById('chipsRow').innerHTML = html;
}

function buildFilteredCache() {
    let list = [...goals];

    // Status
    if (statusFilter === 'active') list = list.filter(g => !g.completed);
    else if (statusFilter === 'completed') list = list.filter(g => g.completed);

    // Category
    if (catFilter !== 'all') {
        list = catFilter === '__none__'
            ? list.filter(g => !g.category)
            : list.filter(g => g.category === catFilter);
    }

    // Search
    if (searchQuery) {
        list = list.filter(g =>
            (g.goal || '').toLowerCase().includes(searchQuery) ||
            (g.reason || '').toLowerCase().includes(searchQuery) ||
            (g.category || '').toLowerCase().includes(searchQuery)
        );
    }

    // Sort: active newest first, then completed newest first
    list.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    filteredCache = list;
}

function renderGoalsChunk() {
    const grid = document.getElementById('goalsGrid');

    if (!filteredCache.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-ico"><svg class="icon icon-xl"><use href="#ico-${searchQuery ? 'search' : 'target'}"/></svg></div>
                <h3>${searchQuery ? 'Ничего не найдено' : 'Нет целей'}</h3>
                <p>${searchQuery ? 'Попробуйте другой запрос' : 'Нажмите «Добавить»'}</p>
            </div>`;
        return;
    }

    const count = Math.min(displayCount, filteredCache.length);
    const slice = filteredCache.slice(0, count);

    grid.innerHTML = slice.map((g, i) => cardHTML(g, i)).join('');

    if (count < filteredCache.length) {
        grid.innerHTML += `
            <div class="load-sentinel">
                <div class="sentinel-spinner"></div>
                <div class="sentinel-text">Загрузка...</div>
            </div>`;
    }
}

function appendCards(from, to) {
    const grid = document.getElementById('goalsGrid');

    // Remove sentinel
    const sentinel = grid.querySelector('.load-sentinel');
    if (sentinel) sentinel.remove();

    const slice = filteredCache.slice(from, to);
    const fragment = document.createDocumentFragment();
    const tmp = document.createElement('div');

    slice.forEach((g, i) => {
        tmp.innerHTML = cardHTML(g, from + i);
        fragment.appendChild(tmp.firstElementChild);
    });

    grid.appendChild(fragment);

    // Add sentinel back if more
    if (to < filteredCache.length) {
        const s = document.createElement('div');
        s.className = 'load-sentinel';
        s.innerHTML = '<div class="sentinel-spinner"></div><div class="sentinel-text">Загрузка...</div>';
        grid.appendChild(s);
    }
}

function updateListInfo() {
    const shown = Math.min(displayCount, filteredCache.length);
    const total = filteredCache.length;
    document.getElementById('listInfo').innerHTML = total
        ? `<span>Показано ${shown} из ${total}</span><span>${statusFilter === 'completed' ? 'выполненных' : statusFilter === 'active' ? 'активных' : 'целей'}</span>`
        : '';
}

function cardHTML(g, idx) {
    const done = g.completed;
    const hp = g.photos && g.photos.length > 0;
    const delay = Math.min(idx * 30, 300);

    const badge = g.category ? `<div class="c-badge"><svg class="icon icon-sm"><use href="#ico-tag"/></svg> ${esc(g.category)}</div>` : '';

    const photo = hp
        ? `<div class="c-photo"><img src="${g.photos[0]}" alt="" loading="lazy">${g.photos.length > 1 ? `<div class="c-photo-n"><svg class="icon icon-sm"><use href="#ico-image"/></svg>${g.photos.length}</div>` : ''}${badge}</div>`
        : `<div class="c-photo-empty"><svg class="icon icon-xxl"><use href="#ico-image"/></svg>${badge}</div>`;

    const stamp = done ? `<div class="done-badge"><svg class="icon icon-sm" style="stroke:white"><use href="#ico-check"/></svg></div>` : '';

    const reason = g.reason ? `<div class="c-reason"><svg class="icon icon-sm"><use href="#ico-lightbulb"/></svg><span>${esc(g.reason)}</span></div>` : '';

    const dt = g.createdAt ? fmtDate(new Date(g.createdAt)) : '';
    const meta = dt ? `<div class="c-meta"><svg class="icon icon-sm"><use href="#ico-calendar"/></svg>${dt}${done && g.completedAt ? ' — выпол. ' + fmtDate(new Date(g.completedAt)) : ''}</div>` : '';

    const toggle = done
        ? `<button class="btn btn-warning-outline btn-xs" onclick="toggleDone('${g.id}')"><svg class="icon icon-sm"><use href="#ico-rotate-ccw"/></svg> Вернуть</button>`
        : `<button class="btn btn-success-outline btn-xs" onclick="toggleDone('${g.id}')"><svg class="icon icon-sm"><use href="#ico-check"/></svg> Выполнено</button>`;

    return `
    <div class="g-card${done ? ' done' : ''}" style="animation-delay:${delay}ms">
        ${stamp}${photo}
        <div class="c-body">
            <div class="c-title">${esc(g.goal)}</div>
            ${reason}${meta}
            <div class="c-actions">
                ${toggle}
                <button class="btn btn-outline btn-xs" onclick="editGoal('${g.id}')"><svg class="icon icon-sm"><use href="#ico-edit"/></svg> Изменить</button>
                <button class="btn btn-danger-outline btn-xs" onclick="confirmDelete('${g.id}')"><svg class="icon icon-sm"><use href="#ico-trash"/></svg></button>
            </div>
        </div>
    </div>`;
}

function setStatus(s) {
    statusFilter = s;
    catFilter = 'all';
    resetPagination();
    render();
}

function setCat(c) {
    catFilter = c;
    resetPagination();
    render();
}

// ============================================================
//  COMPLETE / UNCOMPLETE
// ============================================================
function toggleDone(id) {
    const g = goals.find(x => x.id === id);
    if (!g) return;

    if (g.completed) {
        g.completed = false;
        g.completedAt = null;
        saveData();
        resetPagination();
        render();
        showToast('Цель возвращена', 'info');
    } else {
        showConfirm('success', 'ico-check-circle', 'Отметить выполненной?',
            `«${g.goal}»`, 'Выполнено', 'btn-success-fill', () => {
                g.completed = true;
                g.completedAt = Date.now();
                saveData();
                resetPagination();
                render();
                showToast('Цель выполнена!', 'success');
            });
    }
}

// ============================================================
//  ADD / EDIT
// ============================================================
function openAddModal() {
    document.getElementById('modalTitle').innerHTML = '<svg class="icon icon-md icon-accent"><use href="#ico-plus"/></svg> Новая цель';
    document.getElementById('editGoalId').value = '';
    document.getElementById('goalInput').value = '';
    document.getElementById('reasonInput').value = '';
    document.getElementById('categorySelect').value = '';
    document.getElementById('newCategoryInput').value = '';
    tempPhotos = [];
    renderPThumbs();
    fillCatSelect();
    openModal('goalModal');
    setTimeout(() => document.getElementById('goalInput').focus(), 150);
}

function editGoal(id) {
    const g = goals.find(x => x.id === id);
    if (!g) return;
    document.getElementById('modalTitle').innerHTML = '<svg class="icon icon-md icon-accent"><use href="#ico-edit"/></svg> Редактировать';
    document.getElementById('editGoalId').value = id;
    document.getElementById('goalInput').value = g.goal || '';
    document.getElementById('reasonInput').value = g.reason || '';
    document.getElementById('newCategoryInput').value = '';
    tempPhotos = g.photos ? [...g.photos] : [];
    renderPThumbs();
    fillCatSelect();
    const sel = document.getElementById('categorySelect');
    if (g.category && [...sel.options].some(o => o.value === g.category)) sel.value = g.category;
    else { sel.value = ''; document.getElementById('newCategoryInput').value = g.category || ''; }
    openModal('goalModal');
}

function saveGoal() {
    const id = document.getElementById('editGoalId').value;
    const goal = document.getElementById('goalInput').value.trim();
    const reason = document.getElementById('reasonInput').value.trim();
    const category = document.getElementById('newCategoryInput').value.trim() || document.getElementById('categorySelect').value;

    if (!goal) { showToast('Введите цель', 'error'); document.getElementById('goalInput').focus(); return; }

    if (id) {
        const g = goals.find(x => x.id === id);
        if (g) { g.goal = goal; g.reason = reason; g.category = category; g.photos = [...tempPhotos]; g.updatedAt = Date.now(); }
        showToast('Цель обновлена', 'success');
    } else {
        goals.push({ id: uid(), goal, reason, category, photos: [...tempPhotos], completed: false, completedAt: null, createdAt: Date.now() });
        showToast('Цель добавлена', 'success');
    }

    saveData();
    resetPagination();
    render();
    closeModal('goalModal');
}

// ============================================================
//  PHOTOS
// ============================================================
function handlePhotoUpload(e) { processFiles(Array.from(e.target.files)); e.target.value = ''; }

function processFiles(files) {
    files.forEach(f => {
        if (!f.type.startsWith('image/')) return;
        const r = new FileReader();
        r.onload = ev => compress(ev.target.result, 800, 0.75, res => { tempPhotos.push(res); renderPThumbs(); });
        r.readAsDataURL(f);
    });
}

function compress(src, mw, q, cb) {
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > mw) { h = mw / w * h; w = mw; }
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(c.toDataURL('image/jpeg', q));
    };
    img.src = src;
}

function renderPThumbs() {
    document.getElementById('photoThumbs').innerHTML = tempPhotos.map((p, i) => `
        <div class="pt"><img src="${p}" alt=""><button class="pt-rm" onclick="rmPhoto(${i})"><svg class="icon icon-sm"><use href="#ico-x"/></svg></button></div>`).join('');
}

function rmPhoto(i) { tempPhotos.splice(i, 1); renderPThumbs(); }

// ============================================================
//  DELETE
// ============================================================
function confirmDelete(id) {
    const g = goals.find(x => x.id === id);
    showConfirm('danger', 'ico-trash', 'Удалить цель?',
        g ? `«${g.goal}»` : 'Это действие нельзя отменить',
        'Удалить', 'btn-danger-fill', () => {
            goals = goals.filter(x => x.id !== id);
            saveData(); resetPagination(); render();
            showToast('Цель удалена', 'success');
        });
}

// ============================================================
//  CONFIRM
// ============================================================
function showConfirm(type, icon, title, text, label, cls, onOk) {
    document.getElementById('confirmContent').innerHTML = `
        <div class="cfm-ico ${type}"><svg class="icon icon-xl"><use href="#${icon}"/></svg></div>
        <h3>${title}</h3>
        <p>${esc(text)}</p>
        <div class="cfm-btns">
            <button class="btn btn-ghost" onclick="closeModal('confirmModal')">Отмена</button>
            <button class="btn ${cls}" id="cfmBtn"><svg class="icon icon-sm"><use href="#${icon}"/></svg> ${label}</button>
        </div>`;
    document.getElementById('cfmBtn').onclick = () => { closeModal('confirmModal'); onOk(); };
    openModal('confirmModal');
}

// ============================================================
//  REVIEW
// ============================================================
function startReview() {
    let list = goals.filter(g => !g.completed);
    if (catFilter !== 'all') {
        list = catFilter === '__none__' ? list.filter(g => !g.category) : list.filter(g => g.category === catFilter);
    }
    if (!list.length) { showToast('Нет активных целей', 'error'); return; }
    reviewGoals = list; reviewIndex = 0;
    document.getElementById('autoInterval').value = '0';
    clearAutoTimer();
    document.getElementById('reviewOverlay').classList.add('active');
    showSlide();
}

function stopReview() { document.getElementById('reviewOverlay').classList.remove('active'); clearAutoTimer(); }

function showSlide() {
    const g = reviewGoals[reviewIndex];
    if (!g) return;
    const hp = g.photos && g.photos.length > 0;
    const ph = hp
        ? `<img class="rv-img" id="rvImg" src="${g.photos[0]}" alt="" style="cursor:${g.photos.length > 1 ? 'pointer' : 'default'}">`
        : `<div class="rv-no-img"><svg class="icon icon-xxl"><use href="#ico-image"/></svg></div>`;
    const cat = g.category ? `<div class="rv-cat"><svg class="icon icon-sm"><use href="#ico-tag"/></svg> ${esc(g.category)}</div>` : '';
    const rsn = g.reason ? `<div class="rv-reason"><svg class="icon icon-md" style="color:var(--warning);flex-shrink:0;margin-top:2px"><use href="#ico-lightbulb"/></svg> ${esc(g.reason)}</div>` : '';

    document.getElementById('reviewContent').innerHTML = `${ph}<div class="rv-text">${cat}<div class="rv-title">${esc(g.goal)}</div>${rsn}</div>`;

    if (hp && g.photos.length > 1) {
        let pi = 0;
        document.getElementById('rvImg').addEventListener('click', function() {
            pi = (pi + 1) % g.photos.length;
            this.src = g.photos[pi];
        });
    }

    document.getElementById('reviewCounter').textContent = `${reviewIndex + 1} / ${reviewGoals.length}`;
    document.getElementById('reviewProgressFill').style.width = ((reviewIndex + 1) / reviewGoals.length * 100) + '%';
}

function nextReview() { if (!reviewGoals.length) return; reviewIndex = (reviewIndex + 1) % reviewGoals.length; showSlide(); }
function prevReview() { if (!reviewGoals.length) return; reviewIndex = (reviewIndex - 1 + reviewGoals.length) % reviewGoals.length; showSlide(); }

function setAutoReview() {
    clearAutoTimer();
    const s = parseInt(document.getElementById('autoInterval').value);
    if (s > 0) { autoTimer = setInterval(nextReview, s * 1000); showToast(`Авто: ${s}с`, 'info'); }
}

function clearAutoTimer() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

// ============================================================
//  PRINT
// ============================================================
function printGoals() {
    if (!goals.length) { showToast('Нет целей', 'error'); return; }
    const gr = {};
    goals.forEach(g => { const c = g.category || 'Без категории'; (gr[c] = gr[c] || []).push(g); });
    const sk = Object.keys(gr).sort((a, b) => a === 'Без категории' ? 1 : b === 'Без категории' ? -1 : a.localeCompare(b));
    const st = getStats();

    let t = '══════════════════════════════════════════\n                 МОИ ЦЕЛИ\n══════════════════════════════════════════\n\n';
    sk.forEach(c => {
        t += `▎ ${c.toUpperCase()}\n──────────────────────────────────────────\n`;
        gr[c].forEach((g, i) => { t += `  ${i + 1}. ${g.goal}${g.reason ? ' (' + g.reason + ')' : ''}${g.completed ? ' [✓]' : ''}\n`; });
        t += '\n';
    });
    t += `══════════════════════════════════════════\nВсего: ${st.total} | Активных: ${st.active} | Выполнено: ${st.completed} (${st.pct}%)\n${new Date().toLocaleDateString('ru-RU')}\n`;

    dlFile(t, `Цели_${ds()}.txt`, 'text/plain;charset=utf-8');
    showToast('Файл сформирован', 'success');
}

// ============================================================
//  EXPORT / IMPORT
// ============================================================
function exportData() {
    if (!goals.length) { showToast('Нет данных', 'error'); return; }
    dlFile(JSON.stringify({ version: APP_VERSION, exportDate: new Date().toISOString(), goals }, null, 2),
        `goals_${ds()}.json`, 'application/json');
    localStorage.setItem(LEK, Date.now().toString());
    updateAutoExportInfo();
    showToast('Экспортировано', 'success');
}

function handleImport(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        try {
            const d = JSON.parse(ev.target.result);
            if (!d.goals || !Array.isArray(d.goals)) throw 0;
            const ex = new Set(goals.map(g => g.id));
            let n = 0;
            d.goals.forEach(g => { if (!ex.has(g.id)) { if (g.completed === undefined) g.completed = false; goals.push(g); n++; } });
            saveData(); resetPagination(); render();
            showToast(`Импорт: ${n} из ${d.goals.length}`, 'success');
        } catch(_) { showToast('Неверный формат', 'error'); }
    };
    r.readAsText(f); e.target.value = '';
}

function openSettings() { updateAutoExportInfo(); openModal('settingsModal'); }

// ============================================================
//  MODALS
// ============================================================
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ============================================================
//  TOAST
// ============================================================
function showToast(msg, type = 'info') {
    const s = document.getElementById('toastStack');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<div class="toast-bar"></div><span>${esc(msg)}</span>`;
    s.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

// ============================================================
//  UTILS
// ============================================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function ds() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) { return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); }
function dlFile(c, n, t) {
    const b = new Blob([c], { type: t }), u = URL.createObjectURL(b), a = document.createElement('a');
    a.href = u; a.download = n; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
}
