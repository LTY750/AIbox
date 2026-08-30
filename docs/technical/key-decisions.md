# Key Decisions

1. Use `pnpm` with `node-linker=isolated` for stable, workspace-local installs.
   The electron-builder `beforePack` hook stages a conventional flattened
   production tree in `release/app/node_modules` before packaging. Routine
   workspace installs perform only a non-forced ABI check.
2. Keep mobile credentials outside the settings row and redact them from bulk
   storage reads and backups.
3. Use Capacitor for the mobile shell while preserving the shared Platform
   abstraction for renderer portability.
4. Keep the mobile SQLite database unencrypted for now; SQLCipher or an
   encrypted Capacitor SQLite configuration requires a separate migration and
   performance review. The planned key-management and plaintext-migration design
   is in `docs/technical/sqlcipher-encryption.md`.

The repository now has a no-secrets GitHub Actions quality workflow at
`.github/workflows/ci.yml` covering lint, type checking, tests, and the web
renderer build. Release/signing automation described in older deployment notes
is still planned, not active.
