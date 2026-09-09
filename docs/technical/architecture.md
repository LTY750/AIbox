# Architecture

The application shares a React renderer across Electron, Web, and Capacitor
mobile builds. `src/renderer/platform` exposes the `Platform` interface and
contains the desktop, web, and mobile implementations. Shared models,
provider definitions, storage contracts, and pure utilities belong in
`src/shared` so they can be tested without a native runtime.

On Android, Capacitor hosts the renderer and native capabilities are accessed
through plugins. Chat/session data is stored in SQLite; API credentials are
stored separately through the native secure-storage plugin. When that plugin
is unavailable, the renderer may keep credentials in memory for the current
WebView process only; it never writes them to SQLite, localStorage, or backup
files. SQLite is currently configured without database-level encryption, so
message contents should be treated as local plaintext at rest. Mobile SQLite
schema is managed by the versioned migration runner in
`src/renderer/storage/sqliteMigrations.ts`.

Build flow: `electron-vite build` produces the renderer, `corepack pnpm exec cap sync android`
copies it to the Capacitor project, and Gradle creates the APK.

## Android Window Contract

The Android activity runs edge-to-edge with transparent system bars. The
renderer reads native safe-area values into `--mobile-safe-area-inset-*` and
assigns each full-bleed surface one owner for its top or bottom inset; the
root `.App` stays full-bleed so nested drawers and notifications do not add the
same inset twice. The edge-to-edge WebView remains full height while the
keyboard is visible; Capacitor reports the IME obstruction in CSS pixels and
the renderer subtracts that value once from `.App`. The native
`resizeOnFullScreen` workaround remains disabled because it can include the
display-cutout inset twice on Android 15 devices. Keyboard bottom insets remain
suppressed until `keyboardDidHide` and are then refreshed from the native
safe-area plugin.

Capacitor `backButton` events are dispatched through the renderer's mobile
back-handler registry. Visible drawers and modals register with a priority,
the newest nested layer closes first, then menu/page hash-router history is
popped. Android chat routes (`/` and `/session/*`) are the native back-stack
boundary: switching conversations replaces the current history entry, and
once the chat surface is reached the next back gesture is handled by Android
so its back-to-home animation can play. Responsive layout uses the
`compact`, `medium`, and `expanded` window tiers exposed by
`useWindowSizeClass()`; compact layouts use a single pane and temporary
drawers while wider windows can keep the sidebar visible.
