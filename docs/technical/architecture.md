# Architecture

The application shares a React renderer across Electron, Web, and Capacitor
mobile builds. `src/renderer/platform` exposes the `Platform` interface and
contains the desktop, web, and mobile implementations. Shared models,
provider definitions, storage contracts, and pure utilities belong in
`src/shared` so they can be tested without a native runtime.

On Android, Capacitor hosts the renderer and native capabilities are accessed
through plugins. Chat/session data is stored in SQLite; API credentials are
stored separately through the native secure-storage plugin (with a documented
SQLite fallback for platforms where the plugin is unavailable). SQLite is
currently configured without database-level encryption, so message contents
should be treated as local plaintext at rest. Mobile SQLite schema is managed
by the versioned migration runner in `src/renderer/storage/sqliteMigrations.ts`.

Build flow: `electron-vite build` produces the renderer, `npx cap sync android`
copies it to the Capacitor project, and Gradle creates the APK.
