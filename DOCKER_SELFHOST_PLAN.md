# AFFiNE 项目自托管 Docker 部署计划

本计划旨在指导您如何为 AFFiNE 项目构建 Docker 镜像，并以自托管模式运行。

## 前提条件

1.  您已成功运行 `yarn affine @affine/native build` 和 `yarn affine @affine/server-native build`，确保了原生模块的构建。
2.  您的 Node.js 版本已切换到 22.x。
3.  您已安装 Docker 和 Docker Compose。

## 步骤 1: 构建前端和后端资产

在构建 Docker 镜像之前，您需要确保所有前端（Web、Admin、Mobile）和后端（Server）的静态资源和代码都已编译完成。由于项目是 monorepo 结构，我们需要分别构建这些子包。

请**依次**执行以下命令：

```bash
yarn affine build -p @affine/server
yarn affine build -p @affine/web
yarn affine build -p @affine/admin
yarn affine build -p @affine/mobile
```

这些命令将生成 `packages/backend/server/dist`、`packages/frontend/apps/web/dist`、`packages/frontend/admin/dist` 和 `packages/frontend/apps/mobile/dist` 等目录中的文件，这些是 Docker 镜像所需的核心内容。

## 步骤 2: （可选）本地构建 Docker 镜像

AFFiNE 官方提供了预构建的 Docker 镜像。如果您需要进行自定义或不依赖于 Docker Hub，可以按照以下步骤在本地构建 Docker 镜像。

**构建 `affine-graphql` 镜像 (后端服务器):**

```bash
docker build -f .github/deployment/node/Dockerfile -t affine-graphql:local .
```

- `-f .github/deployment/node/Dockerfile`: 指定用于构建后端服务的 Dockerfile。
- `-t affine-graphql:local`: 为镜像打上标签，`local` 表示这是您本地构建的版本。
- `.`: Docker 构建上下文为当前目录。

**构建 `affine-front` 镜像 (前端 Web 服务器):**

```bash
docker build -f .github/deployment/front/Dockerfile -t affine-front:local .
```

- `-f .github/deployment/front/Dockerfile`: 指定用于构建前端服务的 Dockerfile。
- `-t affine-front:local`: 为镜像打上标签。

**注意:** 如果您不进行本地构建，Docker Compose 文件会默认从 `ghcr.io/toeverything/affine-graphql` 和 `openresty/openresty` 拉取镜像。

## 步骤 3: 准备自托管环境

AFFiNE 提供了 Docker Compose 文件来简化自托管部署。

1.  **复制 Docker Compose 文件：**

    将自托管的 Docker Compose 示例文件复制到项目根目录（或者您喜欢的位置，例如 `docker-compose.yml`）：

    ```bash
    cp .docker/selfhost/compose.yml docker-compose.yml
    ```

2.  **创建 `.env` 配置文件：**

    `.docker/selfhost/compose.yml` 文件引用了一个 `.env` 文件来配置数据库凭据、存储位置等。请在与 `docker-compose.yml` **相同的目录**下创建一个 `.env` 文件，并填写必要的信息。

    您可以参考 `.docker/dev/compose.yml.example` 或直接根据 `docker-compose.yml` 中的环境变量需求进行设置。至少需要设置以下变量：

    ```env
    # 数据库配置
    DB_USERNAME=your_db_user
    DB_PASSWORD=your_db_password
    DB_DATABASE=affine # 数据库名称，默认为 affine
    DB_DATA_LOCATION=./data/postgres # PostgreSQL 数据存储路径，请确保该目录存在且可写

    # 文件上传存储位置
    UPLOAD_LOCATION=./data/storage # 用户上传文件存储路径，请确保该目录存在且可写

    # 服务器端口
    PORT=3010 # AFFiNE 服务器监听端口
    ```

    **重要提示：**

    - `DB_DATA_LOCATION` 和 `UPLOAD_LOCATION` 指定的本地目录需要有足够的权限，并且会在 Docker 容器外部持久化数据。请提前创建这些目录，例如：`mkdir -p data/postgres data/storage`。
    - 在生产环境中，请务必设置强密码。
    - `AFFINE_REVISION` 变量在 `docker-compose.yml` 中默认是 `stable`，如果您在步骤 2 中构建了本地镜像，并且希望使用本地镜像，可以将 `affine` 和 `affine_migration` 服务的 `image` 行修改为 `image: affine-graphql:local`。

## 步骤 4: 启动 AFFiNE 自托管服务

在 `.env` 文件配置完成后，您可以启动所有服务：

```bash
docker compose up -d
```

- `up`: 启动 Compose 文件中定义的所有服务。
- `-d`: 在后台运行容器。

这将启动 PostgreSQL 数据库、Redis 缓存服务以及 AFFiNE 的后端（包括迁移服务）。

## 步骤 5: 访问 AFFiNE

服务启动后，AFFiNE 后端应该在您 `.env` 文件中配置的 `PORT` (默认为 3010) 上监听。

您可以通过访问 `http://localhost:3010` (如果端口是 3010) 来访问 AFFiNE。

如果您需要一个单独的 Web 前端（例如通过 Nginx 托管），您还需要构建并运行 `affine-front` 镜像，并配置 Nginx 以反向代理到您的 `affine-graphql` 实例。`.github/deployment/front/Dockerfile` 和 `.github/deployment/front/nginx.conf` 提供了参考。

希望这份计划对您有所帮助！
