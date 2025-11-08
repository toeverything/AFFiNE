# MingNote 快速开始指南

## 🚀 5 分钟快速部署到 Oracle Cloud

### 前提条件
- ✅ 已注册 Oracle Cloud 账号
- ✅ 已创建并启动虚拟机实例
- ✅ 已配置网络安全规则（开放 80、443、3000 端口）
- ✅ 已通过 SSH 连接到服务器

---

## 步骤 1：准备服务器环境

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 安装其他工具
sudo apt install -y git vim ufw

# 配置防火墙
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw --force enable

# 退出并重新登录
exit
```

---

## 步骤 2：克隆项目

```bash
# 重新 SSH 连接到服务器
ssh -i your-key.key ubuntu@YOUR_SERVER_IP

# 克隆项目
cd ~
git clone https://github.com/YOUR_USERNAME/MingNote.git
cd MingNote

# 给部署脚本添加执行权限
chmod +x deploy.sh
```

---

## 步骤 3：一键部署

```bash
# 运行部署脚本
./deploy.sh init
```

这个命令会：
1. 自动生成 `.env` 配置文件（包含随机密钥）
2. 拉取所有需要的 Docker 镜像
3. 启动所有服务（数据库、Redis、后端等）
4. 显示访问地址

---

## 步骤 4：配置管理员账号

```bash
# 编辑环境变量
nano .env
```

找到并修改以下内容：
```bash
# 设置管理员邮箱和密码
AFFINE_ADMIN_EMAIL=your-email@example.com
AFFINE_ADMIN_PASSWORD=your-secure-password
```

保存退出（Ctrl+X，然后 Y，然后 Enter）

```bash
# 重启服务使配置生效
./deploy.sh restart
```

---

## 步骤 5：访问应用

在浏览器中访问：
```
http://YOUR_SERVER_IP:3000
```

使用刚才配置的管理员邮箱和密码登录。

🎉 恭喜！你的 MingNote 已经成功部署！

---

## 常用命令

```bash
# 查看服务状态
./deploy.sh status

# 查看日志
./deploy.sh logs

# 查看特定服务日志
./deploy.sh logs backend
./deploy.sh logs postgres

# 重启服务
./deploy.sh restart

# 停止服务
./deploy.sh stop

# 启动服务
./deploy.sh start

# 备份数据
./deploy.sh backup

# 更新应用
./deploy.sh update
```

---

## 下一步：配置域名和 HTTPS（可选）

### 方式 1：使用 Cloudflare（推荐，免费）

1. **注册域名**（或使用现有域名）
2. **添加到 Cloudflare**：
   - 访问 https://dash.cloudflare.com/
   - 添加站点
   - 修改域名 DNS 为 Cloudflare 的 NS 服务器

3. **配置 DNS 记录**：
   - 类型：A
   - 名称：@（或子域名，如 notes）
   - 内容：你的服务器 IP
   - 代理状态：已代理（橙色云朵）

4. **配置 SSL**：
   - SSL/TLS → 概述 → 加密模式：选择 "灵活"

5. **访问你的域名**：
   ```
   https://your-domain.com
   ```

### 方式 2：使用 Let's Encrypt（免费 SSL）

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx nginx

# 创建 Nginx 配置
sudo nano /etc/nginx/sites-available/mingnote
```

添加配置：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/mingnote /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 申请 SSL 证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 故障排查

### 问题 1：无法访问服务器
**检查清单**：
- ✅ Oracle Cloud 安全列表是否开放端口？
- ✅ 服务器防火墙是否开放端口：`sudo ufw status`
- ✅ 服务是否运行：`./deploy.sh status`

### 问题 2：服务启动失败
```bash
# 查看详细日志
./deploy.sh logs backend

# 检查容器状态
docker ps -a

# 重新启动
./deploy.sh restart
```

### 问题 3：数据库连接失败
```bash
# 检查数据库容器
docker ps | grep postgres

# 查看数据库日志
./deploy.sh logs postgres

# 检查环境变量
cat .env | grep DATABASE
```

### 问题 4：内存不足
```bash
# 添加 Swap（交换空间）
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 验证
free -h
```

---

## 性能优化建议

### 1. 定期备份
```bash
# 添加到 crontab
crontab -e

# 添加每天凌晨 2 点自动备份
0 2 * * * cd /home/ubuntu/MingNote && ./deploy.sh backup
```

### 2. 日志清理
```bash
# 添加到 crontab
# 每周清理一次 Docker 日志
0 3 * * 0 truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

### 3. 监控资源使用
```bash
# 安装 htop
sudo apt install -y htop

# 实时监控
htop

# Docker 资源监控
docker stats
```

---

## 更多资源

- 📖 完整部署文档：[docs/DEPLOY_ORACLE_CLOUD.md](docs/DEPLOY_ORACLE_CLOUD.md)
- 🐛 问题反馈：GitHub Issues
- 💬 社区讨论：GitHub Discussions
- 📚 AFFiNE 官方文档：https://docs.affine.pro/

---

## 获取帮助

如果遇到问题：
1. 查看日志：`./deploy.sh logs`
2. 检查文档：`docs/DEPLOY_ORACLE_CLOUD.md`
3. 搜索 GitHub Issues
4. 提交新 Issue

祝你使用愉快！🎉
