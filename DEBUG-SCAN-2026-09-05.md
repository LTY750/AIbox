# AIbox Mobile 代码质量与静态扫描报告（v2 修订版）

- **扫描日期**：2026-09-05（v1）/ 2026-09-05 18:20（v2 修订）
- **修订说明**：v1 存在 6 处硬错误与多处过期结论，经用户复核后修正；本版为当前基线
- **扫描方式**：静态分析 + 只读命令 + 用户实测复核（`corepack pnpm run check/lint/test` 全量）
- **项目版本**：0.0.1

---

## 一、总体结论（v2）

| 维度 | 结论 | 状态 |
|---|---|---|
| TypeScript 类型检查 | ✅ 0 error 通过（双方独立验证一致） | 健康 |
| Biome lint | 838 warnings / 0 error（完整诊断 890 条，含 52 条 information） | 治理项 |
| 测试套件 | ✅ 284 文件 passed / 2 skipped；用例级 2821 passed / 62 skipped | 健康 |
| 定向测试 | 安全区/页面标题/返回导航 9/9 通过 | 健康 |
| **键盘返回回归** | 🔴 **唯一明确 P1**，当前工作区引入，根因已定位 | **待修复** |
| 依赖健康 | react-router-dom、swr 无源码引用（可清理候选）；多库并存 | 治理项 |
| 仓库卫生 | release 产物已被 .gitignore（仅本地磁盘占用）；81 modified / 50 untracked 待提交 | 提示 |

---

## 二、🔴 P1：返回键收起键盘时布局滞后（唯一明确 P1）

### 2.1 现象（qa-pages/back-repro 已复现）

图片生成器页输入框聚焦、键盘弹起时按返回键：
- **50ms**：键盘已开始收起，但建议标签被截半、输入框仍压在键盘残影下
- **700ms**：`keyboardDidHide` 触发后布局才完全恢复

### 2.2 根因（代码级确认）

**[mobile_safe_area.ts](src/renderer/setup/mobile_safe_area.ts) 事件监听不对称：**
- 79 行：`keyboardWillShow` → `setKeyboardOpenWithHeight`（弹起有提前量）
- 85 行：`keyboardDidShow` → 同上
- 91 行：`keyboardDidHide` → `setKeyboardOpen(false)`（**收起只听 did，无 will**）

