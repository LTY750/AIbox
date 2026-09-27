# AIbox Mobile Android 设置界面重设计方案（修订版）

> **版本**: v2.0  
> **日期**: 2026-09-25  
> **目标**: 基于现有 Mantine + Tailwind 技术栈，优化 Android 端常规设置页面的信息架构和移动端体验  
> **范围**: 改造 `/src/renderer/routes/settings/general.tsx`

---

## 一、问题定位

基于 `/src/renderer/routes/settings/general.tsx` 的实际代码分析：

### 当前实现概况

**技术栈**：
- UI 框架：Mantine v7.17.7
- 样式：Tailwind CSS + Mantine 主题变量
- 状态管理：`useSettingsStore` (Zustand)
- 布局：响应式 Stack/Flex，最大宽度 760px

**现有设置项**（已实现）：
1. 显示设置（Display Settings）
   - 语言选择（AdaptiveSelect）
   - 字体系列（AdaptiveSelect）
   - 主题（跟随系统/浅色/深色）
   - 生成时触觉反馈（移动端独有）
   - 配色预设（Badge 横向排列，支持自定义）
   - 字体大小（LazySlider，10-22px）
   - 启动页（Radio 单选：主页/上次会话）
2. 网络代理（TextInput）
3. 数据找回（DataRecoverySection）
4. 数据备份与恢复（ImportExportDataSection）
5. 诊断日志（ExportLogsSection + 匿名分析开关）
6. 系统设置（仅桌面端：自动启动、自动更新、Beta 更新）

### 移动端问题

**信息密度**：
- 所有设置挤在单一垂直滚动流，首屏信息过载
- 高级功能（代理、数据找回）与常用设置混在一起，无优先级区分
- 配色预设横向滚动，小屏触控困难（Badge 高度 30dp，间距小）

**触控优化不足**：
- AdaptiveSelect 下拉框在移动端体验一般（应改用 Bottom Sheet）
- Radio 按钮组过于紧凑（"主页/上次会话"）
- 开关（Switch）位置不够突出

**缺少分组视觉**：
- SettingsCard 已存在，但内部设置项缺少次级分组
- 无折叠/展开机制，高级功能无法收起

---

## 二、设计目标

### 核心原则

1. **基于现有实现改造**，不重写组件或状态管理
2. **保持所有现有功能**，包括自定义配色、数据备份完整流程
3. **优化移动端触控**，遵循 Android Material Design 指南（48dp 最小触控区）
4. **渐进式改进**，分阶段实施，每阶段可独立验收

### 非目标

- 不引入 React Native 组件或新状态管理
- 不改动 Android 原生层或 Capacitor 配置
- 不简化现有配色系统（保留自定义预设完整功能）
- 不实现 Material You 动态配色（需 Android 12+ 原生接入，超出范围）

---

## 三、改进方案

### 3.1 信息架构重组

将设置项按使用频率和功能相关性重新分组，分为**4 个主要区域 + 1 个桌面端专属区域**：

```
常规设置 (general.tsx)
│
├─ 外观与主题 (Appearance & Theme)
│  ├─ 主题模式（跟随系统/浅色/深色）
│  ├─ 配色预设（现有 Badge 系统）
│  ├─ 字体系列
│  ├─ 字体大小（滑块）
│  └─ 触觉反馈（移动端）
│
├─ 语言与区域 (Language & Region)
│  └─ 界面语言
│
├─ 启动与交互 (Startup & Interaction)
│  └─ 启动页（主页/上次会话）
│
├─ 高级设置 (Advanced) - 可折叠
│  ├─ 网络代理
│  ├─ 数据找回
│  ├─ 数据备份与恢复
│  └─ 诊断日志
│
└─ 系统设置 (System) - 仅桌面端
   ├─ 自动启动
   ├─ 自动更新
   └─ Beta 更新
```

### 3.2 视觉改进（基于现有 SettingsCard）

**现有组件复用**：
- 保留 `SettingsCard` 作为主卡片容器
- 保留 `SettingRow` 作为设置项布局
- 增加可折叠的 `CollapsibleSection` 组件

**改进点**：

1. **分组标题优化**
   - 使用 Mantine `Title` order={5} + 主色调
   - 增加 Icon 前缀（`IconPalette`、`IconWorld`、`IconHome`、`IconLock`）
   - 间距调整：上边距 24px → 32px（提升呼吸感）

2. **触控区域增强**
   - Switch 最小高度：40dp → 48dp
   - Radio 按钮组垂直排列（移动端），增加 12px 间距
   - AdaptiveSelect 改用 Mantine Modal（移动端）

