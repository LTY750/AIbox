# Predictive Back 接入评估（2026-09-05）

> 结论先行：**可以做，而且迟早必须做**。但两件事的性价比差别极大 ——
> 「系统级返回桌面动画」值得马上做（成本低、收益明确），
> 「应用内跟手动画」建议先做折中版，逐帧跟手不划算。
>
> 本文档为评估，未改动任何代码。

---

## 一、现状盘点

### 1.1 技术栈

| 项 | 值 | 影响 |
|---|---|---|
| 框架 | Capacitor 7（`@capacitor/android` ^7.0.0） | 返回键走 App 插件的 `OnBackPressedCallback` |
| Activity | 单 Activity：`MainActivity extends BridgeActivity` | 跨 Activity 动画 **不适用** |
| 渲染 | 单 WebView + hash 路由 | 所有 UI 层都是 DOM，原生看不见 |
| `android:enableOnBackInvokedCallback` | **已为 `true`**（application 节点） | 已 opt-in，但见 1.2 |
| `androidxActivityVersion` | **1.9.2** | ≥ 1.8.0，Progress API **全部可用** |
| compileSdk / targetSdk | **35 / 35** | 见第三节的合规风险 |
| minSdk | 23 | 动画只在 Android 13+ 生效 |
| Fragment / Material View / AndroidX Transition | 全部未使用 | 官方那套 Fragment/MDC 迁移路径 **不适用** |

### 1.2 关键发现：manifest 开关目前是「空转」的

`node_modules/@capacitor/app/.../AppPlugin.java` 的 `load()`：

```java
this.onBackPressedCallback =
    new OnBackPressedCallback(!disableBackButtonHandler) {   // enabled = true
        @Override
        public void handleOnBackPressed() {
            if (!hasListeners(EVENT_BACK_BUTTON)) {
                if (bridge.getWebView().canGoBack()) bridge.getWebView().goBack();
            } else {
                data.put("canGoBack", bridge.getWebView().canGoBack());
                notifyListeners(EVENT_BACK_BUTTON, data, true);
                bridge.triggerJSEvent("backbutton", "document");
            }
        }
    };
getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), this.onBackPressedCallback);
```

`capacitor.config.ts` 里没有配 `disableBackButtonHandler`，所以这个回调**默认 enabled、默认优先级**。

而官方原话是：

> If your app enables an `OnBackPressedCallback` or an `OnBackInvokedCallback` with
> `PRIORITY_DEFAULT` or `PRIORITY_OVERLAY`, **the predictive back animations don't run**
> and you must handle the back event.

**所以：虽然 manifest 开了 `true`，但返回桌面（back-to-home）的预览动画现在根本不会播。**
实际链路是：侧滑 → 系统让出控制权给 dispatcher → Capacitor 回调 → 发 `backButton` 给 JS
→ `mobile_platform.ts` 判断无 handler 且 `canGoBack=false` → `App.exitApp()`
→ 原生 `getBridge().getActivity().finish()`。

`finish()` 是普通销毁，不是带缩回桌面图标预览的 back-to-home 动画。

### 1.3 应用内返回：完全没有预测性

现有返回栈（`src/renderer/platform/mobile_back_navigation.ts`）是纯 JS 的
`registerMobileBackHandler` / `useMobileBackHandler`，带 priority 排序。

共 **12 个文件、16 处注册**：

```
Sidebar.tsx                              1
components/session/ThreadHistoryDrawer   1
components/layout/Overlay.tsx            1
components/common/AdaptiveModal.tsx      1
components/ActionMenu.tsx                2
components/AdaptiveSelect.tsx            1
components/ModelSelectorV2/index.tsx     2
components/ModelSelector/MobileModelSelector.tsx  1
components/settings/provider/ProviderSpotlight.tsx 1
pages/SearchDialog.tsx                   1
pages/PictureDialog.tsx                  1
routes/image-creator/-components/MobileDrawers.tsx 3
```

这些全是 DOM/CSS 层。Capacitor 的回调只有 `handleOnBackPressed()` 一个时机，
**没有 started / progressed / cancelled**，所以：
抽屉、弹窗、菜单在侧滑过程中不会有任何跟手反馈，松手瞬间才"啪"地关掉。

---

## 二、官方 Predictive Back 到底是什么

### 2.1 四类动画，本 App 只对两类有份

