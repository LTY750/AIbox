# Development Guide

AIbox Mobile is a Capacitor Android application with a shared React renderer.
The supported local workflow is:

```text
pnpm install --frozen-lockfile
pnpm run check
pnpm run lint
pnpm run test
pnpm run mobile:sync:android
```

Renderer and shared code live in `src/renderer` and `src/shared`. Android
native code lives in `android`. Generated output under `release/app/dist` and
`android/app/build` must not be edited by hand. The current repository has no
GitHub Actions workflow; CI/CD remains a follow-up task.
