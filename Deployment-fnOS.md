# 飞牛 OS (fnOS) Docker 部署 MyLibPro 指南

由于你的大模型数据（`libdata`）已经在飞牛 NAS 上的某个指定文件夹中，并且你的代码上传到了 GitHub。飞牛 OS 自带可视化 Docker 管理功能，使用 `docker-compose.yml` 部署非常简单。

## 第一步：准备代码和配置

1. 确保你已经在 GitHub 仓库中提交了最新的代码，其中包含了我刚刚创建的：
   - `Dockerfile`
   - `.dockerignore`
   - `docker-compose.yml`
   - `next.config.ts`

2. 编辑（或在飞牛OS中确认编辑）`docker-compose.yml`：
   > **关键修改**：打开 `docker-compose.yml`，找到 `volumes:` 的部分。这里必须将冒号前面的路径改为你飞牛 NAS 上真实的**绝对路径**。
   - 例：你的 NAS 数据目录是 `/vol1/1000/MyData/libdata`，那么这里就写 `/vol1/1000/MyData/libdata:/app/libdata`。
   - 同时为数据库 `db` 找一个存储位置映射给 `/app/db`。
   - **千万别忘了**修改 `GEMINI_API_KEY` 为你自己的真实 API Key。

## 第二步：在飞牛 OS 中部署

飞牛 OS 提供了图形化的 Docker Compose 部署方式（通常在 Docker 管理套件的“项目”或者“Compose”中进行）。

1. **进入 Docker 应用**：登录飞牛 OS 的网页后台，打开「Docker」套件。
2. **下载 GitHub 项目文件**（两种方式选你方便的一款）：
   - *方式一（推荐）*：如果你已经在飞牛的某个共享文件夹里通过 Git 拉取了你的仓库，直接在 Docker 套件的「项目/Compose」中，点击「新增」，选择对应的那份代码文件夹（包含 `docker-compose.yml`）。
   - *方式二*：在网络上或者本地直接复制好改过的 `docker-compose.yml` 文本内容。在 Docker 的「项目」里选择「手工创建」，然后把代码粘贴进去。
3. **开始构建与部署**：
   - 因为配置里写的是 `build: .`，如果是选择文件夹创建的方式，飞牛 OS 的 Docker 会自动下载 Node.js 的镜像并帮你进行源码编译。这可能需要几分钟到十几分钟（取决于你 NAS 的性能和网络）。
   - 部署完成后，应该能看到一个名为 `mylibpro` 的容器处于“运行中”状态。

## 第三步：访问与测试

- **访问**：在浏览器中输入 `http://<你的飞牛NAS的IP地址>:3000` 即可访问你的桌面书架。
- **数据**：网页应当能够加载出你存放在 `libdata` 下的 PDF 和书籍内容。

## 常见排错建议

- 如果部署失败，提示无法找到库或下载很慢，可能是国内网络拉取 npm 包的问题，可以在 `Dockerfile` 的 `RUN npm ci` 前加上 `RUN npm config set registry https://registry.npmmirror.com`。
- 如果网页打开提示数据库报错，请确保 `docker-compose.yml` 映射的 `db` 和 `libdata` 路径在飞牛系统中赋予了正确的读写权限（可以在飞牛 File Manager 里修改相关文件夹权限，允许 Docker 用户或 everyone 读写）。
