import { Capacitor } from '@capacitor/core'
import { type StartStreamOptions, StreamHttp } from 'capacitor-stream-http'
import { ApiError } from '../../shared/models/errors'
import { notifyNativeStreamCancelled, registerNativeStreamRecoveryHandler } from './background-stream-recovery'

export type { StartStreamOptions } from 'capacitor-stream-http'
export { StreamHttp }

export type NativeStreamStateName = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'missing'

export interface NativeStreamState {
  id: string
  state: NativeStreamStateName
  lastSequence: number
  terminalSequence?: number
  firstBufferedSequence?: number
  bufferTruncated?: boolean
  cancelledByNotification?: boolean
  status?: number
  headers?: Record<string, string>
  error?: string
  errorBody?: string
}

export interface NativeStreamChunk {
  id: string
  sequence: number
  chunk: string
}

export interface AttachNativeStreamOptions {
  id: string
  /** Last contiguous chunk already persisted by the renderer. */
  lastSequence?: number
}

export interface NativeStreamHandle {
  readonly stream: NativeReadableStream
  readonly id: Promise<string>
  readonly ready: Promise<NativeStreamState>
  readonly lastSequence: number
  getState(): Promise<NativeStreamState>
  recover(): Promise<NativeStreamState>
  cancel(): Promise<void>
}

export interface NativeReadableStream extends ReadableStream<Uint8Array> {
  readonly nativeStream: NativeStreamHandle
}

interface NativeStreamChunkEvent extends NativeStreamChunk {
  status?: number
  headers?: Record<string, string>
}

interface NativeStreamTerminalEvent {
  id: string
  sequence: number
  cancelled?: boolean
  cancelledByNotification?: boolean
  status?: number
  headers?: Record<string, string>
  error?: string
  errorBody?: string
}

interface NativeReplayResult {
  chunks: NativeStreamChunkEvent[]
  state: NativeStreamState
  hasMore?: boolean
}

interface NativeListenerHandle {
  remove: () => void | Promise<void>
}

interface DurableStreamHttpPlugin {
  startStream(options: StartStreamOptions): Promise<{ id: string }>
  cancelStream(options: { id: string }): Promise<void>
  attachStream(options: AttachNativeStreamOptions): Promise<NativeStreamState>
  getStreamState(options: { id: string }): Promise<NativeStreamState>
  replayChunks(options: { id: string; afterSequence?: number }): Promise<NativeReplayResult>
  addListener(
    eventName: 'chunk' | 'end' | 'error',
    listenerFunc: (data: NativeStreamChunkEvent | NativeStreamTerminalEvent) => void
  ): Promise<NativeListenerHandle>
}

type StreamSource =
  | { type: 'start'; options: StartStreamOptions }
  | { type: 'attach'; options: AttachNativeStreamOptions }

type LiveEvent =
  | { type: 'chunk'; data: NativeStreamChunkEvent }
  | { type: 'end'; data: NativeStreamTerminalEvent }
  | { type: 'error'; data: NativeStreamTerminalEvent }

const PRE_ID_EVENT_LIMIT = 128
const activeStreams = new Map<string, NativeStreamSession>()

function supportsDurableNativeStreams(): boolean {
  // The foreground-service manager and its replay protocol are implemented by
  // the Android plugin. iOS keeps its existing native URLSession stream until
  // it implements the same attach/replay contract.
  return Capacitor.getPlatform() === 'android'
}

function getNativePlugin(): DurableStreamHttpPlugin {
  return StreamHttp as unknown as DurableStreamHttpPlugin
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  // The stream can be consumed without explicitly observing these helper promises.
  void promise.catch(() => undefined)
  return { promise, resolve, reject }
}

function toNonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

function toSequence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function normalizeState(state: NativeStreamState, expectedId: string): NativeStreamState {
  const stateName: NativeStreamStateName =
    state.state === 'pending' ||
    state.state === 'running' ||
    state.state === 'completed' ||
    state.state === 'failed' ||
    state.state === 'cancelled' ||
    state.state === 'missing'
      ? state.state
      : 'missing'

  return {
    ...state,
    id: typeof state.id === 'string' ? state.id : expectedId,
    state: stateName,
    lastSequence: toNonNegativeInteger(state.lastSequence),
    firstBufferedSequence: toSequence(state.firstBufferedSequence),
  }
}

