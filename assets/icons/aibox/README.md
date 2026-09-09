# AIbox Mobile · 应用图标 · 方案 C 星轨中枢 Orbit Core

## 创意与定位

方案 C 用 **原子 / 星系** 语言,把 AIbox Mobile「多模型围绕你的工作区运转」翻译成一个一眼可读的图像:

1. **发光内核** — 圆心白热光源,代表 AIbox 工作区核心(本地会话、数据、设置),是整套图标的绝对焦点。
2. **三条渐变轨道** — 围绕内核交叉成原子轮廓的三条椭圆轨道,沿长轴方向做品牌紫 → 桥接蓝 → 电光青的连续渐变,代表三家(及以上)模型服务并行接入。
3. **三颗卫星** — 轨道上的实心圆点(紫/蓝/青),代表已连接的模型节点,暗示多模型持续运转的状态。

整图置于深空圆角方块之内,配以稀疏星点;浅色版降低饱和、加深描边,在白底应用场景同样清晰。整套视觉保持与方案 A / B 共享的品牌 DNA(紫蓝青连续光谱),通过更结构化的几何传达「多模型中枢站」的产品心智。

## 配色

| 角色 | Hex | 说明 |
| --- | --- | --- |
| 内核白 Core White | `#FFFFFF` | 内核高光焦点 |
| 电光青 Electric Cyan | `#22D3EE` | 浅版内核外缘 / 主轨终点 |
| 桥接蓝 Bridge Blue | `#4E7BFF` | 主轨中段 / 蓝色卫星 |
| 品牌紫 Brand Violet | `#7A5CFF` | 亮紫 / 轨道起点 / 紫色卫星 |
| 深空底 Deep Base | `#0A0E1F` | 深色板底 / 自适应背景 |
| 浅空底 Pale Base | `#F5F7FC` | 浅色板底 |

浅色版与 macOS 自适应背景会使用 `6A48F5 / 3B63F0 / 0B9BD1` 加深变体,保证浅底对比。

## 构图

- **关键线**:1024 × 1024 矢量母版
- **圆角**:232 px(22.7%,跨平台中性)
- **轨道**:三条椭圆 rx 340 / ry 126,围绕中心旋转 0° / 60° / 120°,主描边 26 px + 外发光描边 60 px @ 0.14
- **内核**:半径 110 px,径向高光在 38%/34%,三层外发光(195/150/110)
- **卫星**:半径 34 px,三点分布在三轨极端 — (852, 512) 蓝 / (342, 218) 紫 / (342, 806) 青
- **自适应安全圈**:标记层缩放 1.07,占源画布 ~77%,经缩放后落在 66% 安全圈内
- **星点场**:34 颗(深色)/ 16 颗(背景),种子随机,排除中心 270 / 400 半径

## 多平台适配

### Android(5 个 mipmap 密度)
- `ic_launcher.png` 完整启动图标
- `ic_launcher_round.png` 圆形启动图标
- `ic_launcher_foreground.png` Android 8.0+ 自适应前景(标记层,缩放至 66% 安全圈)
- `ic_launcher_background.png` Android 8.0+ 自适应背景(深空渐变方块 + 外域星点)

### iOS
- `AppIcon-1024.png` App Store 上传规格,1024×1024,无 alpha

### Windows
- `app.ico` 多尺寸(16, 20, 24, 32, 40, 48, 64, 128, 256),适用于任务栏 / 桌面 / 资源管理器

### macOS
- `macos/icon_{16,32,64,128,256,512,1024}.png` + `@2x` 共 18 张
- `macos/Contents.json` Asset Catalog 元数据,可直接放入 `Assets.xcassets/AppIcon.appiconset/`
- 需要 `.icns` 时,在 macOS 上执行:`iconutil -c icns macos -o app.icns`

### 矢量母版
- `svg/icon-foreground.svg` 标记层(透明)
- `svg/icon-background.svg` 渐变背景 + 外域星点(适配 Android 8.0+ 自适应图层)
- `svg/icon-transparent.svg` 透明前景(可叠加任意背景)
- `svg/icon-light.svg` 浅色场景完整图标(柔光描边)
- `svg/icon-dark.svg` 深色场景完整图标(高光环 + 品牌辉光)

## 资源结构

```
aibox/
  master/
    master_light.png      # 1024 矢量母版(浅色描边)
    master_dark.png       # 1024 矢量母版(深色描边)
    master_fg.png         # 1024 标记层(透明)
    master_bg.png         # 1024 渐变背景 + 外域星点
  transparent/16…1024.png  # 主图标透明版
  light/16…1024.png        # 浅色底适配版(含柔投影)
  dark/16…1024.png         # 深色底适配版(含品牌色辉光)
  android/mipmap-*/        # Android 5 个密度
  ios/AppIcon-1024.png
  windows/app.ico
  macos/                   # macOS 图标集 + Contents.json
  _archive-v1/             # 方案 A 扁平双气泡
  _archive-v2/             # 方案 B 棱芯立方
  preview.html             # 本地图标预览页
  build_assets.py          # 本管线脚本
```

## 沿革

- **方案 A · 扁平双气泡**(_archive-v1) — 对话 + 错位双气泡 + 四角星芒,友好轻量。
- **方案 B · 棱芯立方**(_archive-v2) — 等距立方体三面 + 顶面发光内核 + 暖光金星芒,强调「装 AI 的盒子」。
- **方案 C · 星轨中枢**(当前) — 原子/星系隐喻,强调「多模型围绕你运转」。当前生效。

## 复现

1. 将四个 1024 母版放入 `master/`(当前版本已包含星轨中枢)
2. 运行 `python build_assets.py`
