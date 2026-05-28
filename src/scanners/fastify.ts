import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * Fastify scanner.
 * Scans .ts/.js files for fastify.get('/path') and fastify.route(...) definitions.
 * Normalizes route parameters: cleans inline regexes like :id(^\d+$) -> :id and * -> :wildcard*
 */
export async function scanFastify(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  const scannedFiles = new Set<string>()
  const srcDirs = ['src', 'routes', 'api', 'controllers', 'lib', '.']

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
      } else if (/\.(ts|js|mjs|cjs)$/.test(entry) && !entry.endsWith('.d.ts')) {
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

  // 1. Matches: fastify.get('/path'), fastify.post('/path')
  const verbPattern = /\b(?:fastify|server|app)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi
  let match: RegExpExecArray | null
  while ((match = verbPattern.exec(content)) !== null) {
    const method = match[1].toUpperCase()
    let endpoint = match[2]

    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }

    // Normalizations:
    // Fastify parameter constraints: :id(^\\d+$) -> :id
    endpoint = endpoint.replace(/:(\w+)\([^)]+\)/g, ':$1')
    // Fastify wildcards: * -> :wildcard*
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
      description: `Auto-detected Fastify route: ${method} ${endpoint}`,
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

  // 2. Matches fastify.route({ method: 'GET', url: '/path' })
  const routePattern = /\b(?:fastify|server|app)\.route\s*\(\s*\{([^}]+)\}/gi
  while ((match = routePattern.exec(content)) !== null) {
    const block = match[1]
    const methodMatch = /method\s*:\s*['"`]?(GET|POST|PUT|PATCH|DELETE)['"`]?/i.exec(block)
    const urlMatch = /url\s*:\s*['"`]([^'"`]+)['"`]/i.exec(block)

    if (methodMatch && urlMatch) {
      const method = methodMatch[1].toUpperCase()
      let endpoint = urlMatch[1]

      if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint
      }

      endpoint = endpoint.replace(/:(\w+)\([^)]+\)/g, ':$1')
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
        description: `Auto-detected Fastify route configuration: ${method} ${endpoint}`,
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
}