function isTerminalState(state: NativeStreamState): boolean {
  return (
    state.state === 'completed' || state.state === 'failed' || state.state === 'cancelled' || state.state === 'missing'
  )
}

function lastChunkSequence(state: NativeStreamState): number {
  const terminalSequence = toSequence(state.terminalSequence)
  return terminalSequence ? Math.min(state.lastSequence, terminalSequence - 1) : state.lastSequence
}

export class NativeStreamHttpError extends ApiError {
  readonly status?: number
  readonly headers?: Record<string, string>
  readonly errorBody?: string

  constructor(state: Pick<NativeStreamState, 'status' | 'headers' | 'error' | 'errorBody'>) {
    const message =
      state.error ||
      (state.status ? `Native stream request failed with status ${state.status}` : 'Native stream failed')
    super(message, state.errorBody, state.status)
    this.name = 'NativeStreamHttpError'
    // Keep the native bridge's concise error text while preserving ApiError's
    // statusCode/responseBody classification for model-level error handling.
    this.message = message
    this.status = state.status
    this.headers = state.headers
    this.errorBody = state.errorBody
  }
}

class NativeStreamSession {
  private readonly plugin = getNativePlugin()
  private readonly encoder = new TextEncoder()
  private readonly idDeferred = createDeferred<string>()
  private readonly readyDeferred = createDeferred<NativeStreamState>()
  private readonly pendingChunks = new Map<number, NativeStreamChunk>()
  private readonly preIdEvents: LiveEvent[] = []
  private readonly listeners: NativeListenerHandle[] = []

  private controller: ReadableStreamDefaultController<Uint8Array> | undefined
  private streamId: string | undefined
  private currentState: NativeStreamState | undefined
  private lastDeliveredSequence: number
  private initialized = false
  private closed = false
  private cancellationRequested = false
  private cancellationPromise: Promise<void> | undefined
  private recoveryPromise: Promise<NativeStreamState> | undefined
  private terminalEventReceivedDuringInitialization = false

  readonly stream: ReadableStream<Uint8Array>

