# 构建与部署

> Last updated: 2026-09

本文档描述 Chatbox Pro 的构建系统、依赖管理策略及各平台部署流程，聚焦关键决策的**原因**和踩过的坑。项目结构与命令清单见 [`AGENTS.md`](../../AGENTS.md)。

---

## 构建工具链

桌面端使用 **electron-vite** 作为构建工具，统一处理 main（Node.js）、preload 和 renderer（React）三个构建目标。相比传统 Webpack 方案，electron-vite 提供了开箱即用的 Electron 多入口支持和更快的 HMR。

构建产物结构：

| 目标 | 入口 | 产物路径 | 运行环境 |
|------|------|---------|---------|
| main | `src/main/` | `out/main/main.js` | Node.js |
| preload | `src/preload/` | `out/preload/index.js` | 受限 Node.js |
| renderer | `src/renderer/` | `out/renderer/` | Chromium |

打包使用 **electron-builder**，配置在 `electron-builder.yml`，产出 dmg/nsis/AppImage/deb 格式安装包。发布通过 Cloudflare R2 S3 兼容存储分发，客户端内置自动更新（`electron-updater`）。

---

## npm 到 pnpm 迁移

项目从 npm 迁移到 pnpm，主要动机是安装速度和磁盘效率。迁移的核心挑战在于 electron-builder 兼容性。

**关键决策（[`./key-decisions.md`](./key-decisions.md) #6）**：开发态采用
`node-linker=isolated`，让 pnpm 的 workspace 状态在重复安装之间稳定收敛。

electron-builder 仍需要扁平的生产依赖树，但不应让这个打包约束污染日常
开发安装。`electron-builder.yml` 的 `beforePack` hook
`.erb/scripts/ensure-app-deps.cjs` 会在 `release/app/` 中运行
`npm ci --omit=dev --ignore-scripts`，生成只包含生产依赖的扁平
`release/app/node_modules`；打包结束后该目录可安全被下一次 pnpm 安装重新链接。

日常 `pnpm install` 会运行一次非强制的 `electron-rebuild` 检查；匹配当前
Electron ABI 的模块会被跳过，不会重复编译。需要显式重建桌面端原生依赖时，
运行 `pnpm --filter xyz.chatboxapp.ce run rebuild -- --force`；electron-builder
打包时也会在 `beforePack` 暂存生产依赖后执行自己的依赖重建步骤。

`.npmrc` 中的关键配置：

```ini
node-linker=isolated
auto-install-peers=true
```

此外需要 `pnpm-workspace.yaml` 声明 workspace，以支撑根目录与 `release/app` 的两包架构。

迁移时使用 `pnpm import` 从 `package-lock.json` 转换锁文件，确保依赖版本完全不变。原有的 `patch-package` 机制也迁移为 pnpm 原生的 `pnpm patch` 功能。

---

## 依赖管理分离

项目采用 **Two-Package.json** 架构（来源：[`docs/dependency-reorg.md`](../dependency-reorg.md)）：

| package.json | 位置 | 职责 |
|-------------|------|------|
| 根 `package.json` | `/` | 开发依赖 + renderer 依赖 |
| `release/app/package.json` | `/release/app/` | 主进程生产依赖（原生模块） |

**为什么 renderer 依赖放在根目录的 `devDependencies`？**

electron-vite 会将 renderer 代码打包为纯前端 bundle（类似 Vite 构建 SPA），所有 renderer 依赖在构建时被 bundle 进产物。如果将 ESM-only 的包（如 `@mantine/*`、`@tanstack/*`）放在 `dependencies`，electron-builder 打包时会尝试 `require()` 这些包，导致 `require() of ES Module not supported` 错误。

`release/app/package.json` 只保留真正需要在运行时通过 Node.js `require()` 加载的依赖，目前主要是知识库相关的 `@libsql/client`。原生模块（`.node` 文件）必须放在此处，由 `electron-rebuild` 针对 Electron 版本重新编译。

`electron-builder.yml` 中通过 `directories.app: release/app` 指定此目录为应用根，打包时只包含此目录下的 `node_modules`。

---

## 复盘：pdfjs 打包后 `DOMMatrix is not defined`

打包安装版启动即崩 `ReferenceError: DOMMatrix is not defined`（`main.js` 顶层 `Object.<anonymous>`），但 `pnpm dev` 从不复现。根因是本地 PDF 解析库 `pdfjs-dist`（`src/main/file-parser.ts`）。

### 根因链（每一环都不显然）

