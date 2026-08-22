import type { ProviderModelInfo } from '@shared/types'

// Kept as a compatibility hook for legacy route components. The Chatbox AI
// catalog is deliberately disabled so rendering a model selector never calls
// the upstream model-manifest or license APIs.
const useChatboxAIModels = () => {
  const emptyModels: ProviderModelInfo[] = []
  return {
    allChatboxAIModels: emptyModels,
    chatboxAIModels: emptyModels,
    chatboxAIImageModels: emptyModels,
    chatboxAIModelList: null,
    refetch: async () => ({ data: undefined }),
    isLoading: false,
    isFetching: false,
  }
}

export default useChatboxAIModels