  constructor(private readonly source: StreamSource) {
    this.lastDeliveredSequence = source.type === 'attach' ? toNonNegativeInteger(source.options.lastSequence) : 0
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => this.start(controller),
      cancel: () => this.cancel(),
    })
  }

  get id(): Promise<string> {
    return this.idDeferred.promise
  }

  get ready(): Promise<NativeStreamState> {
    return this.readyDeferred.promise
  }

  get lastSequence(): number {
    return this.lastDeliveredSequence
  }

  async getState(): Promise<NativeStreamState> {
    const id = await this.id
    if (!supportsDurableNativeStreams()) {
      return (
        this.currentState || {
          id,
          state: 'running',
          lastSequence: this.lastDeliveredSequence,
        }
      )
    }
    const state = normalizeState(await this.plugin.getStreamState({ id }), id)
    this.currentState = state
    return state
  }

  recover(): Promise<NativeStreamState> {
    if (this.closed) {
      return Promise.resolve(
        this.currentState || {
          id: this.streamId || '',
          state: 'cancelled',
          lastSequence: this.lastDeliveredSequence,
        }
      )
    }

    if (!supportsDurableNativeStreams()) {
      return this.id.then(
        (id) =>
          this.currentState || {
            id,
            state: 'running',
            lastSequence: this.lastDeliveredSequence,
          }
      )
    }

    if (!this.recoveryPromise) {
      this.recoveryPromise = this.synchronize().finally(() => {
        this.recoveryPromise = undefined
      })
    }
    return this.recoveryPromise
  }

  cancel(): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (!this.cancellationPromise) {
      this.cancellationRequested = true
      this.cancellationPromise = this.cancelNative().finally(() => {
        this.cancellationPromise = undefined
      })
    }
    return this.cancellationPromise
  }

  private async cancelNative(): Promise<void> {
    const id = await this.id
    await this.plugin.cancelStream({ id })
    this.currentState = {
      id,
      state: 'cancelled',
      lastSequence: this.lastDeliveredSequence,
    }
    await this.close()
  }

  private async start(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    this.controller = controller
    try {
      await this.installListeners()
      if (this.closed) return

      if (this.source.type === 'start') {
        const result = await this.plugin.startStream(this.source.options)
        this.setStreamId(result.id)
      } else {
        this.setStreamId(this.source.options.id)
      }

      if (this.cancellationRequested) {
        // `cancel()` may already be waiting for the id because a caller
        // aborted before startStream resolved. Awaiting it here would await
        // the same promise from inside its own initializer and leave the
        // ReadableStream permanently pending. The in-flight cancellation
        // owns cleanup; initialization only needs to publish the state.
        this.initialized = true
        const cancelledState = this.currentState || {
          id: this.streamId || '',
          state: 'cancelled' as const,
          lastSequence: this.lastDeliveredSequence,
        }
        this.currentState = cancelledState
        this.readyDeferred.resolve(cancelledState)
        return
      }

      const state = supportsDurableNativeStreams()
        ? await this.recover()
        : {
            id: this.streamId || '',
            state: 'running' as const,
            lastSequence: this.lastDeliveredSequence,
          }
      this.currentState = state
      this.initialized = true
      this.readyDeferred.resolve(state)
      if (this.terminalEventReceivedDuringInitialization) {
        this.terminalEventReceivedDuringInitialization = false
        this.recoverAfterTerminalEvent()
      }
    } catch (error) {
      this.initialized = true
      if (!this.streamId) this.idDeferred.reject(error)
      this.readyDeferred.reject(error)
      if (this.streamId && this.source.type === 'start') {
        void this.plugin.cancelStream({ id: this.streamId }).catch(() => undefined)
      }
      await this.fail(error instanceof Error ? error : new Error('Failed to initialize native stream'))
    }
  }

  private async installListeners(): Promise<void> {
    const listenerSpecs: Array<{
      type: LiveEvent['type']
      eventName: 'chunk' | 'end' | 'error'
    }> = [
      { type: 'chunk', eventName: 'chunk' },
      { type: 'end', eventName: 'end' },
      { type: 'error', eventName: 'error' },
    ]

    try {
      for (const { type, eventName } of listenerSpecs) {
        const listener = await this.plugin.addListener(eventName, (data) => {
          this.onLiveEvent({ type, data: data as NativeStreamChunkEvent & NativeStreamTerminalEvent } as LiveEvent)
        })
        this.listeners.push(listener)
      }
    } catch (error) {
      await this.removeListeners()
      throw error
    }
  }

  private setStreamId(id: string): void {
    if (!id) throw new Error('Native stream did not return an id')
    this.streamId = id
    this.idDeferred.resolve(id)
    activeStreams.set(id, this)

    const pendingEvents = this.preIdEvents.splice(0)
    for (const event of pendingEvents) {
      this.onLiveEvent(event)
    }
  }

  private onLiveEvent(event: LiveEvent): void {
    const eventId = event.data.id
    if (!eventId) return

    if (!this.streamId) {
      if (this.preIdEvents.length < PRE_ID_EVENT_LIMIT) this.preIdEvents.push(event)
      return
    }
    if (this.closed || eventId !== this.streamId) return

    this.updateResponseMetadata(event.data)
    if (event.type === 'chunk') {
      this.acceptChunk(event.data)
      return
    }

    if (!supportsDurableNativeStreams()) {
      void this.finishLegacyTerminal(event)
      return
    }

    if (!this.initialized) {
      // A terminal event can arrive after the first replay snapshot says
      // "running" but before initialization completes. Replay it once the
      // initial attach has settled so the ReadableStream cannot stay open.
      this.terminalEventReceivedDuringInitialization = true
      return
    }
    this.recoverAfterTerminalEvent()
  }

  private recoverAfterTerminalEvent(): void {
    void this.recover().catch((error) => {
      void this.fail(error instanceof Error ? error : new Error('Failed to recover native stream'))
    })
  }

  private updateResponseMetadata(data: Pick<NativeStreamChunkEvent, 'status' | 'headers'>): void {
    if (data.status === undefined && data.headers === undefined) return
    const state =
      this.currentState ||
      ({
        id: this.streamId || '',
        state: 'running',
        lastSequence: this.lastDeliveredSequence,
      } satisfies NativeStreamState)
    this.currentState = {
      ...state,
      status: data.status ?? state.status,
      headers: data.headers ?? state.headers,
    }
  }

  private acceptChunk(chunk: NativeStreamChunk): void {
    const sequence = toSequence(chunk.sequence) || this.nextSyntheticSequence()
    if (sequence <= this.lastDeliveredSequence || this.pendingChunks.has(sequence)) return

    this.pendingChunks.set(sequence, {
      id: chunk.id,
      sequence,
      chunk: typeof chunk.chunk === 'string' ? chunk.chunk : '',
    })
    this.flushChunks()
  }

  private nextSyntheticSequence(): number {
    let sequence = this.lastDeliveredSequence + 1
    while (this.pendingChunks.has(sequence)) sequence += 1
    return sequence
  }

  private async finishLegacyTerminal(event: Exclude<LiveEvent, { type: 'chunk' }>): Promise<void> {
    const terminalSequence = toSequence(event.data.sequence) || this.lastDeliveredSequence + 1
    const state: NativeStreamState = {
      id: this.streamId || event.data.id,
      state: event.type === 'error' ? 'failed' : event.data.cancelled ? 'cancelled' : 'completed',
      lastSequence: Math.max(this.lastDeliveredSequence, terminalSequence),
      terminalSequence,
      status: event.data.status,
      headers: event.data.headers,
      error: event.data.error,
      errorBody: event.data.errorBody,
    }
    this.currentState = state
    if (state.state === 'failed') {
      await this.fail(new NativeStreamHttpError(state))
      return
    }
    await this.close()
  }

  private flushChunks(): void {
    while (!this.closed) {
      const nextSequence = this.lastDeliveredSequence + 1
      const nextChunk = this.pendingChunks.get(nextSequence)
      if (!nextChunk) return

      this.pendingChunks.delete(nextSequence)
      this.lastDeliveredSequence = nextSequence
      try {
        this.controller?.enqueue(this.encoder.encode(nextChunk.chunk))
      } catch {
        void this.close()
        return
      }
    }
  }

  private async synchronize(): Promise<NativeStreamState> {
    const id = await this.id
    const attachedState = normalizeState(
      await this.plugin.attachStream({ id, lastSequence: this.lastDeliveredSequence }),
      id
    )
    this.currentState = attachedState

    let replayAfterSequence = this.lastDeliveredSequence
    let state = attachedState
    for (;;) {
      const replay = await this.plugin.replayChunks({ id, afterSequence: replayAfterSequence })
      let highestReplayedSequence = replayAfterSequence
      for (const chunk of replay.chunks || []) {
        if (chunk.id !== id) continue
        this.acceptChunk(chunk)
        highestReplayedSequence = Math.max(highestReplayedSequence, toSequence(chunk.sequence) || 0)
      }

      state = normalizeState(replay.state || attachedState, id)
      this.currentState = state
      if (!replay.hasMore) break
      if (highestReplayedSequence <= replayAfterSequence) {
        throw new Error(`Native stream replay stalled at sequence ${replayAfterSequence}`)
      }
      replayAfterSequence = highestReplayedSequence
    }

    const firstBufferedSequence = toSequence(state.firstBufferedSequence)
    const replayHasGap = firstBufferedSequence
      ? firstBufferedSequence > this.lastDeliveredSequence + 1
      : lastChunkSequence(state) > this.lastDeliveredSequence
    if (state.bufferTruncated && replayHasGap) {
      await this.fail(
        new Error(`Native stream replay buffer was truncated before sequence ${lastChunkSequence(state)}`)
      )
      return state
    }

    await this.finishIfTerminal(true)
    return state
  }

  private async finishIfTerminal(fromReplay: boolean): Promise<void> {
    const state = this.currentState
    if (!state || !isTerminalState(state) || this.closed) return

    const expectedLastChunkSequence = lastChunkSequence(state)
    if (expectedLastChunkSequence > this.lastDeliveredSequence) {
      if (fromReplay) {
        await this.fail(
          new Error(
            `Native stream replay is incomplete: expected sequence ${expectedLastChunkSequence}, received ${this.lastDeliveredSequence}`
          )
        )
      } else {
        void this.recover().catch((error) => {
          void this.fail(error instanceof Error ? error : new Error('Failed to recover native stream'))
        })
      }
      return
    }

    if (state.state === 'failed') {
      await this.fail(new NativeStreamHttpError(state))
      return
    }
    if (state.state === 'missing') {
      await this.fail(new Error('Native stream is no longer available'))
      return
    }
    if (state.state === 'cancelled' && state.cancelledByNotification) {
      // Android's notification stops every native task. Keep the session state
      // in sync so this partial reply is finalized as canceled, not successful.
      notifyNativeStreamCancelled()
    }
    await this.close()
  }

  private async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.streamId) activeStreams.delete(this.streamId)
    this.preIdEvents.length = 0
    this.pendingChunks.clear()
    try {
      this.controller?.close()
    } catch {
      // A cancelled reader has already closed this stream.
    }
    await this.removeListeners()
  }

  private async fail(error: Error): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.streamId) activeStreams.delete(this.streamId)
    this.preIdEvents.length = 0
    this.pendingChunks.clear()
    try {
      this.controller?.error(error)
    } catch {
      // A cancelled reader cannot receive a later error.
    }
    await this.removeListeners()
  }

  private async removeListeners(): Promise<void> {
    const listeners = this.listeners.splice(0)
    await Promise.allSettled(listeners.map((listener) => Promise.resolve(listener.remove())))
  }
}