1. `pdfjs-dist` v6 在**模块顶层**引用浏览器 canvas 全局：`const SCALE_MATRIX = new DOMMatrix()`（以及 `Path2D` / `ImageData`）。
2. 在 Electron **主进程** `process.type === "browser"`，pdfjs 判定 `isNodeJS === true`，于是走 Node 分支尝试 `require("@napi-rs/canvas")` 来 polyfill `globalThis.DOMMatrix`。
3. `@napi-rs/canvas` 只是 pdfjs 的 **optionalDependency**：开发态被传递安装进根 `node_modules`，但**不在 `release/app/package.json`**，所以打包产物里缺失，`require` 失败仅 `warn`，随后顶层 `new DOMMatrix()` 崩溃。
4. **dev 不复现**：开发态动态 import 保持惰性且 `node_modules` 齐全；**production 打包会 inline 动态 import**，使 pdfjs 顶层代码在 `main.js` 加载时立即执行，叠加缺失的原生依赖才暴露。

### 最终方案

本地 PDF 仅做**文本提取（从不渲染）**，实测最小 polyfill 即可让 pdfjs 加载并正常提取文本。新增 `src/main/pdfjs-globals.ts`（最小可用 `DOMMatrix` + 空壳 `Path2D` / `ImageData`，带 `if undefined` 守卫），并在 `src/main/main.ts` 中作为**第一个 import**。这样在 pdfjs 顶层代码运行前全局已就绪，pdfjs 的 `if (!globalThis.DOMMatrix)` 守卫命中、跳过 `@napi-rs/canvas` 路径。

未选择"把 `@napi-rs/canvas` 加进 `release/app`"：它含完整 skia，每平台增加约 10MB 原生依赖，对仅做文本提取的场景过重。

### 通用教训

- 第三方库的 `optionalDependencies` 在 Two-Package.json 架构下**不会自动进包**。若主进程运行时确实需要，要么显式加入 `release/app/package.json`，要么自行 polyfill。
- production 主进程 bundle 会 **inline 动态 import**，原本惰性的第三方顶层代码会在启动时执行——这类崩溃只在打包版出现。
- 验证打包问题必须打包 + 启动（`electron-vite build` 后 `NODE_ENV=production electron release/app/dist/main/main.js`）；**不要只用纯 Node 验证**，纯 Node 的 `node_modules` 含 optional/传递依赖，会掩盖打包缺失。

---

## macOS 签名与 libsql 补丁传奇

这是项目构建系统中最复杂的问题，经历了 **6 次尝试**才最终解决（来源：[`docs/libsql-patch-fix-attempts.md`](../libsql-patch-fix-attempts.md)）。

### 问题背景

`libsql` 是知识库 RAG 功能的核心原生依赖，需要 patch 以支持 Windows ARM64 容错和 pnpm 路径兼容。patch 内容修改 `libsql/index.js` 和 `libsql/promise.js`，添加 try-catch 和平台检测。

从 alpha.17 开始，CI 打出的 macOS 包安装后报 **"damaged and can't be opened"**——`codesign --verify` 显示 `app.asar.unpacked/node_modules/libsql/*.js` 在签名后被修改，seal 失效。

### 6 次尝试与关键教训

| 尝试 | 方案 | 结果 | 教训 |
|------|------|------|------|
| 1 | afterPack 直接 patch | ❌ damaged | 真正问题不在 patch 时机 |
| 2 | postinstall patch + afterPack 校验 | ❌ CI 失败 | pnpm `node_modules` 路径不可预测 |
| 3 | postinstall 非阻塞 + afterPack 写入 | ❌ CI 失败 | hard link 仍然污染已签名文件 |
| 4 | beforePack patch | ❌ CI 失败 | `installAppDependencies` 会覆盖 patch |
| 5 | afterPack 改进路径 | ⚠️ CI 过，用户失败 | CI 通过 ≠ 签名有效 |
| 6 | afterPack + `USE_HARD_LINKS=false` | ✅ 全部通过 | 根因是 hard link |

### 根因与最终方案

**关键决策（[`./key-decisions.md`](./key-decisions.md) #7）**：在 macOS CI 构建中设置 `USE_HARD_LINKS=false`。

electron-builder 在 CI 环境默认启用 hard link 优化（`builder-util/out/fs.js`）。当 multi-arch 构建（arm64 + x64）在同一个 job 中运行时，两个架构的 `app.asar.unpacked` 目录中的文件通过 hard link 共享同一个 inode。第一个架构签名后，第二个架构的依赖重建/patch 操作通过 hard link **间接修改**了已签名文件，破坏了 code signature。

