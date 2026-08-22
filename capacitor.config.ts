import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'xyz.chatboxapp.chatbox.debug',
  appName: 'AIbox Mobile',
  webDir: 'release/app/dist/renderer',
  plugins: {
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
}

export default config
