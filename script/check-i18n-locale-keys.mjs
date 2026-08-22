import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('src/renderer/i18n/locales')
const localeNames = fs.readdirSync(root).filter((name) => fs.existsSync(path.join(root, name, 'translation.json')))
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name, 'translation.json'), 'utf8'))
const placeholders = (value) => [...String(value ?? '').matchAll(/{{\s*([^}]+?)\s*}}/g)].map((match) => match[1]).sort()
const source = read('en')
const sourceKeys = Object.keys(source).sort()
const failures = []

for (const locale of localeNames) {
  const translation = read(locale)
  const keys = Object.keys(translation).sort()
  const missing = sourceKeys.filter((key) => !(key in translation))
  const extra = keys.filter((key) => !(key in source))
  const placeholderDiff = sourceKeys.filter(
    (key) => key in translation && JSON.stringify(placeholders(source[key])) !== JSON.stringify(placeholders(translation[key]))
  )
  if (missing.length || extra.length || placeholderDiff.length) {
    failures.push({ locale, missing, extra, placeholderDiff })
  }
}

if (failures.length) {
  for (const failure of failures) console.error(JSON.stringify(failure))
  process.exit(1)
}

console.log(`Checked ${localeNames.length} locales against en (${sourceKeys.length} keys).`)
