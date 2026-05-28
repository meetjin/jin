import fs from 'fs'
import path from 'path'
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
import { resolveJinJsonPath, promptUser } from '../utils'

export async function init(cwd: string = process.cwd()) {
  const existingPath = resolveJinJsonPath(cwd)
  if (existingPath) {
    console.log(`⚠ Found existing intent map at ${path.relative(cwd, existingPath) || 'jin.json'}`)
    const ans = await promptUser('Do you want to override and rewrite it? (y/n): ')
    if (ans !== 'y' && ans !== 'yes') {
      console.log('  Aborting init.')
      process.exit(0)
    }
    console.log('  Overwriting existing intent map...\n')
  }

  console.log('🔍 Jin — scanning your codebase...\n')

  const detectedIntents: Partial<AIPIntent>[] = []
  let packageJson: any = {}
  try {
    packageJson = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')
    )
  } catch (e) {
    // No package.json is normal for Python/PHP/Ruby projects
  }

  // Detect framework
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  }

  const hasNextApp = Boolean(
    deps['next'] ||
    fs.existsSync(path.join(cwd, 'src/app')) ||
    fs.existsSync(path.join(cwd, 'app')) ||
    fs.existsSync(path.join(cwd, 'src/pages/api')) ||
    fs.existsSync(path.join(cwd, 'pages/api'))
  )

  if (hasNextApp) {
    console.log('   Detected: Next.js')
    const intents = await scanNextJS(cwd)
    detectedIntents.push(...intents)
    console.log(`   Found ${intents.length} routes/endpoints`)
  }

  if (deps['react-router-dom'] || deps['react-router']) {
    console.log('   Detected: React Router')
    const intents = await scanReactRouter(cwd)
    detectedIntents.push(...intents)
    console.log(`   Found ${intents.length} routes`)
  }

  if (deps['express']) {
    console.log('   Detected: Express')
    const intents = await scanExpress(cwd)
    detectedIntents.push(...intents)
    console.log(`   Found ${intents.length} endpoints`)
  }

  if (deps['vite'] && deps['react']) {
    console.log('   Detected: Vite + React SPA')
    const intents = await scanViteReact(cwd)
    detectedIntents.push(...intents)
    console.log(`   Found ${intents.length} routes`)
  }

  if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) {
    console.log('   Detected: Dart/Flutter project')
    const intents = await scanDart(cwd)
    detectedIntents.push(...intents)
    console.log(`   Found ${intents.length} routes/endpoints`)
  }

  if (fs.existsSync(path.join(cwd, 'supabase/functions'))) {
    console.log('   Detected: Supabase Edge Functions')
    const intents = await scanSupabaseFunctions(cwd)
    detectedIntents.push(...intents)
    console.log(`   Found ${intents.length} edge functions`)
  }

  // Node Frameworks (Fastify, Hono, NestJS, tRPC)
  if (deps['fastify']) {
    const intents = await scanFastify(cwd)
    if (intents.length > 0) {
      console.log('   Detected: Fastify')
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} endpoints`)
    }
  }

  if (deps['hono']) {
    const intents = await scanHono(cwd)
    if (intents.length > 0) {
      console.log('   Detected: Hono')
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} routes`)
    }
  }

  if (deps['@nestjs/core'] || deps['@nestjs/common']) {
    const intents = await scanNestJS(cwd)
    if (intents.length > 0) {
      console.log('   Detected: NestJS')
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} routes`)
    }
  }

  if (deps['@trpc/server'] || deps['@trpc/client']) {
    const intents = await scanTRPC(cwd)
    if (intents.length > 0) {
      console.log('   Detected: tRPC')
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} procedures`)
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
  if (checkFileTypeExists(cwd, '.py')) {
    const fastapiIntents = await scanFastAPI(cwd)
    if (fastapiIntents.length > 0) {
      console.log('   Detected: FastAPI (Python)')
      detectedIntents.push(...fastapiIntents)
      console.log(`   Found ${fastapiIntents.length} endpoints`)
    }

    const flaskIntents = await scanFlask(cwd)
    if (flaskIntents.length > 0) {
      console.log('   Detected: Flask (Python)')
      detectedIntents.push(...flaskIntents)
      console.log(`   Found ${flaskIntents.length} routes`)
    }

    const djangoIntents = await scanDjango(cwd)
    if (djangoIntents.length > 0) {
      console.log('   Detected: Django REST Framework (Python)')
      detectedIntents.push(...djangoIntents)
      console.log(`   Found ${djangoIntents.length} endpoints`)
    }
  }

  // Laravel (PHP)
  if (fs.existsSync(path.join(cwd, 'artisan')) || checkFileTypeExists(cwd, '.php')) {
    const intents = await scanLaravel(cwd)
    if (intents.length > 0) {
      console.log('   Detected: Laravel (PHP)')
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} routes`)
    }
  }

  // Ruby on Rails
  if (fs.existsSync(path.join(cwd, 'Gemfile')) || fs.existsSync(path.join(cwd, 'config/routes.rb'))) {
    const intents = await scanRails(cwd)
    if (intents.length > 0) {
      console.log('   Detected: Ruby on Rails')
      detectedIntents.push(...intents)
      console.log(`   Found ${intents.length} routes`)
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

  const openApiSpecs = findOpenAPISpecs(cwd)
  for (const specPath of openApiSpecs) {
    const relPath = path.relative(cwd, specPath)
    console.log(`   Detected: OpenAPI spec (${relPath})`)
    const intents = await scanOpenAPI(specPath)
    detectedIntents.push(...intents)
    console.log(`   Imported ${intents.length} operations`)
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
