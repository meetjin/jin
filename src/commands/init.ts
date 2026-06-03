import fs from 'fs'
import path from 'path'
import { select, input, confirm } from '@inquirer/prompts'
import { JinJSON, AIPIntent } from '../types/aip'
import { scanNextJS } from '../scanners/nextjs'
import { scanReactRouter } from '../scanners/react-router'
import { scanExpress } from '../scanners/express'
import { scanOpenAPI } from '../scanners/openapi'
import { scanViteReact } from '../scanners/vite-react'
import { scanSupabaseFunctions } from '../scanners/supabase-functions'
import { scanDart } from '../scanners/dart'
import { scanFastAPI } from '../scanners/fastapi'
import { scanDjango } from '../scanners/django'
import { scanFlask } from '../scanners/flask'
import { scanLaravel } from '../scanners/laravel'
import { scanRails } from '../scanners/rails'
import { scanFastify } from '../scanners/fastify'
import { scanHono } from '../scanners/hono'
import { scanNestJS } from '../scanners/nestjs'
import { scanTRPC } from '../scanners/trpc'
import { resolveJinJsonPath, detectWorkspaceApps } from '../utils'

/**
 * Programmatically triggers the correct framework scanner for a directory in-memory.
 */
export async function scanDirectoryForIntents(subCwd: string): Promise<Partial<AIPIntent>[]> {
  const detectedIntents: Partial<AIPIntent>[] = []
  let packageJson: any = {}
  try {
    packageJson = JSON.parse(
      fs.readFileSync(path.join(subCwd, 'package.json'), 'utf-8')
    )
  } catch (e) {
    // No package.json is normal for Python/PHP/Ruby projects
  }

  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  }

  const hasNextApp = Boolean(
    deps['next'] ||
    fs.existsSync(path.join(subCwd, 'src/app')) ||
    fs.existsSync(path.join(subCwd, 'app')) ||
    fs.existsSync(path.join(subCwd, 'src/pages/api')) ||
    fs.existsSync(path.join(subCwd, 'pages/api'))
  )

  if (hasNextApp) {
    console.log('   Detected: Next.js')
    try {
      const intents = await scanNextJS(subCwd)
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} Next.js routes/endpoints`)
    } catch (e) {
      console.warn(`   ⚠ Failed Next.js scan:`, e)
    }
  }

  if (deps['react-router-dom'] || deps['react-router']) {
    console.log('   Detected: React Router')
    try {
      const intents = await scanReactRouter(subCwd)
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} React Router routes`)
    } catch (e) {
      console.warn(`   ⚠ Failed React Router scan:`, e)
    }
  }

  if (deps['express']) {
    console.log('   Detected: Express')
    try {
      const intents = await scanExpress(subCwd)
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} Express endpoints`)
    } catch (e) {
      console.warn(`   ⚠ Failed Express scan:`, e)
    }
  }

  if (deps['vite'] && deps['react']) {
    console.log('   Detected: Vite + React SPA')
    try {
      const intents = await scanViteReact(subCwd)
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} Vite + React routes`)
    } catch (e) {
      console.warn(`   ⚠ Failed Vite React scan:`, e)
    }
  }

  if (fs.existsSync(path.join(subCwd, 'pubspec.yaml'))) {
    console.log('   Detected: Dart/Flutter project')
    try {
      const intents = await scanDart(subCwd)
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} Dart routes/endpoints`)
    } catch (e) {
      console.warn(`   ⚠ Failed Dart scan:`, e)
    }
  }

  if (fs.existsSync(path.join(subCwd, 'supabase/functions'))) {
    console.log('   Detected: Supabase Edge Functions')
    try {
      const intents = await scanSupabaseFunctions(subCwd)
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} Supabase edge functions`)
    } catch (e) {
      console.warn(`   ⚠ Failed Supabase Edge Functions scan:`, e)
    }
  }

  // Node Frameworks (Fastify, Hono, NestJS, tRPC)
  if (deps['fastify']) {
    try {
      const intents = await scanFastify(subCwd)
      if (intents.length > 0) {
        console.log('   Detected: Fastify')
        detectedIntents.push(...intents)
        console.log(`   Found ${intents.length} Fastify endpoints`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed Fastify scan:`, e)
    }
  }

  if (deps['hono']) {
    try {
      const intents = await scanHono(subCwd)
      if (intents.length > 0) {
        console.log('   Detected: Hono')
        detectedIntents.push(...intents)
        console.log(`   Found ${intents.length} Hono routes`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed Hono scan:`, e)
    }
  }

  if (deps['@nestjs/core'] || deps['@nestjs/common']) {
    try {
      const intents = await scanNestJS(subCwd)
      if (intents.length > 0) {
        console.log('   Detected: NestJS')
        detectedIntents.push(...intents)
        console.log(`   Found ${intents.length} NestJS routes`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed NestJS scan:`, e)
    }
  }

  if (deps['@trpc/server'] || deps['@trpc/client']) {
    try {
      const intents = await scanTRPC(subCwd)
      if (intents.length > 0) {
        console.log('   Detected: tRPC')
        detectedIntents.push(...intents)
        console.log(`   Found ${intents.length} tRPC procedures`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed tRPC scan:`, e)
    }
  }

  // Recursive check helpers for Python, Laravel (PHP), Rails (Ruby)
  function checkFileTypeExists(dir: string, ext: string): boolean {
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return false
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'venv' || entry === '.venv') continue
      const fp = path.join(dir, entry)
      let stat: fs.Stats
      try {
        stat = fs.statSync(fp)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        if (checkFileTypeExists(fp, ext)) return true
      } else if (entry.endsWith(ext)) {
        return true
      }
    }
    return false
  }

  // Python Frameworks (FastAPI, Django, Flask)
  if (checkFileTypeExists(subCwd, '.py')) {
    try {
      const fastapiIntents = await scanFastAPI(subCwd)
      if (fastapiIntents.length > 0) {
        console.log('   Detected: FastAPI (Python)')
        detectedIntents.push(...fastapiIntents)
        console.log(`   Found ${fastapiIntents.length} FastAPI endpoints`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed FastAPI scan:`, e)
    }

    try {
      const flaskIntents = await scanFlask(subCwd)
      if (flaskIntents.length > 0) {
        console.log('   Detected: Flask (Python)')
        detectedIntents.push(...flaskIntents)
        console.log(`   Found ${flaskIntents.length} Flask routes`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed Flask scan:`, e)
    }

    try {
      const djangoIntents = await scanDjango(subCwd)
      if (djangoIntents.length > 0) {
        console.log('   Detected: Django REST Framework (Python)')
        detectedIntents.push(...djangoIntents)
        console.log(`   Found ${djangoIntents.length} Django endpoints`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed Django scan:`, e)
    }
  }

  // Laravel (PHP)
  if (fs.existsSync(path.join(subCwd, 'artisan')) || checkFileTypeExists(subCwd, '.php')) {
    try {
      const intents = await scanLaravel(subCwd)
      if (intents.length > 0) {
        console.log('   Detected: Laravel (PHP)')
        detectedIntents.push(...intents)
        console.log(`   Found ${intents.length} Laravel routes`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed Laravel scan:`, e)
    }
  }

  // Ruby on Rails
  if (fs.existsSync(path.join(subCwd, 'Gemfile')) || fs.existsSync(path.join(subCwd, 'config/routes.rb'))) {
    try {
      const intents = await scanRails(subCwd)
      if (intents.length > 0) {
        console.log('   Detected: Ruby on Rails')
        detectedIntents.push(...intents)
        console.log(`   Found ${intents.length} Rails routes`)
      }
    } catch (e) {
      console.warn(`   ⚠ Failed Rails scan:`, e)
    }
  }

  // Recursive OpenAPI Search
  function findOpenAPISpecs(dir: string, fileList: string[] = []): string[] {
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return fileList
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)

      if (
        entry === 'node_modules' ||
        entry === 'dist' ||
        entry === '.git' ||
        entry === '.next' ||
        entry === 'venv' ||
        entry === '.venv'
      ) {
        continue
      }

      let stat: fs.Stats
      try {
        stat = fs.statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        findOpenAPISpecs(fullPath, fileList)
      } else if (
        entry === 'openapi.json' ||
        entry === 'openapi.yaml' ||
        entry === 'openapi.yml' ||
        entry === 'swagger.json' ||
        entry === 'swagger.yaml' ||
        entry === 'swagger.yml'
      ) {
        fileList.push(fullPath)
      }
    }

    return fileList
  }

  try {
    const openApiSpecs = findOpenAPISpecs(subCwd)
    for (const specPath of openApiSpecs) {
      const relPath = path.relative(subCwd, specPath)
      console.log(`   Detected: OpenAPI spec (${relPath})`)
      const intents = await scanOpenAPI(specPath)
      detectedIntents.push(...intents)
      console.log(`   Imported ${intents.length} operations`)
    }
  } catch (e) {
    console.warn(`   ⚠ Failed OpenAPI scan:`, e)
  }

  return detectedIntents
}

