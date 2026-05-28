import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * Hono scanner.
 * Scans .ts/.js files for app.get('/path') and app.post(...) style declarations.
 * Normalizes Hono parameter regex constraints: :id{[0-9]+} -> :id and /* -> /:wildcard*
 */
export async function scanHono(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  const scannedFiles = new Set<string>()
  const srcDirs = ['src', 'routes', 'api', 'lib', '.']

  function walk(dir: string) {
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === '.next') continue

      let stat: fs.Stats
      try {
        stat = fs.statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (/\.(ts|js|tsx|jsx|mjs|cjs)$/.test(entry) && !entry.endsWith('.d.ts')) {
        if (scannedFiles.has(fullPath)) continue
        scannedFiles.add(fullPath)
        scanFile(fullPath, intents)
      }
    }
  }

  for (const dir of srcDirs) {
    const fullDir = path.join(cwd, dir)
    if (fs.existsSync(fullDir)) {
      walk(fullDir)
    }
  }

  return intents
}

function scanFile(filePath: string, intents: Partial<AIPIntent>[]) {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return
  }

  // Matches Hono routing: app.get('/path', ...) or route.post('/path', ...)
  const honoPattern = /\b(?:app|route|hono)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi

  let match: RegExpExecArray | null
  while ((match = honoPattern.exec(content)) !== null) {
    const method = match[1].toUpperCase()
    let endpoint = match[2]

    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }

    // Normalizations:
    // Hono parameter constraints: :id{[0-9]+} -> :id
    endpoint = endpoint.replace(/:(\w+)\{[^}]+\}/g, ':$1')
    // Hono wildcards: /* -> /:wildcard*
    if (endpoint === '/*') {
      endpoint = '/:wildcard*'
    } else if (endpoint.endsWith('/*')) {
      endpoint = endpoint.slice(0, -2) + '/:wildcard*'
    }

    const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
    if (intents.some(i => i.id === id)) continue

    intents.push({
      id,
      name: `${method} ${endpoint}`,
      description: `Auto-detected Hono route: ${method} ${endpoint}`,
      triggers: [
        `call ${endpoint}`,
        `${method.toLowerCase()} ${endpoint}`,
      ],
      category: 'developer',
      method: method as any,
      endpoint,
      requires_auth: false,
      destructive: method === 'DELETE',
      confirmation_required: method === 'DELETE',
    })
  }
}
