# 在飞牛 NAS 上用 GitHub Actions + Docker 固定端口部署 MyLibPro

这份教程按当前项目 `mylibpro` 来写，不再套用“静态前端 + Nginx”的模板。

当前项目是 **Next.js standalone 服务**：

- Docker 镜像运行的是 `node server.js`
- 容器内部监听端口是 `3000`
- GitHub Actions 会把镜像推送到 GHCR
- 飞牛 NAS 只需要拉取镜像，然后在创建容器时固定宿主机端口

最终访问方式类似：

```text
http://NAS_IP:18080
```

本教程示例约定：

```text
GitHub 用户名：LJK0719
仓库名：mylibpro
镜像地址：ghcr.io/ljk0719/mylibpro:latest
NAS 访问端口：18080
容器内部端口：3000
数据目录：/vol1/1000/library/libdata
数据库目录：/vol1/1000/docker/lib
```

如果你想继续用当前 `docker-compose.yml` 里的 `3000:3000`，访问地址就是：

```text
http://NAS_IP:3000
```

如果你想让 NAS 端口更稳定、更不容易和别的服务冲突，建议改成：

```text
18080:3000
```

这里的“持久化端口”不是 Docker 的特殊功能，本质就是把 **NAS 宿主机端口固定映射到容器端口**。端口映射格式是：

```text
宿主机端口:容器端口
```

所以：

```text
18080:3000
```

表示访问 `NAS_IP:18080` 时，请求会转发到容器里的 `3000` 端口。

---

## 1. 当前项目已经准备好的文件

这个仓库已经有部署需要的核心文件，不需要从零创建。

### Dockerfile

项目根目录已有 `Dockerfile`，它做的是：

```text
Node 20 构建 Next.js
  -> 复制 .next/standalone
  -> 运行 node server.js
  -> 暴露容器端口 3000
```

关键点如下：

```dockerfile
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_ROOT=/app/libdata
ENV DB_PATH=/app/db/library.db

CMD ["node", "server.js"]
```

所以后面飞牛里不要填容器端口 `80`。这个项目不是 Nginx 静态站，容器端口应该填：

```text
3000
```

### docker-compose.yml

项目根目录已有 `docker-compose.yml`：

```yaml
services:
  mylibpro:
    image: ghcr.io/ljk0719/mylibpro:latest
    container_name: mylibpro
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GEMINI_API_KEY=your_api_key_here
      - GEMINI_MODEL=gemini-3.1-flash-lite-preview
      - DATA_ROOT=/app/libdata
      - DB_PATH=/app/db/library.db
    volumes:
      - /vol1/1000/library/libdata:/app/libdata
      - /vol1/1000/docker/lib:/app/db

networks:
  default:
    name: mylibpro-network
```

如果要把 NAS 访问端口固定为 `18080`，只改这一行：

```yaml
ports:
  - "18080:3000"
```

含义是：

```text
NAS 端口 18080 -> 容器端口 3000
```

### GitHub Actions

项目已有 workflow：

```text
.github/workflows/docker-publish.yml
```

它会在推送到 `master` 或 `main` 时构建并推送镜像。PR 只构建，不推送。

推送成功后，镜像地址就是：

```text
ghcr.io/ljk0719/mylibpro:latest
```

如果你 fork 或换了 GitHub 账号，镜像地址按这个规则改：

```text
ghcr.io/<github用户名小写>/<仓库名小写>:latest
```

例如：

```text
ghcr.io/zhangsan/mylibpro:latest
```

注意：GHCR 镜像名必须小写。当前 workflow 已经把 `GITHUB_REPOSITORY` 转成小写，所以实际镜像是 `ghcr.io/ljk0719/mylibpro:latest`，不是 `ghcr.io/LJK0719/mylibpro:latest`。

---

## 2. 推送代码，让 GitHub Actions 自动构建镜像

平时只需要正常提交并推送：

```bash
git add .
git commit -m "docs: update fnOS deployment guide"
git push origin master
```

如果你的主分支叫 `main`，就推送到 `main`：

```bash
git push origin main
```

然后打开 GitHub 仓库页面：

