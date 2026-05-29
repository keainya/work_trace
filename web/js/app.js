/* ============================================
   工作管理前端 — 零依赖 Hash SPA
   ============================================ */

// ---------- DOM 引用 ----------
const $header  = document.getElementById('header');
const $navMain = document.getElementById('nav-main');
const $userArea= document.getElementById('user-area');
const $drawer  = document.getElementById('drawer');
const $drawerOv= document.getElementById('drawer-overlay');
const $toast   = document.getElementById('toast');
const $main    = document.getElementById('main');
const $modalCt = document.getElementById('modal-container');
const $menuBtn = document.getElementById('menu-toggle');

// ---------- 全局状态 ----------
let currentUser  = null;
let accessToken  = null;
let refreshToken = null;
let currentPage  = null;
let toastTimer   = null;

const AUTH_URL  = 'https://account.takemeto.icu/oauth/authorize';
const TOKEN_URL = 'https://account.takemeto.icu/oauth/token';
const USERINFO_URL = 'https://account.takemeto.icu/oauth/userinfo';
const CLIENT_ID = 'app_work_trace';

// ---------- 转义函数 (XSS 防护) ----------
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escJs(s) {
    return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

// ---------- 工具函数 ----------
function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- Toast ----------
function showToast(msg, type) {
    type = type || 'info';
    $toast.textContent = msg;
    $toast.className = 'toast ' + type + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.classList.remove('show'); }, 2800);
}

// ---------- Drawer ----------
function openDrawer()  { $drawer.classList.add('open'); $drawerOv.classList.add('open'); }
function closeDrawer() { $drawer.classList.remove('open'); $drawerOv.classList.remove('open'); }

// ---------- Modal ----------
function showModal(html) { $modalCt.innerHTML = html; }
function closeModal()    { $modalCt.innerHTML = ''; }

// ---------- Token 管理 ----------
function loadTokens() {
    accessToken  = localStorage.getItem('wt_access_token');
    refreshToken = localStorage.getItem('wt_refresh_token');
}
function saveTokens(access, refresh) {
    accessToken = access;
    refreshToken = refresh || refreshToken;
    if (accessToken)  localStorage.setItem('wt_access_token', accessToken);
    if (refreshToken) localStorage.setItem('wt_refresh_token', refreshToken);
}
function clearTokens() {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem('wt_access_token');
    localStorage.removeItem('wt_refresh_token');
}

// ---------- API ----------
async function api(url, opts = {}) {
    const headers = opts.headers || {};
    if (!(opts.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    if (accessToken) {
        headers['Authorization'] = 'Bearer ' + accessToken;
    }
    const res = await fetch(url, { ...opts, headers });

    let data;
    try { data = await res.json(); } catch (_) {
        throw { code: -1, msg: '响应解析失败' };
    }
    if (data.code !== 0) {
        // token 过期尝试刷新
        if (data.code === 2001 && refreshToken) {
            const ok = await doRefreshToken();
            if (ok) return api(url, opts);
            clearTokens();
            navigate('#/login');
        }
        throw data;
    }
    return data;
}

function apiGet(url)          { return api(url); }
function apiPost(url, body)   { return api(url, { method: 'POST', body: JSON.stringify(body) }); }
function apiPut(url, body)    { return api(url, { method: 'PUT',  body: JSON.stringify(body) }); }
function apiDel(url)          { return api(url, { method: 'DELETE' }); }

async function doRefreshToken() {
    try {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: CLIENT_ID,
                client_secret: 'your_client_secret'
            })
        });
        const data = await res.json();
        if (data.access_token) {
            saveTokens(data.access_token, data.refresh_token);
            return true;
        }
    } catch (_) {}
    return false;
}

async function fetchUserInfo() {
    try {
        const res = await fetch(USERINFO_URL, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        const data = await res.json();
        if (data.sub) {
            currentUser = {
                id: data.sub,
                username: data.username,
                email: data.email || '',
                role: data.role || 'user'
            };
            return true;
        }
    } catch (_) {}
    return false;
}

// ---------- OAuth2 登录 ----------
function getRedirectURI() {
    const loc = window.location;
    return loc.protocol + '//' + loc.host + loc.pathname;
}

function startOAuthLogin() {
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('wt_oauth_state', state);
    const redirectURI = getRedirectURI();
    localStorage.setItem('wt_oauth_redirect', redirectURI);

    const url = AUTH_URL + '?' + new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: redirectURI,
        state: state,
        scope: ''
    }).toString();
    window.location.href = url;
}

