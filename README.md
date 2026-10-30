# QuotaDashboard

大模型配额监控中心 · AI API Key 用量监控与智能调度系统。

多平台主流 AI 大模型（Kimi、智谱 GLM、MiniMax、火山方舟、DeepSeek、硅基流动、阶跃星辰等）套餐额度与余额的实时监控、历史追踪与 Sub2API 智能调度联动平台。

## 项目结构

```
├── config.js          # 必需环境变量校验与安全配置
├── server.js          # Express 服务入口
├── db/
│   └── schema.js      # SQLite 数据库初始化与 schema
├── routes/
│   ├── api.js         # 公开查询 API 与短期能力令牌控制
│   └── admin.js       # 管理员 API（HttpOnly Cookie + CSRF）
├── providers/
│   ├── index.js        # Provider 路由分发
│   ├── kimi.js         # Kimi For Coding 用量查询
│   ├── zhipu.js        # Zhipu GLM 用量查询
│   ├── minimax.js      # MiniMax 用量查询
│   ├── volcengine.js   # 火山方舟 Agent/Coding Plan 用量查询
│   ├── zenmux.js       # ZenMux 用量查询
│   ├── deepseek.js     # DeepSeek 余额查询
│   ├── stepfun.js      # StepFun 余额查询
│   ├── siliconflow.js  # SiliconFlow 余额查询
│   ├── openrouter.js   # OpenRouter 余额查询
│   └── novita.js       # Novita AI 余额查询
├── middleware/
│   ├── auth.js        # 管理员会话鉴权
│   ├── csrf.js        # CSRF 校验
│   └── rateLimits.js  # 接口限流
├── services/
│   ├── crypto.js      # AES-256-GCM 敏感字段加密
│   ├── refresh.js     # 合并式刷新任务
│   ├── safeHttp.js    # SSRF/DNS 重绑定防护
│   └── ...            # 审计、会话、公开控制、调度等
├── test/              # 安全边界与集成测试
├── public/
│   ├── index.html     # 前端 HTML
│   ├── app.js         # Alpine 应用逻辑
│   ├── tailwind.css   # 预编译样式
│   ├── vendor/        # 自托管 Alpine.js
│   ├── favicon.svg    # 站点图标
│   └── icons/         # 供应商图标库
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 快速启动

```bash
cp .env.example .env
# 按 .env 注释生成并写入独立随机密钥，切勿使用示例值
npm install
npm run build:css