此问题仅在 **CI + multi-arch** 条件下出现：本地构建不启用 hard link，单架构构建无交叉污染。这使得问题极难在本地复现。

**关键决策（[`./key-decisions.md`](./key-decisions.md) #8）**：使用 `afterPack` hook 执行 libsql patch。

electron-builder 的 hook 执行顺序为：

```
beforePack → installAppDependencies → copyAppFiles/asar → afterPack → signApp → afterSign
```

`afterPack` 是唯一安全的 patch 时机——文件已在 bundle 中（不会被覆盖），签名尚未开始（不会破坏 seal）。配置在 `electron-builder.yml` 的 `afterPack: .erb/scripts/patch-libsql.cjs`。

最终方案还包含 CI 签名校验关卡：未来的 macOS job 在发布前执行
`codesign --verify --deep --strict --verbose=4`，防止类似问题再次逃逸。

---

## Windows 签名

Windows 安装包由 `electron-builder` 构建为 NSIS 安装包，并通过 `win.signtoolOptions.sign` 调用根目录的 `custom_win_sign.js`。签名脚本使用 AzureSignTool 连接 Azure Key Vault，调用保存在 Key Vault 中的 GlobalSign 代码签名证书完成 Authenticode 签名。

计划中的 `build-windows` job 的签名流程：

1. 安装 .NET 8 SDK
2. 通过 `dotnet tool install --global AzureSignTool --version 7.0.1` 安装 AzureSignTool
3. 从 GitHub Secrets 注入 Azure Key Vault 配置
4. 运行 `npm run electron:publish-win`，由 electron-builder 在打包过程中逐个调用 `custom_win_sign.js`

需要配置的 GitHub Secrets：

| Secret | 说明 |
|--------|------|
| `AZURE_KEY_VAULT_URL` | Azure Key Vault URL，例如 `https://example.vault.azure.net/` |
| `AZURE_KEY_VAULT_CLIENT_ID` | 有 Key Vault 签名权限的 Azure App Registration client ID |
| `AZURE_KEY_VAULT_CLIENT_SECRET` | 该 App Registration 的 client secret |
| `AZURE_KEY_VAULT_TENANT_ID` | Azure AD tenant ID |
| `AZURE_KEY_VAULT_CERTIFICATE_NAME` | Key Vault 中的代码签名证书名称 |

签名脚本默认使用 GlobalSign RFC 3161 时间戳服务 `http://timestamp.globalsign.com/tsa/advanced`，并使用 SHA-256 文件摘要和时间戳摘要。可选覆盖项：

| 环境变量 | 默认值 |
|----------|--------|
| `AZURE_SIGNTOOL_TIMESTAMP_URL` | `http://timestamp.globalsign.com/tsa/advanced` |
| `AZURE_SIGNTOOL_FILE_DIGEST` | `sha256` |
| `AZURE_SIGNTOOL_TIMESTAMP_DIGEST` | `sha256` |
| `AZURE_SIGNTOOL_DESCRIPTION` | `Chatbox` |
| `AZURE_SIGNTOOL_DESCRIPTION_URL` | `https://chatboxai.app` |
| `WINDOWS_CODE_SIGNING_DISABLED` | 未设置；设为 `true`/`1`/`yes` 可显式跳过签名 |

alpha 通道沿用原行为，不注入签名 secrets，因此会跳过 Windows 代码签名。本地构建如果没有任何 Azure Key Vault 签名配置，也会跳过签名；如果只配置了一部分变量，脚本会失败并列出缺失项，避免误产出未签名的发布包。上述 CI 注入和校验目前尚未接入。

---

## 移动端构建

移动端使用 **Capacitor** 将 renderer 代码打包为原生应用。当前工作区只维护 Android 流程：

1. `pnpm run mobile:sync:android` — 使用 `CHATBOX_BUILD_TARGET=mobile_app` 和 `CHATBOX_BUILD_PLATFORM=android` 编译 renderer，并执行 `corepack pnpm exec cap sync android`
2. 在 Android Studio 或 `android/gradlew.bat` 中运行、签名和生成 APK

Release Android 构建启用 Android Gradle Plugin 的 R8 压缩与混淆（`minifyEnabled true`、`shrinkResources true`）；debug 构建保持未压缩，便于调试。FileProvider 仅暴露应用专属的 cache/external-files 子目录。

移动端与桌面端共享同一份 renderer 代码，通过 Platform 抽象层（`src/renderer/platform/`）屏蔽 API 差异。iOS 的构建脚本和 Capacitor 依赖暂时保留，但本阶段不进行 Xcode 构建、签名或发布验证。

