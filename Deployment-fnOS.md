# 飞牛 OS (fnOS) Docker 部署指南 (基于 GitHub 容器库)

既然你在飞牛 OS 中只看到了“从 URL 添加镜像”的选项（没有进入终端部署的入口），那么最顺畅的方法就是让 GitHub 服务器来帮你打包镜像，飞牛 OS 直接下载成品即可。

我已经为你配置了 **GitHub Actions**（位于 `.github/workflows/docker-publish.yml`）。只要你把代码推送到 GitHub，它就会自动在云端帮你打包出 Docker 镜像，并发布到 GitHub 的官方容器库（ghcr.io）。

## 第一步：触发云端打包推送代码

在你的本地命令行执行以下操作，将我刚才写的自动打包脚本推送到 GitHub 仓库：
```bash
git add .
git commit -m "feat: 添加 GitHub Actions 自动构建 Docker 镜像"
git push origin master
```
推送上去后，打开你 GitHub 仓库的 **Actions** 标签页，你会看到一个名为 `Docker Image CI` 的任务正在运行。等待它变成绿色的打勾状态（通常需要 2-3 分钟），说明云端镜像早已打包完毕。

*(注意：如果你希望以后不输入密码就能下载镜像，你可以进入 GitHub 仓库页面右下角的 "Packages" -> 点击 "mylibpro" -> "Package settings" -> 滑到底部把 "Danger Zone" 里的 "Change package visibility" 改为 **Public**)*

## 第二步：在飞牛 OS 填入 URL 部署

1. 回到飞牛 OS 的 Docker 管理界面。
2. 找到你说的 **添加镜像 -> 从 URL 添加镜像**。
3. **输入镜像名称 (或 URL)**：
   请填入：
   `ghcr.io/LJK0719/mylibpro:latest`
   *(这里的 LJK0719 是根据我获取到的你的仓库路径推测的，如果你的 GitHub 用户名不同，请把它替换成真实的用户名的小写形式)*

4. **用户名与密码（可选）**：
   - **如果你的 GitHub 仓库是公开的（Public）** 或者你刚才在 Package settings 里把镜像权限改成了公开：这里**不需要**填密码，直接拉取即可。
   - **如果你的仓库是私有的（Private）**：你在飞牛 OS 这里填写：
     - **用户名**：你的 GitHub 用户名
     - **密码**：你需要去 GitHub官网生成一个 **Personal Access Token (PAT)**（带 `read:packages` 权限），千万不能填你的实际 GitHub 登录密码，必须填写以 `ghp_` 开头的 Token 令牌。

然后点击下载/拉取，飞牛 OS 就会自动把你的项目镜像下载到 NAS 里了。

## 第三步：启动容器并映射路径

镜像下载完毕后，在飞牛 OS 中从刚才的镜像启动一个容器（有的叫创建容器/部署容器）。在向导中，你需要配置两处核心参数：

1. **端口映射 (Port)**：
   将容器端口 `3000` 映射到你希望的 NAS 端口（比如也填 `3000`）。
2. **文件夹映射 (Volume)**：
   这是让容器能读到你 NAS 上的数据的关键步骤！添加两个**绑定挂载 (Bind Mount)**：
   - 将飞牛 OS 里的 `libdata` 所在的真实共享文件夹，挂载到容器内的 `/app/libdata` 路径。
   - 随便在飞牛 OS 里新建一个文件夹（例如命名为 `mylibpro_db`），将其挂载到容器内的 `/app/db` 路径（用于持久化保存数据库文件，防止重启丢失）。
3. **环境变量 (Env)**：
   手动添加一行环境变量：
   - 名称: `GEMINI_API_KEY`
   - 值: `你的真实API_KEY` (如果在上一步的网页里你希望使用前台输入的话，这一步就不用配啦，但我还是建议你留意下)。

启动容器后，访问 `http://<飞牛IP>:3000` 即可！
