# =============================================
# Stage 1: Build & Install Dependencies
# =============================================
FROM node:20-bookworm-slim AS builder

# 使用淘宝 npm 镜像源
RUN npm config set registry https://registry.npmmirror.com

# 安装 better-sqlite3 编译所需工具（使用国内 apt 镜像源）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    apt-get update -qq && apt-get install -y -qq python3 make g++ gcc > /dev/null && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制依赖配置文件，利用 Docker 缓存
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci

# =============================================
# Stage 2: Production Image
# =============================================
FROM node:20-bookworm-slim

WORKDIR /app

# 使用淘宝 npm 镜像源（生产阶段保留）
RUN npm config set registry https://registry.npmmirror.com

# 仅复制运行时所需文件
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY .env.example .env
COPY server.js ./
COPY db/ ./db/
COPY routes/ ./routes/
COPY providers/ ./providers/
COPY middleware/ ./middleware/
COPY services/ ./services/
COPY public/ ./public/

# 创建数据目录
RUN mkdir -p /app/data

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:3000/api/usage > /dev/null || exit 1

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "server.js"]
