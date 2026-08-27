# Rouba DSH Desktop 开发指南

> 面向开发者的 dsh-desktop 开发、构建、打包与本地改动注入指南。

## 1. 项目结构

```
dsh-desktop/                      ← 外层 Yarn workspace（packageManager: yarn@4.18.0）
├── dsh-plugin-desktop/           桌面壳（electron）：窗口/托盘/终端/更新
├── dsh-community-fabric/         社区插件契约讨论
├── dsh-community-market/         插件市场
├── deepseek-harness/             ★ git submodule（用户 fork dsh-rouba，pnpm workspace）
│     └── packages/               DSH 核心（client/llm/jobs/media/apiproxy…几十个包）
├── patches/                      对官方 npm 包的 yarn patch
└── scripts/                      打包/验证脚本
```

**两层包管理器，完全分离**：
- 外层（dsh-desktop）：**Yarn 4.18.0**
- 上游（deepseek-harness）：**pnpm 11.7.0**

## 2. 环境准备

```sh
# Node ^22.19 || >=24（含 Corepack）
node -v && corepack --version

# 初始化 submodule（指向用户 fork dsh-rouba）
git submodule update --init --recursive

# 外层 Yarn 依赖
corepack yarn install

# 上游 pnpm 依赖（在 deepseek-harness 内）
cd deepseek-harness
corepack pnpm install --ignore-scripts   # 跳过 lefthook，避免 stale lock 卡住
cd ..
```

> ⚠️ `pnpm install` 若卡住，检查 `.git/dsh-lefthook-install.lock` 残留，删掉再装（或一直用 `--ignore-scripts`）。

## 3. 日常开发循环

### 3.1 改上游（deepseek-harness）代码

```sh
cd deepseek-harness
# 改 packages/**/src/** 后构建 lib
corepack pnpm run build:lib:host     # node 端（jobs/apiproxy/llm/media）
corepack pnpm run build:lib:client   # client 端（ui-conversation/ui-sidebar 等）
```

> ⚠️ **改 `src/` 必须 build 出 `lib/`**，否则 afterPack 覆盖的是旧 lib。

### 3.2 把改动注入 exe（afterPack 自动覆盖）

打包时 `afterPack` hook（`dsh-plugin-desktop/scripts/override-local-dsh-packages.mjs`）会自动把本地 lib 覆盖进 `app.asar.unpacked`：

| 包 | 覆盖来源 |
|----|---------|
| `dsh-client-ui-conversation` | 图片/视频渲染（MediaMessageNode 判定）|
| `dsh-client-runtime` | 节点类型 |
| `dsh-client-ui-sidebar` / `ui-renderer` | Rouba 品牌 |
| `dsh-client-ui-brand-rouba` | 品牌插件（本地新增）|
| `dsh-host-apiproxy` | SSRF |
| `dsh-llm` | VideoBlock |
| `dsh-jobs` / `dsh-jobs-local` | reportProgress |

> 覆盖源默认 `deepseek-harness`（相对脚本路径），可用环境变量改：`DSH_UPSTREAM_ROOT=<路径>`

### 3.3 提交到 fork

```sh
cd deepseek-harness
git add -A
git commit -m "改动说明"
git push origin master          # 必须先 push，主仓才能记录新 submodule 指针
```

## 4. 打包

### 快速出未打包目录（验证用，~30 秒）

```sh
cd dsh-desktop/dsh-plugin-desktop
# 结束旧进程（释放 exe 占用）
# 设环境变量绕过 CodeBuddy safe-delete 拦截
$env:CODEBUDDY_SAFE_DELETE_ENABLED='0'
corepack yarn electron-builder --dir --x64 --publish never --config.win.signExecutable=false --config.npmRebuild=false
# 产物：dist\win-unpacked\Rouba DSH.exe
```

### 正式打包（含前置检查）

```sh
cd dsh-desktop
corepack yarn dist:win          # NSIS 安装器（会先跑 check:win-package）
corepack yarn dist:win-portable # 绿色版
```

## 5. 常见坑速查

| 坑 | 症状 | 解决 |
|----|------|------|
| lefthook 卡住 | `pnpm install`/`pnpm dsh` 无限等待 | `pnpm install --ignore-scripts` 或删 `.git/dsh-lefthook-install.lock` |
| safe-delete 拦截 | electron-builder 清理 dist 报错 | 打包前 `CODEBUDDY_SAFE_DELETE_ENABLED=0` |
| exe 文件占用 | `EPERM: unlink Rouba DSH.exe` | 先结束 `Rouba DSH.exe` 进程 |
| immutable 冲突 | `yarn install` 报 lockfile 会被修改 | 改了 package.json 后 `yarn install --mode=update-lockfile` |
| Workspace not found | `yarn install` 解析 `workspace:` 依赖失败 | 别对上游包用 file:，统一 afterPack 覆盖 |
| 图片/视频不渲染 | 聊天里"未知内容块" | 确认 ui-conversation 被 afterPack 覆盖（改 upstream lib 后重打包）|

## 6. 关键机制说明

### 为什么不用 file: 引上游源码

上游 deepseek-harness 内部包用 `workspace:` 互相依赖。dsh-desktop 是 yarn，`file:` 引用这些包时无法解析 `workspace:` 依赖（报 `Workspace not found`）。所以：
- **本地新增包**（media/media-maizi/brand-rouba，官方 npm 没有）→ `file:` 引入
- **改官方包** → 统一 `afterPack` 覆盖（打包后物理覆盖 lib）

### submodule 语义

`deepseek-harness/` 是独立 git 仓库（gitlink）。主仓 push **不带** submodule 内容；submodule 代码单独 push 到 fork 远程。记住：**submodule 的 commit 要先 push 到 fork，再更新主仓指针**。

## 7. 品牌（Rouba DSH）开发

- 品牌 = `ui-brand-rouba` 插件（注册 sidebar/conversation 品牌 slot）+ `ui-sidebar`/`ui-renderer` 的 fallback。
- 改品牌 → build client → 重打包（afterPack 覆盖）。
- 官方 `ui-brand-official` 已由 patch 替换为 `ui-brand-rouba`。
