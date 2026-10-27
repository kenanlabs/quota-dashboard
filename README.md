# QuotaDashboard

大模型配额监控中心 · AI API Key 用量监控与智能调度系统。

多平台主流 AI 大模型（Kimi、智谱 GLM、MiniMax、火山方舟、DeepSeek、硅基流动、阶跃星辰等）套餐额度与余额的实时监控、历史追踪与 Sub2API 智能调度联动平台。

## 项目结构

```
├── server.js          # Express 服务入口
├── db/
│   └── schema.js      # SQLite 数据库初始化与 schema
├── routes/
│   ├── api.js         # 公开 API（/api/settings, /api/usage, /api/icons）
│   └── admin.js       # 管理员 API（JWT 保护）
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
│   └── auth.js        # JWT 鉴权中间件
├── public/
│   ├── index.html     # 前端页面（Alpine.js + Tailwind CSS）
│   ├── favicon.svg    # 站点图标
│   └── icons/         # 供应商图标库
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 快速启动

```bash
# 安装依赖
npm install

# 启动服务
node server.js
```

默认监听 `http://localhost:3000`，管理员账号 `admin / admin`。

## 界面与交互特性

- **信号轨道布局 (Signal Rail)**：横向三段式高密度监控面板，将密钥身份、配额/余额指标及状态操作排布在同一视线基线，紧凑易扫，杜绝冗余留白。
- **全栈多模式外观**：顶部导航下拉支持 `自适应（跟随系统） / 浅色模式 / 深色模式`，管理员可在后台设置默认主题，用户个性化偏好持久化保存在浏览器本地。
- **统一胶囊导航 (Pill Capsule)**：顶部导航栏所有按钮统一采用 34px 圆角药丸胶囊设计，排序、主题模式下拉、倒计时和操作按钮整齐对齐。
- **透明显示/隐藏权限**：密钥状态明确为“公开显示”（所有访客可见）与“后台隐藏”（仅登录后的管理员可见），卡片直观显示隐藏警示徽章。
- **Sub2API 深度联动**：
  - **双向调度开关**：卡片上提供交互式调度胶囊徽章，随时查看并在面板直接开启或暂停 Sub2API 调度；
  - **异常/限流一键恢复**：当账号触发限流、告警或调用异常时，卡片主动提供「解除限流/恢复」按钮，快速重置健康状态。
- **无障碍沉浸弹窗**：弹窗去除原生灰色粗滚动条，采用固定头部标题（带关闭 ×）与固定操作底栏设计，内容过长时“关闭”与“保存配置”按钮始终停留在视窗内，无需滚动查找。
- **精致中文化与防折行排版**：全站指标、重置倒计时、相对时间及状态全面中文化，账户余额使用不换行排版 (`-0.50 CNY`)，刷新时居中精致卡片不大幅抖动下推页面。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务端口 |
| DB_PATH | ./db/usage.db | SQLite 数据库路径 |
| JWT_SECRET | super_secret_dev_key_change_me | JWT 签名密钥 |
| ADMIN_USERNAME | admin | 管理员用户名 |
| ADMIN_PASSWORD | admin | 管理员密码 |

## Docker 部署

```bash
docker compose up -d
```

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
| DeepSeek | Bearer API Key | CNY | 实时剩余与总余额 |
| StepFun (阶跃星辰) | Bearer API Key | CNY | 账户实时余额与消耗 |
| SiliconFlow (硅基流动) | Bearer API Key | CNY / USD | 支持多币种钱包查询 |
| OpenRouter | Bearer API Key | USD | 全球多模型中转余额 |
| Novita AI | Bearer API Key | USD | 剩余可用额度 |
