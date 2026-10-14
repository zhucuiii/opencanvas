#!/bin/sh
# 重建镜像并重启容器，让容器里的代码与当前源码一致。
# 用法：./deploy.sh   或   sh deploy.sh
set -e
cd "$(dirname "$0")"
docker compose up -d --build
echo
echo "已部署。访问 http://localhost:10086"
docker compose ps