3. **高级设置折叠**
   - 新增 `Accordion` 组件包裹"高级设置"
   - 默认收起，点击展开
   - 使用 `IconChevronDown` 指示状态

4. **配色预设改进**
   - Badge 尺寸：30px → 40px（提升触控面积）
   - 横向间距：xs (8px) → sm (12px)
   - 保留现有横向滚动，添加滚动指示器

### 3.3 组件实现（基于现有代码）

#### CollapsibleSection 组件

```typescript
// components/settings/CollapsibleSection.tsx
import { Accordion, Box, Flex, Text } from '@mantine/core'
import { type ReactNode } from 'react'

interface CollapsibleSectionProps {
  icon: ReactNode
  title: string
  children: ReactNode
  defaultOpened?: boolean
}

export const CollapsibleSection = ({
  icon,
  title,
  children,
  defaultOpened = false,
}: CollapsibleSectionProps) => (
  <Accordion
    variant="contained"
    defaultValue={defaultOpened ? 'content' : undefined}
    styles={{
      root: {
        backgroundColor: 'transparent',
        border: 'none',
      },
      item: {
        backgroundColor: 'var(--chatbox-background-secondary)',
        border: '1px solid var(--chatbox-border-primary)',
        borderRadius: 12,
      },
      control: {
        padding: '16px',
      },
      content: {
        padding: '0 16px 16px',
      },
    }}
  >
    <Accordion.Item value="content">
      <Accordion.Control>
        <Flex align="center" gap="xs">
          <Box c="chatbox-brand" className="flex items-center">
            {icon}
          </Box>
          <Text fw={700} size="sm">
            {title}
          </Text>
        </Flex>
      </Accordion.Control>
      <Accordion.Panel>{children}</Accordion.Panel>
    </Accordion.Item>
  </Accordion>
)
```

#### 重组后的 general.tsx 结构（示意）

```typescript
// 省略 imports 和现有逻辑...

export function RouteComponent() {
  const { t } = useTranslation()
  const { setSettings, ...settings } = useSettingsStore((state) => state)
  // ... 现有状态逻辑保持不变

  return (
    <Stack p="md" gap="lg" className="mx-auto w-full max-w-[760px]">
      {/* 1. 外观与主题 */}
      <SettingsCard title={t('Appearance & Theme')} icon={<IconPalette size={18} />}>
        <Stack gap="md">
          <SettingRow icon={<IconAdjustmentsHorizontal size={17} />} label={t('Theme Mode')}>
            <AdaptiveSelect
              // ... 现有 props
            />
          </SettingRow>

          {/* 配色预设 - 增大 Badge 尺寸和间距 */}
          <Box className="border-t border-solid border-chatbox-border-primary pt-3">
            <Stack gap="md">
              <Text size="sm" fw={500}>{t('Color Presets')}</Text>
              <Flex columnGap="sm" rowGap="sm" wrap="wrap"> {/* xs → sm */}
                {colorPresets.map((preset) => (
                  <Badge
                    key={preset.id}
                    component="button"
                    style={{
                      backgroundColor: withColorOpacity(preset.colors[realTheme].brand, 0.6),
                      cursor: 'pointer',
                      height: 40, // 30 → 40
                      minWidth: 40,
                    }}
                    // ... 现有逻辑
                  >
                    {preset.label}
                  </Badge>
                ))}
              </Flex>
            </Stack>
          </Box>

          <SettingRow icon={<IconPalette size={17} />} label={t('Font Family')}>
            {/* 保持现有 AdaptiveSelect */}
          </SettingRow>

          <SettingRow icon={<IconAdjustmentsHorizontal size={17} />} label={t('Font Size')}>
            {/* 保持现有 LazySlider */}
          </SettingRow>

          {platform.type === 'mobile' && (
            <SettingRow
              icon={<IconDeviceMobileVibration size={17} />}
              label={t('Haptic Feedback')}
            >
              <Switch
                // 增大触控区域
                styles={{ root: { minHeight: 48 } }}
                checked={settings.enableHapticFeedback !== false}
                onChange={(e) => setSettings({ enableHapticFeedback: e.currentTarget.checked })}
              />
            </SettingRow>
          )}
        </Stack>
      </SettingsCard>

      {/* 2. 语言与区域 */}
      <SettingsCard title={t('Language & Region')} icon={<IconWorld size={18} />}>
        <SettingRow icon={<IconWorld size={17} />} label={t('Language')}>
          <AdaptiveSelect
            // ... 保持现有实现
          />
        </SettingRow>
      </SettingsCard>

      {/* 3. 启动与交互 */}
      <SettingsCard title={t('Startup & Interaction')} icon={<IconHome size={18} />}>
        <SettingRow icon={<IconHome size={17} />} label={t('Startup Page')} align="start">
          <Radio.Group
            value={settings.startupPage}
            onChange={(val) => {
              if (val === 'home' || val === 'session') setSettings({ startupPage: val })
            }}
          >
            {/* 移动端改为垂直布局 */}
            <Stack gap="md" className="sm:hidden">
              <Radio label={t('Home Page')} value="home" />
              <Radio label={t('Last Session')} value="session" />
            </Stack>
            {/* 桌面端保持横向 */}
            <Flex gap="md" wrap="wrap" className="hidden sm:flex">
              <Radio label={t('Home Page')} value="home" />
              <Radio label={t('Last Session')} value="session" />
            </Flex>
          </Radio.Group>
        </SettingRow>
      </SettingsCard>

      {/* 4. 高级设置 - 折叠 */}
      <CollapsibleSection
        icon={<IconLock size={18} />}
        title={t('Advanced Settings')}
        defaultOpened={false}
      >
        <Stack gap="lg">
          {/* 网络代理 */}
          <Box>
            <Text size="sm" fw={500} mb="xs">{t('Network Proxy')}</Text>
            <TextInput
              placeholder="socks5://127.0.0.1:6153"
              value={settings.proxy}
              onChange={(e) => setSettings({ proxy: e.currentTarget.value })}
            />
          </Box>

          <Divider />

          {/* 数据找回 */}
          <DataRecoverySection showTitle={true} />

          <Divider />

          {/* 数据备份与恢复 */}
          <ImportExportDataSection />

          <Divider />

          {/* 诊断日志 */}
          <ExportLogsSection showTitle={true} />
          <Checkbox
            label={t('Enable optional anonymous usage analytics')}
            checked={settings.allowReportingAndTracking}
            onChange={(e) => setSettings({ allowReportingAndTracking: e.target.checked })}
          />
        </Stack>
      </CollapsibleSection>

      {/* 5. 系统设置（仅桌面端） */}
      {platform.type === 'desktop' && (
        <SettingsCard title={t('System')} icon={<IconChartBar size={18} />}>
          {/* ... 保持现有实现 */}
        </SettingsCard>
      )}
    </Stack>
  )
}
```

