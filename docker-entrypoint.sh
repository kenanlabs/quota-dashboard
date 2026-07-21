#!/bin/sh
# 确保数据目录可写
if [ ! -w "/app/data" ]; then
  echo "Fixing /app/data permissions..."
  chown -R node:node /app/data
fi

exec "$@"