**[index.css:176](src/renderer/static/index.css#L176) 压缩布局持续到 did 才释放：**
```css
html[data-mobile-keyboard-open="true"] .App {
  height: calc(100% - var(--mobile-keyboard-height, 0px));
  transition: height 180ms ease-out;
}
```

**因果链**：键盘收起动画开始（系统级）→ `keyboardDidHide` 尚未触发 → `data-mobile-keyboard-open` 仍为 `"true"`、`--mobile-keyboard-height` 仍为全高 → `.App` 保持压缩布局 → 内容被压在正在消失的键盘之下 → 约 700ms 后 `keyboardDidHide` 才触发布局恢复。**弹起方向有 `keyboardWillShow` 提前量、收起方向没有，是本次工作区引入的不对称回归。**

### 2.3 修复方案

在 `mobile_safe_area.ts` 补 `keyboardWillHide` 监听（与 79 行 willShow 对称）：

```ts
void Keyboard.addListener('keyboardWillHide', () => {
  setKeyboardOpen(false)
  refreshSafeAreaInsets()
}).catch((error) => {
  console.warn('Failed to listen for keyboardWillHide:', error)
})
```

- `setKeyboardOpen(false)` 幂等，保留 91 行 `keyboardDidHide` 作兜底（低版本 Android WebView 的 will 事件可能退化），双保险无冲突
- 收起动画开始即释放压缩态，`.App` 走既有 180ms ease-out 过渡，消除"先遮挡后跳变"
- `syncSafeAreaVariables()` 中 bottom inset 随 `keyboardOpen=false` 恢复真实值，手势条区域行为正确

### 2.4 复测标准

重新执行 back-repro 流程（图片生成器 → 聚焦输入框 → 返回键收键盘）：
- **50ms 截图**：建议标签完整可见（或处于 180ms 高度过渡中），不被键盘残影遮挡
- **700ms 截图**：与 v1 一致（完全恢复）
- 回归项：正常聊天页键盘开合、`useScreenChange` 横竖屏不回归

---

## 三、v1 错误勘误（记录在案）

| # | v1 论断 | 事实 | 错误原因 |
|---|---|---|---|
| 1 | Biome 906 warnings | **838 warnings + 52 info = 890 diagnostics** | 表格加总算错（表内分项数字本身正确，合计应为 890） |
| 2 | "无 `.skip` 残留" | `openai.test.ts:9` 存在 `describe.skip('OpenAI Adapter')` | 只扫了 `test/` 目录，未覆盖 `src/**/*.test.ts` |
| 3 | "3 处定时器无 cleanup" | `useVersion.ts:65-71`、`useThinkingTimer.ts:37` 有完整 cleanup；`store-node.ts` autoBackupTimer 由 `powerMonitor.on('suspend'/'resume')` 生命周期管理 | grep 命中后未读上下文即下结论 |
| 4 | "Node/pnpm 引擎阻塞" | 用户环境 Node 24.15.0 / pnpm 10.33.0，与 engines 完全一致，check/lint/test 全部跑通 | 扫描会话的 Bash PATH 解析到 node 22（工具环境问题），误判为项目阻塞 |
| 5 | "构建产物污染 git" | `.gitignore` 已覆盖：`git status --ignored` 确认 `release/app/dist/`、`release/app/node_modules/`、`src/renderer/release/` 均被忽略；仅本地磁盘占用（131MB + 74MB） | 未先跑 `git check-ignore` / `--ignored` 即定性 |
| 6 | "40+ 修改 / 130 untracked" | 实际 **81 modified / 50 untracked** | 把 `git status --short` 总行数 130 误当 untracked 数 |

## 四、依赖审计（v2 修正）

### 4.1 可清理候选（源码无引用，已验证）

- `react-router-dom@6.11.2`：`src/` 内无 `from 'react-router-dom'` import
- `swr@2.1.5`：`src/` 内无 `from 'swr'` import

### 4.2 不可移除（v1 误判修正）

- `react-swipeable-views`：[MobileModelSelector.tsx](src/renderer/components/ModelSelector/MobileModelSelector.tsx) 仍在使用 `SwipeableViews`

### 4.3 多库并存（治理项，非错误）

| 类别 | 并存 | 说明 |
|---|---|---|
| 状态/数据 | zustand + jotai(+immer/optics) + @tanstack/react-query | swr 无引用可移除后剩两套，属常见组合 |
| 路由 | @tanstack/react-router（react-router-dom 待移除后归一） | 迁移收尾即可 |
| 工具 | lodash + es-toolkit | 渐进迁移 |
| 日期 | date-fns + dayjs | 渐进归一 |
| 样式 | MUI + Mantine + Emotion + Tailwind | 与 UI 审查 P2 一致，长期治理 |
| 高亮 | shiki + highlight.js + react-syntax-highlighter | r-s-h 内部依赖 hljs，实际两套半 |
| 构建 | webpack 系 + vite 系 + 双 Sentry 插件 | electron-builder（webpack）与 electron-vite（dev）双轨，架构现状 |

### 4.4 类型包不匹配（保留结论）

- `@types/ua-parser-js@0.7.39` ↔ `ua-parser-js@2.0.10`：2.x 自带类型，@types 包过时
- `@types/highlight.js`：hljs 11 自带类型，多余
- `react-test-renderer`：React 18+ 已 deprecated（与 @testing-library/react 并存）

---

## 五、Biome 890 项诊断分布（v2 数字修正）

> 838 warnings + 52 information = 890 diagnostics；0 errors。以下为全量规则分布（分项与 v1 一致，合计勘误为 890）：

| 数量 | 规则 | 定性 |
|---|---|---|
| 290 | `lint/suspicious/useAwait` | 多为 IPC handler 包装，批量 fix 低风险 |
| 113 | `lint/style/noNonNullAssertion` | 治理项（潜在 undefined 风险） |
| 108 | `lint/suspicious/noExplicitAny` | 治理项 |
| 78 | `lint/correctness/noUnusedFunctionParameters` | 清理项 |
| 74 | `lint/suspicious/noConsole` | 收敛到 logger |
| 45 | `lint/nursery/noFloatingPromises` | **治理项**（v1 误标 P1；作为后续治理，非当前 bug） |
| 36 | `lint/correctness/noUnusedVariables` | 清理项 |
| 35 | `lint/correctness/useExhaustiveDependencies` | **治理项**（同上降级） |
| 22 | `lint/style/useTemplate` | 自动 fix |
| 20 | `lint/complexity/useLiteralKeys` | 自动 fix |
| 18 | `lint/style/useNodejsImportProtocol` | 自动 fix |
| 10 | `lint/correctness/noUnusedImports` | 自动 fix |
| 9 | `lint/suspicious/noArrayIndexKey` | 治理项 |
| 其余 17 条零星 | useConst/useOptionalChain/noBannedTypes 等 | 自动 fix / 排查 |

**v1 → v2 定性修正**：noFloatingPromises(45) / useExhaustiveDependencies(35) / noArrayIndexKey(9) 从"P1"降级为**后续治理项**——它们是 lint 基线债务，不是已复现的功能 bug；当前唯一 P1 为键盘回归（见第二节）。

## 六、测试状态（用户实测，v2 采纳）

| 命令 | 结果 |
|---|---|
| `corepack pnpm run check` | ✅ 通过 |
| `corepack pnpm run lint` | exit 0，838 warnings |
| `corepack pnpm test` | 284 文件 passed / 2 skipped；用例 2821 passed / 62 skipped |
| 安全区/页面标题/返回导航定向测试 | 9/9 通过 |

**新增遗留项**：`settingsStore.persist.test.ts` 存在 3 处嵌套 `vi.unmock`（`@/platform`、`@/storage`、`@/variables`），Vitest 已发警告，未来版本可能升级为错误——列入治理项。

## 七、UI 审查（09-04）状态更新

| UI 审查项 | 状态 |
|---|---|
| P3 设置子页标题恒为「设置」 | **已实现待复测**：[settings/route.tsx:120](src/renderer/routes/settings/route.tsx#L120) `getSettingsPageTitle(pathname, ...)` 动态标题 |
| I2 会话加载白屏 | **已实现待复测**：[$sessionId.tsx:272](src/renderer/routes/session/$sessionId.tsx#L272) `<SessionLoadingSkeleton />` |
| I1/A2 键盘收起布局滞后 | 🔴 本报告 P1（mobile_safe_area 缺 keyboardWillHide） |
| P1 横屏初始渲染失败 | 今日 qa-rotation 未复现，保持观察 |

## 八、仓库卫生（v2 修正）

- **release 产物**：已被 .gitignore 忽略（`release/app/dist`、`release/build` 规则 + `!!` 验证），属本地磁盘占用（release/ 131MB、src/renderer/release/ 74MB），可按需清理磁盘，与 git 无关
- **工作区**：81 个已修改文件、50 个未跟踪文件，含本次键盘修复前的大量改动，建议尽快分批提交形成检查点
- **测试跳过**：62 个用例 skipped（主因 `openai.test.ts` 整套 `describe.skip`，注释标明待迁移 msw），迁移后可恢复

## 九、优先级结论（v2）

1. **立即**：修复 keyboardWillHide 回归（第二节方案）+ back-repro 50ms/700ms 复测
2. **短期**：提交当前 81 文件工作区；复测 P3/I2 已实现项；迁移 openai.test.ts 到 msw 消除 62 skipped
3. **治理项（非 P1）**：noFloatingPromises / useExhaustiveDependencies / noArrayIndexKey 逐文件审视；移除 react-router-dom、swr、过时 @types 包、react-test-renderer；vi.unmock 嵌套警告
4. **长期**：Biome 838 warnings 分批消化；样式/状态/构建多库并存按迁移计划归一

---

### 附：v1 报告归档说明

v1 版本（含 906 错误数字、"无 .skip"、"3 定时器泄漏"、"Node 阻塞"、"产物污染"、"40+/130" 六处错误）已被本 v2 完全取代，不再作为基线引用。v1 的 TSC 通过、TODO 清单、Biome 分项数字、依赖清单事实仍然有效并已并入本版。
