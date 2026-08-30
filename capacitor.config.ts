import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.aibox.mobile',
  appName: 'AIbox Mobile',
  webDir: 'release/app/dist/renderer',
  plugins: {
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
}

export default config
