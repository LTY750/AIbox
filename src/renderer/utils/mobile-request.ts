import { CapacitorHttp } from '@capacitor/core'
import { createNativeReadableStream, getNativeStreamHandle } from '@/native/stream-http'
import { ApiError } from '../../shared/models/errors'

type MobileResponseType = 'text' | 'json' | 'blob' | 'arraybuffer'

interface NativeFormDataEntry {
  key: string
  value: string
  type: 'string' | 'base64File'
  contentType?: string
  fileName?: string
}

type FormDataFileLike = {
  name?: unknown
  type?: unknown
  arrayBuffer: () => Promise<ArrayBuffer>
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function serializeFormData(formData: FormData): Promise<NativeFormDataEntry[]> {
  const entries: NativeFormDataEntry[] = []
  const formEntries: [string, FormDataEntryValue][] = []
  formData.forEach((value, key) => formEntries.push([key, value]))

  for (const [key, value] of formEntries) {
    if (typeof value === 'string') {
      entries.push({ key, value, type: 'string' })
      continue
    }

    // Capacitor's native bridge receives files from both the browser File
    // implementation and Expo's `File` class. The latter is not an instanceof
    // the browser global, but it still exposes the filename and MIME type.
    // Losing the extension makes document parsers treat DOCX/PDF uploads as a
    // generic binary file and reject them.
    const fileLike = value as FormDataFileLike
    const fileName = typeof fileLike.name === 'string' && fileLike.name ? fileLike.name : `${key}.bin`
    entries.push({
      key,
      value: bytesToBase64(new Uint8Array(await value.arrayBuffer())),
      type: 'base64File',
      contentType:
        typeof fileLike.type === 'string' && fileLike.type ? fileLike.type : 'application/octet-stream',
      fileName,
    })
  }
  return entries
}

function isLockedStreamCancelError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('Cannot cancel a locked stream') ||
      error.message.includes('ReadableStream is locked') ||
      error.message.includes('stream is locked'))
  )
}

function isStreamingRequest(url: string, method: string, headers: Headers, body?: RequestInit['body']): boolean {
  if (method.toUpperCase() !== 'POST') return false

  if (headers.get('accept')?.toLowerCase().includes('text/event-stream')) return true

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.searchParams.get('alt')?.toLowerCase() === 'sse') return true
    if (parsedUrl.pathname.toLowerCase().includes('streamgeneratecontent')) return true
  } catch {
    // The request implementation will surface malformed URLs with its normal error.
  }

  if (typeof body !== 'string') return false
  try {
    return JSON.parse(body).stream === true
  } catch {
    return false
  }
}

export function cancelReadableStreamOnAbort(stream: ReadableStream<Uint8Array>) {
  // Fetch consumers normally hold a reader lock by the time an AbortSignal is
  // delivered. Cancelling the ReadableStream then rejects before its cancel
  // callback reaches native code. The durable handle remains callable while
  // locked, so stop the foreground-service task through it first.
  const nativeStream = getNativeStreamHandle(stream)
  if (nativeStream) {
    void nativeStream.cancel().catch((error: unknown) => {
      console.warn('Failed to cancel native stream', error)
    })
    return
  }

  try {
    void stream.cancel('aborted').catch((error: unknown) => {
      if (!isLockedStreamCancelError(error)) {
        console.warn('Failed to cancel native stream', error)
      }
    })
  } catch (error) {
    if (!isLockedStreamCancelError(error)) {
      console.warn('Failed to cancel native stream', error)
    }
  }
}

export async function handleMobileRequest(
  url: string,
  method: string,
  headers: Headers,
  body?: RequestInit['body'],
  signal?: AbortSignal,
  responseType?: MobileResponseType
): Promise<Response> {
  // Fix: Convert Headers to plain object without using .entries()
  const headerObj: Record<string, string> = {}
  headers.forEach((value, key) => {
    headerObj[key] = value
  })
  const isStreaming = isStreamingRequest(url, method, headers, body)

  if (isStreaming) {
    // Preserve the caller's header casing instead of sending duplicate Accept headers.
    const streamHeaders = { ...headerObj }
    const acceptHeader = Object.keys(streamHeaders).find((key) => key.toLowerCase() === 'accept') || 'Accept'
    streamHeaders[acceptHeader] = 'text/event-stream'

    const stream = createNativeReadableStream({
      url,
      method,
      headers: streamHeaders,
      body: body as string,
    })

    // Handle abort signal for stream cancellation.
    if (signal) {
      const onAbort = () => {
        cancelReadableStreamOnAbort(stream)
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    // HTTP failures are emitted by the durable native stream with their status
    // and response body. Do not fall back to a one-shot WebView/native request:
    // that would lose the foreground-service ownership required in background.
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  let requestData: unknown = body
  let dataType: 'formData' | undefined
  if (isFormData) {
    const boundary = `----ChatboxBoundary${Date.now().toString(16)}`
    headerObj['content-type'] = `multipart/form-data; boundary=${boundary}`
    requestData = await serializeFormData(body)
    dataType = 'formData'
  }

  const response = await CapacitorHttp.request({
    url,
    method,
    headers: headerObj,
    data: requestData,
    dataType,
    responseType: responseType || 'text',
  })

  const isBinaryResponse = responseType === 'arraybuffer' || responseType === 'blob'
  const rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
  // Treat status 0 or < 200 as errors, in addition to >= 400
  if (response.status === 0 || response.status < 200 || response.status >= 400) {
    throw new ApiError(`Status Code ${response.status}`, rawData, response.status)
  }
  const responseData = rawData

  if (isStreaming) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(responseData))
        controller.close()
      },
    })
    return new Response(stream, {
      status: response.status,
      headers: { ...response.headers, 'Content-Type': 'text/event-stream' },
    })
  }

  if (isBinaryResponse && typeof response.data === 'string') {
    const bytes = base64ToBytes(response.data)
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    return new Response(buffer, {
      status: response.status,
      headers: response.headers,
    })
  }

  return new Response(responseData, {
    status: response.status,
    headers: response.headers,
  })
}
