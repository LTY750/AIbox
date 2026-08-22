# libSQL Patch Notes

The current build keeps the libSQL patch in the electron-builder `afterPack`
hook, after application files are copied and before signing. This avoids
patching files in the dependency tree that electron-builder later replaces.

The historical multi-architecture macOS signing issue was attributed to hard
link reuse during packaging. When macOS packaging is reintroduced, the job
must set `USE_HARD_LINKS=false` and verify the final bundle with
`codesign --verify --deep --strict` before publishing. No CI workflow currently
implements this check in this repository.
