# AIbox Mobile

AIbox Mobile 是基于 Chatbox 共享渲染层和 Capacitor 的移动端工作区。当前开发、联调和发布范围是 **Android**；iOS 工程暂不纳入本阶段流程，相关脚本保留用于后续恢复。

> 这是开发仓库，不是面向最终用户的安装包仓库。Android 原生壳位于 `android/`，界面和大部分业务逻辑位于 `src/renderer/` 与 `src/shared/`。

## 当前范围

| 目标 | 状态 | 说明 |
| --- | --- | --- |
| Android | 当前支持 | 使用 Capacitor 同步 Web 资源，并通过 Android Studio 或 Gradle 构建 APK。 |
| iOS | 暂缓 | 本 README 不覆盖 Xcode、签名和发布流程；不要把 iOS 同步作为日常开发步骤。 |
| Desktop / Web | 共享代码 | 仓库中保留桌面和 Web 的共享实现，但当前工作区的交付目标是 Android。 |

## 能力概览

- 接入多个 AI 服务商和模型，支持流式回复、Markdown、LaTeX 与代码高亮。
- 在设备本地保存设置和会话；移动端使用 SQLite 存储，API Key 等敏感值使用 Android Keystore 加密保存。
- 支持移动端文件选择、内容读取、导出和系统分享，并适配安全区与软键盘行为。
- 支持深链接（`chatbox://provider/import?config=`，`chatbox-dev://` 自动归一化）：桌面端由 Electron 主进程处理，Android 端经 Manifest intent-filter + Capacitor App 插件 `appUrlOpen` 事件接线。
- 支持 Android 原生 HTTP/流式请求，减少 WebView 环境下的跨域限制。
- 复用桌面端的会话、模型、国际化和主题代码，平台差异集中在 `src/renderer/platform/`。

### 移动端限制

以下能力目前只在桌面端启用，Android 端不会显示对应入口：

- MCP 在所有平台仅支持远程 HTTPS；本地 stdio MCP 不可用。Android 上的知识库、Agent Mode、Skills 和本地代码执行仍不可用。
- 依赖桌面 OAuth 回调服务器的登录方式。
- Electron 主进程、桌面沙箱和自动更新能力。

## 环境要求

| 工具 | 要求 | 来源 |
| --- | --- | --- |
| Node.js | `22.14.x`（`22.13 <= version < 23`） | `.node-version`、`package.json#engines`；pnpm 会拒绝不兼容版本 |
| pnpm | `10.33.0`（至少 `10.17`） | `package.json#packageManager` |
| JDK | 21（LTS） | AGP 8.7.2 最低 17，但 app 与绝大多数 Capacitor 插件模块声明 Java 21 工具链，实测 JDK 17 会在 `:capacitor-filesystem` 编译失败 |
| Android Studio | 建议使用最新版稳定版 | 用于 SDK、模拟器和原生调试 |
| Android SDK | Platform 35、Build Tools 35；可运行 Android API 23 及以上设备 | `android/variables.gradle` |

还需要 Git、可访问 npm/Gradle 仓库的网络，以及用于真机调试的 USB 调试权限。Android Studio 首次打开项目时会生成本机专用的 `android/local.properties`，该文件不应提交。

## 快速开始

以下命令在仓库根目录执行。

### 1. 安装依赖

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
```

如果本机已安装匹配版本的 pnpm，只需执行最后一条命令即可。

### 2. 同步 Android 工程

```bash
pnpm run mobile:sync:android
```

该命令会完成两步：

1. 使用 `CHATBOX_BUILD_TARGET=mobile_app` 和 `CHATBOX_BUILD_PLATFORM=android` 构建 renderer。
2. 将构建产物同步到 `android/`（`npx cap sync android`）。

### 3. 在 Android Studio 中运行

```bash
pnpm run mobile:android
```

命令会重新构建并同步资源，然后打开 Android Studio。选择已连接的真机或 API 23 及以上模拟器，运行 `app` configuration 即可。

也可以直接使用 Gradle：

```powershell
Set-Location android
.\gradlew.bat assembleDebug
.\gradlew.bat installDebug # 已连接设备时可选
```

Debug APK 默认输出到 `android/app/build/outputs/apk/debug/app-debug.apk`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm run mobile:sync:android` | 构建 renderer 并同步 Android 工程 |
| `pnpm run mobile:android` | 同步后打开 Android Studio |
| `pnpm run start` | 启动 Electron 开发环境，用于桌面端调试共享代码 |
| `pnpm run dev:web` | 启动 Web 开发环境 |
| `pnpm run test` | 执行 Vitest 单元测试 |
| `pnpm run test:integration` | 执行集成测试 |
| `pnpm run check` | TypeScript 类型检查 |
| `pnpm run lint` | Biome 静态检查 |
| `pnpm run check:shared-boundaries` | 检查 shared 层依赖边界 |
| `cd android; .\gradlew.bat clean` | 清理 Android 构建缓存（清理后需重新同步） |

## 构建变量与签名

日常 Android 构建不需要手动设置平台变量，`mobile:sync:android` 已自动设置。需要切换后端或发布渠道时，可在构建前设置：

