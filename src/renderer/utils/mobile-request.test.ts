import { beforeEach, describe, expect, test, vi } from 'vitest'

const capacitorRequest = vi.hoisted(() => vi.fn())
const nativeReadableStream = vi.hoisted(() => vi.fn())
const nativeStreamHandle = vi.hoisted(() => vi.fn())

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: {
    request: capacitorRequest,
  },
}))

vi.mock('@/native/stream-http', () => ({
  createNativeReadableStream: nativeReadableStream,
  getNativeStreamHandle: nativeStreamHandle,
}))

import { cancelReadableStreamOnAbort, handleMobileRequest } from './mobile-request'

describe('mobile request transport', () => {
  beforeEach(() => {
    capacitorRequest.mockReset()
    nativeReadableStream.mockReset()
    nativeStreamHandle.mockReset()
  })

  test('serializes FormData files for the Capacitor native HTTP bridge', async () => {
    capacitorRequest.mockResolvedValue({
      data: '{}',
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const form = new FormData()
    form.append('model', 'gpt-image-2')
    form.append('image', new File([new Uint8Array([1, 2, 3])], 'input.png', { type: 'image/png' }))

    await handleMobileRequest(
      'https://example.com/v1/images/edits',
      'POST',
      new Headers({ Authorization: 'Bearer test-key' }),
      form
    )

    expect(capacitorRequest).toHaveBeenCalledOnce()
    const request = capacitorRequest.mock.calls[0][0]
    expect(request).toMatchObject({
      url: 'https://example.com/v1/images/edits',
      method: 'POST',
      dataType: 'formData',
      responseType: 'text',
      data: [
        { key: 'model', value: 'gpt-image-2', type: 'string' },
        {
          key: 'image',
          value: 'AQID',
          type: 'base64File',
          contentType: 'image/png',
          fileName: 'input.png',
        },
      ],
    })
    expect(request.headers.authorization).toBe('Bearer test-key')
    expect(request.headers['content-type']).toMatch(/^multipart\/form-data; boundary=----ChatboxBoundary[\da-f]+$/)
  })

  test('preserves filenames from Expo File-like objects', async () => {
    capacitorRequest.mockResolvedValue({
      data: '{}',
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const form = new FormData()
    const expoFileLike = new Blob([new Uint8Array([80, 75, 3, 4])], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    Object.defineProperty(expoFileLike, 'name', { value: '公安联考资料汇编.docx' })
    form.append('file', expoFileLike, '公安联考资料汇编.docx')

    await handleMobileRequest(
      'https://api.cloud.llamaindex.ai/api/v1/beta/files',
      'POST',
      new Headers({ Authorization: 'Bearer test-key' }),
      form
    )

    const request = capacitorRequest.mock.calls[0][0]
    expect(request.data).toEqual([
      {
        key: 'file',
        value: 'UEsDBA==',
        type: 'base64File',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileName: '公安联考资料汇编.docx',
      },
    ])
  })

  test('restores native Base64 arraybuffer responses to binary data', async () => {
    capacitorRequest.mockResolvedValue({
      data: 'AQID',
      status: 200,
      headers: { 'content-type': 'image/png' },
    })

    const response = await handleMobileRequest(
      'https://cdn.example.com/image.png',
      'GET',
      new Headers(),
      undefined,
      undefined,
      'arraybuffer'
    )

    expect(capacitorRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        responseType: 'arraybuffer',
      })
    )
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  test('uses the durable stream transport for Gemini SSE URLs', async () => {
    nativeReadableStream.mockReturnValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: done\\n\\n'))
          controller.close()
        },
      })
    )

    const response = await handleMobileRequest(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini:streamGenerateContent?alt=sse',
      'POST',
      new Headers({ Authorization: 'Bearer test-key' }),
      '{}'
    )

    expect(nativeReadableStream).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '{}',
        headers: expect.objectContaining({ Accept: 'text/event-stream', authorization: 'Bearer test-key' }),
      })
    )
    expect(capacitorRequest).not.toHaveBeenCalled()
    expect(await response.text()).toBe('data: done\\n\\n')
  })

  test('uses the durable stream transport when an SDK requests SSE through Accept', async () => {
    nativeReadableStream.mockReturnValue(new ReadableStream<Uint8Array>())

    await handleMobileRequest(
      'https://api.example.com/v1/chat/completions',
      'POST',
      new Headers({ accept: 'text/event-stream' }),
      '{}'
    )

    expect(nativeReadableStream).toHaveBeenCalledOnce()
    expect(capacitorRequest).not.toHaveBeenCalled()
  })
})

describe('mobile request stream cancellation', () => {
  beforeEach(() => {
    nativeStreamHandle.mockReset()
  })

  test('cancels the native task even when its readable stream is locked', async () => {
    const stream = new ReadableStream<Uint8Array>()
    const reader = stream.getReader()
    const cancel = vi.fn().mockResolvedValue(undefined)
    nativeStreamHandle.mockReturnValue({ cancel })

    cancelReadableStreamOnAbort(stream)
    await Promise.resolve()

    expect(cancel).toHaveBeenCalledOnce()
    reader.releaseLock()
  })

  test('swallows locked stream cancel rejections', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const stream = new ReadableStream<Uint8Array>()
    const reader = stream.getReader()

    cancelReadableStreamOnAbort(stream)
    await Promise.resolve()
    await Promise.resolve()

    expect(warnSpy).not.toHaveBeenCalled()
    reader.releaseLock()
    warnSpy.mockRestore()
  })

  test('logs unexpected cancel failures', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const stream = {
      cancel: vi.fn().mockRejectedValue(new Error('boom')),
    } as Pick<ReadableStream<Uint8Array>, 'cancel'> as ReadableStream<Uint8Array>

    cancelReadableStreamOnAbort(stream)
    await Promise.resolve()
    await Promise.resolve()

    expect(warnSpy).toHaveBeenCalledWith('Failed to cancel native stream', expect.any(Error))
    warnSpy.mockRestore()
  })
})
