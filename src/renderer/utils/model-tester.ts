import { getModel } from '@shared/models'
import type { CallChatCompletionOptions, ModelInterface } from '@shared/models/types'
import type { Config, Settings } from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import { jsonSchema, type ToolSet } from 'ai'

export type TestResult = {
  status: 'success' | 'error' | 'pending'
  error?: string
}

export type ModelTestState = {
  testing: boolean
  basicTest?: TestResult
  visionTest?: TestResult
  toolTest?: TestResult
}

export type TestModelOptions = {
  providerId: string
  modelId: string
  settings: Settings
  configs: Config
  dependencies: ModelDependencies
  onStateChange?: (state: ModelTestState) => void
}

const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

// This marker is deliberately local and non-sensitive. A model passes the
// tool-use check only after it invokes the synthetic tool and includes the
// tool's returned marker in its final answer.
const TOOL_USE_TEST_MARKER = 'AIBOX_TOOL_USE_CHECK_7F3C'

const testWeatherTools: CallChatCompletionOptions['tools'] = {
  mcp__verification__check: {
    description: `Verification tool. Call this tool for the user's request, then reply with the exact marker it returns: ${TOOL_USE_TEST_MARKER}`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short reason for checking tool use' },
      },
      required: ['reason'],
      additionalProperties: false,
    }),
    execute: async () => ({ marker: TOOL_USE_TEST_MARKER }),
  },
} satisfies ToolSet

/**
 * Test a model's capabilities
 * @returns The final test state
 */
export async function testModelCapabilities(options: TestModelOptions): Promise<ModelTestState> {
  const { providerId, modelId, settings, configs, dependencies, onStateChange } = options

  let state: ModelTestState = {
    testing: true,
    basicTest: { status: 'pending' },
    visionTest: { status: 'pending' },
    toolTest: { status: 'pending' },
  }

  onStateChange?.(state)

  try {
    const modelInstance = getModel({ ...settings, provider: providerId, modelId }, settings, configs, dependencies)

    // Test 1: Basic text request
    state = await testBasicRequest(modelInstance, state)
    onStateChange?.({ ...state })

    // Test 2: Vision request (if basic test passed)
    if (state.basicTest?.status === 'success') {
      state = await testVisionRequest(modelInstance, state)
      onStateChange?.({ ...state })
    }

    // Test 3: Tool use request (if basic test passed)
    if (state.basicTest?.status === 'success') {
      state = await testToolUseRequest(modelInstance, state)
      onStateChange?.({ ...state })
    }
    state = { ...state, testing: false }
    onStateChange?.({ ...state })
  } catch (e: unknown) {
    state = { ...state, testing: false, basicTest: { status: 'error', error: String(e) } }
    onStateChange?.({ ...state })
  }
  return state
}

async function testBasicRequest(modelInstance: ModelInterface, state: ModelTestState): Promise<ModelTestState> {
  try {
    await modelInstance.chat([{ role: 'user', content: 'Hi' }], { onResultChange: undefined })

    return { ...state, basicTest: { status: 'success' } }
  } catch (e: unknown) {
    const error = e as { responseBody?: string; message?: string }
    return {
      ...state,
      basicTest: {
        status: 'error',
        error: error?.responseBody || error?.message || String(e),
      },
    }
  }
}

async function testVisionRequest(modelInstance: ModelInterface, state: ModelTestState): Promise<ModelTestState> {
  try {
    await modelInstance.chat(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What color is in this image?' },
            { type: 'image', image: `data:image/png;base64,${TEST_IMAGE_BASE64}` },
          ],
        },
      ],
      { onResultChange: () => {} }
    )
    return {
      ...state,
      visionTest: { status: 'success' },
    }
  } catch (e: unknown) {
    const error = e as { responseBody?: string; message?: string }

    return {
      ...state,
      visionTest: {
        status: 'error',
        error: error?.responseBody || error?.message || String(e),
      },
    }
  }
}

async function testToolUseRequest(modelInstance: ModelInterface, state: ModelTestState): Promise<ModelTestState> {
  let toolExecuted = false
  try {
    const result = await modelInstance.chat(
      [
        {
          role: 'user',
          content: `Use the verification tool now. Do not answer until it has run. In your final answer include the exact marker returned by the tool (${TOOL_USE_TEST_MARKER}).`,
        },
      ],
      {
        tools: testWeatherTools,
        onResultChange: () => {},
        maxSteps: 2,
      }
    )
    toolExecuted = result.contentParts.some(
      (part) => part.type === 'tool-call' && part.toolName === 'mcp__verification__check' && part.state === 'result'
    )
    const finalText = result.contentParts
      .filter((part): part is Extract<(typeof result.contentParts)[number], { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('')
    if (!toolExecuted) {
      throw new Error('The model did not execute the verification tool.')
    }
    if (!finalText.includes(TOOL_USE_TEST_MARKER)) {
      throw new Error('The model executed the tool but did not use its returned value in the final response.')
    }
    return { ...state, toolTest: { status: 'success' } }
  } catch (e: unknown) {
    const error = e as { responseBody?: string; message?: string }
    return {
      ...state,
      toolTest: {
        status: 'error',
        error: error?.responseBody || error?.message || String(e),
      },
    }
  }
}
