import fs from 'fs'
import path from 'path'
import { validate } from './validate'
import { resolveJinJsonPath } from '../utils'

/**
 * Watch jin.json and related source files for changes.
 * Re-validates on every change and optionally re-serves.
 */
export function watch(cwd: string = process.cwd()) {
  const jinJsonPath = resolveJinJsonPath(cwd)

  if (!jinJsonPath) {
    console.log('✗ jin.json not found — run: npx @papercargo/jin-cli init')
    process.exit(1)
  }

  console.log('👁  Watching for changes...\n')

  // Validate on start
  runValidation(jinJsonPath)

  // Watch jin.json
  let debounceTimer: NodeJS.Timeout | null = null

  fs.watch(jinJsonPath, (eventType) => {
    if (eventType !== 'change') return

    // Debounce rapid changes
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      console.log(`\n⟳ jin.json changed — re-validating...\n`)
      runValidation(jinJsonPath)
    }, 300)
  })

  // Also watch common source directories for route changes
  const watchDirs = [
    path.join(cwd, 'src', 'app'),      // Next.js App Router
    path.join(cwd, 'app', 'routes'),    // Remix
    path.join(cwd, 'src', 'routes'),    // SvelteKit / React Router
    path.join(cwd, 'routes'),           // Express
    path.join(cwd, 'api'),              // API directory
  ]

  for (const dir of watchDirs) {
    if (!fs.existsSync(dir)) continue

    try {
      fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        // Only care about route files
        if (!/\.(ts|tsx|js|jsx)$/.test(filename)) return
        if (filename.includes('node_modules')) return

        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          console.log(`\n⟳ ${filename} changed — consider re-running: npx @papercargo/jin-cli init\n`)
        }, 500)
      })
      console.log(`   Watching: ${path.relative(cwd, dir)}/`)
    } catch {
      // Directory may not support recursive watching on some platforms
    }
  }

  console.log(`   Watching: jin.json`)
  console.log(`\n   Press Ctrl+C to stop.\n`)

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\n\n✓ Stopped watching.')
    process.exit(0)
  })
}

function runValidation(jinJsonPath: string) {
  const result = validate(jinJsonPath)

  if (result.valid) {
    console.log('   ✓ jin.json is valid AIP 0.1')
  }

  if (result.errors.length > 0) {
    result.errors.forEach(e => console.log(`   ✗ ${e}`))
  }
  if (result.warnings.length > 0) {
    result.warnings.forEach(w => console.log(`   ⚠ ${w}`))
  }

  const total = result.errors.length + result.warnings.length
  if (total === 0) {
    console.log('   All clear — ready to publish.')
  }
}
