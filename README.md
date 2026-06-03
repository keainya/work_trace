# 工作管理程序

一个轻量级的工作任务管理工具，帮助你追踪和管理日常工作事项。基于 Go + Gin 构建，前端采用零依赖原生 SPA，编译为单个可执行文件部署。

## 核心概念

本系统围绕以下三个核心概念构建：

### 1. 工作项 (WorkItem)

工作项是任务管理的最小独立单元，代表一项具体的工作任务。

**数据字段：**

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| ID | string(UUID) | 自动 | 主键，系统自动生成 |
| UserID | string | 自动 | 从 OAuth token 解析的 `sub`，API 层自动填充 |
| Title | string | 是 | 工作任务的名称 |
| Completed | bool | 否 | 已完成 / 未完成，默认 false |
| Detail | text | 否 | 详细说明，纯文本，支持全屏编辑 |
| StartTime | datetime | 否 | 任务的计划开始时间 |
| EndTime | datetime | 否 | 任务的计划结束时间 |
| RemindAt | datetime | 否 | 提醒时间点（尚未启用前端通知） |
| CreatedAt | datetime | 自动 | 创建时间 |
| UpdatedAt | datetime | 自动 | 最后更新时间 |

**功能：**
- 创建、编辑、删除工作项
- 切换完成 / 未完成状态（已完成的工作项使用删除线样式）
- 列表页支持关键词搜索、按状态（全部/进行中/已完成）筛选、多字段排序
- 列表页卡片显示子任务完成进度（如"3/5"）

### 2. 子任务 (SubTask)

子任务绑定在工作项之下，用于将一个大的工作项拆分为更细粒度的待办条目。

**数据字段：**

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| ID | string(UUID) | 自动 | 自动生成 |
| WorkItemID | string(UUID) | 是 | 绑定的工作项 ID，外键关联，级联删除 |
| Content | text | 是 | 子任务的文字描述 |
| Completed | bool | 否 | 默认 false |
| StartTime | datetime | 否 | 计划开始时间 |
| EndTime | datetime | 否 | 计划结束时间 |
| RemindAt | datetime | 否 | 提醒时间点 |
| CreatedAt | datetime | 自动 | 创建时间 |
| UpdatedAt | datetime | 自动 | 最后更新时间 |

**功能：**
- 在工作项详情页内添加、编辑、删除子任务
- 勾选切换完成 / 未完成（已完成子任务使用删除线样式）
- 按完成状态筛选
- 不依附工作项：删除工作项时级联删除其子任务

### 3. 工作记录 (WorkRecord)

工作记录是对工作项所有变更操作的自动审计日志，记录每一次操作的内容和时间。

**数据字段：**

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| ID | string(UUID) | 自动 | 自动生成 |
| WorkItemID | string(UUID) | 是 | 所属工作项 ID，级联删除 |
| Action | string | 是 | 操作类型：`create` / `update` / `complete` / `uncomplete` / `delete` |
| Detail | text | 是 | 人类可读的变更描述（字段级新旧值对比） |
| CreatedAt | datetime | 自动 | 操作时间 |

**功能：**
- 每次对工作项的编辑自动生成一条记录
- 记录变更字段及新旧值对比
- 在工作项详情页底部**收起**展示，默认不展开
- 用户点击展开时才请求数据（懒加载），按时间倒序排列
- 用户不能手动创建或编辑工作记录

---

## 数据关系

```
User (Account服务)  1 ──── N  工作项 (WorkItem)
                                  │
                                  ├──── 1 ──── N  子任务 (SubTask)
                                  │
                                  └──── 1 ──── N  工作记录 (WorkRecord)
```

- 所有数据通过 `user_id` 进行用户间隔离，用户只能访问自己的数据
- 删除工作项时级联删除其子任务和工作记录

---

## API 接口

### 统一响应格式

```json
{
    "code": 0,
    "msg": "ok",
    "data": { ... }
}
```

