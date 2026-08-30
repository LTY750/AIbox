# AIbox Mobile Development Guide

## Project purpose and scope

AIbox Mobile is the Android-focused mobile workspace built from Chatbox's shared React renderer and a Capacitor native shell. The current delivery target is **Android**. iOS scripts remain for possible future work, but iOS is not part of the normal development or validation flow unless a task explicitly says otherwise.

The repository also contains Electron and web implementations because most UI, conversations, providers, settings, and shared types are reused across platforms. Mobile work should not accidentally break those shared paths.

## Source of truth

Before changing an area, read the relevant implementation and documentation rather than relying on old assumptions:

- `README.md` — supported platforms, setup, common commands, and project layout.
- `docs/technical/` — architecture and design decisions.
- `docs/testing.md` — test organization and patterns.
- `docs/storage.md` — persistence, migrations, and cross-platform storage behavior.
- `docs/technical/build-and-deployment.md` — build, signing, and CI/CD details.
- `ANDROID-BUILD-NOTES.md` — machine-specific offline/local Android build notes; do not generalize its local paths into product code.

When code behavior, commands, versions, or platform support changes, update the relevant documentation in the same change.

## Repository layout

- `src/renderer/` — React UI, routes, state, i18n, and platform adapters.
- `src/shared/` — cross-platform models, provider logic, types, and utilities.
- `src/main/` and `src/preload/` — Electron-only code; Android does not execute it.
- `android/` — Capacitor Android project and custom native plugins.
- `resources/` — source assets for mobile icons and splash screens.
- `test/integration/` — Vitest integration suites.
- `docs/` — product, implementation, and technical documentation.
- `patches/` — intentional pnpm dependency patches; preserve them during dependency work.

Platform-specific renderer behavior belongs in `src/renderer/platform/` whenever practical. Prefer the existing `Platform` abstraction and `CHATBOX_BUILD_TARGET` / `CHATBOX_BUILD_PLATFORM` gates over scattered user-agent checks.

## Generated files and protected areas

Do not edit generated output by hand, including:

- `node_modules/`
- `release/app/dist/`
- `android/app/build/`
- `android/build/`
- `android/app/src/main/assets/public/`
- `src/renderer/routeTree.gen.ts`
- Capacitor-generated Gradle files such as `android/app/capacitor.build.gradle` and `android/capacitor.settings.gradle`

Regenerate renderer/native assets with `pnpm run mobile:sync:android`. Keep machine-local files, SDK paths, signing material, API keys, and credentials out of source control. Do not overwrite unrelated working-tree changes.

## Toolchain

Use the repository-pinned toolchain:

- Node.js `>=24.15.0 <25.0.0` (`.node-version` currently selects the supported Node 24 line).
- pnpm `10.33.0` via Corepack; do not use npm or Yarn for dependency changes.
- JDK 21 (LTS). AGP 8.7.2 only requires 17, but the app module and most Capacitor plugin modules declare a Java 21 toolchain (`@capacitor/filesystem` requests a Java 21 compiler); a JDK 17-only machine fails at `:capacitor-filesystem:compileDebugJavaWithJavac`.
- Android SDK Platform/Target 35, with minimum Android API 23.

Install dependencies from the repository root:

```text
corepack enable
corepack prepare pnpm@10.33.0 --activate
corepack pnpm install --frozen-lockfile
```

Only update `pnpm-lock.yaml` when dependency declarations or patches intentionally change.

## Required local workflow

The normal validation sequence is:

```text
pnpm install --frozen-lockfile
corepack pnpm run check
corepack pnpm run lint
corepack pnpm run test
corepack pnpm run mobile:sync:android
```

Use the smallest relevant checks while iterating, then run the full applicable set before finishing. Useful commands include:

```text
pnpm run test -- <path-or-pattern>
pnpm run test:integration
pnpm run check:shared-boundaries
pnpm run build:web
pnpm run mobile:android
```

`pnpm run test:model-provider` is opt-in and may call live provider APIs. Do not run it unless the task explicitly requires live integration testing and the required credentials are available.

For native Android changes, also build with Gradle from `android/` and manually exercise the affected flow on an emulator or device when possible:

```text
.\gradlew.bat assembleDebug
```

The GitHub Actions workflow in `.github/workflows/ci.yml` runs lint, type checking, tests, and a web renderer build. Release signing and store publication are intentionally outside that workflow.

## Coding conventions

- TypeScript is strict. Preserve type safety and avoid introducing `any`, unjustified type assertions, or non-null assertions.
- Biome is the primary formatter/linter: 2-space indentation, LF line endings, single quotes, no semicolons, and a 120-character line width.
- Use `@/` for renderer imports and `@shared/` for shared imports where appropriate.
- Keep components and functions focused; reuse existing primitives and patterns before adding a parallel abstraction.
- Await or explicitly handle promises. Do not silently swallow errors.
- Avoid new `console` calls except intentional `assert`, `error`, `info`, or `warn` diagnostics, and never log secrets or complete user content.
- Put user-visible strings through the existing i18n system instead of hard-coding one language.
- Keep tests next to source as `*.test.ts` / `*.test.tsx`; integration tests belong under `test/integration/`.
- Add or update tests for behavior changes, regressions, parsing, persisted settings, provider logic, and platform adapters.

## Mobile and cross-platform rules

- Treat Android as a Capacitor WebView, not as Electron. Renderer code used by Android must not require Node.js, Electron IPC, or desktop filesystem APIs.
- Keep native operations behind the mobile platform layer or a focused Capacitor plugin. Register custom plugins in `MainActivity.java` and keep the TypeScript/native contract synchronized.
- Preserve lifecycle behavior for backgrounding, streaming responses, keyboard resizing, safe areas, file selection/export, and Android back navigation.
- Use responsive/mobile UI patterns already present in the codebase. Verify touch targets, drawers/modals, small screens, keyboard-open layouts, light/dark themes, and long localized text.
- Desktop-only capabilities such as local MCP processes, knowledge-base execution, Agent Mode/local code execution, Skills, desktop OAuth callbacks, Electron sandboxing, and auto-update must remain hidden or safely unavailable on Android unless the task implements a supported mobile equivalent.
- When changing shared code, consider Android, web, and Electron behavior. Put unavoidable differences behind explicit platform boundaries.

## Data, settings, and security

- Settings and conversations are persisted. Schema/type changes must preserve existing users through defaults, normalization, or migration code and should include regression tests.
- Android uses SQLite-backed storage for application data and Android Keystore-backed secure storage for sensitive settings. Do not downgrade sensitive values to plain local storage.
- Treat import/export and backup data as untrusted input: validate paths, filenames, archive contents, and parsed schemas.
- Never commit `.env` secrets, provider API keys, Android keystores, signing passwords, `google-services.json`, or machine-specific `android/local.properties`.
- Release builds must retain the existing fail-closed signing behavior. Do not bypass missing `CHATBOX_ANDROID_*` signing values in source code.

## Change discipline

- Make the smallest change that fully solves the task; avoid unrelated refactors and mass formatting.
- Inspect `git status` before and after edits, and preserve user-authored changes already in the working tree.
- Do not edit build artifacts to make a test pass; fix source or configuration and regenerate outputs.
- If a required command cannot run because of unavailable SDKs, credentials, network access, or emulator/device access, report exactly what was and was not verified.
- In the final summary, list the files changed, the behavior affected, and the validation commands run with their results.
