# AIbox Mobile

This directory is the standalone mobile workspace. It contains the shared renderer, Capacitor configuration, and Android project used by the mobile builds.

Desktop sources remain in the sibling `chatbox-1.22.3` directory. Run mobile commands from this directory so generated web assets and native project changes stay isolated:

```text
pnpm install
pnpm run mobile:sync:android
pnpm run mobile:sync:ios
```

The Android `local.properties` file is machine-specific and should be generated locally by Android Studio or Gradle rather than committed.
