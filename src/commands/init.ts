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
    console.log('   Warning: No package.json found')
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

  // Check for existing OpenAPI spec
  const openApiPaths = ['openapi.json', 'openapi.yaml', 'swagger.json', 'swagger.yaml']
  for (const p of openApiPaths) {
    if (fs.existsSync(path.join(cwd, p))) {
      console.log(`   Detected: OpenAPI spec (${p})`)
      const intents = await scanOpenAPI(path.join(cwd, p))
      detectedIntents.push(...intents)
      console.log(`   Imported ${intents.length} operations`)
    }
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
