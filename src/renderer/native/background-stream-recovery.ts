/**
 * Coordinates foreground recovery without coupling session orchestration to the
 * Capacitor stream implementation. The stream bridge installs the handler when
 * it has at least one native stream that can be reattached.
 */
export type NativeStreamRecoveryHandler = () => Promise<void>
export type NativeStreamCancellationHandler = () => void

let handler: NativeStreamRecoveryHandler | undefined
let inFlight: Promise<void> | undefined
let cancellationHandler: NativeStreamCancellationHandler | undefined

export function registerNativeStreamRecoveryHandler(nextHandler: NativeStreamRecoveryHandler): () => void {
  handler = nextHandler
  return () => {
    if (handler === nextHandler) {
      handler = undefined
    }
  }
}

/** Reattach any renderer-held native streams after the WebView becomes active again. */
export function recoverNativeStreamsAfterForeground(): Promise<void> {
  if (!handler) {
    return Promise.resolve()
  }
  if (!inFlight) {
    inFlight = Promise.resolve()
      .then(handler)
      .finally(() => {
        inFlight = undefined
      })
  }
  return inFlight
}

/** Called when Android's foreground-notification Stop action cancels native tasks. */
export function registerNativeStreamCancellationHandler(nextHandler: NativeStreamCancellationHandler): () => void {
  cancellationHandler = nextHandler
  return () => {
    if (cancellationHandler === nextHandler) {
      cancellationHandler = undefined
    }
  }
}

export function notifyNativeStreamCancelled(): void {
  cancellationHandler?.()
}

export function resetNativeStreamRecoveryForTests(): void {
  handler = undefined
  inFlight = undefined
  cancellationHandler = undefined
}