---

## 四、实施计划

### Phase 1: 基础重组（1-2 天）

**目标**：调整信息架构，不改变组件实现

**任务**：
- [ ] 创建 `CollapsibleSection` 组件
- [ ] 重组 `general.tsx`，按新分组排列设置项
- [ ] 调整 SettingsCard 间距（gap: lg → xl）
- [ ] 验证所有设置项功能正常

**验收标准**：
- 所有设置项可读取、修改、保存
- 折叠/展开动画流畅
- 无视觉回退或布局错位

### Phase 2: 移动端触控优化（1-2 天）

**目标**：提升小屏体验和触控友好度

**任务**：
- [ ] 配色 Badge 尺寸：30px → 40px，间距增大
- [ ] Radio 按钮组移动端垂直布局（使用 Tailwind 响应式类）
- [ ] Switch 增加最小高度 48dp
- [ ] AdaptiveSelect 移动端改用 Modal（可选，需评估 Mantine Modal 体验）

**验收标准**：
- 所有交互元素触控目标 ≥ 48dp
- 单手操作流畅（拇指可达所有控件）
- 横屏模式无布局异常

### Phase 3: 视觉打磨（1 天）

**目标**：提升视觉层次和呼吸感

**任务**：
- [ ] 分组标题增加 Icon
- [ ] 调整垂直间距（section 间距 32px）
- [ ] 滑块样式优化（轨道高度、手柄大小）
- [ ] 配色预设添加滚动指示器（可选）

**验收标准**：
- 浅色/深色模式视觉一致
- 对比度符合 WCAG AA 标准
- 字体缩放至 200% 无文字截断

### Phase 4: 测试与验收（1 天）

**测试清单**：
- [ ] 功能测试：所有设置项读写正常
- [ ] 屏幕适配：Compact (< 640px)、Medium、Expanded
- [ ] 主题测试：浅色/深色模式切换无视觉瑕疵
- [ ] 横屏测试：布局正常，无溢出
- [ ] 触控测试：所有按钮可单手点击
- [ ] 键盘测试：弹出键盘不遮挡输入框
- [ ] 长文本测试：德语/法语等长文本不溢出
- [ ] 系统字体缩放：100%-200% 无布局错误