async function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get('code');
    const state = params.get('state');
    const savedState = localStorage.getItem('wt_oauth_state');
    const redirectURI = localStorage.getItem('wt_oauth_redirect') || getRedirectURI();

    if (!code) {
        showToast('授权失败：未获取到授权码', 'error');
        navigate('#/login');
        return;
    }
    if (state !== savedState) {
        showToast('授权验证失败，请重试', 'error');
        navigate('#/login');
        return;
    }

    try {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectURI,
                client_id: CLIENT_ID,
                client_secret: 'your_client_secret'
            })
        });
        const data = await res.json();
        if (!data.access_token) {
            showToast('登录失败：' + (data.msg || 'token 交换失败'), 'error');
            navigate('#/login');
            return;
        }
        saveTokens(data.access_token, data.refresh_token);
        localStorage.removeItem('wt_oauth_state');
        localStorage.removeItem('wt_oauth_redirect');

        // 清除 URL 参数
        window.history.replaceState({}, '', getRedirectURI());

        // 获取用户信息
        const ok = await fetchUserInfo();
        if (ok) {
            showToast('登录成功', 'success');
            navigate('#/');
        } else {
            showToast('获取用户信息失败', 'error');
            navigate('#/login');
        }
    } catch (err) {
        showToast('登录失败：' + (err.msg || '网络错误'), 'error');
        navigate('#/login');
    }
}

function logout() {
    clearTokens();
    currentUser = null;
}

// ---------- 路由 ----------
const routes = {
    'login':    { render: renderLogin,    auth: false },
    'detail':   { render: renderDetail,   auth: true  },
};

function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) return 'list';
    if (h.startsWith('detail/')) return 'detail';
    if (routes[h]) return h;
    return 'list'; // 默认：工作项列表
}

function getItemIdFromHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('/');
    if (parts[0] === 'detail' && parts[1]) return parts[1];
    return null;
}

function navigate(hash) {
    if (!hash.startsWith('#')) hash = '#' + hash;
    location.hash = hash;
}

// ---------- 路由执行 ----------
async function doRoute() {
    // OAuth2 回调检测
    const qp = new URLSearchParams(window.location.search);
    if (qp.has('code') && qp.has('state')) {
        await handleOAuthCallback();
        return;
    }

    const page = parseHash();
    const def  = routes[page];

    if (def && def.auth && !currentUser) {
        navigate('#/login');
        return;
    }

    currentPage = page;
    renderHeader();
    closeDrawer();

    try {
        if (page === 'detail') {
            const id = getItemIdFromHash();
            await renderDetail(id);
        } else if (def) {
            await def.render();
        } else {
            await renderList();
        }
    } catch (err) {
        $main.innerHTML = '<div class="empty"><div class="icon">!</div><p>页面加载失败：' + escHtml(err.msg || '未知错误') + '</p></div>';
    }
    window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => { doRoute(); });
$menuBtn.addEventListener('click', openDrawer);
$drawerOv.addEventListener('click', closeDrawer);

// ---------- Header ----------
function renderHeader() {
    const nav = [];
    if (currentUser) {
        nav.push('<a href="#/" class="' + (currentPage==='list'?'active':'') + '">工作项</a>');
    }
    $navMain.innerHTML = nav.join('');

    if (currentUser) {
        $userArea.innerHTML =
            '<span>' + escHtml(currentUser.username) + '</span>' +
            '<button class="btn btn-link btn-sm" onclick="logout();navigate(\'#/login\')">退出</button>';
    } else {
        $userArea.innerHTML = '<button class="btn btn-outline btn-sm" onclick="navigate(\'#/login\')">登录</button>';
    }

    // Drawer
    let d = '';
    if (currentUser) {
        d += '<div style="font-weight:600;margin-bottom:16px;">' + escHtml(currentUser.username) + '</div>';
        d += '<a href="#/" onclick="closeDrawer()" class="' + ((currentPage==='list'||currentPage==='detail')?'active':'') + '">工作项</a>';
        d += '<div class="drawer-divider"></div>';
        d += '<button class="btn btn-outline btn-block btn-logout" onclick="logout();navigate(\'#/login\');closeDrawer()">退出登录</button>';
    } else {
        d += '<a href="#/login" onclick="closeDrawer()">登录</a>';
    }
    $drawer.innerHTML = d;
}

