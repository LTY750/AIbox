import { BaseError } from '@shared/models/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const submitImageGenerationMock = vi.fn()
const pollTaskUntilCompleteMock = vi.fn()
const pollImageTaskMock = vi.fn()
const paintMock = vi.fn()
const createRecordMock = vi.fn()
const updateRecordMock = vi.fn()
const getImageGenerationByIdMock = vi.fn()
const setQueryDataMock = vi.fn()
const invalidateQueriesMock = vi.fn()
const getImageMock = vi.fn()
const setCurrentGeneratingIdMock = vi.fn()
const setCurrentRecordIdMock = vi.fn()
const trackEventMock = vi.fn()

vi.mock('@/adapters', () => ({
  createModelDependencies: vi.fn(async () => ({
    storage: {
      getImage: getImageMock,
    },
  })),
}))

vi.mock('@shared/providers', () => ({
  getModel: vi.fn(() => ({ paint: paintMock })),
}))

vi.mock('@/packages/remote', () => ({
  IMAGE_GENERATION_POLL_INTERVAL_MS: 2000,
  submitImageGeneration: submitImageGenerationMock,
  pollTaskUntilComplete: pollTaskUntilCompleteMock,
  pollImageTask: pollImageTaskMock,
}))

vi.mock('./imageGenerationStore', () => ({
  IMAGE_GEN_LIST_QUERY_KEY: 'image-gen-list',
  IMAGE_GEN_QUERY_KEY: 'image-gen',
  createRecord: createRecordMock,
  updateRecord: updateRecordMock,
  addGeneratedImage: vi.fn(),
  imageGenerationStore: {
    getState: () => ({
      currentGeneratingId: null,
      currentRecordId: null,
      setCurrentGeneratingId: setCurrentGeneratingIdMock,
      setCurrentRecordId: setCurrentRecordIdMock,
    }),
  },
}))

vi.mock('./queryClient', () => ({
  queryClient: {
    setQueryData: setQueryDataMock,
    invalidateQueries: invalidateQueriesMock,
  },
}))

vi.mock('./settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      licenseKey: 'license-key',
      getSettings: () => ({ licenseKey: 'license-key' }),
    }),
  },
}))

