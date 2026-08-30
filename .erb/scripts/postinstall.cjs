/**
 * Root postinstall script.
 * 
 * NOTE: We intentionally do NOT run electron-builder install-app-deps here.
 * Development dependencies are managed by the workspace install; the
 * electron-builder beforePack hook stages the production app tree separately.
 * 
 * Native dependencies are checked through release/app's rebuild script and by
 * electron-builder after the beforePack hook stages production dependencies.
 * The rebuild script intentionally omits --force so matching modules are left
 * untouched during routine workspace installs.
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Run native dependency check
try {
    require('./check-native-dep.cjs')
} catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
        console.log('Native dependency check skipped: module not found')
    } else {
        throw e
    }
}

console.log('Postinstall complete (skipping electron-builder install-app-deps for pnpm compatibility)')