// ============================================
// 页面：登录
// ============================================
function renderLogin() {
    $main.className = 'page-auth';
    $main.innerHTML = `
    <div class="auth-card">
        <h1>工作管理</h1>
        <p class="sub">使用统一账号登录</p>
        <div style="text-align:center;margin-top:12px;">
            <button class="btn btn-primary btn-block" onclick="startOAuthLogin()">前往 Account 登录</button>
        </div>
        <p style="margin-top:20px;text-align:center;font-size:13px;color:var(--c-text-sub);">
            还没有账号？前往 <a href="https://account.takemeto.icu/register" target="_blank">Account 注册</a>
        </p>
    </div>`;
}

// ============================================
// 页面：工作项列表
// ============================================
async function renderList() {
    $main.className = '';

    let statusFilter = 'all';
    let searchQuery   = '';

    function buildToolbar() {
        return `
        <div class="toolbar">
            <input class="search-input" type="text" id="wi-search" placeholder="搜索工作项..."
                   value="${escAttr(searchQuery)}" oninput="onListFilter()"
                   style="flex:1;min-width:160px;max-width:300px;padding:8px 12px;border:1px solid var(--c-border);border-radius:var(--radius-sm);font-size:14px;outline:none;">
            <select id="wi-status" onchange="onListFilter()">
                <option value="all" ${statusFilter==='all'?'selected':''}>全部</option>
                <option value="active" ${statusFilter==='active'?'selected':''}>未完成</option>
                <option value="completed" ${statusFilter==='completed'?'selected':''}>已完成</option>
            </select>
            <button class="btn btn-primary" onclick="createItemModal()">+ 新建工作项</button>
        </div>`;
    }

    $main.innerHTML = `
    <div class="card">
        <div class="card-header"><h2>工作项</h2></div>
        ${buildToolbar()}
        <div id="items-grid" class="work-items-grid">
            <div class="empty"><p>加载中...</p></div>
        </div>
    </div>`;

    window.onListFilter = function() {
        searchQuery   = document.getElementById('wi-search').value.trim();
        statusFilter  = document.getElementById('wi-status').value;
        loadItems();
    };

    await loadItems();

    async function loadItems() {
        let url = '/api/work-items?';
        if (statusFilter !== 'all') url += 'status=' + statusFilter + '&';
        if (searchQuery) url += 'search=' + encodeURIComponent(searchQuery) + '&';
        try {
            const data = await apiGet(url);
            const items = data.data || [];
            const grid = document.getElementById('items-grid');
            if (items.length === 0) {
                grid.innerHTML = '<div class="empty"><div class="icon">&#x1F4CB;</div><p>暂无工作项</p></div>';
                return;
            }
            grid.innerHTML = items.map(item => `
            <div class="item-card${item.completed?' completed':''}" onclick="navigate('#/detail/${escAttr(item.id)}')">
                ${item.completed ? '<span class="completed-badge">已完成</span>' : ''}
                <div class="item-title">${escHtml(item.title)}</div>
                <div class="item-meta">
                    ${item.start_time ? '<span>&#x1F4C5; ' + formatDate(item.start_time) + '</span>' : ''}
                    ${item.end_time ? '<span>&#x23F0; ' + formatDate(item.end_time) + '</span>' : ''}
                </div>
                <div class="item-progress">
                    子任务 <b>${item.completed_sub_tasks}/${item.total_sub_tasks}</b>
                </div>
            </div>`).join('');
        } catch (err) {
            document.getElementById('items-grid').innerHTML =
                '<div class="empty"><p>加载失败：' + escHtml(err.msg || '') + '</p></div>';
        }
    }
}

// ============================================
// 页面：工作项详情
// ============================================
async function renderDetail(itemId) {
    if (!itemId) { navigate('#/'); return; }

    $main.className = '';
    $main.innerHTML = '<div class="empty"><p>加载中...</p></div>';

    try {
        const res = await apiGet('/api/work-items/' + itemId);
        const item = res.data;
        await showDetail(item);
    } catch (err) {
        $main.innerHTML = '<div class="empty"><div class="icon">!</div><p>' + escHtml(err.msg || '工作项不存在') + '</p>' +
            '<button class="btn btn-outline" onclick="navigate(\'#/\')">返回列表</button></div>';
    }
}