```text
Actions -> Docker Image CI
```

看到最新一次 workflow 变成绿色成功后，说明镜像已经推送到 GHCR。

镜像地址固定写：

```text
ghcr.io/ljk0719/mylibpro:latest
```

这就是后面飞牛“拉取镜像”或“创建容器”里要填的地址。

---

## 3. 把 GHCR 镜像设为 Public

飞牛 NAS 如果不登录 GitHub，最省事的做法是把 GHCR Package 设为公开。

GitHub 页面路径：

```text
GitHub 仓库首页
  -> 右侧 Packages
  -> 点击 mylibpro
  -> Package settings
  -> Danger Zone
  -> Change package visibility
  -> Public
```

如果在仓库右侧没看到 `Packages`：

1. 先确认 Actions 已经成功跑完一次。
2. 打开用户主页 `https://github.com/LJK0719`。
3. 找到 `Packages` 标签页。
4. 点击 `mylibpro` 这个 container package。
5. 进入 `Package settings` 修改可见性。

公开后，飞牛可以直接拉取：

```text
ghcr.io/ljk0719/mylibpro:latest
```

如果不公开，就必须在 NAS 上先登录 GHCR。私有镜像需要 GitHub classic PAT，并且至少勾选 `read:packages` 权限：

```bash
echo "你的_GitHub_PAT" | docker login ghcr.io -u "你的_GitHub用户名" --password-stdin
docker pull ghcr.io/ljk0719/mylibpro:latest
```

个人部署建议直接公开镜像。镜像里不要放 `.env.local`、API key、数据库文件；当前 `.dockerignore` 已经排除了 `.env*`、`db/*.db`、`db/*.db-wal`、`db/*.db-shm` 和 `libdata`。

---

## 4. 在飞牛 NAS 上准备目录

在飞牛文件管理器里准备两个目录：

```text
/vol1/1000/library/libdata
/vol1/1000/docker/lib
```

它们分别对应容器内：

```text
/app/libdata
/app/db
```

当前项目里这两个环境变量也对应这两个路径：

```text
DATA_ROOT=/app/libdata
DB_PATH=/app/db/library.db
```

作用：

- `/app/libdata`：放 Markdown 全文、章节、索引等资料文件。
- `/app/db/library.db`：SQLite 数据库文件。

不要把数据库只放在容器内部。容器删掉或重建后，容器内部文件会丢；映射到 NAS 目录后，数据才会跟着 NAS 目录保留下来。

---

## 5. 在飞牛 Docker 里拉取镜像

进入飞牛：

```text
飞牛桌面 -> Docker -> 本地镜像 -> 添加/拉取镜像
```

镜像名填写：

```text
ghcr.io/ljk0719/mylibpro
```

标签填写：

```text
latest
```

如果飞牛界面只有一个输入框，就填完整地址：

```text
ghcr.io/ljk0719/mylibpro:latest
```

拉取成功后，本地镜像列表里应该能看到 `ghcr.io/ljk0719/mylibpro` 和 `latest`。

如果拉取失败，优先检查这三件事：

- GitHub Actions 是否成功。
- GHCR Package 是否已经设为 Public。
- 镜像地址是否全小写。

---

## 6. 用飞牛 UI 创建容器

这一步才是实际部署的重点。

进入：

```text
飞牛桌面 -> Docker -> 镜像 -> ghcr.io/ljk0719/mylibpro:latest -> 创建容器
```

不同版本飞牛 UI 文案可能略有不同，但要填的内容基本一致。

### 基础信息

```text
容器名称：mylibpro
重启策略：unless-stopped 或 总是重启
```

### 端口

如果你想用 `18080` 访问：

```text
本地端口 / 主机端口：18080
容器端口：3000
协议：TCP
```

也就是：

```text
18080 -> 3000
```

部署完成后访问：

```text
http://NAS_IP:18080
```

如果你沿用当前 compose 文件：

```text
本地端口 / 主机端口：3000
容器端口：3000
协议：TCP
```

访问：

```text
http://NAS_IP:3000
```

### 环境变量

至少填写：

