/* ============================================
   服务管理前端 — 零依赖 Hash SPA
   ============================================ */

// ---------- DOM 引用 ----------
const $header    = document.getElementById('header');
const $navMain   = document.getElementById('nav-main');
const $userArea  = document.getElementById('user-area');
const $drawer    = document.getElementById('drawer');
const $drawerOv  = document.getElementById('drawer-overlay');
const $toast     = document.getElementById('toast');
const $main      = document.getElementById('main');
const $modalCt   = document.getElementById('modal-container');
const $menuBtn   = document.getElementById('menu-toggle');

// ---------- 全局状态 ----------
let currentUser = null;
let currentPage = null;
let toastTimer  = null;

// ---------- 转义函数 (XSS 防护) ----------
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;')
                    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escJs(s) {
    return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

// ---------- 工具函数 ----------
function formatTime(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
function openDrawer() {
    $drawer.classList.add('open');
    $drawerOv.classList.add('open');
}
function closeDrawer() {
    $drawer.classList.remove('open');
    $drawerOv.classList.remove('open');
}

// ---------- Modal ----------
function showModal(html) {
    $modalCt.innerHTML = html;
}
function closeModal() {
    $modalCt.innerHTML = '';
}

// ---------- API 客户端 ----------
async function api(url, opts = {}) {
    const headers = opts.headers || {};
    if (!(opts.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const res = await fetch(url, { ...opts, headers, credentials: 'include' });

    let data;
    try { data = await res.json(); } catch (_) {
        throw { code: -1, msg: '响应解析失败' };
    }

    if (data.code !== 0) {
        if (data.code === 2001 && !url.includes('/auth/')) {
            logout(false);
            navigate('#/login');
            throw data;
        }
        throw data;
    }
    return data;
}

function apiGet(url)             { return api(url); }
function apiPost(url, body)      { return api(url, { method: 'POST', body: JSON.stringify(body) }); }
function apiPut(url, body)       { return api(url, { method: 'PUT',  body: JSON.stringify(body) }); }
function apiDel(url)             { return api(url, { method: 'DELETE' }); }

// ---------- 认证 ----------
async function fetchUser() {
    try {
        const data = await apiGet('/api/auth/me');
        currentUser = data.data;
    } catch (_) {
        currentUser = null;
    }
}

function logout(doApi) {
    if (doApi !== false) {
        apiPost('/api/auth/logout').catch(() => {});
    }
    currentUser = null;
}

async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        username: form.username.value.trim(),
        password: form.password.value
    };
    if (!body.username || !body.password) {
        showToast('请输入用户名和密码', 'error');
        return;
    }
    try {
        await apiPost('/api/auth/login', body);
        await fetchUser();
        navigate('#/dashboard');
        showToast('登录成功', 'success');
    } catch (err) {
        showToast(err.msg || '登录失败', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        username: form.username.value.trim(),
        email:    form.email.value.trim(),
        password: form.password.value
    };
    if (!body.username || !body.email || !body.password) {
        showToast('请填写完整信息', 'error');
        return;
    }
    try {
        await apiPost('/api/auth/register', body);
        showToast('注册成功，请登录', 'success');
        navigate('#/login');
    } catch (err) {
        showToast(err.msg || '注册失败', 'error');
    }
}

// ---------- 路由 ----------
const routes = {
    'login':       { render: renderLogin,      auth: false },
    'register':    { render: renderRegister,   auth: false },
    'dashboard':   { render: renderDashboard,  auth: true  },
    'admin-users': { render: renderAdminUsers, auth: true, admin: true },
    'admin-apps':  { render: renderAdminApps,  auth: true, admin: true },
};

function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const page = h.split('/')[0] || 'dashboard';
    if (routes[page]) return page;
    return 'dashboard';
}

function navigate(hash) {
    if (!hash.startsWith('#')) hash = '#' + hash;
    location.hash = hash;
}

function getRouteDef(page) {
    return routes[page] || routes['dashboard'];
}

async function doRoute() {
    const page = parseHash();
    const def  = getRouteDef(page);

    // 认证守卫
    if (def.auth && !currentUser) {
        navigate('#/login');
        return;
    }
    // 管理员守卫
    if (def.admin && (!currentUser || currentUser.role !== 'admin')) {
        navigate('#/dashboard');
        return;
    }

    currentPage = page;
    renderHeader();
    closeDrawer();
    try {
        await def.render();
    } catch (err) {
        $main.innerHTML = `<div class="empty"><div class="icon">⚠</div><p>页面加载失败：${escHtml(err.msg || '未知错误')}</p></div>`;
    }
    window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => { doRoute(); });
$menuBtn.addEventListener('click', openDrawer);
$drawerOv.addEventListener('click', closeDrawer);

// ---------- Header 渲染 ----------
function renderHeader() {
    // 桌面导航
    const links = [];
    if (currentUser) {
        links.push(`<a href="#/dashboard" class="${currentPage==='dashboard'?'active':''}">首页</a>`);
        if (currentUser.role === 'admin') {
            links.push(`<a href="#/admin-users" class="${currentPage==='admin-users'?'active':''}">用户管理</a>`);
            links.push(`<a href="#/admin-apps" class="${currentPage==='admin-apps'?'active':''}">应用管理</a>`);
        }
    }
    $navMain.innerHTML = links.join('');

    // 用户区域
    if (currentUser) {
        $userArea.innerHTML = `
            <span>${escHtml(currentUser.username)}</span>
            ${currentUser.role === 'admin' ? '<span class="role-badge admin">管理员</span>' : '<span class="role-badge">用户</span>'}
            <button class="btn btn-link btn-sm" onclick="logout();navigate('#/login')">退出</button>`;
    } else {
        $userArea.innerHTML = `
            <a href="#/login" class="btn btn-link btn-sm">登录</a>
            <a href="#/register" class="btn btn-outline btn-sm">注册</a>`;
    }

    // 抽屉菜单
    let drawerHtml = '';
    if (currentUser) {
        drawerHtml += `<div style="font-weight:600;margin-bottom:16px;">${escHtml(currentUser.username)}</div>`;
        drawerHtml += `<a href="#/dashboard" onclick="closeDrawer()" class="${currentPage==='dashboard'?'active':''}">首页</a>`;
        if (currentUser.role === 'admin') {
            drawerHtml += `<a href="#/admin-users" onclick="closeDrawer()" class="${currentPage==='admin-users'?'active':''}">用户管理</a>`;
            drawerHtml += `<a href="#/admin-apps" onclick="closeDrawer()" class="${currentPage==='admin-apps'?'active':''}">应用管理</a>`;
        }
        drawerHtml += `<div class="drawer-divider"></div>`;
        drawerHtml += `<button class="btn btn-outline btn-block btn-logout" onclick="logout();navigate('#/login');closeDrawer()">退出登录</button>`;
    } else {
        drawerHtml += `<a href="#/login" onclick="closeDrawer()">登录</a>`;
        drawerHtml += `<a href="#/register" onclick="closeDrawer()">注册</a>`;
    }
    $drawer.innerHTML = drawerHtml;
}

// ============================================
// 页面渲染
// ============================================

// ---------- 登录 ----------
function renderLogin() {
    $main.className = 'page-auth';
    $main.innerHTML = `
    <div class="auth-card">
        <h1>登录</h1>
        <p class="sub">请使用您的账号登录管理后台</p>
        <form onsubmit="handleLogin(event)">
            <div class="form-group">
                <label for="login-user">用户名</label>
                <input id="login-user" name="username" type="text" autocomplete="username" placeholder="请输入用户名" required>
            </div>
            <div class="form-group">
                <label for="login-pass">密码</label>
                <input id="login-pass" name="password" type="password" autocomplete="current-password" placeholder="请输入密码" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block" style="margin-top:8px;">登 录</button>
        </form>
        <p style="margin-top:20px;text-align:center;font-size:13px;color:var(--c-text-sub);">
            还没有账号？<a href="#/register">立即注册</a>
        </p>
    </div>`;
}

// ---------- 注册 ----------
function renderRegister() {
    $main.className = 'page-auth';
    $main.innerHTML = `
    <div class="auth-card">
        <h1>注册</h1>
        <p class="sub">创建新账号以使用管理后台</p>
        <form onsubmit="handleRegister(event)">
            <div class="form-group">
                <label for="reg-user">用户名</label>
                <input id="reg-user" name="username" type="text" autocomplete="username" placeholder="请输入用户名" required>
            </div>
            <div class="form-group">
                <label for="reg-email">邮箱</label>
                <input id="reg-email" name="email" type="email" autocomplete="email" placeholder="请输入邮箱" required>
            </div>
            <div class="form-group">
                <label for="reg-pass">密码</label>
                <input id="reg-pass" name="password" type="password" autocomplete="new-password" placeholder="请输入密码" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block" style="margin-top:8px;">注 册</button>
        </form>
        <p style="margin-top:20px;text-align:center;font-size:13px;color:var(--c-text-sub);">
            已有账号？<a href="#/login">立即登录</a>
        </p>
    </div>`;
}

// ---------- 首页 / Dashboard ----------
async function renderDashboard() {
    $main.className = '';
    $main.innerHTML = `<div class="empty"><div class="icon">📋</div><p>加载中...</p></div>`;

    let infoHtml = '<p style="color:var(--c-text-sub);">未登录</p>';
    if (currentUser) {
        infoHtml = `
            <table><tbody>
                <tr><th style="width:80px;">用户名</th><td>${escHtml(currentUser.username)}</td></tr>
                <tr><th>邮箱</th><td>${escHtml(currentUser.email || '-')}</td></tr>
                <tr><th>角色</th><td><span class="role-badge${currentUser.role==='admin'?' admin':''}">${escHtml(currentUser.role || 'user')}</span></td></tr>
                <tr><th>注册时间</th><td>${formatTime(currentUser.created_at || '')}</td></tr>
            </tbody></table>`;
    }

    $main.innerHTML = `
    <div class="card">
        <div class="card-header"><h2>账户信息</h2></div>
        ${infoHtml}
    </div>
    <div class="card">
        <div class="card-header"><h2>系统状态</h2></div>
        <p style="color:var(--c-text-sub);" id="sys-status">正在获取...</p>
    </div>`;

    // 获取系统状态
    try {
        const data = await apiGet('/status');
        document.getElementById('sys-status').textContent = `服务正常运行 (${data.msg})`;
    } catch (_) {
        document.getElementById('sys-status').textContent = '无法获取状态';
    }
}

// ---------- 管理员: 用户管理 ----------
async function renderAdminUsers() {
    $main.className = '';
    $main.innerHTML = `
    <div class="card">
        <div class="card-header">
            <h2>用户管理</h2>
        </div>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>用户名</th>
                        <th>邮箱</th>
                        <th>角色</th>
                        <th>注册时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="users-tbody">
                    <tr><td colspan="6"><div class="empty"><p>加载中...</p></div></td></tr>
                </tbody>
            </table>
        </div>
    </div>`;

    try {
        const data = await apiGet('/api/admin/users');
        const users = data.data || [];
        if (users.length === 0) {
            document.getElementById('users-tbody').innerHTML =
                '<tr><td colspan="6"><div class="empty"><p>暂无用户数据</p></div></td></tr>';
            return;
        }
        document.getElementById('users-tbody').innerHTML = users.map(u => `
            <tr>
                <td data-label="ID">${escHtml(String(u.id))}</td>
                <td data-label="用户名">${escHtml(u.username)}</td>
                <td data-label="邮箱">${escHtml(u.email || '-')}</td>
                <td data-label="角色"><span class="role-badge${u.role==='admin'?' admin':''}">${escHtml(u.role || 'user')}</span></td>
                <td data-label="注册时间">${formatTime(u.created_at || '')}</td>
                <td data-label="操作" class="actions">
                    <button class="btn btn-outline btn-sm" onclick="editUserModal('${escJs(String(u.id))}','${escJs(u.username)}','${escJs(u.email||'')}','${escJs(u.role||'user')}')">编辑</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteUser('${escJs(String(u.id))}','${escJs(u.username)}')">删除</button>
                </td>
            </tr>`).join('');
    } catch (err) {
        document.getElementById('users-tbody').innerHTML =
            `<tr><td colspan="6"><div class="empty"><p>加载失败：${escHtml(err.msg || '未知错误')}</p></div></td></tr>`;
    }
}

function editUserModal(id, username, email, role) {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>编辑用户</h3>
            <form onsubmit="handleEditUser(event,'${escJs(id)}')">
                <div class="form-group">
                    <label>用户名</label>
                    <input name="username" value="${escAttr(username)}" required>
                </div>
                <div class="form-group">
                    <label>邮箱</label>
                    <input name="email" type="email" value="${escAttr(email)}">
                </div>
                <div class="form-group">
                    <label>角色</label>
                    <select name="role">
                        <option value="user" ${role==='user'?'selected':''}>用户</option>
                        <option value="admin" ${role==='admin'?'selected':''}>管理员</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    </div>`);
}

async function handleEditUser(e, id) {
    e.preventDefault();
    const form = e.target;
    try {
        await apiPut('/api/admin/users/' + id, {
            username: form.username.value.trim(),
            email: form.email.value.trim(),
            role: form.role.value
        });
        closeModal();
        showToast('用户更新成功', 'success');
        renderAdminUsers();
    } catch (err) {
        showToast(err.msg || '更新失败', 'error');
    }
}

function deleteUser(id, username) {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>确认删除</h3>
            <p style="margin-bottom:8px;">确定要删除用户 <strong>${escHtml(username)}</strong> 吗？</p>
            <p style="font-size:13px;color:var(--c-text-sub);">此操作不可撤销。</p>
            <div class="modal-actions">
                <button class="btn btn-outline" onclick="closeModal()">取消</button>
                <button class="btn btn-danger" onclick="handleDeleteUser('${escJs(id)}')">确认删除</button>
            </div>
        </div>
    </div>`);
}

async function handleDeleteUser(id) {
    try {
        await apiDel('/api/admin/users/' + id);
        closeModal();
        showToast('用户已删除', 'success');
        renderAdminUsers();
    } catch (err) {
        showToast(err.msg || '删除失败', 'error');
    }
}

// ---------- 管理员: 应用管理 ----------
async function renderAdminApps() {
    $main.className = '';
    $main.innerHTML = `
    <div class="card">
        <div class="card-header">
            <h2>应用管理</h2>
            <button class="btn btn-primary btn-sm" onclick="createAppModal()">+ 新建应用</button>
        </div>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>名称</th>
                        <th>创建时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="apps-tbody">
                    <tr><td colspan="4"><div class="empty"><p>加载中...</p></div></td></tr>
                </tbody>
            </table>
        </div>
    </div>`;

    try {
        const data = await apiGet('/api/admin/apps');
        const apps = data.data || [];
        if (apps.length === 0) {
            document.getElementById('apps-tbody').innerHTML =
                '<tr><td colspan="4"><div class="empty"><p>暂无应用，点击上方按钮创建</p></div></td></tr>';
            return;
        }
        document.getElementById('apps-tbody').innerHTML = apps.map(a => `
            <tr>
                <td data-label="ID">${escHtml(String(a.id))}</td>
                <td data-label="名称">${escHtml(a.name)}</td>
                <td data-label="创建时间">${formatTime(a.created_at || '')}</td>
                <td data-label="操作" class="actions">
                    <button class="btn btn-outline btn-sm" onclick="editAppModal('${escJs(String(a.id))}','${escJs(a.name)}')">编辑</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteApp('${escJs(String(a.id))}','${escJs(a.name)}')">删除</button>
                </td>
            </tr>`).join('');
    } catch (err) {
        document.getElementById('apps-tbody').innerHTML =
            `<tr><td colspan="4"><div class="empty"><p>加载失败：${escHtml(err.msg || '未知错误')}</p></div></td></tr>`;
    }
}

function createAppModal() {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>新建应用</h3>
            <form onsubmit="handleCreateApp(event)">
                <div class="form-group">
                    <label>应用名称</label>
                    <input name="name" placeholder="请输入应用名称" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">创建</button>
                </div>
            </form>
        </div>
    </div>`);
}

async function handleCreateApp(e) {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    try {
        await apiPost('/api/admin/apps', { name: name });
        closeModal();
        showToast('应用创建成功', 'success');
        renderAdminApps();
    } catch (err) {
        showToast(err.msg || '创建失败', 'error');
    }
}

function editAppModal(id, name) {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>编辑应用</h3>
            <form onsubmit="handleEditApp(event,'${escJs(id)}')">
                <div class="form-group">
                    <label>应用名称</label>
                    <input name="name" value="${escAttr(name)}" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存</button>
                </div>
            </form>
        </div>
    </div>`);
}

async function handleEditApp(e, id) {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    try {
        await apiPut('/api/admin/apps/' + id, { name: name });
        closeModal();
        showToast('应用更新成功', 'success');
        renderAdminApps();
    } catch (err) {
        showToast(err.msg || '更新失败', 'error');
    }
}

function deleteApp(id, name) {
    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
            <h3>确认删除</h3>
            <p style="margin-bottom:8px;">确定要删除应用 <strong>${escHtml(name)}</strong> 吗？</p>
            <p style="font-size:13px;color:var(--c-text-sub);">此操作不可撤销。</p>
            <div class="modal-actions">
                <button class="btn btn-outline" onclick="closeModal()">取消</button>
                <button class="btn btn-danger" onclick="handleDeleteApp('${escJs(id)}')">确认删除</button>
            </div>
        </div>
    </div>`);
}

async function handleDeleteApp(id) {
    try {
        await apiDel('/api/admin/apps/' + id);
        closeModal();
        showToast('应用已删除', 'success');
        renderAdminApps();
    } catch (err) {
        showToast(err.msg || '删除失败', 'error');
    }
}

// ============================================
// 启动
// ============================================
(async function init() {
    await fetchUser();
    await doRoute();
})();