**预计总耗时**：4-6 个工作日

---

## 五、技术细节

### 5.1 响应式断点（复用现有 Tailwind 配置）

```
sm: 640px   (medium viewport)
md: 768px
lg: 1024px  (expanded viewport)
```

使用示例：
```tsx
<Flex className="flex-col sm:flex-row">  {/* 移动端垂直，桌面端横向 */}
  {/* ... */}
</Flex>
```

### 5.2 主题变量（已存在）

```css
var(--chatbox-background-primary)    /* 主背景 */
var(--chatbox-background-secondary)  /* 卡片背景 */
var(--chatbox-border-primary)        /* 边框 */
var(--chatbox-brand)                 /* 品牌色 */
var(--chatbox-tertiary)              /* 次要文本 */
```

### 5.3 Mantine 组件样式覆盖

```typescript
// 示例：增大 Switch 触控区域
<Switch
  styles={{
    root: { minHeight: 48 },
    track: { cursor: 'pointer' },
  }}
/>
```

### 5.4 Accordion 折叠动画

```typescript
// Mantine Accordion 自带动画，无需额外配置
// 可通过 transitionDuration 调整速度
<Accordion transitionDuration={200}>
  {/* ... */}
</Accordion>
```

---

## 六、风险与缓解

### 风险 1: 折叠状态持久化

**问题**：用户展开"高级设置"后刷新页面，状态丢失

**缓解**：
- 短期：接受当前行为（符合移动端轻量预期）
- 长期：在 `useSettingsStore` 增加 `expandedSections: string[]`

### 风险 2: AdaptiveSelect 移动端体验

**问题**：Mantine Select 在移动端可能不如原生 Bottom Sheet

**缓解**：
- Phase 2 标记为"可选"，先评估现有体验
- 如需改进，使用 Mantine Modal + Radio.Group 模拟 Bottom Sheet

### 风险 3: 配色预设横向滚动指示器

**问题**：用户可能不知道可以横向滚动

**缓解**：
- 添加渐变遮罩提示滚动（CSS `mask-image`）
- 或使用 Mantine ScrollArea 组件

---

## 七、验收标准（总结）

### 功能完整性
- ✅ 所有设置项可正常读取和保存
- ✅ 自定义配色预设创建/编辑/删除功能完整
- ✅ 数据备份/恢复流程无回退
- ✅ 折叠/展开动画流畅

### 移动端体验
- ✅ 触控目标 ≥ 48dp（Material Design 标准）
- ✅ 单手操作流畅
- ✅ 横屏模式支持
- ✅ 键盘弹出不遮挡输入

### 视觉质量
- ✅ 符合现有设计语言（Mantine + Tailwind）
- ✅ 浅色/深色模式无视觉瑕疵
- ✅ 系统字体缩放支持（100%-200%）
- ✅ 长文本不溢出或截断

### 兼容性
- ✅ Android 6.0+ (API 23) 兼容
- ✅ 屏幕尺寸适配（4" ~ 12"）
- ✅ 现有设置数据完全兼容（无迁移）

---

## 八、后续优化方向

1. **设置搜索**：当设置项继续增加时，提供快速定位能力
2. **预设方案**：提供"简洁模式"、"完整模式"等一键配置
3. **引导提示**：首次使用时高亮重要设置
4. **A/B 测试**：收集用户点击热力图，持续优化布局

---

## 附录

### A. 现有组件清单（可复用）

| 组件 | 用途 | 位置 |
|------|------|------|
| `SettingsCard` | 设置分组卡片 | `general.tsx` L512 |
| `SettingRow` | 设置项布局 | `general.tsx` L531 |
| `AdaptiveSelect` | 下拉选择（响应式） | `@/components/AdaptiveSelect` |
| `LazySlider` | 防抖滑块 | `@/components/common/LazySlider` |
| `InterfaceColorInput` | 颜色选择器 | `@/components/common/InterfaceColorInput` |

### B. 需新建组件

| 组件 | 用途 | 优先级 |
|------|------|--------|
| `CollapsibleSection` | 可折叠设置区域 | P0 |

### C. 参考资料

- [Mantine v7 文档](https://v7.mantine.dev/)
- [Material Design 3 - Touch Target](https://m3.material.io/foundations/accessible-design/accessibility-basics#28032e45-c598-450c-b355-f9fe737b1cd8)
- [WCAG 2.1 对比度标准](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)

---

**文档版本**: 2.0  
**最后更新**: 2026-09-25  
**作者**: Claude  
**审阅状态**: 待审阅