# 启动服务
node server.js
```

默认仅监听 `127.0.0.1:3000`。管理员密码来自 `.env` 的 `ADMIN_PASSWORD`，首次初始化或检测到旧默认密码时会写入数据库；之后可在页面修改。

运行环境要求 Node.js 24 LTS 或更高受支持版本。

数据库中的平台 API Key、AK/SK、Sub2API 管理 Key 与原始响应均使用 `DATA_ENCRYPTION_KEY` 进行 AES-256-GCM 加密。更换该密钥前必须先完成数据迁移，否则旧密文无法解密。

## 界面与交互特性

- **信号轨道布局 (Signal Rail)**：横向三段式高密度监控面板，将密钥身份、配额/余额指标及状态操作排布在同一视线基线，紧凑易扫，杜绝冗余留白。
- **账号风险总览**：顶部统一胶囊条实时统计“用量到期（5小时 / 7天 / 30天）”与“余额不足”账号数量，并汇总全站今日 Token 总消耗；风险卡片采用 Rose 左侧信号条、警示底色与标签突出展示。
- **全站用量排行**：顶部“用量排行”按钮公开展示当日全部有消耗记录的用户，包含用户名、请求数、输入/输出/缓存/总 Token，不展示费用；服务端提供 60 秒缓存与独立限流。
- **已用 / 剩余口径切换**：配额窗口支持在“已用百分比”和“剩余百分比”之间一键切换，偏好持久化到浏览器本地。
- **全栈多模式外观**：顶部导航下拉支持 `自适应（跟随系统） / 浅色模式 / 深色模式`，管理员可在后台设置默认主题，用户个性化偏好持久化保存在浏览器本地。
- **统一胶囊导航 (Pill Capsule)**：顶部导航栏所有按钮统一采用 34px 圆角药丸胶囊设计，排序、主题模式下拉、倒计时和操作按钮整齐对齐。
- **供应商聚合排序**：默认视图按供应商首次出现顺序分组，同供应商卡片连续排列；组内沿用 `sort_order`，再按 ID 保持稳定顺序。
- **透明显示/隐藏权限**：密钥状态明确为“公开显示”（所有访客可见）与“后台隐藏”（仅登录后的管理员可见），卡片直观显示隐藏警示徽章。
- **克制的自定义业务提示**：Sub2API 状态、完整错误原因、调度语义、可见性与额度重置时间使用统一定制悬浮层；关闭、编辑、删除等直观操作不额外打扰。
- **Sub2API 深度联动**：
  - **双向调度开关**：卡片仅显示「调度」字样，通过胶囊颜色与开关状态区分开启/关闭，可直接暂停或恢复 Sub2API 调度；
  - **异常/限流一键恢复**：仅恢复临时不可调度、限流、过载和临时错误；管理员手动停用或硬锁账号必须由管理员处理。
  - **今日 Token 统计**：通过 Sub2API 批量账号今日统计接口同步当日 Token 与请求数，以 `M` 为单位展示，并可在可见字段中关闭公开显示。
  - **公开控制安全层**：短期 HMAC 能力令牌、同源 CSRF 校验、账号级冷却、IP 限流、状态版本校验和审计日志。
- **无障碍沉浸弹窗**：弹窗去除原生灰色粗滚动条，采用固定头部标题（带关闭 ×）与固定操作底栏设计，内容过长时“关闭”与“保存配置”按钮始终停留在视窗内，无需滚动查找。
- **精致中文化与防折行排版**：全站指标、重置倒计时、相对时间、状态及币种全面中文化，账户余额使用不换行排版 (`-0.50 元`)，刷新时居中精致卡片不大幅抖动下推页面。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| NODE_ENV | development | `production` 时启用安全 Cookie 与 HSTS |
| HOST | 127.0.0.1 | 监听地址；容器内使用 `0.0.0.0` |
| PORT | 3000 | 服务端口 |
| DB_PATH | ./db/usage.db | SQLite 数据库路径 |
| JWT_SECRET | 无 | 必填，管理员 JWT 签名密钥，至少 32 字符 |
| CONTROL_TOKEN_SECRET | 无 | 必填，公开控制能力令牌签名密钥 |
| AUDIT_HASH_SECRET | 无 | 必填，审计日志 IP 哈希密钥 |
| DATA_ENCRYPTION_KEY | 无 | 必填，32 字节随机密钥的 Base64 编码 |
| ADMIN_USERNAME | 无 | 必填，管理员用户名 |
| ADMIN_PASSWORD | 无 | 必填，初始/默认密码修复用，至少 12 字符 |
| COOKIE_SECURE | 跟随 NODE_ENV | 通过 HTTPS 访问时设为 true |
| TRUST_PROXY | 0 | 反向代理层数或受信网段 |
| OUTBOUND_ALLOW_PRIVATE | false | 是否允许访问私网目标 |
| OUTBOUND_ALLOW_HTTP | false | 是否允许明文 HTTP 目标 |
| SNAPSHOT_RETENTION_DAYS | 30 | 用量快照保留天数 |
| REFRESH_CONCURRENCY | 4 | 外部用量查询的最大并发数（1–16） |
| PUBLIC_ACTION_TOKEN_TTL_SECONDS | 900 | 公开控制令牌有效期 |

## Sub2API 公开控制配置

后台设置中分别配置两类凭据：

- **管理员 API Key**：用于同步账号、分组及后台导入，不会返回浏览器；没有独立控制 Key 时，也可作为公开控制的兼容凭据。
- **独立公开控制 Key（可选）**：只用于访客的调度启停和临时状态恢复。它不是普通用户调用模型时使用的网关 API Key。

如果同时配置两项 Key，两者必须不同。

### 优先：受限管理员 Key

Sub2API `v0.2.19` 及以上版本已正式支持受限管理员密钥。在「系统设置 → 安全」中的「管理员访问密钥」创建，按钮名称为「创建受限密钥」，完整值以 `adm_sc_` 开头：

- 只授予 `accounts.read`、`accounts.status`、`accounts.recover`，不要授予全站权限。
- 资源规则的分组、账户类型、平台和未分组账户范围必须覆盖需要公开控制的账号；共享账号只要命中一个授权分组，就会影响所有关联分组。
- 如设置了来源 IP/CIDR，必须包含 QuotaDashboard 服务访问 Sub2API 时使用的出口 IP。
- 完整 Key 只在创建或轮换时显示一次，关闭后无法从 Sub2API 列表重新读取。

### 兼容：复用管理员 Key

如果 Sub2API 版本没有受限管理员密钥功能，可把「独立公开控制 Key」留空。QuotaDashboard 会在服务端复用管理员 Key，但只调用固定白名单接口：

- 读取指定账号状态。
- 修改指定账号的调度开关。
- 恢复指定账号的可恢复运行状态。

浏览器不会获得管理员 Key，也不能指定任意 Sub2API 管理接口。设置页会明确提示当前处于管理员 Key 兼容模式。

普通用户 API Key 只能用于模型网关调用，不能读取后台账号或修改调度状态。

管理员 Key 和独立控制 Key 均未配置时，公开卡片不会显示调度和恢复按钮。每个 Key 还可以单独设置“允许公开调度”“允许公开恢复”和“管理员硬锁”。

受限 Key 模式只调用 `clear-error`；管理员 Key 兼容模式优先调用 Sub2API 的统一恢复接口，并以 `clear-error` 等兼容接口回退。两种模式都不会强制激活管理员手动停用的账号或覆盖硬锁状态。控制操作受短期能力令牌、状态版本、CSRF、账号冷却、IP 限流和审计日志约束。

## 安全与运行特性

- 管理员会话使用 HttpOnly、SameSite=Strict Cookie；写操作要求双提交 CSRF Token。
- 登录、公开操作、刷新和管理写接口分别限流；登录密码哈希使用异步 bcrypt cost 12。
- 所有外部请求强制执行 HTTPS、DNS 解析校验、私网地址拦截、禁重定向和响应体大小限制。
- 用量刷新仅由服务端定时任务或管理员手动触发，访客只读取缓存快照，避免刷新放大。
- 敏感字段使用 AES-256-GCM 加密，数据库迁移后执行 WAL 截断与 VACUUM。
- 快照默认保留 30 天，审计日志保留 365 天，并按 Key/时间建立索引。

## Docker 部署

```bash
# 先在 shell 或 .env 中提供全部必填密钥
docker compose up -d
```

Compose 仅把端口绑定到 `127.0.0.1`，使用命名卷 `quota-data` 持久化数据库，并以非 root、只读根文件系统、无 Linux capabilities 运行。对外提供服务时应再前置 HTTPS 反向代理。

若直接通过 `http://127.0.0.1:3000` 调试 Compose，需显式设置 `COOKIE_SECURE=false`；通过 HTTPS 反向代理部署时保持 `COOKIE_SECURE=true`，并按代理层数设置 `TRUST_PROXY=1`。