async function showDetail(item) {
    const completedCls = item.completed ? ' completed' : '';

    $main.innerHTML = `
    <div class="card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <a href="#/" style="color:var(--c-text-sub);font-size:13px;">&larr; 返回列表</a>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-outline btn-sm" onclick="toggleCompleteItem('${escJs(item.id)}', ${item.completed})">
                    ${item.completed ? '取消完成' : '标记完成'}
                </button>
                <button class="btn btn-outline btn-sm" onclick="editItemModal('${escJs(item.id)}','${escJs(item.title)}','${escJs(item.detail||'')}','${escJs(item.start_time||'')}','${escJs(item.end_time||'')}','${escJs(item.remind_at||'')}')">编辑</button>
                <button class="btn btn-danger btn-sm" onclick="deleteItemConfirm('${escJs(item.id)}','${escJs(item.title)}')">删除</button>
            </div>
        </div>

        <div class="item-detail-header${completedCls}" style="margin-top:16px;">
            <h2>${escHtml(item.title)}</h2>
            <div class="detail-meta">
                ${item.start_time ? '<span>&#x1F4C5; 开始: ' + formatDate(item.start_time) + '</span>' : ''}
                ${item.end_time ? '<span>&#x23F0; 结束: ' + formatDate(item.end_time) + '</span>' : ''}
                ${item.remind_at ? '<span>&#x1F514; 提醒: ' + formatTime(item.remind_at) + '</span>' : ''}
            </div>
        </div>

        ${item.detail ? '<div style="margin:16px 0;white-space:pre-wrap;line-height:1.8;">' + escHtml(item.detail) + '</div>' : ''}
    </div>

    <!-- 子任务 -->
    <div class="card">
        <div class="card-header">
            <h2>子任务</h2>
        </div>
        <div id="subtask-list"></div>
        <div class="inline-form">
            <input id="subtask-input" type="text" placeholder="添加子任务..." onkeydown="if(event.key==='Enter')addSubTask('${escJs(item.id)}')">
            <button class="btn btn-primary btn-sm" onclick="addSubTask('${escJs(item.id)}')">添加</button>
        </div>
    </div>

    <!-- 工作记录（收起） -->
    <div class="card" style="padding-bottom:0;">
        <div class="records-toggle" id="records-toggle" onclick="loadRecords('${escJs(item.id)}')">
            工作记录 &#x25BC;
        </div>
        <div id="record-list" style="display:none;"></div>
    </div>`;

    // 加载子任务
    loadSubTasks(item.id);
}

// ---------- 子任务 ----------
async function loadSubTasks(itemId) {
    try {
        const res = await apiGet('/api/work-items/' + itemId + '/sub-tasks');
        const subs = res.data || [];
        const el = document.getElementById('subtask-list');
        if (subs.length === 0) {
            el.innerHTML = '<div class="empty" style="padding:16px;"><p>暂无子任务</p></div>';
            return;
        }
        el.innerHTML = '<ul class="subtask-list">' + subs.map(s => `
        <li class="subtask-item">
            <div class="check-box${s.completed ? ' checked' : ''}" onclick="toggleSubTask('${escJs(itemId)}','${escJs(s.id)}')">
                ${s.completed ? '&#x2713;' : ''}
            </div>
            <div class="subtask-content${s.completed ? ' completed' : ''}">
                <div>${escHtml(s.content)}</div>
                <div class="subtask-time">
                    ${s.start_time ? formatDate(s.start_time) : ''}
                    ${s.start_time && s.end_time ? ' ~ ' : ''}
                    ${s.end_time ? formatDate(s.end_time) : ''}
                </div>
            </div>
            <div class="subtask-actions">
                <button class="btn btn-outline btn-sm" onclick="editSubTaskModal('${escJs(itemId)}','${escJs(s.id)}','${escJs(s.content)}','${escJs(s.start_time||'')}','${escJs(s.end_time||'')}','${escJs(s.remind_at||'')}')">编辑</button>
                <button class="btn btn-danger btn-sm" onclick="deleteSubTaskConfirm('${escJs(itemId)}','${escJs(s.id)}','${escJs(s.content)}')">删除</button>
            </div>
        </li>`).join('') + '</ul>';
    } catch (err) {
        document.getElementById('subtask-list').innerHTML =
            '<div class="empty" style="padding:16px;"><p>加载失败</p></div>';
    }
}