| code | 含义 |
|------|------|
| 0 | 成功 |
| 1002 | 参数校验失败 |
| 2001 | 未登录 / Token 无效 |
| 3004 | 授权码无效或已过期 |
| 3006 | grant_type 不支持 |
| 4004 | 工作项不存在 |
| 4005 | 子任务不存在 |
| 9000 | 服务器内部错误 |

### 公开接口（无需认证）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/status` | 健康检查 |
| GET | `/api/oauth/config` | 返回 OAuth2 配置（auth_url, token_url, client_id, redirect_uri） |
| POST | `/api/oauth/token` | 代理 token 交换（保护 client_secret），支持 `authorization_code` 和 `refresh_token` 两种 grant_type |

### 认证接口（需要 `Authorization: Bearer {access_token}`）

**工作项：**

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/work-items` | 列表查询，支持 `?status=all/active/completed`、`?search=keyword`、`?sort=start_time/end_time/created_at/updated_at`、`?order=asc/desc` |
| POST | `/api/work-items` | 创建（title 必填，可选 detail/start_time/end_time/remind_at） |
| GET | `/api/work-items/:id` | 获取单个工作项详情 |
| PUT | `/api/work-items/:id` | 更新工作项 |
| DELETE | `/api/work-items/:id` | 删除（级联删除子任务和工作记录） |
| POST | `/api/work-items/:id/toggle-complete` | 切换完成状态，同时自动记录 WorkRecord |

**子任务：**

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/work-items/:id/sub-tasks` | 获取子任务列表（按 created_at 升序） |
| POST | `/api/work-items/:id/sub-tasks` | 创建子任务（content 必填） |
| PUT | `/api/work-items/:id/sub-tasks/:sub_id` | 更新子任务 |
| DELETE | `/api/work-items/:id/sub-tasks/:sub_id` | 删除子任务 |
| POST | `/api/work-items/:id/sub-tasks/:sub_id/toggle` | 切换子任务完成状态 |

**工作记录：**

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/work-items/:id/records` | 获取工作记录列表（按 created_at 倒序） |

---

## 用户系统

本系统不自行管理用户账户，而是接入统一的 Account 服务 (`https://account.takemeto.icu`) 作为 OAuth2 身份认证中心。详情参见 [docs/用户系统.md](docs/用户系统.md)。

### 认证流程

```
Web App  ──OAuth2 Authorization Code──> Account 服务
    │                                          │
    │ <──302 redirect with ?code──             │
    │                                          │
    │ POST /api/oauth/token (代理) ────────────> Account 服务 /oauth/token
    │ <── {access_token, refresh_token} ────── │
    │                                          │
    │ 后续 API 请求携带 Authorization: Bearer {access_token}
    │                                          │
    │ AuthMiddleware ──/oauth/userinfo──> Account 服务
    │ <── {sub, username, role} ───────────── │
    │                                          │
    │ 按 user_id (sub) 隔离数据
```

### 设计要点

- `client_secret` 始终保存在后端，前端通过 `/api/oauth/token` 代理交换 token，永远不接触 secret
- AuthMiddleware 对每个需认证的请求调用 Account 服务 `/oauth/userinfo` 验证 token
- 用户身份 (`sub`) 写入 Gin context 的 `user_id`，后续 handler 通过 `getUserID()` 获取
- 所有查询和写入自动按 `user_id` 过滤，确保用户间数据隔离

### Token 管理（前端）

| 属性 | Access Token | Refresh Token |
|------|-------------|---------------|
| 格式 | JWT | 随机字符串 |
| 有效期 | 1 小时 | 30 天 |
| 存储 | localStorage (`wt_access_token`) | localStorage (`wt_refresh_token`) |
| 刷新策略 | API 返回 code=2001 时自动用 refresh_token 刷新，失败则跳转登录页 |

---

## 配置

复制 `config.toml.example` 为 `config.toml` 并填入实际值：