function createNativeStream(source: StreamSource): NativeStreamHandle {
  const session = new NativeStreamSession(source)
  const stream = session.stream as NativeReadableStream
  const handle: NativeStreamHandle = {
    stream,
    id: session.id,
    ready: session.ready,
    get lastSequence() {
      return session.lastSequence
    },
    getState: () => session.getState(),
    recover: () => session.recover(),
    cancel: () => session.cancel(),
  }

  Object.defineProperty(stream, 'nativeStream', {
    configurable: false,
    enumerable: false,
    value: handle,
  })
  return handle
}

export function startNativeStream(options: StartStreamOptions): NativeStreamHandle {
  return createNativeStream({ type: 'start', options })
}

export function attachNativeStream(options: AttachNativeStreamOptions): NativeStreamHandle {
  if (!supportsDurableNativeStreams()) {
    throw new Error('Native stream attachment is only supported on Android')
  }
  return createNativeStream({ type: 'attach', options })
}

/** Start a native HTTP stream while preserving the existing request-layer API. */
export function createNativeReadableStream(options: StartStreamOptions): NativeReadableStream {
  return startNativeStream(options).stream
}

/** Reattach to an existing native task and replay chunks after the given checkpoint. */
export function attachNativeReadableStream(options: AttachNativeStreamOptions): NativeReadableStream {
  return attachNativeStream(options).stream
}

export function getNativeStreamHandle(stream: ReadableStream<Uint8Array>): NativeStreamHandle | undefined {
  return (stream as Partial<NativeReadableStream>).nativeStream
}

export async function getNativeStreamState(id: string): Promise<NativeStreamState> {
  if (!supportsDurableNativeStreams()) {
    throw new Error('Native stream state is only available on Android')
  }
  return normalizeState(await getNativePlugin().getStreamState({ id }), id)
}

/** Reattach all renderer-held streams after Android resumes the WebView. */
export async function recoverActiveNativeStreams(): Promise<void> {
  const sessions = [...activeStreams.values()]
  const results = await Promise.allSettled(sessions.map((session) => session.recover()))
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failure) throw failure.reason
}

registerNativeStreamRecoveryHandler(recoverActiveNativeStreams)