async function addSubTask(itemId) {
    const input = document.getElementById('subtask-input');
    const content = input.value.trim();
    if (!content) return;
    try {
        await apiPost('/api/work-items/' + itemId + '/sub-tasks', { content: content });
        input.value = '';
        showToast('子任务已添加', 'success');
        loadSubTasks(itemId);
        // 重新加载工作项详情以更新 detail header 等
        const res = await apiGet('/api/work-items/' + itemId);
        showDetail(res.data);
    } catch (err) {
        showToast(err.msg || '添加失败', 'error');
    }
}

async function toggleSubTask(itemId, subId) {
    try {
        await apiPost('/api/work-items/' + itemId + '/sub-tasks/' + subId + '/toggle', {});
        loadSubTasks(itemId);
    } catch (err) {
        showToast(err.msg || '操作失败', 'error');
    }
}

function editSubTaskModal(itemId, subId, content, startTime, endTime, remindAt) {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>编辑子任务</h3>
            <form onsubmit="handleEditSubTask(event,'${escJs(itemId)}','${escJs(subId)}')">
                <div class="form-group">
                    <label>内容</label>
                    <input name="content" value="${escAttr(content)}" required>
                </div>
                <div class="form-group">
                    <label>开始时间</label>
                    <input name="start_time" type="datetime-local" value="${escAttr(startTime)}">
                </div>
                <div class="form-group">
                    <label>结束时间</label>
                    <input name="end_time" type="datetime-local" value="${escAttr(endTime)}">
                </div>
                <div class="form-group">
                    <label>提醒时间</label>
                    <input name="remind_at" type="datetime-local" value="${escAttr(remindAt)}">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    </div>`);
}

async function handleEditSubTask(e, itemId, subId) {
    e.preventDefault();
    const f = e.target;
    try {
        await apiPut('/api/work-items/' + itemId + '/sub-tasks/' + subId, {
            content:    f.content.value.trim(),
            start_time: f.start_time.value,
            end_time:   f.end_time.value,
            remind_at:  f.remind_at.value
        });
        closeModal();
        showToast('子任务已更新', 'success');
        loadSubTasks(itemId);
    } catch (err) {
        showToast(err.msg || '更新失败', 'error');
    }
}

function deleteSubTaskConfirm(itemId, subId, content) {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>确认删除</h3>
            <p>确定要删除子任务「${escHtml(content.substring(0, 40))}」吗？</p>
            <div class="modal-actions">
                <button class="btn btn-outline" onclick="closeModal()">取消</button>
                <button class="btn btn-danger" onclick="handleDeleteSubTask('${escJs(itemId)}','${escJs(subId)}')">确认删除</button>
            </div>
        </div>
    </div>`);
}

async function handleDeleteSubTask(itemId, subId) {
    try {
        await apiDel('/api/work-items/' + itemId + '/sub-tasks/' + subId);
        closeModal();
        showToast('子任务已删除', 'success');
        loadSubTasks(itemId);
    } catch (err) {
        showToast(err.msg || '删除失败', 'error');
    }
}

// ---------- 工作项操作 ----------
async function toggleCompleteItem(itemId, currentCompleted) {
    try {
        await apiPost('/api/work-items/' + itemId + '/toggle-complete', {});
        showToast(currentCompleted ? '已取消完成' : '已标记完成', 'success');
        const res = await apiGet('/api/work-items/' + itemId);
        showDetail(res.data);
    } catch (err) {
        showToast(err.msg || '操作失败', 'error');
    }
}

