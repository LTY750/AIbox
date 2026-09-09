# AIbox Mobile · 应用图标交付总览（方案 C · 星轨中枢）

> 本次更新：2026-09-06 · 方案 C 星轨中枢 Orbit Core（v3）
> 项目路径：`assets/icons/aibox/`
> 画板：Ardot fileId `722818268693036`（https://ardot.tencent.com/file/722818268693036）
> 本地预览：`http://127.0.0.1:8765/preview.html`

## 三个方案沿革

| 版本 | 名称 | 视觉语法 | 定位 | 状态 |
| --- | --- | --- | --- | --- |
| **方案 A** | 扁平双气泡 | 圆角方块 + 错位双气泡 + 四角星芒 | 友好、对话向 | `_archive-v1/` |
| **方案 B** | 棱芯立方 | 等距立方体三面 + 顶面发光内核 + 暖光金星芒 | 结构、装 AI 的盒子 | `_archive-v2/` |
| **方案 C** | **星轨中枢** | **原子/星系：发光内核 + 三条渐变轨道 + 三颗卫星** | **多模型围绕你的工作区运转** | **当前生效** |

三套共享品牌 DNA（紫蓝青连续光谱），通过完全不同的视觉语法区分形态：
- A = 平面 / 对话
- B = 立体 / 结构
- C = 空间 / 系统

## 方案 C 创意

把 AIbox Mobile「多模型围绕你的工作区运转」翻译成一个一眼可读的图像：

| 元素 | 角色 | 含义 |
| --- | --- | --- |
| 发光内核 | 圆心白热光源 | AIbox 工作区核心（本地会话、数据、设置） |
| 三条渐变轨道 | 围绕内核交叉成原子轮廓的椭圆轨道 | 多模型并行接入，紫→蓝→青连续光谱 |
| 三颗卫星 | 轨道上的实心圆点 | 已连接的模型节点，持续运转 |

整图置于深空圆角方块（圆角 232 px / 22.7%）之内，配以稀疏星点；浅色版降低饱和、加深描边，在白底应用场景同样清晰。

## 配色

| 角色 | Hex | 说明 |
| --- | --- | --- |
| 内核白 Core White | `#FFFFFF` | 内核高光焦点 |
| 电光青 Electric Cyan | `#22D3EE` | 浅版内核外缘 / 主轨终点 / 青卫星 |
| 桥接蓝 Bridge Blue | `#4E7BFF` | 主轨中段 / 蓝卫星 |
| 品牌紫 Brand Violet | `#7A5CFF` | 亮紫 / 轨道起点 / 紫卫星 |
| 深空底 Deep Base | `#0A0E1F` | 深色板底 / 自适应背景 |
| 浅空底 Pale Base | `#F5F7FC` | 浅色板底 |

浅色版与 macOS 自适应背景使用加深变体 `6A48F5 / 3B63F0 / 0B9BD1` 保证浅底对比。

## 关键线几何

- 母版：`1024 × 1024` SVG（矢量）
- 圆角：232 px（22.7%，跨平台中性）
- 轨道：三条椭圆 `rx 340 / ry 126`，旋转 `0° / 60° / 120°`，主描边 26 px + 外发光描边 60 px @ 0.14
- 内核：`r 110`，径向高光在 `38% / 34%`，三层外发光（195/150/110）
- 卫星：`r 34`，三极分布：(852, 512) 蓝 / (342, 218) 紫 / (342, 806) 青
- 安全圈：标记层缩放 1.07，缩放后落在 66% 安全圈内
- 星点场：34 颗（深色）/ 16 颗（背景），种子随机

## 交付清单（~101 文件）

| 类别 | 路径 | 数量 | 说明 |
| --- | --- | --- | --- |
| 母版 | `master/master_{light,dark,fg,bg}.png` | 4 | 1024×1024 PNG 来源 |
| 矢量母版 | `svg/icon-{dark,light,foreground,background,transparent}.svg` | 5 | 内联渐变版，可缩放 |
| 主图透明版 | `transparent/{16,20,24,32,40,48,64,96,128,256,512,1024}.png` | 12 | 圆角透出的主图 |
| 浅色 tile | `light/{16…1024}.png` | 12 | 浅底 + 柔投影 |
| 深色 tile | `dark/{16…1024}.png` | 12 | 深底 + 品牌辉光 |
| Android | `android/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher{,_round,_foreground,_background}.png` | 20 | 5 密度 × 4 文件 |
| iOS | `ios/AppIcon-1024.png` | 1 | App Store 上传规格 |
| Windows | `windows/app.ico` | 1 | 9 尺寸（16→256） |
| macOS | `macos/icon_{16,32,64,128,256,512,1024}.png` + `@2x` ×6 | 13 | 完整 1x/2x |
| macOS 元数据 | `macos/Contents.json` | 1 | Asset Catalog |
| 文档 | `README.md` + `preview.html` | 2 | 方案 C 文案 + 本地预览 |
| 管线 | `build_assets.py` | 1 | Pillow 重生成脚本 |
| 归档 | `_archive-v1/{master,svg}` + `_archive-v2/{master,svg}` | 18 | 历史方案原始素材 |

合计约 **101 文件 / ≈ 3.6 MB**。

## 复现 / 切换方案

```bash
cd "C:/Users/LTY/Desktop/AIbox mobile/assets/icons/aibox"
"C:/Users/LTY/.workbuddy/binaries/python/envs/default/Scripts/python.exe" build_assets.py
# 1) 母版放入 master/
# 2) 跑脚本即可重新生成全部下游
```

切回旧方案：把对应 `_archive-vN/master/*.png` 拷回 `master/`，再跑脚本。

## 验证记录

- 1024 深色母版：深空底 + 渐变轨道 + 三卫星清晰可辨
- 1024 浅色母版：浅底 + 加深描边 + 柔光外缘，对比充分
- 128 px 浅色 tile：原子轮廓 + 内核焦点保留
- 64 px 深色 tile：仍呈"星系"剪影，内核为绝对焦点
- 192 px Android 启动器（xxxhdpi）：图标在系统桌面大小下完全清晰

## 后续建议

1. 在 Android 设备上实测 Android adaptive 图标在圆形 / 圆角矩形 / 水滴等掩膜下的最终呈现。
2. macOS 上执行 `iconutil -c icns macos -o app.icns` 生成原生 `.icns`。
3. 若决定全面切换为方案 C，可删除 `_archive-v1/` 和 `_archive-v2/` 释放体积。