# QuotaDashboard

AI 模型 API Key 用量与配额监控平台。

## 关键约定

- 前端使用 **Alpine.js** + **Tailwind CSS**（CDN 加载）
- 供应商命名参考 CC Switch：Kimi For Coding、Zhipu GLM (智谱)、MiniMax、火山方舟 (Volcengine)
- 供应商用量查询参考 `cc-switch/src-tauri/src/services/coding_plan.rs` 的实现逻辑
- 数据库使用 SQLite（better-sqlite3），数据存储于 `db/usage.db`
- 环境变量配置在 `.env` 文件中，参考 `.env.example`

## 构建与运行

```bash
npm install
node server.js
docker compose up -d    # Docker 部署
```

## 项目结构

- `server.js` - Express 服务入口
- `routes/api.js` - 公开 API 路由
- `routes/admin.js` - 管理员 API 路由（JWT 保护）
- `providers/` - 各供应商用量查询适配器
- `public/index.html` - 前端页面（Alpine.js 单页应用）
- `db/schema.js` - SQLite 数据库初始化