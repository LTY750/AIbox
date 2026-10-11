# AIbox Mobile 常规设置界面 UI 优化计划

> **版本**：v1.0  
> **日期**：2026-10-01  
> **状态**：设计方案  
> **目标平台**：Android（Capacitor WebView）

## 一、现状诊断

### 当前界面问题

通过分析现有截图和代码,识别出以下主要问题:

**1. 视觉层次不清晰**
现有界面使用了统一的灰色背景卡片,所有设置项都是相同的视觉权重。用户很难快速识别哪些是高频使用的功能,哪些是低频或高级功能。"显示设置"、"Interface"、"网络代理"、"Data" 在视觉上没有优先级区分。

**2. 信息密度与留白失衡**
- 顶部标题 "常规设置" 字体偏小,存在感弱
- 各个分组之间的间距不够明显,容易混淆为一个整体
- 每个设置项内部的图标、标签、值之间的间距过于均匀,缺乏节奏感
- 右侧箭头和值的摆放让整体看起来拥挤

**3. 交互反馈不足**
- 可点击的行项目和不可点击的信息展示在视觉上区别不明显
- "预设颜色" 的编辑按钮藏在右侧,不够明显
- 代理输入框直接暴露在设置列表中,与其他项目的交互模式不一致

**4. 色彩运用单调**
- 整体使用黑白灰,缺少品牌色的点缀
- 图标全部是单色,没有利用色彩来区分功能类别
- 选中状态和默认状态的视觉区别不够明显

**5. 字体排版缺乏层次**
- 标题、标签、说明文字的字重和大小差异不够明显
- 14px 的字体大小显示对于移动端来说偏小
- 中文显示使用系统字体,缺乏个性

## 二、设计原则与方向

基于 frontend-design skill 的指导,我们为这次优化确立以下原则:

### 核心原则

**1. 服务于使用场景,而非模板化设计**
设置页面是用户调整 AIbox Mobile 的行为和外观的地方。用户来到这里是为了完成具体的任务:改变语言、切换主题、调整字体大小、配置代理。设计应该让这些任务变得显而易见且容易完成,而不是展示一个通用的"设置页面模板"。

**2. 建立清晰的信息架构**
- 常用设置(显示、语言、主题)应该在第一屏,一目了然
- 中频设置(启动页、字体大小)应该易于访问但不占据主要空间
- 低频设置(代理、数据管理)应该存在但不干扰主流程

**3. 用视觉语言传递功能层级**
- 通过卡片的大小、颜色、阴影来区分重要性
- 用图标的色彩来暗示功能分类
- 用字体大小和字重来建立阅读节奏

**4. 移动优先,但不失克制**
- 触控区域要足够大(最小 44×44dp)
- 但不要为了"移动感"而过度放大、过度圆角
- 保持专业感和精致感

### 具体设计取向

