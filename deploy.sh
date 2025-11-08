#!/bin/bash

# MingNote 自动部署脚本
# 适用于 Oracle Cloud、VPS 等 Linux 服务器
# 支持：初始部署、更新、备份、恢复等功能

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_warning "建议不要使用 root 用户运行此脚本"
        read -p "是否继续？(y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 检查系统要求
check_requirements() {
    log_info "检查系统要求..."

    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        log_info "安装 Docker: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi

    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装"
        log_info "安装 Docker Compose:"
        log_info "sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose"
        log_info "sudo chmod +x /usr/local/bin/docker-compose"
        exit 1
    fi

    # 检查 Git
    if ! command -v git &> /dev/null; then
        log_warning "Git 未安装，某些功能可能无法使用"
    fi

    log_success "系统要求检查通过"
}

# 生成随机密钥
generate_secret() {
    openssl rand -base64 32 | tr -d '\n'
}

# 初始化环境变量文件
init_env() {
    log_info "初始化环境变量..."

    if [ -f .env ]; then
        log_warning ".env 文件已存在"
        read -p "是否覆盖？(y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "保持现有 .env 文件"
            return
        fi
    fi

    # 复制示例文件
    cp .env.example .env

    # 生成随机密钥
    AUTH_SECRET=$(generate_secret)
    JWT_SECRET=$(generate_secret)
    DB_PASSWORD=$(generate_secret | tr -d '/' | head -c 16)

    # 替换密钥
    sed -i "s/CHANGE_THIS_TO_RANDOM_STRING_32_CHARS/$AUTH_SECRET/" .env
    sed -i "s/CHANGE_THIS_TO_SECURE_PASSWORD/$DB_PASSWORD/" .env

    # JWT_SECRET 需要单独替换（第二个出现的位置）
    sed -i "0,/CHANGE_THIS_TO_RANDOM_STRING_32_CHARS/{s/CHANGE_THIS_TO_RANDOM_STRING_32_CHARS/$JWT_SECRET/}" .env

    log_success "环境变量已初始化"
    log_info "请编辑 .env 文件以配置管理员邮箱等信息："
    log_info "  nano .env"
}

# 初始化部署
init_deploy() {
    log_info "开始初始化部署..."

    check_requirements
    init_env

    log_info "拉取 Docker 镜像..."
    docker-compose -f docker-compose.prod.yml pull

    log_info "启动服务..."
    docker-compose -f docker-compose.prod.yml up -d

    log_info "等待服务启动..."
    sleep 10

    # 检查服务状态
    docker-compose -f docker-compose.prod.yml ps

    log_success "部署完成！"
    log_info "访问地址: http://$(curl -s ifconfig.me):${AFFINE_SERVER_PORT:-3000}"
    log_info "查看日志: ./deploy.sh logs"
}

# 启动服务
start_services() {
    log_info "启动服务..."
    docker-compose -f docker-compose.prod.yml up -d
    log_success "服务已启动"
}

# 停止服务
stop_services() {
    log_info "停止服务..."
    docker-compose -f docker-compose.prod.yml down
    log_success "服务已停止"
}

# 重启服务
restart_services() {
    log_info "重启服务..."
    docker-compose -f docker-compose.prod.yml restart
    log_success "服务已重启"
}

# 查看日志
view_logs() {
    docker-compose -f docker-compose.prod.yml logs -f "${@:2}"
}

# 查看状态
check_status() {
    log_info "服务状态:"
    docker-compose -f docker-compose.prod.yml ps

    echo ""
    log_info "资源使用情况:"
    docker stats --no-stream $(docker-compose -f docker-compose.prod.yml ps -q)
}

# 更新应用
update_app() {
    log_info "开始更新应用..."

    # 备份数据
    log_info "自动备份数据..."
    backup_data

    # 拉取最新代码（如果是 Git 仓库）
    if [ -d .git ]; then
        log_info "拉取最新代码..."
        git pull
    fi

    # 拉取最新镜像
    log_info "拉取最新镜像..."
    docker-compose -f docker-compose.prod.yml pull

    # 重启服务
    log_info "重启服务..."
    docker-compose -f docker-compose.prod.yml up -d

    log_success "更新完成"
}

# 备份数据
backup_data() {
    log_info "开始备份数据..."

    BACKUP_DIR="./backups"
    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP"

    # 备份数据库
    log_info "备份数据库..."
    docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U affine affine > "$BACKUP_FILE.sql"

    # 备份文件存储
    log_info "备份文件存储..."
    VOLUME_NAME=$(docker volume ls -q | grep storage)
    if [ -n "$VOLUME_NAME" ]; then
        docker run --rm -v "$VOLUME_NAME":/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf "/backup/storage_$TIMESTAMP.tar.gz" -C /data .
    fi

    # 备份环境变量
    cp .env "$BACKUP_FILE.env"

    log_success "备份完成: $BACKUP_FILE"

    # 清理旧备份（保留最近 7 天）
    find "$BACKUP_DIR" -name "backup_*" -mtime +7 -delete
}

# 恢复数据
restore_data() {
    log_warning "数据恢复将覆盖现有数据！"
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi

    BACKUP_DIR="./backups"

    # 列出可用备份
    log_info "可用备份:"
    ls -lh "$BACKUP_DIR"/backup_*.sql

    read -p "请输入备份文件名（不含.sql后缀）: " BACKUP_NAME

    if [ ! -f "$BACKUP_DIR/$BACKUP_NAME.sql" ]; then
        log_error "备份文件不存在"
        exit 1
    fi

    log_info "恢复数据库..."
    docker-compose -f docker-compose.prod.yml exec -T postgres psql -U affine affine < "$BACKUP_DIR/$BACKUP_NAME.sql"

    log_info "恢复文件存储..."
    if [ -f "$BACKUP_DIR/storage_$(echo $BACKUP_NAME | cut -d'_' -f2-).tar.gz" ]; then
        VOLUME_NAME=$(docker volume ls -q | grep storage)
        docker run --rm -v "$VOLUME_NAME":/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar xzf "/backup/storage_$(echo $BACKUP_NAME | cut -d'_' -f2-).tar.gz" -C /data
    fi

    log_success "数据恢复完成"
}

# 清理数据
cleanup() {
    log_warning "此操作将删除所有数据和容器！"
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi

    log_info "停止并删除容器..."
    docker-compose -f docker-compose.prod.yml down -v

    log_info "删除镜像..."
    docker-compose -f docker-compose.prod.yml down --rmi all

    log_success "清理完成"
}

# 显示帮助
show_help() {
    cat << EOF
MingNote 部署脚本

用法: ./deploy.sh [命令] [选项]

命令:
  init          初始化并部署应用
  start         启动服务
  stop          停止服务
  restart       重启服务
  status        查看服务状态
  logs          查看日志 (可选参数: backend/postgres/redis)
  update        更新应用
  backup        备份数据
  restore       恢复数据
  cleanup       清理所有数据（危险！）
  help          显示此帮助信息

示例:
  ./deploy.sh init              # 初始化部署
  ./deploy.sh logs backend      # 查看后端日志
  ./deploy.sh backup            # 备份数据
  ./deploy.sh update            # 更新应用

更多信息请参考: docs/DEPLOY_ORACLE_CLOUD.md
EOF
}

# 主函数
main() {
    case "${1:-help}" in
        init)
            check_root
            init_deploy
            ;;
        start)
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            restart_services
            ;;
        status)
            check_status
            ;;
        logs)
            view_logs "$@"
            ;;
        update)
            update_app
            ;;
        backup)
            backup_data
            ;;
        restore)
            restore_data
            ;;
        cleanup)
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"