代码块高亮在 Android WebView 中使用 Shiki 的 JavaScript 正则引擎；WebView 的 CSP 实现会拒绝 Oniguruma WASM 的编译。桌面端和 Web 构建仍使用默认的 Oniguruma 引擎。

Android 目标 SDK 35 默认采用 edge-to-edge 窗口。渲染层通过 `capacitor-plugin-safe-area` 将系统 inset 应用到页面布局；Android 原生 `SystemBars` 插件只负责显示状态栏并根据渲染层的明暗主题切换状态栏图标颜色。这样白色页面使用深色时间、电量图标，深色页面使用浅色图标，同时不会改变现有内容的安全区间距。

已知限制：
- Android 端已升级至 `targetSdkVersion=35`（Android 15），最低支持 API 23
- Windows ARM64 知识库功能被禁用（libsql 原生模块不支持）

Android 应用身份（2026-08 起）：
- `applicationId` / Capacitor `appId` 统一为 `com.aibox.mobile`，与应用名 "AIbox Mobile"（`package.json#productName`）一致；`namespace` 保留上游 `xyz.chatboxapp.chatbox`（内部 R 类包名，避免迁移 Java 包目录）
- `versionName` / `versionCode` 以根 `package.json#version` 为唯一事实来源（当前 `0.0.1` / `1`），升级时两处需同步修改
- Release 签名为 fail-closed：四个 `CHATBOX_ANDROID_*` 属性齐全才可出 release 包。本机签名材料放在 gitignored 的 `android/.gradle-local/gradle.properties`（随 NOTES 流程的 `GRADLE_USER_HOME` 自动加载）与 `~/.aibox-signing/` keystore；keystore 绝不进仓库

Android 深链接：`chatbox://` 与 `chatbox-dev://` 在 `AndroidManifest.xml` 以 BROWSABLE intent-filter 声明，`singleTask` 启动模式下经 Capacitor App 插件 `appUrlOpen` 事件进入 `MobilePlatform.handleDeepLink`（与桌面端 `src/main/deeplinks.ts` 行为对齐）。

---

## CI/CD 流水线

当前仓库已配置 `.github/workflows/ci.yml`，在 push 到 `main` 或创建 Pull
Request 时运行无 secrets 的质量门禁：`pnpm install --frozen-lockfile`、
lint、TypeScript 检查、测试和 Web renderer 构建。该 workflow 不执行发布、
签名或 notarization。

以下发布流程仍是目标设计，不会由当前 GitHub Actions 自动执行。发布前请
在本机显式运行对应的构建、签名和校验命令。

计划中的发布 GitHub Actions 流程通过 git tag（`vX.X.X`）触发，覆盖 5 个构建目标：

| Job | 平台 | 产物 |
|-----|------|------|
| build-macos | macOS (arm64 + x64) | dmg |
| build-windows | Windows (x64 + arm64) | nsis 安装包 |
| build-linux | Linux (x64 + arm64) | AppImage + deb |
| build-android | Android | APK |
| build-web | Web | 静态文件 |

发布 workflow 接入后的关键变更：
- 每个 job 前置 `pnpm/action-setup@v4` 步骤
- `setup-node` 从根目录 `.node-version` 读取固定的 Node 版本，并使用 `cache: pnpm`
- pnpm 版本由根 `package.json#packageManager` 固定为 `10.33.0`
- 依赖安装使用 `pnpm install --frozen-lockfile`
- macOS job 额外设置 `USE_HARD_LINKS: 'false'` 和签名校验步骤

构建环境变量：
- `CHATBOX_BUILD_TARGET`：`'mobile_app'` | 默认（桌面/Web）
- `CHATBOX_BUILD_PLATFORM`：当前移动构建使用 `'android'`；另支持 `'ios'`、`'web'`（iOS 暂缓）
- `USE_LOCAL_API=true`：开发环境使用本地后端
- `UPDATE_CHANNEL`：更新通道（stable/alpha），传递给 S3 publish path

---

## 相关文档

- libsql 签名修复记录（6 次尝试）：[`docs/libsql-patch-fix-attempts.md`](../libsql-patch-fix-attempts.md)
- 依赖分离方案：[`docs/dependency-reorg.md`](../dependency-reorg.md)
- 跨平台架构：[`docs/technical/architecture.md`](./architecture.md)
- 关键决策记录：[`docs/technical/key-decisions.md`](./key-decisions.md)（决策 #6、#7、#8）