```text
GEMINI_API_KEY=你的 Gemini API Key
GEMINI_MODEL=gemini-3.1-flash-lite-preview
DATA_ROOT=/app/libdata
DB_PATH=/app/db/library.db
TZ=Asia/Shanghai
```

如果你不用 Gemini，而是 OpenAI-compatible provider，再按项目 `.env.example` 填对应变量，例如：

```text
AGENT_PROVIDER=openai
OPENAI_API_KEY=你的 API Key
OPENAI_MODEL=你的模型名
OPENAI_BASE_URL=你的接口地址
```

不要把 API key 写进 Dockerfile，也不要提交到 GitHub。

### 存储卷

添加两个绑定挂载：

```text
NAS 路径：/vol1/1000/library/libdata
容器路径：/app/libdata
权限：读写
```

```text
NAS 路径：/vol1/1000/docker/lib
容器路径：/app/db
权限：读写
```

第二个挂载很重要。`DB_PATH=/app/db/library.db`，所以 SQLite 数据库会落在：

```text
/vol1/1000/docker/lib/library.db
```

这样容器更新、删除、重建后，数据库仍然保留。

### 网络

普通部署选择默认 Bridge 网络即可。端口已经通过 `18080:3000` 暴露给局域网，不需要 host 网络。

---

## 7. 用 Compose 部署的等价写法

如果你想用飞牛 Compose 项目管理，而不是手动点 UI，可以在飞牛里新建 Compose 项目，粘贴：

```yaml
services:
  mylibpro:
    image: ghcr.io/ljk0719/mylibpro:latest
    container_name: mylibpro
    restart: unless-stopped
    ports:
      - "18080:3000"
    environment:
      GEMINI_API_KEY: "你的 Gemini API Key"
      GEMINI_MODEL: "gemini-3.1-flash-lite-preview"
      DATA_ROOT: "/app/libdata"
      DB_PATH: "/app/db/library.db"
      TZ: "Asia/Shanghai"
    volumes:
      - /vol1/1000/library/libdata:/app/libdata
      - /vol1/1000/docker/lib:/app/db

networks:
  default:
    name: mylibpro-network
```

如果你在仓库根目录用当前 `docker-compose.yml`，把端口从：

```yaml
- "3000:3000"
```

改成：

```yaml
- "18080:3000"
```

然后在 NAS 上运行：

```bash
docker compose pull
docker compose up -d
docker compose ps
```

---

## 8. 更新版本

以后项目更新时，流程是：

1. 本地修改代码。
2. 推送到 `master` 或 `main`。
3. 等 GitHub Actions 构建成功。
4. 飞牛里重新拉取 `ghcr.io/ljk0719/mylibpro:latest`。
5. 重建或重启容器。

SSH 方式：

```bash
docker pull ghcr.io/ljk0719/mylibpro:latest
docker stop mylibpro
docker rm mylibpro
```

然后按第 6 步重新创建容器，或者用 Compose：

```bash
docker compose pull
docker compose up -d
```

数据库和资料文件不会因为镜像更新而丢，因为它们在 NAS 目录里：

```text
/vol1/1000/library/libdata
/vol1/1000/docker/lib
```

---

## 9. 常见问题

### 访问不了页面

先确认端口填的是：

```text
主机端口：18080
容器端口：3000
```

然后访问：

```text
http://NAS_IP:18080
```

不要访问 `https`，也不要把容器端口错填成 `80`。

### 镜像拉不下来

检查：

```text
ghcr.io/ljk0719/mylibpro:latest
```

是否全小写。再检查 GitHub Package 是否 Public。

### 容器启动后马上退出

看日志：

```bash
docker logs mylibpro
```

常见原因：

- 没有填写 `GEMINI_API_KEY`，但你打开了需要 AI 的功能。
- `/app/db` 没有写权限。
- `/app/libdata` 没有挂载或目录内容不完整。

### 数据没有持久化

检查飞牛容器的存储卷是否存在这条：

```text
/vol1/1000/docker/lib -> /app/db
```

并确认环境变量：

```text
DB_PATH=/app/db/library.db
```

如果数据库文件在容器内部别的路径，容器重建后就可能丢。

