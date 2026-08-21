import { createTheme, type ThemeOptions } from '@mui/material/styles'
import {
  DEFAULT_INTERFACE_FONT_FAMILY,
  getDefaultInterfaceColors,
  INTERFACE_FONT_FAMILY_CSS,
  type InterfaceFontFamily,
  resolveInterfaceBrandColor,
} from '@shared/theme-colors'
import { useLayoutEffect, useMemo } from 'react'
import { settingsStore, useLanguage, useSettingsStore } from '@/stores/settingsStore'
import { uiStore, useUIStore } from '@/stores/uiStore'
import { type Language, Theme } from '../../shared/types'
import platform from '../platform'
import DesktopPlatform from '../platform/desktop_platform'

export const switchTheme = async (theme: Theme) => {
  let finalTheme = 'light' as 'light' | 'dark'
  if (theme === Theme.System) {
    finalTheme = (await platform.shouldUseDarkColors()) ? 'dark' : 'light'
  } else {
    finalTheme = theme === Theme.Dark ? 'dark' : 'light'
  }
  uiStore.setState({
    realTheme: finalTheme,
  })
  localStorage.setItem('initial-theme', finalTheme)
  if (platform instanceof DesktopPlatform) {
    await platform.switchTheme(finalTheme)
  }
}

export default function useAppTheme() {
  const theme = useSettingsStore((state) => state.theme)
  const interfaceColors = useSettingsStore((state) => state.interfaceColors ?? getDefaultInterfaceColors())
  const interfaceFontFamily = useSettingsStore((state) => state.interfaceFontFamily ?? DEFAULT_INTERFACE_FONT_FAMILY)
  const realTheme = useUIStore((state) => state.realTheme)
  const language = useLanguage()

  useLayoutEffect(() => {
    switchTheme(theme)
  }, [theme])

  useLayoutEffect(() => {
    platform.onSystemThemeChange(() => {
      const theme = settingsStore.getState().theme
      switchTheme(theme)
    })
  }, [])

  useLayoutEffect(() => {
    // update material-ui theme
    document.querySelector('html')?.setAttribute('data-theme', realTheme)
    // update tailwindcss theme
    if (realTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [realTheme])

  useLayoutEffect(() => {
    const colors = interfaceColors[realTheme]
    const brandColor = resolveInterfaceBrandColor(colors.brand, realTheme)
    const rootStyle = document.documentElement.style
    rootStyle.setProperty('--chatbox-background-primary', colors.backgroundPrimary)
    rootStyle.setProperty('--chatbox-background-secondary', colors.backgroundSecondary)
    rootStyle.setProperty('--chatbox-background-tertiary', colors.backgroundTertiary)
    rootStyle.setProperty('--chatbox-brand', brandColor)
    rootStyle.setProperty('--chatbox-font-family', getInterfaceFontFamily(interfaceFontFamily, language))
  }, [interfaceColors, interfaceFontFamily, language, realTheme])

  const themeObj = useMemo(
    () =>
      createTheme(
        getThemeDesign(
          realTheme,
          language,
          resolveInterfaceBrandColor(interfaceColors[realTheme].brand, realTheme),
          interfaceFontFamily
        )
      ),
    [interfaceColors, interfaceFontFamily, language, realTheme]
  )
  return themeObj
}

export function getThemeDesign(
  realTheme: 'light' | 'dark',
  language: Language,
  brandColor = getDefaultInterfaceColors()[realTheme].brand,
  interfaceFontFamily: InterfaceFontFamily = DEFAULT_INTERFACE_FONT_FAMILY
): ThemeOptions {
  return {
    palette: {
      mode: realTheme,
      primary: {
        main: brandColor,
      },
      ...(realTheme === 'light'
        ? {}
        : {
            // MUI 内部无法处理 css 变量，需要使用具体颜色值
            background: {
              default: '#242424',
              paper: '#242424',
            },
          }),
    },
    components: {
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: realTheme === 'dark' ? '#333333' : undefined,
            color: realTheme === 'dark' ? '#ffffff' : undefined,
          },
        },
      },
    },
    typography: {
      fontFamily: getInterfaceFontFamily(interfaceFontFamily, language),
      fontSize: 14,
    },
    direction: language === 'ar' ? 'rtl' : 'ltr',
    breakpoints: {
      values: {
        xs: 0,
        sm: 640, // 修改sm的值与tailwindcss保持一致
        md: 900,
        lg: 1200,
        xl: 1536,
      },
    },
  }
}

export function getInterfaceFontFamily(fontFamily: InterfaceFontFamily, language: Language): string {
  if (fontFamily === DEFAULT_INTERFACE_FONT_FAMILY && language === 'ar') {
    return 'Cairo, Arial, sans-serif'
  }
  return INTERFACE_FONT_FAMILY_CSS[fontFamily] ?? INTERFACE_FONT_FAMILY_CSS[DEFAULT_INTERFACE_FONT_FAMILY]
}
