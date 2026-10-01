# AIbox mobile — 安卓本地构建环境说明（供 Codex 参考）

> 本文档记录了从「Codex 老是沙箱超时」到「本地成功出包并安装到模拟器」的完整排查结论与可用流程。
> 核心结论：**不要用 Codex 自带的工具沙箱执行构建**，改用普通 PowerShell 终端，按第四节流程构建。

---

## 一、项目背景

- 项目：Capacitor Android 应用 + electron-vite 共享渲染层。
- 根目录：`C:\Users\LTY\Desktop\AIbox mobile`
- 构建目标：`android\app\build\outputs\apk\debug\app-debug.apk`

---

## 二、原始问题与根因（分层）

### 1. Codex 工具沙箱实际是 workspace-write + 禁网（不是配置写的那样）
- 配置里写了 `sandbox_mode = "danger-full-access"`、`[windows] sandbox = "elevated"`、项目 `trusted`，但**当前工具会话实际以 `workspace-write` 运行**，只允许访问工作区范围，且禁止网络。
- 表现：
  - `pnpm` 访问 npm registry：`GET https://registry.npmjs.org/... error (EACCES)`（网络被禁）
  - esbuild/Vite：`Cannot read directory "../..": Access is denied`（文件越界被拒）
  - 长命令 `command timed out after 120s`（被杀）
- 提权到 full-access 的请求失败：审批服务返回了模型不支持的 404。
- **结论：修改项目代码无法解决以上问题，必须在普通终端构建。**

### 2. Java 缺失（但项目内有 JDK 21）
- 系统 `JAVA_HOME` 为空、PATH 无 `java`、机器上没有 Android Studio / 全局 JDK。
- 构建工具目录内已有 JDK 21：`C:\\Users\\LTY\\Desktop\\chatbox-build-tools\\OpenJDK21U-jdk_x64_windows_hotspot_21.0.6_7\\jdk-21.0.6+7`（Temurin 21.0.6+7，满足 `capacitor.build.gradle` 的 `JavaVersion.VERSION_21`）。

### 3. Node 版本不符（已于 2026-08-30 解决）
- 原状态：`engines.node` 要求 `>=22.13.0 <23.0.0`（Node 22），与系统默认 node v24.x 冲突，当时需临时改用 `C:\Users\LTY\Desktop\chatbox-build-tools\node-v22.14.0-win-x64\node.exe`。
- 现状态：工程已迁移到 Node 24（`engines.node` = `>=24.15.0 <25.0.0`，`.node-version` = `v24.15.0`，CI 也是 24），系统 node v24.15.0 即为正确版本，无需再切换 PATH；`.npmrc` 开启了 `engine-strict=true`，node 22 会直接安装失败。

### 4. 依赖装不完整
- `pnpm install` 曾因沙箱禁网 + 120s 超时被打断，导致 `electron-vite` 等 bin 缺失、`.pnpm-store` 链接悬空。
- 在普通终端重跑 `pnpm install --frozen-lockfile` 后已修复。

### 5. Gradle 两个问题（都已解决/可忽略）
- **native 缓存坏**：`Failed to load native library 'native-platform.dll'` → 删除 gradle 用户目录下的 `native` 缓存后重试即可。
- **problems-report.html 冲突**：`java.nio.file.FileAlreadyExistsException` 是 Gradle 8.11 在 Windows 的已知 bug，发生在 assembleDebug 完成之后的「生成 HTML 问题报告」阶段，**不影响 APK 生成**。构建前清理 `.gradle-local\.tmp\problems-report*.html` 和 `build\reports` 可消除该报错。

---

## 三、关键工具路径与版本（已验证）

