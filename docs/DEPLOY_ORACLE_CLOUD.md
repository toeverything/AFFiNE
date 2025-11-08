# MingNote 部署到 Oracle Cloud 永久免费指南

## 📋 目录
- [准备工作](#准备工作)
- [注册 Oracle Cloud](#注册-oracle-cloud)
- [创建免费服务器](#创建免费服务器)
- [配置服务器环境](#配置服务器环境)
- [部署 MingNote](#部署-mingnote)
- [域名配置（可选）](#域名配置可选)
- [常见问题](#常见问题)

---

## 准备工作

### 你需要准备：
- ✅ 一个邮箱账号
- ✅ 一张信用卡或借记卡（仅用于验证，不会扣费）
- ✅ 30-60 分钟的时间

### Oracle Cloud 永久免费资源：
- 🖥️ **2 台 AMD VM**（每台 1/8 OCPU + 1GB RAM）
- 🖥️ **或 4 台 ARM VM**（Ampere A1，总共 4 OCPU + 24GB RAM）推荐！
- 💾 **200GB 块存储**
- 🌐 **10TB/月 出站流量**
- 📦 **20GB 对象存储**
- ⚡ **永久免费**（不是试用期）

---

## 注册 Oracle Cloud

### 步骤 1：访问 Oracle Cloud
1. 打开浏览器，访问：https://www.oracle.com/cloud/free/
2. 点击 "Start for free" 或 "免费开始"

### 步骤 2：填写注册信息
1. **选择区域**：
   - 推荐选择：**Japan Central (Osaka)** 或 **South Korea Central (Seoul)**
   - 这些区域离中国近，速度更快
   - ⚠️ **注意**：注册后无法更改区域，请慎重选择！

2. **填写账号信息**：
   - 邮箱地址
   - 国家/地区：选择你的所在地
   - 姓名（建议使用拼音）

3. **验证邮箱**：
   - 检查邮箱，输入验证码

### 步骤 3：账号验证
1. **手机验证**：
   - 输入你的手机号码
   - 接收并输入验证码

2. **信用卡验证**：
   - 输入信用卡信息（仅验证身份，会预授权 $1-2 后退回）
   - 支持 Visa、Mastercard、银联等
   - ⚠️ 确保卡片信息真实有效

3. **完成注册**：
   - 等待账号激活（通常 5-10 分钟）
   - 收到欢迎邮件后登录

---

## 创建免费服务器

### 步骤 1：登录 Oracle Cloud Console
1. 访问：https://cloud.oracle.com/
2. 输入你的云账户名（Cloud Account Name）
3. 输入用户名和密码登录

### 步骤 2：创建虚拟机（推荐 ARM 架构）

1. **进入 Compute Instances 页面**：
   - 左上角菜单 ≡ → Compute → Instances
   - 点击 "Create Instance"

2. **配置实例**：

   **基本信息**：
   - Name: `mingnote-server` （或任意名称）
   - Compartment: 保持默认

   **Image and Shape**：
   - 点击 "Edit" 编辑
   - **Image**: 选择 `Canonical Ubuntu 22.04`
   - **Shape**:
     - 点击 "Change Shape"
     - 选择 "Ampere" (ARM)
     - 选择 `VM.Standard.A1.Flex`
     - **OCPU**: 4（最大值）
     - **Memory**: 24 GB（最大值）
     - ✅ 这是永久免费的最强配置！

   **Networking**：
   - 保持默认设置（会自动创建 VCN）
   - ✅ 确保 "Assign a public IPv4 address" 已勾选

   **Add SSH Keys**：
   - 选择 "Generate a key pair for me"
   - 点击 "Save Private Key" 下载私钥（重要！保存好）
   - 点击 "Save Public Key" 下载公钥

   **Boot Volume**：
   - Size: 最少 50GB（建议 100GB+）
   - 永久免费最多 200GB

3. **创建实例**：
   - 点击底部 "Create" 按钮
   - 等待状态变为 "RUNNING"（绿色）
   - 记下你的 **Public IP Address**

   ⚠️ **如果创建失败提示 "Out of capacity"**：
   - ARM 实例很抢手，可能需要多试几次
   - 可以尝试在凌晨或其他时间段创建
   - 或者选择其他区域（Region）

### 步骤 3：配置网络安全规则

1. **打开必要端口**：
   - 在 Instance Details 页面，找到 "Virtual Cloud Network"
   - 点击你的 VCN 名称
   - 左侧点击 "Security Lists"
   - 点击 "Default Security List"

2. **添加入站规则**：
   点击 "Add Ingress Rules"，添加以下规则：

   **规则 1 - HTTP**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: `TCP`
   - Destination Port Range: `80`
   - Description: `HTTP`

   **规则 2 - HTTPS**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: `TCP`
   - Destination Port Range: `443`
   - Description: `HTTPS`

   **规则 3 - 自定义应用端口**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: `TCP`
   - Destination Port Range: `3000`
   - Description: `AFFiNE Backend`

---

## 配置服务器环境

### 步骤 1：连接到服务器

**Windows 用户**：
```bash
# 使用 PowerShell 或 Windows Terminal
ssh -i "path\to\your\private-key.key" ubuntu@YOUR_SERVER_IP
```

**Mac/Linux 用户**：
```bash
# 设置私钥权限
chmod 400 ~/Downloads/your-private-key.key

# SSH 连接
ssh -i ~/Downloads/your-private-key.key ubuntu@YOUR_SERVER_IP
```

替换 `YOUR_SERVER_IP` 为你的服务器公网 IP

### 步骤 2：更新系统并安装必要软件

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要工具
sudo apt install -y curl git wget vim ufw

# 配置防火墙
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Backend API
sudo ufw --force enable

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 添加当前用户到 docker 组
sudo usermod -aG docker ubuntu

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 退出并重新登录使权限生效
exit
```

重新连接：
```bash
ssh -i ~/Downloads/your-private-key.key ubuntu@YOUR_SERVER_IP
```

### 步骤 3：验证安装

```bash
# 验证 Docker
docker --version
docker-compose --version

# 测试 Docker
docker run hello-world
```

---

## 部署 MingNote

### 步骤 1：克隆项目

```bash
# 创建项目目录
mkdir -p ~/apps
cd ~/apps

# 克隆项目（替换为你的仓库地址）
git clone https://github.com/YOUR_USERNAME/MingNote.git
cd MingNote
```

### 步骤 2：配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
nano .env
```

修改以下配置：
```bash
# 应用配置
NODE_ENV=production
AFFINE_SERVER_HOST=0.0.0.0
AFFINE_SERVER_PORT=3000

# 数据库配置
DATABASE_URL=postgresql://affine:YOUR_SECURE_PASSWORD@postgres:5432/affine
POSTGRES_USER=affine
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
POSTGRES_DB=affine

# Redis 配置
REDIS_SERVER_HOST=redis
REDIS_SERVER_PORT=6379

# 安全配置（生成随机密钥）
AUTH_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)

# 文件存储（使用本地存储）
AFFINE_STORAGE_PROVIDER=local
AFFINE_LOCAL_STORAGE_PATH=/app/storage

# 搜索配置
AFFINE_INDEXER_SEARCH_ENDPOINT=http://indexer:9308
```

⚠️ **重要**：
- 替换 `YOUR_SECURE_PASSWORD` 为强密码
- 保存好你的环境变量文件

### 步骤 3：启动服务

```bash
# 使用 Docker Compose 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 步骤 4：等待服务启动

```bash
# 查看后端日志，等待数据库迁移完成
docker-compose logs -f backend

# 当看到类似 "Server is running on http://0.0.0.0:3000" 的消息时，说明启动成功
```

### 步骤 5：访问应用

打开浏览器，访问：
```
http://YOUR_SERVER_IP:3000
```

🎉 如果能看到 MingNote/AFFiNE 的登录页面，说明部署成功！

---

## 域名配置（可选）

### 免费域名选项：

1. **Freenom**（.tk, .ml, .ga 等）- 免费但不太稳定
2. **eu.org** - 免费二级域名，较稳定
3. **afraid.org** - 免费 DNS 服务
4. **Cloudflare** - 购买域名后免费 CDN 和 SSL

### 配置步骤：

1. **在域名 DNS 设置中添加 A 记录**：
   - Type: `A`
   - Name: `@` 或 `mingnote`
   - Value: `YOUR_SERVER_IP`
   - TTL: `Auto` 或 `3600`

2. **配置 Nginx 反向代理**（可选，用于 HTTPS）：

```bash
# 安装 Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

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
```

3. **配置 SSL（HTTPS）**：
```bash
sudo certbot --nginx -d your-domain.com
```

按提示操作，完成后即可通过 HTTPS 访问。

---

## 常见问题

### Q1: 创建 ARM 实例时提示 "Out of capacity"
**A**: ARM 实例很抢手，建议：
- 尝试不同时间段（如凌晨）
- 多尝试几次
- 或选择 AMD 实例（性能较低但也够用）

### Q2: 无法访问服务器
**A**: 检查：
1. Oracle Cloud 安全列表是否已添加入站规则
2. 服务器防火墙是否开放端口：`sudo ufw status`
3. Docker 服务是否正常运行：`docker-compose ps`

### Q3: 服务启动失败
**A**: 查看日志排查：
```bash
docker-compose logs backend
docker-compose logs postgres
```

### Q4: 数据库连接失败
**A**: 确认：
1. `.env` 文件中的数据库密码与 `docker-compose.yml` 一致
2. PostgreSQL 容器已启动：`docker-compose ps postgres`

### Q5: 内存不足
**A**:
- ARM 实例有 24GB 内存，应该足够
- 如果还不够，可以配置 swap：
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Q6: 如何备份数据
**A**:
```bash
# 备份数据库
docker-compose exec postgres pg_dump -U affine affine > backup_$(date +%Y%m%d).sql

# 备份文件存储
tar -czf storage_backup_$(date +%Y%m%d).tar.gz ./storage
```

### Q7: 如何更新应用
**A**:
```bash
cd ~/apps/MingNote
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

---

## 🎉 完成！

现在你拥有了：
- ✅ 一个完全免费的云服务器
- ✅ 可以在线使用的 MingNote/AFFiNE
- ✅ 数据永久保存不会丢失
- ✅ 全球任何地方都可以访问

### 下一步：
- 🔒 配置域名和 HTTPS（推荐）
- 👥 邀请团队成员使用
- 📱 在手机浏览器中访问
- 💾 设置定期备份计划

---

## 📚 有用的资源

- Oracle Cloud 文档: https://docs.oracle.com/en-us/iaas/
- AFFiNE 官方文档: https://docs.affine.pro/
- Docker 文档: https://docs.docker.com/
- Nginx 文档: https://nginx.org/en/docs/

---

## 🆘 需要帮助？

如果遇到问题：
1. 查看项目的 GitHub Issues
2. 查看 Docker 日志：`docker-compose logs -f`
3. 检查服务器资源：`htop` 或 `docker stats`

祝你部署顺利！🚀