**色彩策略**
- 主色调:保持浅色模式的奶白色背景(避免使用 AI 常见的 #F4F1EA)
- 强调色:使用 AIbox 的品牌色(需要从现有的 interfaceColors 中提取),避免使用常见的暖陶土色(#D97757)
- 功能色:为不同类别的设置使用不同的图标色彩
  - 显示类:紫色/蓝紫色
  - 交互类:绿色/青色
  - 系统类:橙色/琥珀色
  - 数据类:红色/粉色

**字体策略**
- 标题:使用 16-18px,字重 600
- 主标签:使用 14-15px,字重 500
- 副标签/说明:使用 13px,字重 400,降低透明度
- 数值:使用 14px,字重 400,但使用更醒目的颜色

**布局策略**
- 使用 "卡片内卡片" 的层次结构
- 外层卡片定义功能组
- 内层使用更轻的分隔线和背景色来区分项目
- 关键操作(如字体大小调整)给予独立的卡片空间

## 三、详细优化方案

### 3.1 页面整体结构

```
┌─────────────────────────────────────┐
│  ← 常规设置                [搜索图标] │ 
├─────────────────────────────────────┤
│                                     │
│  ┌─ 显示与外观 ───────────────────┐ │  ← 大卡片,带色彩强调
│  │  🌍 语言         简体中文    ›  │ │
│  │  ─────────────────────────────  │ │
│  │  🎨 字体         系统字体    ›  │ │
│  │  ─────────────────────────────  │ │
│  │  🌓 主题         浅色模式    ›  │ │
│  │  ─────────────────────────────  │ │
│  │  🎨 配色方案      默认       ›  │ │
│  └─────────────────────────────────┘ │
│                                     │
│  ┌─ 字体大小 ──────────────────────┐ │  ← 独立卡片,强调重要性
│  │   Aa                            │ │
│  │   ●━━━━━━●━━━━━━━━━━━         │ │
│  │   14px                          │ │
│  └─────────────────────────────────┘ │
│                                     │
│  ┌─ 应用行为 ──────────────────────┐ │
│  │  🏠 启动页       ◉ 主页  ○ 上次 │ │
│  │  ─────────────────────────────  │ │
│  │  📳 触觉反馈              [ON]  │ │
│  └─────────────────────────────────┘ │
│                                     │
│  ┌─ 网络 ─────────────────────────┐ │
│  │  🌐 代理          未配置     ›  │ │
│  └─────────────────────────────────┘ │
│                                     │
│  ┌─ 数据与存储 ────────────────────┐ │
│  │  💾 数据管理                 ›  │ │
│  │     恢复、备份与诊断日志          │ │
│  └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### 3.2 具体优化项

#### A. 页面头部

**现状**: 标题居中,字体偏小,无法传达重要性

**优化**:
- 标题 "常规设置" 左对齐,字号提升到 20px,字重 600
- 添加返回按钮(如果是从其他页面进入)
- 考虑添加搜索按钮(用于未来快速定位设置项)
- 页面顶部留出更多空间(从当前的 sm 提升到 md)

```tsx
<Box component="header" className="settings-header" p="md" pb="sm">
  <Flex align="center" gap="sm">
    <ActionIcon variant="subtle" size="lg">
      <IconChevronLeft size={20} />
    </ActionIcon>
    <Title order={2} size="h3" fw={600}>
      常规设置
    </Title>
  </Flex>
</Box>
```

#### B. 显示与外观组

**现状**: 使用灰色小标题 "Display Settings",内部项目视觉上分离不明显

**优化**:
1. **组标题优化**
   - 保留 "显示设置" 但改用图标+文字的形式
   - 字号 14px → 15px,字重 500 → 600
   - 添加装饰性的色彩线条或图标

2. **卡片层级**
   - 外层使用带轻微阴影的白色卡片
   - 内部项目使用细分隔线而非独立小卡片
   - 鼠标悬停/点击时整行高亮,而不只是文字

3. **图标优化**
   - 为每个图标添加色彩(使用品牌色的不同色调)
   - 语言:蓝色 🌍
   - 字体:紫色 📝
   - 主题:琥珀色 🌓
   - 配色:粉色 🎨

4. **右侧值的展示**
   - 当前值使用更明显的颜色(不是 tertiary gray)
   - 箭头图标与值之间留出更多空间
   - 考虑使用徽章样式来展示当前选中的值

```tsx
<MobileSettingGroup
  icon={<IconPalette size={20} stroke={1.5} />}
  title={t('Display & Appearance')}
  accentColor="purple"
  className="settings-group--primary"
>
  <MobileSelectRow
    icon={<IconWorld size={18} color="var(--mantine-color-blue-6)" />}
    label={t('Language')}
    value={languageNameMap[settings.language]}
    badge
  >
    <AdaptiveSelect ... />
  </MobileSelectRow>
  {/* ... 其他项目 */}
</MobileSettingGroup>
```

#### C. 字体大小独立卡片

**现状**: 字体大小链接到一个独立页面,在主页面只显示当前值

**优化**:
1. **提升视觉重要性**
   - 给予独立的卡片,而不是放在 Interface 组内
   - 使用大号的 "Aa" 示例文字
   - 滑块使用品牌色强调

2. **即时预览**
   - 保留跳转到详情页的能力,但在卡片上直接显示滑块
   - 拖动滑块时,显示实时预览的字号
   - 使用视觉反馈(如轻微的缩放动画)

3. **视觉设计**
   - 卡片使用渐变背景或微妙的图案
   - 滑块轨道使用品牌色
   - 当前值显示在滑块下方,字号更大(16-18px)

```tsx
<Card className="settings-font-size-card" shadow="sm" radius="md" p="lg">
  <Stack gap="md">
    <Flex justify="space-between" align="center">
      <Text fw={600} size="sm">字体大小</Text>
      <Text size="xl" fw={500} className="font-size-preview">Aa</Text>
    </Flex>
    <Stack gap="xs">
      <LazySlider
        value={settings.fontSize}
        min={12}
        max={24}
        step={1}
        marks={[
          { value: 12, label: '小' },
          { value: 18, label: '中' },
          { value: 24, label: '大' }
        ]}
        color="brand"
        onChange={(val) => setSettings({ fontSize: val })}
      />
      <Text size="sm" c="dimmed" ta="center">{settings.fontSize}px</Text>
    </Stack>
  </Stack>
</Card>
```

#### D. 应用行为组

**现状**: 启动页使用单选按钮组,触觉反馈使用开关,但视觉上不够紧凑

**优化**:
1. **组织优化**
   - 改名为 "应用行为" 或 "交互设置",更准确地描述内容
   - 使用绿色/青色的图标色彩,与显示设置区分

2. **启动页选择**
   - 单选按钮改为分段控制器(Segmented Control)样式
   - 使用图标+文字的形式
   - 选中状态使用品牌色背景

3. **触觉反馈**
   - Switch 开关使用更大的尺寸
   - 开启时使用品牌色
   - 添加说明文字:"生成内容时震动反馈"

#### E. 网络与数据组

**现状**: 代理设置直接展示输入框,Data 链接到独立页面

**优化**:
1. **代理设置**
   - 不在主页面直接展示输入框
   - 改为显示当前状态:"未配置" 或 "socks5://..."
   - 点击后展开编辑区域或跳转到独立页面
   - 使用橙色图标

2. **数据管理**
   - 保留跳转到独立页面的设计
   - 添加更清晰的说明文字
   - 使用红色/粉色图标,暗示这是敏感操作

3. **视觉分组**
   - 这两个都是低频但重要的功能
   - 使用更轻的卡片样式,暗示它们不是日常操作
   - 可以考虑合并为一个 "高级设置" 组

### 3.3 色彩系统

基于现有的 `interfaceColors` 系统,定义以下色彩变量:

```scss
/* 功能色彩 - 用于图标和强调 */
--settings-display-color: var(--mantine-color-violet-6);
--settings-interaction-color: var(--mantine-color-teal-6);
--settings-network-color: var(--mantine-color-orange-6);
--settings-data-color: var(--mantine-color-pink-6);

/* 卡片层级 */
--settings-card-primary-bg: var(--mantine-color-white);
--settings-card-primary-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
--settings-card-secondary-bg: var(--mantine-color-gray-0);

/* 交互状态 */
--settings-row-hover-bg: var(--mantine-color-gray-0);
--settings-row-active-bg: var(--mantine-color-gray-1);

/* 文字层级 */
--settings-text-primary: var(--mantine-color-gray-9);
--settings-text-secondary: var(--mantine-color-gray-7);
--settings-text-tertiary: var(--mantine-color-gray-5);
```

### 3.4 字体系统

```scss
/* 标题层级 */
--settings-title-size: 20px;
--settings-title-weight: 600;

--settings-group-title-size: 15px;
--settings-group-title-weight: 600;

/* 内容层级 */
--settings-label-size: 14px;
--settings-label-weight: 500;

--settings-value-size: 14px;
--settings-value-weight: 400;

--settings-description-size: 13px;
--settings-description-weight: 400;

/* 行高 */
--settings-line-height-tight: 1.3;
--settings-line-height-normal: 1.5;
```

### 3.5 间距系统

```scss
/* 页面级间距 */
--settings-page-padding-x: 16px;
--settings-page-padding-y: 20px;

/* 组间距 */
--settings-group-gap: 20px;

/* 卡片内间距 */
--settings-card-padding: 16px;

/* 行间距 */
--settings-row-padding-y: 14px;
--settings-row-gap: 12px;

/* 图标与文字间距 */
--settings-icon-gap: 12px;
```

## 四、实施细节

### 4.1 新增组件

#### SettingCard
带强调色和图标的设置组卡片

```tsx
interface SettingCardProps {
  icon?: ReactNode
  title: string
  accentColor?: 'violet' | 'teal' | 'orange' | 'pink'
  children: ReactNode
  className?: string
}

const SettingCard = ({ icon, title, accentColor, children, className }: SettingCardProps) => (
  <Card
    className={cn('setting-card', `accent-${accentColor}`, className)}
    shadow="xs"
    radius="md"
    p="md"
  >
    <Stack gap="xs">
      <Flex align="center" gap="sm" className="setting-card-header">
        {icon && <Box className="setting-card-icon">{icon}</Box>}
        <Text size="sm" fw={600} className="setting-card-title">
          {title}
        </Text>
      </Flex>
      <Stack gap={0} className="setting-card-content">
        {children}
      </Stack>
    </Stack>
  </Card>
)
```

#### SettingRow
优化后的设置行,支持徽章、色彩图标、更好的悬停效果

```tsx
interface SettingRowProps {
  icon: ReactNode
  label: string
  value?: string
  badge?: boolean
  onClick?: () => void
  children?: ReactNode
}

const SettingRow = ({ icon, label, value, badge, onClick, children }: SettingRowProps) => (
  <Box
    className={cn('setting-row', onClick && 'setting-row-clickable')}
    onClick={onClick}
  >
    <Flex align="center" justify="space-between" gap="md">
      <Flex align="center" gap="sm" className="setting-row-left">
        <Box className="setting-row-icon">{icon}</Box>
        <Text size="sm" fw={500}>{label}</Text>
      </Flex>
      <Flex align="center" gap="xs" className="setting-row-right">
        {value && !badge && (
          <Text size="sm" c="dimmed">{value}</Text>
        )}
        {value && badge && (
          <Badge variant="light" size="sm">{value}</Badge>
        )}
        {onClick && <IconChevronRight size={16} className="setting-row-chevron" />}
      </Flex>
    </Flex>
    {children && (
      <Box className="setting-row-detail" mt="sm">
        {children}
      </Box>
    )}
  </Box>
)
```

### 4.2 CSS 样式

创建新文件 `src/renderer/routes/settings/general.module.css`:

```css
/* 页面容器 */
.settings-page {
  --card-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
}

/* 设置卡片 */
.setting-card {
  background: var(--mantine-color-white);
  border: 1px solid var(--mantine-color-gray-2);
  overflow: hidden;
  transition: all 0.2s ease;
}

.setting-card.accent-violet .setting-card-header {
  color: var(--mantine-color-violet-6);
}

.setting-card.accent-teal .setting-card-header {
  color: var(--mantine-color-teal-6);
}

.setting-card.accent-orange .setting-card-header {
  color: var(--mantine-color-orange-6);
}

.setting-card.accent-pink .setting-card-header {
  color: var(--mantine-color-pink-6);
}

/* 设置行 */
.setting-row {
  padding: 14px 0;
  border-bottom: 1px solid var(--mantine-color-gray-1);
  transition: background-color 0.15s ease;
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-row-clickable {
  cursor: pointer;
  margin: 0 -16px;
  padding: 14px 16px;
  border-radius: 8px;
}

.setting-row-clickable:hover {
  background-color: var(--mantine-color-gray-0);
}

.setting-row-clickable:active {
  background-color: var(--mantine-color-gray-1);
  transform: scale(0.99);
}

.setting-row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.setting-row-chevron {
  color: var(--mantine-color-gray-5);
  transition: transform 0.2s ease;
}

.setting-row-clickable:hover .setting-row-chevron {
  transform: translateX(2px);
}

/* 字体大小卡片 */
.font-size-card {
  background: linear-gradient(
    135deg,
    var(--mantine-color-violet-0) 0%,
    var(--mantine-color-white) 100%
  );
}

.font-size-preview {
  color: var(--mantine-color-violet-6);
  font-weight: 500;
  transition: font-size 0.2s ease;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .settings-page {
    padding: 12px;
  }
  
  .setting-card {
    padding: 12px;
  }
}
```

### 4.3 动画与微交互

```css
/* 悬停效果 */
.setting-row-clickable {
  position: relative;
}

.setting-row-clickable::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: var(--mantine-color-brand-6);
  transition: height 0.2s ease;
  border-radius: 0 2px 2px 0;
}

.setting-row-clickable:hover::before {
  height: 60%;
}

/* 滑块动画 */
.setting-slider {
  --slider-track-height: 6px;
}

.setting-slider:hover {
  --slider-track-height: 8px;
}

/* 开关动画 */
.setting-switch {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.setting-switch:active {
  transform: scale(0.95);
}
```

## 五、实施计划

### 阶段 1: 基础重构(1-2天)
1. 创建新的组件文件和样式文件
2. 实现 `SettingCard` 和 `SettingRow` 组件
3. 定义色彩和间距变量

### 阶段 2: 逐组优化(2-3天)
1. 优化 "显示与外观" 组
2. 重构 "字体大小" 为独立卡片
3. 优化 "应用行为" 组
4. 优化 "网络" 和 "数据" 组

### 阶段 3: 细节打磨(1-2天)
1. 添加动画和微交互
2. 测试深色模式适配
3. 测试不同屏幕尺寸
4. 性能优化

### 阶段 4: 用户测试(1天)
1. 内部测试
2. 收集反馈
3. 迭代调整

## 六、风险与注意事项

### 技术风险
1. **兼容性**: 新的样式需要在 Android 23-35 上测试
2. **性能**: 动画和阴影可能影响低端设备性能
3. **深色模式**: 所有色彩需要适配深色主题

### 设计风险
1. **过度设计**: 要避免为了"好看"而牺牲功能性
2. **一致性**: 新设计需要与应用其他部分保持一致
3. **可访问性**: 色彩对比度需要符合 WCAG AA 标准

### 缓解措施
1. 使用 CSS 变量,方便主题切换和调整
2. 动画使用 `prefers-reduced-motion` 媒体查询
3. 保留现有的功能逻辑,只改变视觉呈现
4. 渐进式实施,每个阶段都可以独立发布

## 七、成功指标

### 定性指标
- 用户能在 3 秒内找到常用设置(语言、主题、字体大小)
- 用户反馈界面"清晰"、"专业"、"易用"
- 新用户无需指导即可完成基本设置

### 定量指标
- 设置页面加载时间 < 500ms
- 动画帧率 > 50fps
- 无可访问性警告

## 八、后续优化方向

1. **搜索功能**: 添加设置项搜索,快速定位
2. **快捷方式**: 常用设置的快捷入口
3. **预设方案**: 提供"推荐配置"、"护眼模式"等预设
4. **设置同步**: 跨设备同步用户配置
5. **智能推荐**: 根据使用习惯推荐设置调整

---

**附录A**: 视觉对比图(需要设计师补充)
**附录B**: 组件 API 文档(需要开发者补充)
**附录C**: 用户测试脚本(需要产品经理补充)
