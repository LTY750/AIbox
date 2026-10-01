import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Flex,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core'
import { IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PopoverConfirm from '@/components/common/PopoverConfirm'
import { memoryStore } from '@/memory/memoryStore'
import { useSettingsStore } from '@/stores/settingsStore'

export function MemorySettingsSection() {
  const { t } = useTranslation()
  const memoryEnabled = useSettingsStore((state) => state.memoryEnabled !== false)
  const setSettings = useSettingsStore((state) => state.setSettings)
  const [memories, setMemories] = useState<Awaited<ReturnType<typeof memoryStore.listMemories>>>([])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMemories = useCallback(async () => {
    setIsLoading(true)
    try {
      setMemories(await memoryStore.listMemories())
      setError(null)
    } catch (loadError) {
      setError(String(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMemories()
  }, [loadMemories])

  const addMemory = async () => {
    if (!draft.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      await memoryStore.addMemory(draft)
      setDraft('')
      await loadMemories()
    } catch (saveError) {
      setError(String(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteMemory = async (id: string) => {
    setError(null)
    try {
      await memoryStore.deleteMemory(id)
      await loadMemories()
    } catch (deleteError) {
      setError(String(deleteError))
    }
  }

  const clearMemories = async () => {
    setError(null)
    try {
      await memoryStore.clearMemories()
      await loadMemories()
    } catch (clearError) {
      setError(String(clearError))
    }
  }

  return (
    <Stack gap={0} className="settings-section-list">
      <Box className="settings-row border-b border-solid border-chatbox-border-primary last:border-b-0">
        <Flex align="center" justify="space-between" gap="md">
          <Box className="min-w-0">
            <Text size="sm" fw={500}>
              {t('Memory')}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              {t('Saved memories are added to future conversations as reference context.')}
            </Text>
          </Box>
          <Switch
            aria-label={String(t('Enable Memory'))}
            checked={memoryEnabled}
            onChange={(event) => setSettings({ memoryEnabled: event.currentTarget.checked })}
          />
        </Flex>
      </Box>

      <Box className="settings-row border-b border-solid border-chatbox-border-primary last:border-b-0">
        <Stack gap="sm">
          <Box>
            <Text size="sm" fw={500}>
              {t('Add a memory')}
            </Text>
            <Text size="xs" c="chatbox-tertiary">
              {t('Save a stable fact or preference for future conversations.')}
            </Text>
          </Box>
          <Textarea
            aria-label={String(t('Add a memory'))}
            placeholder={String(t('For example: I prefer concise answers in Chinese.'))}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            minRows={3}
            maxRows={6}
            maxLength={1000}
            disabled={isSaving}
          />
          <Button
            className="self-start"
            leftSection={<IconPlus size={16} />}
            onClick={() => void addMemory()}
            disabled={!draft.trim() || isSaving || memories.length >= 100}
            loading={isSaving}
          >
            {t('Save memory')}
          </Button>
        </Stack>
      </Box>

      {error && (
        <Box className="settings-row border-b border-solid border-chatbox-border-primary last:border-b-0">
          <Alert color="red" variant="light" title={t('Memory operation failed')} icon={<IconInfoCircle />}>
            {error}
          </Alert>
        </Box>
      )}

      <Box className="settings-row border-b border-solid border-chatbox-border-primary last:border-b-0">
        <Stack gap="sm">
          <Flex align="center" gap="xs" wrap="wrap">
            <Text size="sm" fw={500}>
              {t('Memory')}
            </Text>
            <Badge size="sm" variant="light" color="chatbox-secondary">
              {memories.length}/100
            </Badge>
            <Box flex={1} />
            {memories.length > 0 && (
              <PopoverConfirm
                title={t('Clear all memories')}
                confirmButtonText={String(t('Clear all memories'))}
                confirmButtonColor="chatbox-error"
                onConfirm={() => void clearMemories()}
              >
                <Button size="xs" variant="subtle" color="chatbox-error">
                  {t('Clear all memories')}
                </Button>
              </PopoverConfirm>
            )}
          </Flex>

          {isLoading && (
            <Flex justify="center" py="sm">
              <Loader size="sm" />
            </Flex>
          )}
          {!isLoading && memories.length === 0 && (
            <Text size="sm" c="chatbox-tertiary" fs="italic">
              {t('No memories saved yet.')}
            </Text>
          )}
          {!isLoading && memories.length > 0 && (
            <Stack gap={6}>
              {memories.map((memory) => (
                <Paper key={memory.id} withBorder radius="md" p="xs">
                  <Flex align="flex-start" gap="xs">
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {memory.content}
                      </Text>
                      <Text size="xs" c="chatbox-tertiary">
                        {new Date(memory.createdAt).toLocaleDateString()}
                      </Text>
                    </Stack>
                    <ActionIcon
                      variant="subtle"
                      color="chatbox-error"
                      size="sm"
                      aria-label={String(t('Delete memory'))}
                      onClick={() => void deleteMemory(memory.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Flex>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Box>
    </Stack>
  )
}
