# QuotaDashboard

AI 模型 API Key 用量与配额监控平台。

## 项目结构

```
├── server.js          # Express 服务入口
├── db/
│   └── schema.js      # SQLite 数据库初始化与 schema
├── routes/
│   ├── api.js         # 公开 API（/api/settings, /api/usage, /api/icons）
│   └── admin.js       # 管理员 API（JWT 保护）
├── providers/
│   ├── index.js       # Provider 路由分发
│   ├── kimi.js        # Kimi For Coding 用量查询
│   ├── zhipu.js       # Zhipu GLM 用量查询
│   ├── minimax.js     # MiniMax 用量查询
│   └── volcengine.js  # 火山方舟 Agent/Coding Plan 用量查询
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

| 供应商 | 用量查询方式 | 额度维度 |
|--------|------------|---------|
| Kimi For Coding | Bearer API Key | 5h / 周 |
| Zhipu GLM (智谱) | API Key（无 Bearer 前缀） | 5h / 周 |
| MiniMax | Bearer API Key | 5h / 周 |
| 火山方舟 (Volcengine) | AK/SK 签名 V4 | 5h / 周 / 月 |