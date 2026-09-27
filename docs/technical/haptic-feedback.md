# Android 触觉反馈

> Last updated: 2026-09

AIbox Mobile 的触觉反馈仅在 Android/mobile 平台启用，并通过 `enableHapticFeedback` 设置控制。历史生成状态反馈与流式输出反馈共用 `src/renderer/platform/haptics.ts` 的 Capacitor Haptics 封装；触觉失败不能影响消息生成流程。

## 生成生命周期反馈

| 场景 | 类型 |
|------|------|
| 生成开始 | `light` |
| 用户取消 | `warning` |
| 正常完成 | `success` |
| 生成失败 | `error` |

## 流式输出反馈

流式反馈只消费可见回答的 `text-delta`，不消费 reasoning、工具调用参数、工具结果或状态 chunk。

首个非空文本 chunk 会立即触发一次 `light`，保留首 token 的即时反馈。后续反馈由 `streaming-haptics.ts` 节流：默认需要累计至少 10 个字符且距离上一次流式震动至少 220ms，才会再次触发轻微震动。参数集中在流式震动 controller 中，便于后续根据真机体验调整。

流式震动调用不会阻塞 stream，也不会把 Capacitor 错误传播到编排流程。生成结束、取消或失败时，controller 会被释放，终止后不会补发延迟震动。

## 设置兼容性

`enableHapticFeedback` 是可选设置，缺失时按默认值开启。关闭后，开始、流式、完成、取消和错误反馈全部禁用。该设置沿用现有 Settings Schema 和持久化机制，不需要数据库迁移。

## 验证要点

Android 真机或模拟器需要覆盖：正常高速/低速流式输出、短回答、长回答、取消、错误、工具调用、开关关闭，以及后台回前台后的生成流程。重点确认没有按 token 高频震动、震动堆积或影响停止按钮和消息渲染。
