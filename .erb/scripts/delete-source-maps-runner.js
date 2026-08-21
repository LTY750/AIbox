import { rimrafSync } from 'rimraf'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '../..')
const distPath = path.join(projectRoot, 'release/app/dist')

console.log('Deleting source maps from:', distPath)

// Delete all .js.map files recursively
rimrafSync(path.join(distPath, '**/*.js.map'), { glob: true })

console.log('Source maps deleted successfully')
