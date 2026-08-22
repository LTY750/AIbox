import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativeStreamMock = vi.hoisted(() => {
  const listeners: Record<string, Array<(data: Record<string, unknown>) => void>> = {
    chunk: [],
    end: [],
    error: [],
  }
  const removes: ReturnType<typeof vi.fn>[] = []
  const addListener = vi.fn((eventName: string, listener: (data: Record<string, unknown>) => void) => {
    listeners[eventName].push(listener)
    const remove = vi.fn(() => {
      const index = listeners[eventName].indexOf(listener)
      if (index >= 0) listeners[eventName].splice(index, 1)
    })
    removes.push(remove)
    return Promise.resolve({ remove })
  })

  return {
    listeners,
    removes,
    addListener,
    startStream: vi.fn(),
    cancelStream: vi.fn(),
    attachStream: vi.fn(),
    getStreamState: vi.fn(),
    replayChunks: vi.fn(),
  }
})

const registerRecoveryHandlerMock = vi.hoisted(() => vi.fn())
const notifyNativeStreamCancelledMock = vi.hoisted(() => vi.fn())
const getPlatformMock = vi.hoisted(() => vi.fn(() => 'android'))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: getPlatformMock,
  },
}))

vi.mock('capacitor-stream-http', () => ({
  StreamHttp: nativeStreamMock,
}))

vi.mock('./background-stream-recovery', () => ({
  notifyNativeStreamCancelled: notifyNativeStreamCancelledMock,
  registerNativeStreamRecoveryHandler: registerRecoveryHandlerMock,
}))

import {
  attachNativeReadableStream,
  createNativeReadableStream,
  getNativeStreamHandle,
  type NativeStreamHttpError,
  type NativeStreamState,
  recoverActiveNativeStreams,
} from './stream-http'

function streamState(overrides: Partial<NativeStreamState> = {}): NativeStreamState {
  return {
    id: 'stream-1',
    state: 'running',
    lastSequence: 0,
    ...overrides,
  }
}

function emit(eventName: 'chunk' | 'end' | 'error', data: Record<string, unknown>) {
  for (const listener of [...nativeStreamMock.listeners[eventName]]) listener(data)
}

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return result
    result += decoder.decode(value, { stream: true })
  }
}