```toml
[server]
port = 8086

[account]
base_url = "https://account.takemeto.icu"
client_id = "app_work_trace"
client_secret = "your_client_secret_here"
redirect_uri = "http://localhost:8086/oauth/callback"   # 可选，留空则自动从请求头推断
```

**配置优先级（从低到高）：**

1. 代码默认值：port `8086`，base_url `https://account.takemeto.icu`，client_id `app_work_trace`
2. `config.toml` 文件
3. 环境变量：`PORT` / `ACCOUNT_BASE_URL` / `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET`

---

## 构建与部署

### 本地开发

```bash
cp config.toml.example config.toml
# 编辑 config.toml

go build -o app.out
./app.out
# 打开 http://localhost:8086
```

### 生产部署

项目包含 `deploy.bat`（Windows 端执行，部署到 Linux 服务器）：

1. 交叉编译为 Linux 二进制
2. `scp` 上传到服务器 `/apps/wt/app.out`
3. SSH `kill` 旧进程
4. SSH `nohup` 启动新进程

服务启动后写入 `app.pid` 便于进程管理。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Go + Gin |
| ORM | GORM + `glebarez/sqlite`（纯 Go，无需 CGO） |
| 数据库 | SQLite |
| 前端 | 原生 HTML + CSS + JavaScript（零依赖 SPA） |
| 静态资源 | Go 1.16+ `embed.FS` 编译嵌入 |
| 认证 | OAuth2 Bearer Token（接入 Account 服务） |
| 配置 | TOML + 环境变量覆盖 |
| 主键 | UUID（`google/uuid`） |

---

## 项目结构

```
work_trace/
├── main.go              # 入口：PID 文件、路由、HTTP 服务
├── embed.go             # 将 web/ 嵌入二进制
├── config.toml.example  # 配置模板
├── deploy.bat           # 部署脚本（交叉编译 + scp + SSH 重启）
│
├── object/
│   └── database.go      # GORM 数据模型 + init() 自动建库/migrate
│
├── router/
│   └── default.go       # Gin 路由注册 + SPA 前端兜底
│
├── service/
│   └── default.go       # 全部 Handler + 自动审计日志 + OAuth 代理
│
├── utils/
│   ├── config.go        # TOML 配置解析 + 环境变量覆盖
│   ├── auth.go          # Bearer Token 认证中间件
│   └── pid.go           # PID 文件写入/清理
│
├── web/
│   ├── index.html       # SPA 容器
│   ├── favicon.ico
│   ├── css/
│   │   └── style.css    # 设计系统 + 所有组件样式
│   └── js/
│       └── app.js       # SPA 路由、API 封装、OAuth 登录、页面渲染、XSS 防护
│
├── docs/
│   └── 用户系统.md       # Account 服务 API 文档
│
└── data/
    └── work_trace.db    # SQLite 数据库文件（运行后自动生成）
```

---

## 开发状态

- [x] 项目骨架搭建
- [x] 接入 Account 用户系统（OAuth2 Bearer Token 认证中间件）
- [x] 数据模型设计（WorkItem / SubTask / WorkRecord，含 `user_id` 隔离）
- [x] CRUD API：工作项（含自动 WorkRecord 审计日志）
- [x] CRUD API：子任务
- [x] 工作记录自动记录逻辑（create / update / complete / uncomplete / delete）
- [x] 前端界面：OAuth2 登录流程（含 token 自动刷新）
- [x] 前端界面：主页（卡片网格、搜索、筛选、排序）
- [x] 前端界面：工作项详情页（内联编辑、全屏编辑器、子任务管理、工作记录懒加载）
- [ ] 提醒功能（数据库字段 `remind_at` 已就绪，前端通知尚未实现）
- [x] 搜索和筛选
- [x] 响应式设计（桌面端 + 移动端适配）
- [x] 单二进制编译部署（Go embed 嵌入前端资源）
