import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.aibox.mobile',
  appName: 'AIbox Mobile',
  webDir: 'release/app/dist/renderer',
  plugins: {
    App: {
      // Keep the native callback disabled until the renderer reports that a
      // UI layer or router history can consume the back action.
      disableBackButtonHandler: true,
    },
    Keyboard: {
      // MainActivity uses edge-to-edge. Keep the WebView full-bleed and let
      // the renderer apply the keyboard height once in CSS; the native
      // full-screen workaround misreads the display-cutout inset on some
      // Android 15 devices.
      resizeOnFullScreen: false,
    },
  },
}

export default config
