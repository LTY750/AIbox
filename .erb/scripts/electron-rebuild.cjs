const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Inline the paths instead of importing from webpack.paths.ts
const rootPath = path.join(__dirname, '../..')
const appPath = path.join(rootPath, 'release/app')
const appNodeModulesPath = path.join(appPath, 'node_modules')

// Read dependencies from release/app/package.json
const appPackageJson = require('../../release/app/package.json')
const dependencies = appPackageJson.dependencies || {}
const extraArgs = process.argv.slice(2).filter((arg) => arg !== '--')

if (Object.keys(dependencies).length > 0 && fs.existsSync(appNodeModulesPath)) {
    const electronRebuildEntry = path.join(path.dirname(require.resolve('@electron/rebuild')), 'cli.js')
    const electronVersion = require('electron/package.json').version
    execFileSync(
        process.execPath,
        [
            electronRebuildEntry,
            ...extraArgs,
            '--version',
            electronVersion,
            '--types',
            'prod,dev,optional',
            '--module-dir',
            '.',
        ],
        {
            cwd: appPath,
            stdio: 'inherit',
        },
    )
}
