"""AIbox Mobile 应用图标资源构建管线。

基于版本化 master/ 中的四个 1024 PNG 母版,生成全平台多尺寸图标资源。
"""
from pathlib import Path
from PIL import Image, ImageFilter

# 交付目录
ROOT = Path(r"C:/Users/LTY/Desktop/AIbox mobile/assets/icons/aibox")

# 母版来源(与交付目录一起版本化，避免依赖机器上的临时导出目录)
SRC_M_LIGHT = ROOT / "master/master_light.png"
SRC_M_DARK = ROOT / "master/master_dark.png"
SRC_M_FG = ROOT / "master/master_fg.png"
SRC_M_BG = ROOT / "master/master_bg.png"

# 多尺寸清单
SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024]

# Android 密度 (启动器尺寸, 自适应前景尺寸)
ANDROID = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}


def ensure(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def make_tile_light(master: Image.Image, size: int) -> Image.Image:
    """浅色底:白底 + 图标 + 柔和投影。"""
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    icon_size = int(size * 0.84)
    icon = master.resize((icon_size, icon_size), Image.LANCZOS)
    sx, sy = (size - icon_size) // 2, (size - icon_size) // 2
    # 投影:同位置偏移,模糊
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow.paste(icon, (sx, sy + max(1, size // 64)), icon)
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1.0, size * 0.014)))
    # 暗化阴影
    shadow = shadow.point(lambda p: int(p * 0.22))
    canvas.paste(shadow, (0, 0), shadow)
    canvas.paste(icon, (sx, sy), icon)
    return canvas


def make_tile_dark(master: Image.Image, size: int) -> Image.Image:
    """深色底:深空底 + 图标 + 品牌色辉光。"""
    canvas = Image.new("RGB", (size, size), (11, 13, 19))
    icon_size = int(size * 0.84)
    icon = master.resize((icon_size, icon_size), Image.LANCZOS)
    gx, gy = (size - icon_size) // 2, (size - icon_size) // 2
    # 辉光:图标 + 强模糊
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow.paste(icon, (gx, gy), icon)
    glow = glow.filter(ImageFilter.GaussianBlur(max(2.0, size * 0.035)))
    canvas.paste(glow, (0, 0), glow)
    canvas.paste(icon, (gx, gy), icon)
    return canvas


def build_adaptive_foreground(master_fg: Image.Image, target_size: int) -> Image.Image:
    """Android 8.0+ 自适应前景:标记层缩放到 66% 安全圈。"""
    # master_fg 内容已占 1024 的 ~78%
    content_frac = 0.66 / 0.78
    scaled = int(round(target_size * content_frac))
    src = master_fg.resize((scaled, scaled), Image.LANCZOS)
    canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    canvas.paste(src, ((target_size - scaled) // 2, (target_size - scaled) // 2), src)
    return canvas


def resize_to_sizes(master: Image.Image, sizes, folder: Path, prefix=""):
    ensure(folder)
    for s in sizes:
        out = master.resize((s, s), Image.LANCZOS)
        out.save(folder / f"{prefix}{s}.png", "PNG", optimize=True)


def build_android(master_full, master_fg, master_bg):
    base = ROOT / "android"
    ensure(base)
    for folder, (launcher_size, fg_size) in ANDROID.items():
        d = base / folder
        ensure(d)
        master_full.resize((launcher_size, launcher_size), Image.LANCZOS).save(
            d / "ic_launcher.png", "PNG", optimize=True)
        master_full.resize((launcher_size, launcher_size), Image.LANCZOS).save(
            d / "ic_launcher_round.png", "PNG", optimize=True)
        fg = build_adaptive_foreground(master_fg, fg_size)
        fg.save(d / "ic_launcher_foreground.png", "PNG", optimize=True)
        master_bg.resize((fg_size, fg_size), Image.LANCZOS).save(
            d / "ic_launcher_background.png", "PNG", optimize=True)
        print(f"   {folder:<16} launcher={launcher_size} fg={fg_size}")


def build_windows_ico(master):
    folder = ROOT / "windows"
    ensure(folder)
    icon_sizes = [(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 128, 256)]
    master.convert("RGBA").save(
        folder / "app.ico", format="ICO", sizes=icon_sizes)
    print(f"   app.ico sizes={[s for s,_ in icon_sizes]}")


def build_ios(master):
    folder = ROOT / "ios"
    ensure(folder)
    img = master.resize((1024, 1024), Image.LANCZOS)
    canvas = Image.new("RGB", (1024, 1024), (255, 255, 255))
    canvas.paste(img.convert("RGB"), mask=img.getchannel("A"))
    canvas.save(folder / "AppIcon-1024.png", "PNG", optimize=True)
    print("   AppIcon-1024.png (1024x1024)")


def build_macos(master):
    """macOS App Icon 多尺寸 PNG 集 + Contents.json(可直接拷入 *.appiconset)。"""
    import json
    folder = ROOT / "macos"
    ensure(folder)
    sizes = [16, 32, 64, 128, 256, 512, 1024]
    for s in sizes:
        master.resize((s, s), Image.LANCZOS).save(folder / f"icon_{s}.png", "PNG", optimize=True)
    twos = [(16, 32), (32, 64), (64, 128), (128, 256), (256, 512), (512, 1024)]
    for base, dbl in twos:
        master.resize((dbl, dbl), Image.LANCZOS).save(folder / f"icon_{base}@2x.png", "PNG", optimize=True)
    contents = {
        "images": [
            {"size": "16x16",   "idiom": "mac", "scale": "1x", "filename": "icon_16.png"},
            {"size": "16x16",   "idiom": "mac", "scale": "2x", "filename": "icon_16@2x.png"},
            {"size": "32x32",   "idiom": "mac", "scale": "1x", "filename": "icon_32.png"},
            {"size": "32x32",   "idiom": "mac", "scale": "2x", "filename": "icon_32@2x.png"},
            {"size": "64x64",   "idiom": "mac", "scale": "1x", "filename": "icon_64.png"},
            {"size": "64x64",   "idiom": "mac", "scale": "2x", "filename": "icon_64@2x.png"},
            {"size": "128x128", "idiom": "mac", "scale": "1x", "filename": "icon_128.png"},
            {"size": "128x128", "idiom": "mac", "scale": "2x", "filename": "icon_128@2x.png"},
            {"size": "256x256", "idiom": "mac", "scale": "1x", "filename": "icon_256.png"},
            {"size": "256x256", "idiom": "mac", "scale": "2x", "filename": "icon_256@2x.png"},
            {"size": "512x512", "idiom": "mac", "scale": "1x", "filename": "icon_512.png"},
            {"size": "512x512", "idiom": "mac", "scale": "2x", "filename": "icon_512@2x.png"},
        ],
        "info": {"version": 1, "author": "xcode"},
    }
    (folder / "Contents.json").write_text(json.dumps(contents, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"   macos/  1x:{sizes} + 2x:{[b for b,_ in twos]}")


def write_readme():
    text = """# AIbox Mobile · 应用图标 · 方案 C 星轨中枢 Orbit Core

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
"""
    (ROOT / "README.md").write_text(text, encoding="utf-8")




def write_preview_html():
    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>AIbox Mobile · 应用图标预览</title>
<style>
  :root { --bg:#0B0D13; --ink:#FFFFFF; --mute:#A9B2C6; --accent:#22D3EE; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 -apple-system, "Segoe UI", "PingFang SC", sans-serif; background:var(--bg); color:var(--ink); padding:48px; }
  h1 { font-size:40px; font-weight:700; margin:0 0 8px; }
  h2 { font-size:22px; margin:48px 0 16px; color:var(--accent); font-weight:600; }
  .sub { color:var(--mute); margin-bottom:32px; }
  .row { display:flex; gap:24px; align-items:flex-end; flex-wrap:wrap; padding:32px; border-radius:16px; }
  .row.light { background:#FFFFFF; }
  .row.dark  { background:#141827; border:1px solid #262C3D; }
  .item { display:flex; flex-direction:column; align-items:center; gap:8px; }
  .item span { font-size:11px; color:var(--mute); }
  .row.light .item span { color:#5A6472; }
  img.pixelated { image-rendering: pixelated; image-rendering: crisp-edges; }
</style>
</head>
<body>
  <h1>AIbox Mobile · 应用图标预览</h1>
  <p class="sub">浅色 / 深色双适配 · 16 → 512 px 全尺寸一览</p>

  <h2>浅色背景 · 桌面与浅色应用场景</h2>
  <div class="row light" id="light"></div>

  <h2>深色背景 · 深色模式与系统托盘</h2>
  <div class="row dark" id="dark"></div>

<script>
const sizes = [16,20,24,32,40,48,64,96,128,192,256,512];
function build(container, base){
  sizes.forEach(function(s){
    var it = document.createElement('div'); it.className = 'item';
    var img = document.createElement('img');
    img.src = base + s + '.png';
    img.width = s; img.height = s;
    if (s <= 32) img.classList.add('pixelated');
    var cap = document.createElement('span');
    cap.textContent = s + 'px';
    it.appendChild(img); it.appendChild(cap);
    container.appendChild(it);
  });
}
build(document.getElementById('light'), 'light/');
build(document.getElementById('dark'),  'dark/');
</script>
</body>
</html>
"""
    (ROOT / "preview.html").write_text(html, encoding="utf-8")


def main():
    ensure(ROOT)
    print(">> 加载母版")
    master_light = Image.open(SRC_M_LIGHT).convert("RGBA")
    master_dark = Image.open(SRC_M_DARK).convert("RGBA")
    master_fg = Image.open(SRC_M_FG).convert("RGBA")
    master_bg = Image.open(SRC_M_BG).convert("RGBA")
    print(f"   master_light  {master_light.size}")
    print(f"   master_dark   {master_dark.size}")
    print(f"   master_fg     {master_fg.size}")
    print(f"   master_bg     {master_bg.size}")

    print(">> 保存母版到 deliverable/master/")
    master_dir = ROOT / "master"
    ensure(master_dir)
    master_light.save(master_dir / "master_light.png", "PNG", optimize=True)
    master_dark.save(master_dir / "master_dark.png", "PNG", optimize=True)
    master_fg.save(master_dir / "master_fg.png", "PNG", optimize=True)
    master_bg.save(master_dir / "master_bg.png", "PNG", optimize=True)

    print(">> transparent主图 (12 尺寸)")
    resize_to_sizes(master_light, SIZES, ROOT / "transparent")

    print(">> 浅色底 tile (12 尺寸)")
    light_dir = ROOT / "light"
    ensure(light_dir)
    for s in SIZES:
        make_tile_light(master_light, s).save(light_dir / f"{s}.png", "PNG", optimize=True)

    print(">> 深色底 tile (12 尺寸)")
    dark_dir = ROOT / "dark"
    ensure(dark_dir)
    for s in SIZES:
        make_tile_dark(master_dark, s).save(dark_dir / f"{s}.png", "PNG", optimize=True)

    print(">> Android mipmaps")
    build_android(master_light, master_fg, master_bg)

    print(">> Windows ICO")
    build_windows_ico(master_light)

    print(">> iOS AppIcon")
    build_ios(master_light)

    print(">> macOS App Icon 集")
    build_macos(master_light)

    print(">> 文档 & 预览")
    write_readme()
    write_preview_html()

    # 列出最终结构
    print("\n>> 交付结构:")
    for p in sorted(ROOT.rglob("*")):
        if p.is_file():
            print(f"   {p.relative_to(ROOT)}  ({p.stat().st_size//1024} KB)")


if __name__ == "__main__":
    main()
