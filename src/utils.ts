import fs from 'fs'
import path from 'path'
import readline from 'readline'

/**
 * Resolves the path to jin.json based on common directory structures.
 * Checks in order:
 * 1. public/.well-known/jin.json
 * 2. .well-known/jin.json
 * 3. jin.json
 */
export function resolveJinJsonPath(cwd: string = process.cwd()): string | null {
  const paths = [
    path.join(cwd, 'public', '.well-known', 'jin.json'),
    path.join(cwd, '.well-known', 'jin.json'),
    path.join(cwd, 'jin.json')
  ]

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  // If not found in cwd, search detected workspace applications
  const apps = detectWorkspaceApps(cwd)
  const foundPaths: string[] = []

  for (const app of apps) {
    const appPaths = [
      path.join(app, 'public', '.well-known', 'jin.json'),
      path.join(app, '.well-known', 'jin.json'),
      path.join(app, 'jin.json')
    ]
    for (const ap of appPaths) {
      if (fs.existsSync(ap)) {
        foundPaths.push(ap)
      }
    }
  }

  if (foundPaths.length === 1) {
    return foundPaths[0]
  } else if (foundPaths.length > 1) {
    console.warn(`\n⚠ Found multiple jin.json files in this workspace:`)
    for (const p of foundPaths) {
      console.warn(`  - ${path.relative(cwd, p)}`)
    }
    console.warn(`  Defaulting to the first one: ${path.relative(cwd, foundPaths[0])}\n`)
    console.warn(`  Please specify the target directory to avoid ambiguity (e.g. npx @papercargo/jin-cli validate <dir>).\n`)
    return foundPaths[0]
  }

  return null
}

export function promptUser(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  return new Promise(resolve => rl.question(query, ans => {
    rl.close()
    resolve(ans.trim().toLowerCase())
  }))
}

/**
 * Resolves glob patterns (like apps/*) to absolute directory paths.
 */
function resolveGlobPatterns(cwd: string, patterns: string[]): string[] {
  const resolved: string[] = []
  for (const pattern of patterns) {
    const cleanPattern = pattern.trim()
    if (!cleanPattern) continue

    // If it ends with '/*', resolve all subdirectories in the parent folder
    if (cleanPattern.endsWith('/*')) {
      const parentDir = path.join(cwd, cleanPattern.slice(0, -2))
      if (fs.existsSync(parentDir)) {
        try {
          const entries = fs.readdirSync(parentDir)
          for (const entry of entries) {
            const fullPath = path.join(parentDir, entry)
            if (fs.statSync(fullPath).isDirectory()) {
              resolved.push(fullPath)
            }
          }
        } catch {}
      }
    } else {
      // Direct folder pattern
      const fullPath = path.join(cwd, cleanPattern)
      if (fs.existsSync(fullPath)) {
        resolved.push(fullPath)
      }
    }
  }
  return resolved
}

/**
 * Resolves monorepo workspace patterns (like NPM/Yarn workspaces or PNPM workspaces) to actual directories.
 */
export function getWorkspaceDirectories(cwd: string): string[] {
  const workspaceDirs: string[] = []

  // 1. Check NPM/Yarn workspaces in package.json
  const packageJsonPath = path.join(cwd, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const workspaces = packageJson.workspaces
      if (Array.isArray(workspaces)) {
        workspaceDirs.push(...resolveGlobPatterns(cwd, workspaces))
      } else if (workspaces && Array.isArray(workspaces.packages)) {
        workspaceDirs.push(...resolveGlobPatterns(cwd, workspaces.packages))
      }
    } catch {}
  }

  // 2. Check PNPM workspaces in pnpm-workspace.yaml
  const pnpmWorkspacePath = path.join(cwd, 'pnpm-workspace.yaml')
  if (fs.existsSync(pnpmWorkspacePath)) {
    try {
      const content = fs.readFileSync(pnpmWorkspacePath, 'utf-8')
      const lines = content.split('\n')
      const patterns: string[] = []
      for (const line of lines) {
        const match = line.match(/^\s*-\s*['"]?([^'"]+)['"]?/)
        if (match) {
          patterns.push(match[1])
        }
      }
      if (patterns.length > 0) {
        workspaceDirs.push(...resolveGlobPatterns(cwd, patterns))
      }
    } catch {}
  }

  // Deduplicate and filter non-existent directories
  return Array.from(new Set(workspaceDirs)).filter(d => {
    try {
      return fs.statSync(d).isDirectory()
    } catch {
      return false
    }
  })
}

/**
 * Checks if the given directory contains standard web application indicators.
 */
function isAppDirectory(dir: string): boolean {
  // 1. package.json exists? Let's check its dependencies
  const packageJsonPath = path.join(dir, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      }
      
      const webFrameworks = [
        'next', 'express', 'react-router', 'react-router-dom', 'vite',
        'fastify', 'hono', '@nestjs/core', '@nestjs/common', '@trpc/server',
        'koa', 'nuxt', 'svelte', '@sveltejs/kit', 'gatsby'
      ]
      
      for (const framework of webFrameworks) {
        if (deps[framework]) return true
      }
    } catch {}
  }

  // 2. Other frameworks/files
  const appIndicatorFiles = [
    'pubspec.yaml',                // Dart/Flutter
    'artisan',                     // Laravel
    'Gemfile',                     // Ruby on Rails
    'requirements.txt',            // Python FastAPI/Flask/Django
    'Pipfile',
    'poetry.lock',
    'openapi.json',
    'openapi.yaml',
    'openapi.yml',
    'swagger.json'
  ]

  for (const file of appIndicatorFiles) {
    if (fs.existsSync(path.join(dir, file))) return true
  }

  // 3. Routing directories
  const routingDirs = [
    'src/app',
    'app',
    'src/pages/api',
    'pages/api',
    'routes',
    'src/routes',
    'app/routes',
    'supabase/functions'
  ]

  for (const rDir of routingDirs) {
    if (fs.existsSync(path.join(dir, rDir))) return true
  }

  return false
}

/**
 * Crawls and detects application subdirectories in a monorepo workspace.
 * If workspaces are configured, we check those folders first.
 * Otherwise, we do a recursive search up to depth 3.
 */
export function detectWorkspaceApps(cwd: string): string[] {
  const candidateDirs = getWorkspaceDirectories(cwd)

  if (candidateDirs.length > 0) {
    return candidateDirs.filter(isAppDirectory)
  }

  const apps: string[] = []
  
  function crawl(dir: string, depth: number) {
    if (depth > 3) return

    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return
    }

    if (depth > 0 && isAppDirectory(dir)) {
      apps.push(dir)
      return
    }

    for (const entry of entries) {
      if (
        entry === 'node_modules' ||
        entry === 'dist' ||
        entry === 'build' ||
        entry === '.git' ||
        entry === '.next' ||
        entry === 'venv' ||
        entry === '.venv'
      ) {
        continue
      }

      const fullPath = path.join(dir, entry)
      try {
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          crawl(fullPath, depth + 1)
        }
      } catch {}
    }
  }

  crawl(cwd, 0)
  return apps
}