function createItemModal() {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>新建工作项</h3>
            <form onsubmit="handleCreateItem(event)">
                <div class="form-group">
                    <label>标题 <span style="color:var(--c-danger)">*</span></label>
                    <input name="title" placeholder="请输入工作项标题" required>
                </div>
                <div class="form-group">
                    <label>详细说明</label>
                    <textarea name="detail" rows="4" placeholder="任务详细说明..."></textarea>
                </div>
                <div class="form-group">
                    <label>开始时间</label>
                    <input name="start_time" type="datetime-local">
                </div>
                <div class="form-group">
                    <label>结束时间</label>
                    <input name="end_time" type="datetime-local">
                </div>
                <div class="form-group">
                    <label>提醒时间</label>
                    <input name="remind_at" type="datetime-local">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">创建</button>
                </div>
            </form>
        </div>
    </div>`);
}

async function handleCreateItem(e) {
    e.preventDefault();
    const f = e.target;
    try {
        await apiPost('/api/work-items', {
            title:      f.title.value.trim(),
            detail:     f.detail.value.trim(),
            start_time: f.start_time.value,
            end_time:   f.end_time.value,
            remind_at:  f.remind_at.value
        });
        closeModal();
        showToast('工作项已创建', 'success');
        // 刷新列表
        navigate('#/');
        renderList();
    } catch (err) {
        showToast(err.msg || '创建失败', 'error');
    }
}

function editItemModal(id, title, detail, startTime, endTime, remindAt) {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>编辑工作项</h3>
            <form onsubmit="handleEditItem(event,'${escJs(id)}')">
                <div class="form-group">
                    <label>标题 <span style="color:var(--c-danger)">*</span></label>
                    <input name="title" value="${escAttr(title)}" required>
                </div>
                <div class="form-group">
                    <label>详细说明</label>
                    <textarea name="detail" rows="4">${escHtml(detail)}</textarea>
                </div>
                <div class="form-group">
                    <label>开始时间</label>
                    <input name="start_time" type="datetime-local" value="${escAttr(startTime)}">
                </div>
                <div class="form-group">
                    <label>结束时间</label>
                    <input name="end_time" type="datetime-local" value="${escAttr(endTime)}">
                </div>
                <div class="form-group">
                    <label>提醒时间</label>
                    <input name="remind_at" type="datetime-local" value="${escAttr(remindAt)}">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    </div>`);
}

async function handleEditItem(e, id) {
    e.preventDefault();
    const f = e.target;
    try {
        await apiPut('/api/work-items/' + id, {
            title:      f.title.value.trim(),
            detail:     f.detail.value.trim(),
            start_time: f.start_time.value,
            end_time:   f.end_time.value,
            remind_at:  f.remind_at.value
        });
        closeModal();
        showToast('工作项已更新', 'success');
        const res = await apiGet('/api/work-items/' + id);
        showDetail(res.data);
    } catch (err) {
        showToast(err.msg || '更新失败', 'error');
    }
}

function deleteItemConfirm(id, title) {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>确认删除</h3>
            <p>确定要删除工作项「${escHtml(title.substring(0, 40))}」吗？</p>
            <p style="font-size:13px;color:var(--c-text-sub);">此操作不可撤销，同时会删除所有子任务。</p>
            <div class="modal-actions">
                <button class="btn btn-outline" onclick="closeModal()">取消</button>
                <button class="btn btn-danger" onclick="handleDeleteItem('${escJs(id)}')">确认删除</button>
            </div>
        </div>
    </div>`);
}

async function handleDeleteItem(id) {
    try {
        await apiDel('/api/work-items/' + id);
        closeModal();
        showToast('工作项已删除', 'success');
        navigate('#/');
        renderList();
    } catch (err) {
        showToast(err.msg || '删除失败', 'error');
    }
}

// ---------- 工作记录（懒加载） ----------
let recordsLoaded = false;

async function loadRecords(itemId) {
    const toggle = document.getElementById('records-toggle');
    const list   = document.getElementById('record-list');

    if (recordsLoaded) {
        list.style.display = list.style.display === 'none' ? 'block' : 'none';
        toggle.innerHTML = '工作记录 ' + (list.style.display === 'none' ? '&#x25BC;' : '&#x25B2;');
        return;
    }

    toggle.innerHTML = '加载中...';
    try {
        const res = await apiGet('/api/work-items/' + itemId + '/records');
        const records = res.data || [];
        if (records.length === 0) {
            list.innerHTML = '<div class="empty" style="padding:20px;"><p>暂无工作记录</p></div>';
        } else {
            list.innerHTML = '<div class="record-list" style="padding:0 0 12px 0;">' +
                records.map(r => `
                <div class="record-item">
                    <div class="record-time">${formatTime(r.created_at)}</div>
                    <div>${escHtml(r.detail)}</div>
                </div>`).join('') + '</div>';
        }
        list.style.display = 'block';
        toggle.innerHTML = '工作记录 &#x25B2;';
        recordsLoaded = true;
    } catch (err) {
        list.innerHTML = '<div class="empty" style="padding:20px;"><p>加载失败</p></div>';
        list.style.display = 'block';
        toggle.innerHTML = '工作记录 &#x25B2;';
        recordsLoaded = true;
    }
}

// ============================================
// 启动
// ============================================
(async function init() {
    loadTokens();
    if (accessToken) {
        await fetchUserInfo();
    }
    await doRoute();
})();