/**
 * Handle aggregation flow across multiple microservices.
 */
async function handleAggregation(rootCwd: string, detectedApps: string[]) {
  const masterJin: JinJSON = {
    aip_version: '0.1',
    app: {
      name: 'API Gateway',
      description: 'Unified API Gateway Intent Map',
      url: 'https://TODO.your-domain.com',
      contact: 'TODO: dev@your-domain.com'
    },
    auth: {
      type: 'none'
    },
    intents: [],
    published: new Date().toISOString(),
    registry: {
      verified: false
    }
  }

  console.log('\nStarting Microservice Aggregation (In-Memory)...')

  for (const app of detectedApps) {
    const relPath = path.relative(rootCwd, app)
    const prefix = await input({
      message: `Enter the gateway routing prefix for ./${relPath} (e.g., /api/auth) [Leave blank for none]:`,
      default: ''
    })

    let cleanPrefix = prefix.trim()
    if (cleanPrefix && !cleanPrefix.startsWith('/')) {
      cleanPrefix = '/' + cleanPrefix
    }
    if (cleanPrefix.endsWith('/')) {
      cleanPrefix = cleanPrefix.slice(0, -1)
    }

    console.log(`🔍 Scanning ./${relPath}...`)
    try {
      const rawIntents = await scanDirectoryForIntents(app)
      console.log(`   Found ${rawIntents.length} raw intents in ./${relPath}`)

      for (const intent of rawIntents) {
        let endpoint = intent.endpoint || ''
        if (!endpoint.startsWith('/')) {
          endpoint = '/' + endpoint
        }

        const aggregatedEndpoint = `${cleanPrefix}${endpoint}`.replace(/\/+/g, '/')
        const id = `${intent.method?.toLowerCase()}_${aggregatedEndpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`

        masterJin.intents.push({
          id,
          name: intent.name ? `${intent.method} ${aggregatedEndpoint}` : `${intent.method} ${aggregatedEndpoint}`,
          description: intent.description || `Auto-detected intent for ${intent.method} ${aggregatedEndpoint}`,
          triggers: intent.triggers || [
            `call ${aggregatedEndpoint}`,
            `${intent.method?.toLowerCase()} ${aggregatedEndpoint}`
          ],
          category: intent.category || 'developer',
          method: intent.method || 'GET',
          endpoint: aggregatedEndpoint,
          parameters: intent.parameters || {},
          requires_auth: intent.requires_auth ?? false,
          destructive: intent.destructive ?? false,
          confirmation_required: intent.confirmation_required ?? false
        })
      }
    } catch (e) {
      console.warn(`   ⚠ Failed scanning sub-project ./${relPath}:`, e)
    }
  }

  // Determine output path at rootCwd
  let outDir = rootCwd
  if (fs.existsSync(path.join(rootCwd, 'public'))) {
    outDir = path.join(rootCwd, 'public', '.well-known')
  } else {
    outDir = path.join(rootCwd, '.well-known')
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const outputPath = path.join(outDir, 'jin.json')
  fs.writeFileSync(outputPath, JSON.stringify(masterJin, null, 2))

  console.log(`\n✓ Generated unified API Gateway jin.json with ${masterJin.intents.length} intents`)
  console.log(`✓ Saved to ${path.relative(rootCwd, outputPath)}`)
  console.log('\nNext steps:')
  console.log(`  1. Review ${path.relative(rootCwd, outputPath)} and fill in descriptions`)
  console.log('  2. Run: npx @papercargo/jin-cli validate')
}

export async function init(cwd: string = process.cwd()) {
  // Workspace / Monorepo detection
  const detectedApps = detectWorkspaceApps(cwd)
  if (detectedApps.length > 0) {
    if (detectedApps.length === 1 && detectedApps[0] !== cwd) {
      const relPath = path.relative(cwd, detectedApps[0])
      console.log(`🔍 Monorepo detected. Found application in: ${relPath}`)
      const ans = await confirm({
        message: `Initialize jin.json inside ${relPath}?`,
        default: true
      })
      if (ans) {
        cwd = detectedApps[0]
        console.log(`  Targeting workspace: ${relPath}\n`)
      }
    } else if (detectedApps.length > 1) {
      console.log(`🔍 Monorepo detected. Multiple applications found.`)
      const choices = detectedApps.map((app, idx) => ({
        name: `${idx + 1}) ${path.relative(cwd, app)}`,
        value: app
      }))

      choices.push({
        name: 'Create a unified API Gateway map (Aggregate all)',
        value: 'AGGREGATE'
      })

      choices.push({
        name: `Create at root (${path.relative(cwd, cwd) || '.'}) anyway`,
        value: 'ROOT'
      })

      const selection = await select({
        message: 'Select which project to initialize:',
        choices
      })

      if (selection === 'AGGREGATE') {
        await handleAggregation(cwd, detectedApps)
        process.exit(0)
      } else if (selection === 'ROOT') {
        console.log(`  Targeting workspace: root\n`)
      } else {
        cwd = selection
        console.log(`  Targeting workspace: ${path.relative(process.cwd(), cwd)}\n`)
      }
    }
  }

  const existingPath = resolveJinJsonPath(cwd)
  if (existingPath) {
    console.log(`⚠ Found existing intent map at ${path.relative(cwd, existingPath) || 'jin.json'}`)
    const ans = await confirm({
      message: 'Do you want to override and rewrite it?',
      default: false
    })
    if (!ans) {
      console.log('  Aborting init.')
      process.exit(0)
    }
    console.log('  Overwriting existing intent map...\n')
  }

  console.log('🔍 Jin — scanning your codebase...\n')

  const detectedIntents = await scanDirectoryForIntents(cwd)

  let packageJson: any = {}
  try {
    packageJson = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
    )
  } catch (e) {
    // No package.json is normal for Python/PHP/Ruby projects
  }

  console.log('')

  // Build scaffold
  const scaffold: JinJSON = {
    aip_version: '0.1',
    app: {
      name: packageJson.name || 'My App',
      description: packageJson.description || 'TODO: describe what your app does',
      url: 'https://TODO.your-domain.com',
      contact: 'TODO: dev@your-domain.com'
    },
    auth: {
      type: 'none'
    },
    intents: detectedIntents.map(intent => ({
      id: intent.id || 'TODO_intent_id',
      name: intent.name || 'TODO: Intent name',
      description: intent.description || 'TODO: What does this intent do in plain language?',
      triggers: intent.triggers || [
        'TODO: natural language phrase that maps to this intent',
        'TODO: alternative phrasing'
      ],
      category: intent.category || 'developer',
      method: intent.method || 'GET',
      endpoint: intent.endpoint || '/TODO',
      parameters: intent.parameters || {},
      requires_auth: intent.requires_auth ?? false,
      destructive: intent.destructive ?? false,
      confirmation_required: intent.confirmation_required ?? false
    })),
    published: new Date().toISOString(),
    registry: {
      verified: false
    }
  }

  // Determine output path
  let outDir = cwd
  if (fs.existsSync(path.join(cwd, 'public'))) {
    outDir = path.join(cwd, 'public', '.well-known')
    console.log('   Found public/ directory — placing intent map there.')
  } else {
    outDir = path.join(cwd, '.well-known')
    console.log('   No public/ directory found — placing intent map in root .well-known/')
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const outputPath = path.join(outDir, 'jin.json')
  fs.writeFileSync(outputPath, JSON.stringify(scaffold, null, 2))

  console.log(`✓ Generated jin.json with ${scaffold.intents.length} intents`)
  if (outDir !== cwd) {
    console.log(`✓ Copied to ${path.relative(cwd, outputPath)}`)
  }

  console.log('\nNext steps:')
  console.log(`  1. Review ${path.relative(cwd, outputPath) || 'jin.json'} and fill in descriptions`)
  console.log('  2. Run: npx @papercargo/jin-cli validate')
  console.log('  3. Commit and deploy your app')
  console.log(`     git add ${path.relative(cwd, outputPath) || 'jin.json'}`)
  console.log('     git commit -m "feat: add AIP intent map"')
  console.log('     git push')
  console.log('  4. Once deployed, run: npx @papercargo/jin-cli publish')
  console.log('     (your intent map must be live at')
  console.log('      yourdomain.com/.well-known/jin.json)')
}