| 类型 | 本 App 是否适用 | 现状 |
|---|---|---|
| Back-to-home（返回桌面，窗口缩回图标） | ✅ 适用 | ❌ 被 Capacitor 回调吞掉（1.2） |
| Cross-task（切到上一个 App） | ✅ 适用 | ❌ 同上 |
| Cross-activity（Activity 间） | ❌ 单 Activity，不适用 | — |
| In-app（应用内：抽屉/弹窗/页面） | ✅ 适用 | ❌ 完全没有（1.3） |

### 2.2 生效条件

- **Android 13 / 14**：需在开发者选项里打开「预测性返回动画」
- **Android 15+**：默认对用户可见
- **Android 16 + targetSdk 36**：**强制开启**，`onBackPressed()` 不再被调用，
  `KeyEvent.KEYCODE_BACK` 不再分发，manifest 里的关闭开关被忽略
- **Android 16 起**：三键导航也有预测性返回（此前只有手势导航有）

### 2.3 可用的 API（项目已满足依赖）

`androidxActivityVersion = 1.9.2` ≥ 1.8.0，所以下面这些**直接可用，不需要升依赖**：

```java
// AndroidX 向后兼容版（推荐，走 OnBackPressedDispatcher）
new OnBackPressedCallback(enabled) {
    void handleOnBackStarted(BackEventCompat backEvent);    // 手势开始
    void handleOnBackProgressed(BackEventCompat backEvent); // 逐帧进度
    void handleOnBackCancelled();                           // 用户放弃
    void handleOnBackPressed();                             // 用户确认
}
// BackEventCompat: getProgress() 0~1 / getTouchX() / getTouchY() / getSwipeEdge()
```

另有平台级 `androidx.activity.OnBackAnimationCallback`（`onBackStarted` /
`onBackProgressed` / `onBackCancelled` / `onBackInvoked`），API 34+。

**注意**：`BackEventCompat.progress` 不是线性值，Google 做了曲线映射，
越接近 1.0 表示用户越"确定"要返回。直接用它驱动 transform 即可，不要再自己算 easing。

---

## 三、合规风险：这不是「要不要加」的问题

Google Play 要求 **2026-08-31 起**，所有新提交和更新必须 `targetSdk >= 36`
（今天已经是 2026-09-05；符合条件的开发者可申请延期到 2026-11-01）。

项目目前 `targetSdk = 35`，一旦升到 36：

1. **预测性返回强制开启**，manifest 关闭开关失效 —— 现在不主动适配，到时就是被动出问题
2. **edge-to-edge 强制**，opt-out 标志被移除
3. 大屏（≥600dp）忽略 `screenOrientation` / `resizableActivity`

换句话说：**升级 targetSdk 36 是硬要求，而 predictive back 是这次升级里必须一起处理的项。**

---

## 四、接入方案（分两层）

### 层 1：恢复系统级 back-to-home / cross-task 动画 ✅ 强烈建议，成本低

**思路**：让 Capacitor 的回调在「JS 返回栈已空」时自我 disable，把返回交还给系统。

**核心改动点**

1. 原生侧：新增一个 Capacitor 插件（或直接在 `MainActivity` 里），拿到
   `OnBackPressedDispatcher`，自己注册一个可控制 enabled 的 callback；
   同时通过 `App.toggleBackButtonHandler({ enabled: false })` 把 Capacitor 那个默认回调关掉。
2. JS 侧：`mobile_back_navigation.ts` 每次栈变化时，把「当前是否还有 JS 层」
   同步给原生（新增一个 `setBackStackDepth(n)` 之类的插件方法）。
3. 栈空时 → `callback.setEnabled(false)` → 返回交还系统 → 系统播放 back-to-home 动画。
4. **栈空时不要用 `App.exitApp()`**（它是 `finish()`，不带动效预览）。
   改为 disable 回调后主动触发一次 `onBackPressedDispatcher().onBackPressed()`，
   让系统自己走完动画并收尾。

**风险与注意**

- 官方明确建议：**不要**在返回事件已经发生后才用条件语句判断要不要拦。
  要把「有没有可返回的层」做成可观察状态，栈变化时同步 enabled，而不是在回调里临时判断。
  否则 JS↔原生状态不同步时会出现「该退没退」或「一次滑动退两层」。