| 工具 | 版本 | 路径 |
|---|---|---|
| Node（正确版本） | v24.15.0 | 系统 node（`C:\Program Files\nodejs\node.exe`）；旧 node 22.14 已不需要 |
| pnpm | 10.33.0（= packageManager） | `C:\Users\LTY\AppData\Roaming\npm\pnpm.cmd` |
| JDK | 21.0.6+7 (Temurin LTS) | `C:\Users\LTY\Desktop\chatbox-build-tools\OpenJDK21U-jdk_x64_windows_hotspot_21.0.6_7\jdk-21.0.6+7` |
| Gradle | 8.11.1（AGP 8.7.2 要求 8.9–8.11） | `C:\Users\LTY\Desktop\chatbox-build-tools\gradle-8.11.1-bin\gradle-8.11.1\bin\gradle.bat` |
| Android SDK | — | `C:\Users\LTY\AppData\Local\Android\Sdk`（`android\local.properties` 已指向它） |
| Gradle 用户目录 | — | `C:\Users\LTY\Desktop\AIbox mobile\android\.gradle-local` |
| npm registry | — | `https://registry.npmjs.org/`（node 可正常访问，慢时可用 `registry.npmmirror.com`） |
| Release 签名 | RSA 4096，别名 `aibox-release`，有效期 30 年 | keystore：`C:\Users\LTY\.aibox-signing\aibox-release.keystore`；四个 `CHATBOX_ANDROID_*` 属性在 `android\.gradle-local\gradle.properties`（gitignored，随下方 `GRADLE_USER_HOME` 自动加载） |

> **应用身份已统一（2026-08-23）**：`applicationId`/Capacitor `appId` = `com.aibox.mobile`，`versionName` `0.0.4`，`versionCode` `4`（与根 `package.json` 一致）；`namespace` 仍为 `xyz.chatboxapp.chatbox`（内部包名，勿混淆）。旧包 `xyz.chatboxapp.chatbox.debug` 在设备上是另一个应用，不会被覆盖安装。

> **JDK 只保留一份（2026-08-23 清理）**：`C:\Users\LTY\Desktop\chatbox-build-tools` 内同时存放构建工具与 JDK；实际使用上表的 JDK 21，`JAVA_HOME` 固定指向它。工程要求 Java 21 编译工具链（app 模块及多数 Capacitor 插件为 `VERSION_21`，`@capacitor/filesystem` 直接请求 Java 21 编译器；README 与 AGENTS.md 已同步修正），**不要再引入 JDK 17**。

---

## 四、可用的本地构建流程（普通 PowerShell 完整命令）

```powershell
# 0. 解决 pnpm.ps1 被执行策略拦截（Restricted）
Set-ExecutionPolicy -Scope Process Bypass

# 1. 环境变量（系统 node v24.15.0 已满足 engines，无需再 prepend node 22）
$env:JAVA_HOME = 'C:\Users\LTY\Desktop\chatbox-build-tools\OpenJDK21U-jdk_x64_windows_hotspot_21.0.6_7\jdk-21.0.6+7'
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
$env:GRADLE_USER_HOME = 'C:\Users\LTY\Desktop\AIbox mobile\android\.gradle-local'

# 必须：把临时目录指到工作区内，否则 mobile:sync:android 必定失败（见第五节第 6 条）
$env:TEMP = 'C:\Users\LTY\Desktop\AIbox mobile\.tmp-esbuild'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

# 2. 依赖（首次 / 依赖变更时）
cd 'C:\Users\LTY\Desktop\AIbox mobile'
pnpm install --frozen-lockfile

# 3. 构建前端 + 同步 Capacitor android（electron-vite build + npx cap sync android）
pnpm run mobile:sync:android

# 4. 打包 APK（用本地 Gradle，不下载）
cd 'C:\Users\LTY\Desktop\AIbox mobile\android'
Remove-Item -Recurse -Force '.\build\reports' -ErrorAction SilentlyContinue
Remove-Item '..\.gradle-local\.tmp\problems-report*.html' -Force -ErrorAction SilentlyContinue
& 'C:\Users\LTY\Desktop\chatbox-build-tools\gradle-8.11.1-bin\gradle-8.11.1\bin\gradle.bat' assembleDebug --no-daemon

# 4b.（可选）Release 签名包：签名属性已在 .gradle-local\gradle.properties，
#     前提是第 1 步设置了 GRADLE_USER_HOME（否则 Gradle 读不到，fail-closed 报错属预期）
& 'C:\Users\LTY\Desktop\chatbox-build-tools\gradle-8.11.1-bin\gradle-8.11.1\bin\gradle.bat' assembleRelease --no-daemon
# 产物：app\build\outputs\apk\release\app-release.apk

# 5. 安装到模拟器（emulator-5554）
& 'C:\Users\LTY\AppData\Local\Android\Sdk\platform-tools\adb.exe' install -r '.\app\build\outputs\apk\debug\app-debug.apk'
```