vi.mock('@/utils/track', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('@/lib/utils', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('@/platform', () => ({
  default: {
    getConfig: vi.fn(async () => ({})),
    getImageGenerationStorage: () => ({
      getById: getImageGenerationByIdMock,
    }),
  },
}))

vi.mock('@/storage', () => ({
  default: {
    setBlob: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/storage/StoreStorage', () => ({
  StorageKeyGenerator: {
    picture: (category: string) => `picture:${category}:generated`,
  },
}))

describe('imageGenerationActions reference image payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    createRecordMock.mockResolvedValue({ id: 'record-1', createdAt: 1_000 })
    updateRecordMock.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }))
    submitImageGenerationMock.mockResolvedValue({
      task_id: 'task-1',
      items: [{ status: 'pending' }],
    })
    pollTaskUntilCompleteMock.mockResolvedValue({
      items: [
        {
          status: 'completed',
          image_url: 'https://example.com/output.png',
          thumbnail_url: 'https://example.com/output.png?thumbnail=512x512',
        },
      ],
    })
    getImageMock.mockResolvedValue('data:image/png;base64,AAAA')
    paintMock.mockResolvedValue(['data:image/png;base64,GENERATED'])
    getImageGenerationByIdMock.mockResolvedValue({
      id: 'record-1',
      prompt: 'make an image',
      referenceImages: [],
      generatedImages: [],
      createdAt: 1_000,
      model: { provider: 'chatbox-ai', modelId: 'gpt-image-1' },
      imageGenerateNum: 1,
      status: 'generating',
      taskId: 'task-1',
      source: {
        type: 'chatbox_cli',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
      },
    })
  })

  it('sends reference images as image_url entries for both URLs and stored images', async () => {
    const { createAndGenerate } = await import('./imageGenerationActions')

    await createAndGenerate({
      prompt: 'make a variation',
      referenceImages: ['https://example.com/reference.png', 'storage-key-1'],
      model: {
        provider: 'chatbox-ai',
        modelId: 'gpt-image-1',
      },
      imageGenerateNum: 1,
    })

    await vi.waitFor(() => {
      expect(paintMock).toHaveBeenCalledTimes(1)
    })

    expect(paintMock).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ imageUrl: 'https://example.com/reference.png' }, { imageUrl: 'data:image/png;base64,AAAA' }],
      }),
      expect.any(AbortSignal),
      expect.any(Function)
    )
    expect(trackEventMock).toHaveBeenCalledWith('generate_image', expect.objectContaining({ has_reference: true }))
  })

  it('exposes a completion promise for background task consumers', async () => {
    const { startImageGeneration } = await import('./imageGenerationActions')

    const handle = await startImageGeneration({
      prompt: 'make an image',
      referenceImages: [],
      model: {
        provider: 'chatbox-ai',
        modelId: 'gpt-image-1',
      },
      imageGenerateNum: 1,
    })

    expect(handle).toMatchObject({
      recordId: 'record-1',
      startedAt: 1_000,
      monitoring: { mode: 'direct' },
    })

    await expect(handle.completion).resolves.toMatchObject({
      id: 'record-1',
      status: 'done',
    })
  })

  it('persists caller retry metadata before starting the provider request', async () => {
    let releasePersistence: (() => void) | undefined
    const persistenceGate = new Promise<void>((resolve) => {
      releasePersistence = resolve
    })
    const onRecordCreated = vi.fn(async () => persistenceGate)
    const { startImageGeneration } = await import('./imageGenerationActions')

    const handlePromise = startImageGeneration(
      {
        prompt: 'make an image',
        referenceImages: [],
        model: {
          provider: 'chatbox-ai',
          modelId: 'gpt-image-1',
        },
      },
      { onRecordCreated }
    )

    await vi.waitFor(() => expect(onRecordCreated).toHaveBeenCalledOnce())
    expect(submitImageGenerationMock).not.toHaveBeenCalled()

    releasePersistence?.()
    await handlePromise
    await vi.waitFor(() => expect(paintMock).toHaveBeenCalledOnce())
  })

  it('retries an existing record through the direct provider path', async () => {
    const { resumeGeneration } = await import('./imageGenerationActions')

    await expect(resumeGeneration('record-1')).resolves.toMatchObject({
      id: 'record-1',
      status: 'generating',
      source: {
        type: 'chatbox_cli',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
      },
    })
  })

  it('stores structured error codes from Chatbox AI image generation failures', async () => {
    const { BaseError } = await import('@shared/models/errors')
    class StructuredImageGenerationError extends BaseError {
      public code = 20004
    }
    paintMock.mockRejectedValueOnce(new StructuredImageGenerationError('license not found'))

    const { createAndGenerate } = await import('./imageGenerationActions')

    await createAndGenerate({
      prompt: 'make an image',
      referenceImages: [],
      model: {
        provider: 'chatbox-ai',
        modelId: 'gpt-image-1',
      },
      imageGenerateNum: 1,
    })

    await vi.waitFor(() => {
      expect(updateRecordMock).toHaveBeenCalledWith(
        'record-1',
        expect.objectContaining({
          status: 'error',
          error: 'license not found',
          errorCode: 20004,
        })
      )
    })
  })

  it('stores a successful direct generation as done', async () => {
    const { createAndGenerate } = await import('./imageGenerationActions')

    await createAndGenerate({
      prompt: 'make an image',
      referenceImages: [],
      model: {
        provider: 'chatbox-ai',
        modelId: 'gpt-image-1',
      },
      imageGenerateNum: 1,
    })

    await vi.waitFor(() => expect(updateRecordMock).toHaveBeenCalledWith('record-1', { status: 'done', error: undefined }))
  })

  it('stores direct provider failures with a structured error code', async () => {
    class ModerationError extends BaseError {
      public code = 20005
    }
    paintMock.mockRejectedValueOnce(new ModerationError('Content rejected by content moderation'))
    const { createAndGenerate } = await import('./imageGenerationActions')

    await createAndGenerate({
      prompt: 'make an image',
      referenceImages: [],
      model: {
        provider: 'chatbox-ai',
        modelId: 'gpt-image-1',
      },
      imageGenerateNum: 1,
    })

    await vi.waitFor(() => {
      expect(updateRecordMock).toHaveBeenCalledWith(
        'record-1',
        expect.objectContaining({
          status: 'error',
          error: 'Content rejected by content moderation',
          errorCode: 20005,
          errorItemUuid: undefined,
        })
      )
    })
  })
})