## 支持的供应商

### 套餐限额型 (Coding Plan)

| 供应商 | 鉴权方式 | 监控维度 | 说明 |
|--------|------------|---------|------|
| Kimi For Coding | Bearer API Key | 5小时 / 7天 | 支持滚动重置倒计时与使用率 |
| Zhipu GLM (智谱) | API Key（无 Bearer 前缀） | 5小时 / 7天 | 支持个人版与组织项目套餐 |
| Zhipu GLM Team (智谱团队) | API Key + 组织与项目 Headers | 5小时 / 7天 | 团队集中额度监控 |
| MiniMax | Bearer API Key | 5小时 / 7天 | Coding 专用套餐接口 |
| 火山方舟 (Volcengine) | AK/SK 签名 V4 鉴权 | 5小时 / 7天 / 月度 | Agent 与 Plan 用量查询 |
| ZenMux | Bearer API Key + 自定义 base_url | 5小时 / 7天 | 灵活中继平台额度 |

### 余额计量型 (Balance)

| 供应商 | 鉴权方式 | 计量货币 | 说明 |
|--------|------------|---------|------|
| DeepSeek | Bearer API Key | 人民币（元） | 实时剩余与总余额 |
| StepFun (阶跃星辰) | Bearer API Key | 人民币（元） | 账户实时余额与消耗 |
| SiliconFlow (硅基流动) | Bearer API Key | 人民币（元）/ 美元 | 支持多币种钱包查询 |
| OpenRouter | Bearer API Key | 美元 | 全球多模型中转余额 |
| Novita AI | Bearer API Key | 美元 | 剩余可用额度 |
