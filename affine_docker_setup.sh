#!/bin/bash

echo "=== 开始 AFFiNE 自托管部署脚本 ==="

# 确保已经运行 yarn install
if [ ! -d "node_modules" ]; then
    echo "请先运行 'yarn install' 安装依赖。"
    exit 1
fi

echo "--- 1. 构建 @affine/reader ---"
yarn affine build -p @affine/reader
if [ $? -ne 0 ]; then
    echo "构建 @affine/reader 失败。请检查错误信息。"
    exit 1
fi
echo "--- @affine/reader 构建完成 ---"

echo "--- 2. 构建 @affine/server-native ---"
yarn affine @affine/server-native build
if [ $? -ne 0 ]; then
    echo "构建 @affine/server-native 失败。请检查错误信息。"
    exit 1
fi
echo "--- @affine/server-native 构建完成 ---"

echo "--- 3. 构建 @affine/server ---"
yarn affine build -p @affine/server
if [ $? -ne 0 ]; then
    echo "构建 @affine/server 失败。请检查错误信息。"
    exit 1
fi
echo "--- @affine/server 构建完成 ---"

echo "--- 4. 使用 Docker Compose 启动 PostgreSQL 和 Redis 服务 ---"
echo "请确保已安装 Docker 和 Docker Compose。"
docker compose -f docker-compose.yml up -d postgres redis
if [ $? -ne 0 ]; then
    echo "启动 Docker Compose 服务 (postgres, redis) 失败。请检查 Docker 是否运行以及 compose 文件路径。"
    exit 1
fi
echo "--- PostgreSQL 和 Redis 服务已启动 ---"

echo "--- 5. 构建 affine_server 和 affine_front Docker 镜像 ---"
docker compose -f docker-compose.yml build affine_server affine_front
if [ $? -ne 0 ]; then
    echo "构建 affine_server 和 affine_front Docker 镜像失败。请检查 Dockerfile 或相关配置。"
    exit 1
fi
echo "--- affine_server 和 affine_front Docker 镜像构建完成 ---"

echo "--- 6. 启动 affine_server 和 affine_front 服务 ---"
docker compose -f docker-compose.yml up -d affine_server affine_front
if [ $? -ne 0 ]; then
    echo "启动 affine_server 和 affine_front 服务失败。请检查 Docker Compose 配置。"
    exit 1
fi
echo "--- affine_server 和 affine_front 服务已在后台启动 ---"

echo "=== AFFiNE 自托管部署脚本执行完成 ==="
echo "您现在可以通过浏览器访问 AFFiNE 应用。"