describe('durable native stream bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPlatformMock.mockReturnValue('android')
    nativeStreamMock.listeners.chunk.length = 0
    nativeStreamMock.listeners.end.length = 0
    nativeStreamMock.listeners.error.length = 0
    nativeStreamMock.removes.length = 0
    nativeStreamMock.addListener.mockImplementation(
      (eventName: string, listener: (data: Record<string, unknown>) => void) => {
        nativeStreamMock.listeners[eventName].push(listener)
        const remove = vi.fn(() => {
          const index = nativeStreamMock.listeners[eventName].indexOf(listener)
          if (index >= 0) nativeStreamMock.listeners[eventName].splice(index, 1)
        })
        nativeStreamMock.removes.push(remove)
        return Promise.resolve({ remove })
      }
    )
    nativeStreamMock.startStream.mockResolvedValue({ id: 'stream-1' })
    nativeStreamMock.cancelStream.mockResolvedValue(undefined)
    nativeStreamMock.attachStream.mockResolvedValue(streamState())
    nativeStreamMock.getStreamState.mockResolvedValue(streamState())
    nativeStreamMock.replayChunks.mockResolvedValue({
      chunks: [],
      state: streamState(),
      hasMore: false,
    })
  })

  it('orders out-of-order chunks, ignores duplicates, and cleans up listeners after completion', async () => {
    nativeStreamMock.attachStream
      .mockResolvedValueOnce(streamState())
      .mockResolvedValueOnce(streamState({ state: 'completed', lastSequence: 3, terminalSequence: 4 }))
    nativeStreamMock.replayChunks
      .mockResolvedValueOnce({ chunks: [], state: streamState(), hasMore: false })
      .mockResolvedValueOnce({
        chunks: [],
        state: streamState({ state: 'completed', lastSequence: 3, terminalSequence: 4 }),
        hasMore: false,
      })

    const stream = createNativeReadableStream({ url: 'https://example.com', method: 'POST' })
    await stream.nativeStream.ready

    emit('chunk', { id: 'other-stream', sequence: 1, chunk: 'ignored' })
    emit('chunk', { id: 'stream-1', sequence: 1, chunk: 'one' })
    emit('chunk', { id: 'stream-1', sequence: 3, chunk: 'three' })
    emit('chunk', { id: 'stream-1', sequence: 1, chunk: 'duplicate' })
    emit('chunk', { id: 'stream-1', sequence: 2, chunk: 'two' })
    emit('end', { id: 'stream-1', sequence: 4 })

    await expect(readText(stream)).resolves.toBe('onetwothree')
    expect(stream.nativeStream.lastSequence).toBe(3)
    expect(getNativeStreamHandle(stream)).toBe(stream.nativeStream)
    expect(nativeStreamMock.removes).toHaveLength(3)
    expect(nativeStreamMock.removes.every((remove) => remove.mock.calls.length === 1)).toBe(true)
  })

  it('replays every native batch after an attachment checkpoint', async () => {
    nativeStreamMock.attachStream.mockResolvedValue(
      streamState({ id: 'restored', state: 'completed', lastSequence: 4, terminalSequence: 5 })
    )
    nativeStreamMock.replayChunks
      .mockResolvedValueOnce({
        chunks: [{ id: 'restored', sequence: 2, chunk: 'B' }],
        state: streamState({ id: 'restored', lastSequence: 2 }),
        hasMore: true,
      })
      .mockResolvedValueOnce({
        chunks: [
          { id: 'restored', sequence: 3, chunk: 'C' },
          { id: 'restored', sequence: 4, chunk: 'D' },
        ],
        state: streamState({ id: 'restored', state: 'completed', lastSequence: 4, terminalSequence: 5 }),
        hasMore: false,
      })

    const stream = attachNativeReadableStream({ id: 'restored', lastSequence: 1 })

    await expect(readText(stream)).resolves.toBe('BCD')
    expect(nativeStreamMock.attachStream).toHaveBeenCalledWith({ id: 'restored', lastSequence: 1 })
    expect(nativeStreamMock.replayChunks).toHaveBeenNthCalledWith(1, { id: 'restored', afterSequence: 1 })
    expect(nativeStreamMock.replayChunks).toHaveBeenNthCalledWith(2, { id: 'restored', afterSequence: 2 })
  })

  it('accepts an evicted replay prefix when the renderer had already delivered it', async () => {
    const completedState = streamState({
      id: 'restored',
      state: 'completed',
      lastSequence: 3,
      terminalSequence: 4,
      firstBufferedSequence: 2,
      bufferTruncated: true,
    })
    nativeStreamMock.attachStream.mockResolvedValue(completedState)
    nativeStreamMock.replayChunks.mockResolvedValue({
      chunks: [
        { id: 'restored', sequence: 2, chunk: 'two' },
        { id: 'restored', sequence: 3, chunk: 'three' },
      ],
      state: completedState,
      hasMore: false,
    })

    const stream = attachNativeReadableStream({ id: 'restored', lastSequence: 1 })

    await expect(readText(stream)).resolves.toBe('twothree')
  })

  it('recovers active streams without replaying chunks already delivered to the renderer', async () => {
    nativeStreamMock.attachStream
      .mockResolvedValueOnce(streamState())
      .mockResolvedValueOnce(streamState({ state: 'completed', lastSequence: 2, terminalSequence: 3 }))
    nativeStreamMock.replayChunks
      .mockResolvedValueOnce({ chunks: [], state: streamState(), hasMore: false })
      .mockResolvedValueOnce({
        chunks: [
          { id: 'stream-1', sequence: 1, chunk: 'duplicate' },
          { id: 'stream-1', sequence: 2, chunk: 'two' },
        ],
        state: streamState({ state: 'completed', lastSequence: 2, terminalSequence: 3 }),
        hasMore: false,
      })

    const stream = createNativeReadableStream({ url: 'https://example.com', method: 'POST' })
    await stream.nativeStream.ready
    emit('chunk', { id: 'stream-1', sequence: 1, chunk: 'one' })

    await recoverActiveNativeStreams()

    await expect(readText(stream)).resolves.toBe('onetwo')
    expect(nativeStreamMock.attachStream).toHaveBeenNthCalledWith(2, { id: 'stream-1', lastSequence: 1 })
    expect(nativeStreamMock.replayChunks).toHaveBeenNthCalledWith(2, { id: 'stream-1', afterSequence: 1 })
  })

  it('cancels the native task through the handle and removes bridge listeners', async () => {
    const stream = createNativeReadableStream({ url: 'https://example.com', method: 'POST' })
    await stream.nativeStream.ready

    await stream.nativeStream.cancel()

    expect(nativeStreamMock.cancelStream).toHaveBeenCalledWith({ id: 'stream-1' })
    await expect(readText(stream)).resolves.toBe('')
    expect(nativeStreamMock.removes.every((remove) => remove.mock.calls.length === 1)).toBe(true)
  })

  it('does not deadlock when cancellation races native stream startup', async () => {
    let resolveStart!: (value: { id: string }) => void
    nativeStreamMock.startStream.mockReturnValueOnce(
      new Promise<{ id: string }>((resolve) => {
        resolveStart = resolve
      })
    )

    const stream = createNativeReadableStream({ url: 'https://example.com', method: 'POST' })
    const cancellation = stream.nativeStream.cancel()
    resolveStart({ id: 'stream-1' })

    await expect(cancellation).resolves.toBeUndefined()
    await expect(stream.nativeStream.ready).resolves.toMatchObject({ state: 'cancelled' })
    expect(nativeStreamMock.cancelStream).toHaveBeenCalledWith({ id: 'stream-1' })
  })

  it('surfaces native HTTP failures with status and bounded response body', async () => {
    nativeStreamMock.attachStream.mockResolvedValue(
      streamState({
        state: 'failed',
        status: 429,
        error: 'Rate limited',
        errorBody: '{"error":"slow down"}',
        terminalSequence: 1,
      })
    )
    nativeStreamMock.replayChunks.mockResolvedValue({
      chunks: [],
      state: streamState({
        state: 'failed',
        status: 429,
        error: 'Rate limited',
        errorBody: '{"error":"slow down"}',
        terminalSequence: 1,
      }),
      hasMore: false,
    })

    const stream = createNativeReadableStream({ url: 'https://example.com', method: 'POST' })
    const reader = stream.getReader()

    await expect(reader.read()).rejects.toMatchObject({
      name: 'NativeStreamHttpError',
      message: 'Rate limited',
      status: 429,
      errorBody: '{"error":"slow down"}',
      statusCode: 429,
      responseBody: '{"error":"slow down"}',
    } satisfies Partial<NativeStreamHttpError>)
  })

  it('recovers a terminal event that arrives while the initial attachment is settling', async () => {
    const completedState = streamState({ state: 'completed', lastSequence: 1, terminalSequence: 1 })
    nativeStreamMock.attachStream.mockResolvedValueOnce(streamState()).mockResolvedValueOnce(completedState)
    nativeStreamMock.replayChunks
      .mockImplementationOnce(() => {
        emit('end', { id: 'stream-1', sequence: 1 })
        return Promise.resolve({ chunks: [], state: streamState(), hasMore: false })
      })
      .mockResolvedValueOnce({ chunks: [], state: completedState, hasMore: false })

    const stream = createNativeReadableStream({ url: 'https://example.com', method: 'POST' })

    await expect(readText(stream)).resolves.toBe('')
    expect(nativeStreamMock.attachStream).toHaveBeenCalledTimes(2)
  })

  it('keeps the existing iOS stream protocol instead of requesting Android replay methods', async () => {
    getPlatformMock.mockReturnValue('ios')
    const stream = createNativeReadableStream({ url: 'https://example.com', method: 'POST' })

    await stream.nativeStream.ready
    expect(nativeStreamMock.attachStream).not.toHaveBeenCalled()
    expect(nativeStreamMock.replayChunks).not.toHaveBeenCalled()

    emit('chunk', { id: 'stream-1', chunk: 'one' })
    emit('end', { id: 'stream-1' })

    await expect(readText(stream)).resolves.toBe('one')
  })

  it('reports notification-triggered native cancellation to session orchestration', async () => {
    const cancelledState = streamState({
      state: 'cancelled',
      lastSequence: 1,
      terminalSequence: 1,
      cancelledByNotification: true,
    })
    nativeStreamMock.attachStream.mockResolvedValue(cancelledState)
    nativeStreamMock.replayChunks.mockResolvedValue({ chunks: [], state: cancelledState, hasMore: false })

    const stream = createNativeReadableStream({ url: 'https://example.com', method: 'POST' })

    await stream.nativeStream.ready
    expect(notifyNativeStreamCancelledMock).toHaveBeenCalledOnce()
  })
})
