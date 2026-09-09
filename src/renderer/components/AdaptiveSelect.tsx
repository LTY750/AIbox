import type { SelectProps as MantineSelectProps } from '@mantine/core'
import { Button, Select, Stack, Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useState } from 'react'
import { Drawer } from 'vaul'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { useMobileBackHandler } from '@/platform/mobile_back_navigation'

export interface AdaptiveSelectProps extends Omit<MantineSelectProps, 'onChange'> {
  onChange?: (value: string | null) => void
}

export function AdaptiveSelect(props: AdaptiveSelectProps) {
  const isSmallScreen = useIsSmallScreen()
  const [drawerOpened, setDrawerOpened] = useState(false)

  useMobileBackHandler(
    () => {
      setDrawerOpened(false)
      return true
    },
    drawerOpened,
    110
  )

  return isSmallScreen ? (
    <Drawer.NestedRoot open={drawerOpened} onOpenChange={(open) => setDrawerOpened(open)} noBodyStyles>
      <Drawer.Trigger asChild>
        <Select {...props} dropdownOpened={false} />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-chatbox-background-mask-overlay" />

        <Drawer.Content className="flex flex-col h-fit fixed bottom-0 left-0 right-0 outline-none bg-chatbox-background-primary rounded-t-lg max-h-[80vh] overflow-hidden select-none">
          <Drawer.Handle />
          {props.label && (
            <Text c="chatbox-tertiary" size="xs" className="text-center my-xxs">
              {props.label}
            </Text>
          )}
          <Stack gap="xs" p="sm" pb={0} className="overflow-y-auto">
            {props.data?.map((item) => {
              let label: string = ''
              let value: string = ''

              if (typeof item === 'string') {
                value = item
                label = item
              } else if (typeof item === 'object' && 'value' in item && 'label' in item) {
                value = item.value
                label = item.label
              }

              if (!value || !label) return null
              const isSelected = props.value === value

              return (
                <Drawer.Close key={value} asChild>
                  <Button
                    variant={isSelected ? 'light' : 'transparent'}
                    color={isSelected ? 'chatbox-brand' : 'chatbox-primary'}
                    rightSection={isSelected ? <IconCheck size={16} aria-hidden /> : undefined}
                    aria-current={isSelected ? 'true' : undefined}
                    fullWidth
                    className="flex-none justify-between"
                    onClick={() => props.onChange?.(value)}
                  >
                    {label}
                  </Button>
                </Drawer.Close>
              )
            })}

            <div className="mobile-bottom-inset" />
          </Stack>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  ) : (
    <Select {...props} />
  )
}