---

## 五、已知坑与规避

1. **pnpm 命令被 PowerShell 执行策略挡**（`pnpm.ps1 cannot be loaded`）：用 `Set-ExecutionPolicy -Scope Process Bypass` 或改用 `pnpm.cmd`。
2. **Gradle problems-report.html 报 `FileAlreadyExistsException`**：不影响 APK（APK 在那之前已生成）；构建前清理 `.gradle-local\.tmp\problems-report*.html` 与 `build\reports` 可消除。
3. **Gradle native 缓存坏**（`Failed to load native-platform.dll`）：删除 gradle 用户目录的 `native` 缓存（`.gradle-local\native` 或 `%USERPROFILE%\.gradle\native`）后重试。
4. **依赖慢**：可在 `.npmrc` 加 `registry=https://registry.npmmirror.com`（注意与 `--frozen-lockfile` 偶有 resolved URL 不一致，若报错则去掉镜像）。
5. **构建必须用 node 24.15+**（2026-08-30 起 `engines` 要求 `>=24.15.0 <25.0.0`，且 `.npmrc` 的 `engine-strict=true` 会让 node 22 直接安装失败）；切换过 node 大版本后，重跑一次 `pnpm install --frozen-lockfile`。
6. **esbuild 无法在系统 `%TEMP%` 下清理临时文件**（2026-10-01 定位，必现，重试无效）：
   - 现象：`pnpm run mobile:sync:android` 报
     `error during build: [vite:define] remove C:\Users\LTY\AppData\Local\Temp\esbuild-<64位hex>: Access is denied.`，
     并附带 `file: .../pdfjs-dist/legacy/build/pdf.worker.mjs`。
   - 真实原因：esbuild 会把该 2,360,132 字节的 worker 载荷先写成系统临时文件再删除，删除在系统 `%TEMP%` 下被拒。
     每次失败都会留下一个**正好 2,360,132 字节**的孤儿文件（曾在 7 小时内累积 12 个，共 27 MB）。
   - **不是文件锁**：事后立刻手动删除这些孤儿文件是成功的，说明没有句柄占用。
   - **也不是「临时问题」**：孤儿文件逐次累积，证明每一次重试都失败，不要指望重启或重试能解决。
   - 规避：按第四节第 1 步把 `TEMP`/`TMP`/`TMPDIR` 指向工作区内目录（如 `.tmp-esbuild`），构建即通过。

---

## 六、最终产物

- APK：`C:\Users\LTY\Desktop\AIbox mobile\android\app\build\outputs\apk\debug\app-debug.apk`（约 49.78 MB）
- 已通过 `adb install -r` 成功安装到模拟器 `emulator-5554`。

---

## 七、一句话总结

Codex 自带的工具沙箱（workspace-write + 禁网）无法完成这个 Capacitor Android 项目的安装/构建；正确做法是在普通终端用「系统 node 24.15 + 项目内 JDK 21 与 Gradle 8.11.1 + 本地 Gradle home」按第四节命令构建，即可稳定出包并安装。
