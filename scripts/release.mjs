import { spawn } from 'node:child_process'

const target = process.argv[2]
const commands = {
  web: ['run', 'build:web'],
  mac: ['run', 'electron:publish-mac'],
  linux: ['run', 'electron:publish-linux'],
  win: ['run', 'electron:publish-win'],
}

if (!commands[target]) {
  console.error(`Usage: node scripts/release.mjs <${Object.keys(commands).join('|')}>`)
  process.exit(2)
}

const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const child = spawn(packageManager, commands[target], { stdio: 'inherit', shell: false })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