| 变量 | 用途 |
| --- | --- |
| `CHATBOX_BUILD_TARGET=mobile_app` | 选择移动端构建目标 |
| `CHATBOX_BUILD_PLATFORM=android` | 选择 Android 平台 |
| `CHATBOX_BUILD_CHANNEL=google_play` | Google Play 渠道构建（可选） |
| `USE_LOCAL_API=true` | 使用本地 API 服务进行联调 |
| `USE_BETA_API=true` | 使用 Beta API（按需启用） |

Release 构建必须配置完整的签名信息，否则 Gradle 会主动失败。可以通过环境变量或 `android/gradle.properties`（仅限本机、不要提交）提供：

```text
CHATBOX_ANDROID_KEYSTORE=绝对路径/签名文件.jks
CHATBOX_ANDROID_STORE_PASSWORD=...
CHATBOX_ANDROID_KEY_ALIAS=...
CHATBOX_ANDROID_KEY_PASSWORD=...
```

仓库已通过 `.gitignore` 忽略 `*.jks`、`*.keystore`、`keystore.properties` 和 `android/local.properties`。不要把 API Key、签名密码或其他凭据写进源码、README 或提交记录。

## 项目结构

```text
.
├─ android/                 # Capacitor Android 原生工程
│  ├─ app/                  # 应用模块、Manifest、自定义 SecureStorage 插件
│  └─ gradle/               # Gradle Wrapper
├─ src/
│  ├─ renderer/             # React UI、路由、移动端平台适配
│  │  └─ platform/          # desktop / web / mobile 平台实现
│  ├─ shared/               # 模型、Provider、类型和跨平台工具
│  ├─ main/                 # Electron 主进程（Android 不启动）
│  └─ preload/              # Electron preload（Android 不启动）
├─ resources/               # Capacitor 图标和启动图源文件
├─ docs/                    # 产品、技术和开发文档
├─ release/app/             # Electron 运行时依赖与桌面构建目录
├─ patches/                 # pnpm 依赖补丁
├─ capacitor.config.ts     # Capacitor 配置，webDir 指向 renderer 产物
└─ package.json             # 脚本、依赖和版本约束
```

Android 构建链路如下：

```text
src/renderer + src/shared
        │ electron-vite build
        ▼
release/app/dist/renderer
        │ npx cap sync android
        ▼
android/app/src/main/assets/public
        │ Gradle / Android Studio
        ▼
APK
```

`node_modules/`、`release/app/dist/`、`android/app/build/` 等目录都是生成物，不要直接修改。修改 UI 或共享逻辑后，重新执行 `pnpm run mobile:sync:android` 才会进入 APK。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [`docs/technical/build-and-deployment.md`](docs/technical/build-and-deployment.md) | 构建工具链、移动端构建和发布背景 |
| [`docs/storage.md`](docs/storage.md) | SQLite、IndexedDB 与配置迁移策略 |
| [`docs/technical/ai-providers.md`](docs/technical/ai-providers.md) | Provider 注册表、模型能力和鉴权逻辑 |
| [`docs/technical/session-management.md`](docs/technical/session-management.md) | 会话、线程和消息分叉 |
| [`docs/technical/data-backup.md`](docs/technical/data-backup.md) | 数据备份、导入导出和恢复限制 |
| [`docs/technical/tools-and-integrations.md`](docs/technical/tools-and-integrations.md) | Web Search、MCP 与平台能力边界 |
| [`docs/testing.md`](docs/testing.md) | Vitest、集成测试和测试约定 |
| [`docs/technical/index.md`](docs/technical/index.md) | 技术文档总目录 |

文档应优先描述当前实现。涉及平台行为、构建命令或版本约束的代码变更，需要同步更新 README 和对应技术文档。

## 排查问题

### `SDK location not found`

在 Android Studio 的 SDK Manager 安装 Android 35，然后打开 `android/` 工程让 IDE 生成 `local.properties`。也可以确认 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 指向正确 SDK。不要复制其他开发机的 `local.properties`。

### `Unsupported class file major version` 或 Gradle JDK 错误

将 `JAVA_HOME` 和 Android Studio 的 Gradle JDK 都设置为 **JDK 21**，再重新运行 `pnpm run mobile:sync:android`。不要设置为 JDK 17：app 模块和大多数 Capacitor 插件模块声明了 Java 21 编译工具链（`@capacitor/filesystem` 直接请求 Java 21 编译器），仅装 JDK 17 时会在 `:capacitor-filesystem:compileDebugJavaWithJavac` 处必然失败。

### Android 页面仍是旧版本

先确认 renderer 已重新构建，再执行 `pnpm run mobile:sync:android`。只运行 Gradle 不会自动更新 `release/app/dist/renderer`。

### 真机无法安装或调试

确认设备已开启开发者选项和 USB 调试，并执行 `adb devices` 查看设备状态。首次连接需要在设备上确认 RSA 授权；也可以先用 Android Studio 的模拟器验证构建链路。

### Release 构建提示缺少签名配置

这是预期的保护行为。补齐上文四个 `CHATBOX_ANDROID_*` 参数后再执行 Release 任务，不要为了绕过错误而把签名信息写入仓库。

## 贡献约定

提交前至少运行：

```bash
pnpm run check
pnpm run lint
pnpm run test
```

涉及 Android 原生代码、Capacitor 插件、存储或文件导出的改动，还应在 Android 模拟器或真机上完成一次手工回归。当前阶段请将问题和改动聚焦在 Android；iOS 相关任务暂缓。

## 许可证

项目许可证见 [`LICENSE`](LICENSE)。