- JS→原生的同步有异步延迟，快速连点返回键时可能错位。建议栈深变化时做防抖 + 幂等上报。
- `canGoBack` 来自 `bridge.getWebView().canGoBack()`，与 hash 路由的真实可退状态不完全等价，
  现有逻辑已在依赖它，层 1 改动时应统一到同一个判据上。

### 层 2：应用内跟手动画 ⚠️ 可选，建议先做折中版

**方案 A（逐帧跟手，成本高风险大）**
原生 `handleOnBackProgressed` 每帧把 `progress / touchX / swipeEdge` 通过
`notifyListeners` 推给 WebView，JS 用 `transform` / `opacity` 驱动抽屉跟手。

> **硬伤**：progress 是 60Hz 逐帧回调，而 Capacitor 每次 `notifyListeners`
> 都是一次跨线程 `evaluateJavascript`。逐帧打过去大概率掉帧，
> 而且官方也要求在 `handleOnBackProgressed` 里**绝不能触发 `requestLayout()`**，
> 只能做 RenderThread 能处理的属性（translationX / scaleX / alpha）。
> 但 WebView 里改 DOM 的 transform 恰恰会走 layout/composite，无法保证。

**方案 B（折中，推荐先做）**

只在三个时机发事件，不追求逐帧：

| 原生回调 | 发给 JS | Web 层做什么 |
|---|---|---|
| `handleOnBackStarted` | `backGestureStarted { swipeEdge }` | 用 CSS transition 把当前顶层"预演"到中间态（抽屉滑出 30%、遮罩变淡），给用户"我知道你要退"的反馈 |
| `handleOnBackCancelled` | `backGestureCancelled` | CSS transition 回滚到初始态 |
| `handleOnBackPressed` | 走现有 `backButton` 链路 | 完成关闭动画 |

视觉上已有明显的"预测感"，但桥上只有 3 次调用，没有 60Hz 压力。

**方案 C（如果一定要逐帧）**
只给最高频的 1–2 个面（建议 `Sidebar` + `ThreadHistoryDrawer`）做逐帧，
其余 10 处走方案 B。控制爆炸半径。

**共同前提**：原生需要知道 Web 层当前栈顶是什么。
建议 JS 在栈顶变化时同步一个描述给插件，例如
`{ type: 'drawer' | 'modal' | 'menu' | 'page', id }`，
原生据此决定要不要拦、以及回调给 JS 时带哪个 target。

---

## 五、明确不需要做的

- ❌ Fragment 迁移 / `FragmentManager` 预测性返回 —— 项目没有 Fragment
- ❌ Material Components (Views) 1.12.0-alpha02+ 的 Bottom sheet / Side sheet / Search 动效 —— 没有用 MDC
- ❌ AndroidX Transitions 1.5.0 + `TransitionManager.controlDelayedTransition` —— 没有用 Transition
- ❌ `overrideActivityTransition` 自定义跨 Activity 动画 —— 单 Activity
- ❌ `PRIORITY_SYSTEM_NAVIGATION_OBSERVER`（Android 16+ 只观察不消费）—— 目前没有埋点需求，跳过

---

## 六、建议的落地顺序

1. **先把 `compileSdk` / `targetSdk` 提到 36**，跑一遍回归
   （合规硬要求，会顺带暴露 edge-to-edge 和大屏适配问题）
2. **做层 1**（back-to-home）
   - 改动集中在：新/改一个 native 插件 + `mobile_back_navigation.ts` 增加栈状态上报
   - 顺带修掉「栈空时走 `finish()` 而非系统动画」的问题
3. **评估层 2**：先上方案 B，真机看效果；不满意再对 1–2 个高频面试方案 C
4. **测试路径**
   - Android 13/14：开发者选项 → 打开「预测性返回动画」
   - Android 15+：默认可见
   - Android 16 + targetSdk 36：强制，无需开关
   - 需覆盖：手势导航 + 三键导航 × 12 个有返回层的界面

---

## 七、参考

- Add support for the predictive back gesture
  <https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture>
- Add support for built-in and custom predictive back animations (Android 14)
  <https://developer.android.com/about/versions/14/features/predictive-back>
- Predictive Back 设计指南
  <https://developer.android.com/design/ui/mobile/gesture-navigation/predictive-back>
- A Developer's Roadmap to Predictive Back (Views) — Android Developers Blog
- Android 16 behavior changes（predictive back 强制 + edge-to-edge 强制）
