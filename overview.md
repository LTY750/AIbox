# AIbox Mobile · 应用图标交付总览

**交付日期**：2026-09-05（v1.0 蓝紫气泡版 · 9-06 补 SVG 矢量母版与 macOS 资源）→ **2026-09-06（v2.0 棱芯立方版，已替换落地资产）**
**画布**：v1 `https://ardot.tencent.com/file/722633822405618` ｜ v2 `https://ardot.tencent.com/file/722813418884020`（方案 B 棱芯立方）

---

## v2.0 创意与定位（**当前主交付**）

切换语言到 **等距立体**：盒子被做成立方体，三个可见面承载三个层级的紫色调，顶面中央透出青色发光内核，顶部一缕暖光金 星芒。

| 元素 | 含义 |
| --- | --- |
| **等距立方体** | "装 AI 的盒子" — AIbox = 装 AI 的盒子 |
| **三面并行**（深紫 / 紫 / 青） | 多家 AI 服务商并行 = 项目核心能力 |
| **顶面发光内核** | AI 正在工作的瞬间 |
| **暖光金星芒** | 智能释放的标记（唯一暖色焦点） |

**配色**：`#0A0E1C` 深空底 → `#4A33B8` 深紫 → `#7A5CFF` 紫 → `#22D3EE` 青 → `#FFC53D` 暖光金。
**冷暖双色调**：冷色立方 + 暖色焦点，在小尺寸下保持辨识。

## v1.0 创意与定位（**已归档**）

AIbox 的图标设计围绕项目核心「**多模型接入的 Android AI 工作区**」展开，三个图形元素各承担一段产品语义：

| 元素 | 含义 |
| --- | --- |
| **圆角方块**（渐变容器） | "盒子 / 智能容器"，呼应「AIbox = 装 AI 的盒子」的产品名 |
| **错位双气泡**（后层深紫底 + 前层纯白） | "多模型对话 / 多会话"，对应项目接入多家 AI 服务商的核心能力 |
| **四角星芒**（右上角） | "AI 智能内核"，作为智能加持的视觉锚点 |

整套视觉建立在 Chatbox 共享渲染层的现代移动 UI 之上，遵循 Android edge-to-edge 与深/浅双主题适配。

## 配色（v2.0 棱芯立方）

| 角色 | Hex | 用途 |
| --- | --- | --- |
| 暖光金 Spark Amber | `#FFC53D` | 星芒 / 智能释放 |
| 电光青 Electric Cyan | `#22D3EE` | 顶面发光 / 板辉光 |
| 桥接蓝 Bridge Blue | `#4E7BFF` | 渐变中段（品牌色延续） |
| 品牌紫 Brand Violet | `#7A5CFF` | 右面 / 暗面亮调 |
| 深紫 Deep Violet | `#4A33B8` | 左面 / 暗面暗调 |
| 深空底 Deep Base | `#0A0E1C` | 板底 |

冷暖双色调：冷色立方 + 暖色焦点。立体语言让 AIbox 在众多扁平 AI 图标里更有手感。

## 构图（v2.0）

- **关键线**：1024 × 1024 矢量母版
- **圆角**：232 px（22.7%，跨平台中性）
- **立方体**：中心 (512, 566)，宽 512，高 592，占板心 50–58%
- **自适应安全区**：立方体缩至 66% 安全圈
- **星芒位置**：中轴上方 1 点钟方向，与立方体形成动态对角

## 已交付资产

全部落地到 `assets/icons/aibox/`：

```
master/                       # 4 个 1024 矢量母版(v2 棱芯立方)
  master_light.png              # 浅色描边版
  master_dark.png               # 深色描边版
  master_fg.png               # 透明标记层(Android 自适应前景)
  master_bg.png               # 渐变背景层(Android 自适应背景)

_archive-v1/                  # v1 蓝紫气泡版完整归档(master × 4 + svg × 5)

transparent/12 个尺寸         # 主图标透明版(16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024)
light/12 个尺寸                # 浅色底适配版(含柔投影)
dark/12 个尺寸                 # 深色底适配版(含品牌色辉光)

android/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
  ic_launcher.png             # 完整启动图标(5 个密度)
  ic_launcher_round.png       # 圆形启动图标
  ic_launcher_foreground.png  # Android 8.0+ 自适应前景(缩至 66% 安全圈)
  ic_launcher_background.png  # Android 8.0+ 自适应背景

ios/AppIcon-1024.png          # iOS App Store 上传规格
windows/app.ico               # Windows 多尺寸 .ico(16, 20, 24, 32, 40, 48, 64, 128, 256)
macos/                       # macOS App Icon 集 + Asset Catalog
  icon_{16,64,256,1024}.png            # 1x(7 尺寸)
  icon_{16,32,64,128,256,512}@2x.png   # 2x(6 尺寸)
  Contents.json               # Asset Catalog 元数据
svg/                         # v2 矢量母版(可缩放任意尺寸)
  icon-foreground.svg        # 立方体 + 星芒(Android 8.0+ 自适应前景)
  icon-background.svg        # 深空底板
  icon-transparent.svg        # 立方体 + 星芒(透明主图标)
  icon-light.svg              # 浅色场景完整版(含描边)
  icon-dark.svg               # 深色场景完整版(含辉光)

preview.html                  # 本地浏览器多尺寸预览页
README.md                     # 资产说明(已同步更新为 v2)
build_assets.py               # 构建管线脚本(已同步更新为 v2)
```

**总计**:84 个文件 / 2.8 MB(不含 _archive-v1)。

## 多平台覆盖

| 平台 | 入口 | 文件 |
| --- | --- | --- |
| Android 启动器 | 5 密度启动器图标 | `android/mipmap-*/ic_launcher.png` |
| Android 自适应 | 8.0+ 自适应图标 | `ic_launcher_foreground.png` + `ic_launcher_background.png` |
| iOS | App Store | `ios/AppIcon-1024.png` |
| macOS | 应用 / 启动台 / Dock | `macos/icon_*.png` + `Contents.json`（macOS 上 `iconutil` 打包 `.icns`） |
| Windows | 任务栏 / 桌面 / 资源管理器 | `windows/app.ico` |
| Web / Figma / Sketch | 任意尺寸 | `svg/icon-*.svg` 或 `master/*.png` |

## 版本切换

- **当前主交付**:v2.0 棱芯立方(已覆盖 `master/`、`svg/` 与所有派生资源)
- **v1.0 蓝紫气泡版** 完整归档于 `_archive-v1/`(含 4 个母版 + 5 个 SVG),可随时切换
- v1 与 v2 共用同一套 `build_assets.py`,仅需把 `_archive-v1/master_*.png` 拷回 `master/` 即可回滚
- 两版的 `svg/` 文件均已存档,分别位于根 `svg/` 与 `_archive-v1/svg/`

## 集成状态

1. **桌面与 Web**:`assets/`、`src/renderer/static/` 和 `src/renderer/favicon.ico` 已统一为 v2 棱芯立方。
2. **Android**:`resources/` 已作为 Capacitor 源资源,`android/app/src/main/res/` 通过 `pnpm run mobile:assets` 生成并补齐自适应前景/渐变背景图层。
3. **iOS**:当前不在交付范围内(按 AGENTS.md);保留 `assets/icons/aibox/ios/AppIcon-1024.png` 作为未来接入 Xcode 的源文件。

## 复现管线

```bash
# 已运行一次，产物已落盘；如需重新生成：
python "C:/Users/LTY/Desktop/AIbox mobile/assets/icons/aibox/build_assets.py"
```
