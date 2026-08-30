# 本地诊断日志

> Last updated: 2026-08

AIbox Mobile 不初始化 Sentry，也不会把错误报告发送到 Chatbox 或其他远程错误收集服务。历史代码仍保留 `SentryAdapter` 和 `reportError()` 名称，以兼容共享调用方；它们现在只写入平台本地日志。

## 日志路径

| 平台 | 写入位置 | 导出入口 |
|------|----------|----------|
| Android | Capacitor `Filesystem` 的应用私有 `Directory.Data`，文件名为 `chatbox-app.log` | 设置 → 常规 → 诊断日志 |
| Web | Web logger 的本地存储 | 设置 → 常规 → 诊断日志 |
| Desktop | Electron 主进程 `electron-log` | 设置 → 常规 → 诊断日志 |

Android 日志文件不在共享存储中，其他应用无法直接读取。文件超过 5 MB 或保留超过 30 天时轮转，最多保留三个备份。导出前会先刷新缓冲区；导出的文本仍应按不可信诊断数据处理。

## 记录规范

Renderer 使用 `src/renderer/utils/sentry.ts` 的 `reportError()` 记录预期边界之外的异常：

```ts
reportError(error, {
  domain: 'storage',
  operation: 'migration',
  priority: 'high',
})
```

`domain`、`operation`、`priority` 和少量数值型 extra 用于定位故障。调用方不得附加 prompt、消息正文、请求体、响应体、文件内容、路径、URL、API key、token 或用户标识。`withScope()` 仍提供兼容接口，但本地实现不会上传任何事件。

## 脱敏边界

写入日志前会处理：

- `Bearer`、`sk-` 类型密钥，以及 `apiKey`、`accessToken`、`refreshToken`、`password`、`secret`、`licenseKey` 等键值；
- URL 的 query 中常见的 `api_key`、`access_token`、`token`、`key` 参数；
- 错误消息和 stack 中的 HTTP/HTTPS/WSS URL；
- MCP 连接错误中的 endpoint、Authorization 和密钥片段。

诊断日志只用于用户主动导出和本地排障。日志脱敏不是数据隔离边界，任何导出文件都应在分享前再次检查。

## 隐私与 analytics

Android 强制关闭 `allowReportingAndTracking`，因此不会初始化可选的远程 analytics。桌面和 Web 仍可在设置中单独选择匿名使用分析；该开关与本地错误日志无关，关闭后不影响本地记录和导出。

## 兼容性说明

`initSentry()`、`flushSentry()` 和 `SentryErrorBoundary` 是历史兼容入口。它们不会加载 Sentry SDK、读取 DSN、创建远程 transport 或等待网络 flush。新增代码应使用 `reportError()`，并在调用前排除用户可理解且已有 UI 反馈的业务错误。
