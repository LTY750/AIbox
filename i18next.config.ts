import { defineConfig } from 'i18next-cli'

export default defineConfig({
  locales: [
    'en',
    'ar',
    'de',
    'es',
    'fr',
    'it-IT',
    'ja',
    'ko',
    'nb-NO',
    'pt-PT',
    'ru',
    'sv',
    'zh-Hans',
    'zh-Hant',
  ],
  extract: {
    input: ['src/renderer/**/*.{js,jsx,ts,tsx}'],
    ignore: ['src/renderer/release/**'],
    output: 'src/renderer/i18n/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'translation',
    keySeparator: false,
    nsSeparator: false,
    functions: ['t', 'i18n.t'],
    transComponents: ['Trans'],
    disablePlurals: true,
    removeUnusedKeys: false,
    sort: true,
  },
})
