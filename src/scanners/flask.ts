import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * Flask scanner.
 * Scans .py files recursively.
 * Normalizes Flask parameters like <int:id> -> :id, <path:file> -> :file* and <name> -> :name
 * Parses methods array in decorator @app.route('/path', methods=['GET', 'POST'])
 */
export async function scanFlask(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  const scannedFiles = new Set<string>()

  function walk(dir: string) {
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      
      if (
        entry === 'node_modules' ||
        entry === 'dist' ||
        entry === '.git' ||
        entry === '.next' ||
        entry === 'venv' ||
        entry === '.venv' ||
        entry === 'env' ||
        entry === '.env' ||
        entry === '__pycache__' ||
        entry === '.pytest_cache' ||
        entry === 'build'
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
        walk(fullPath)
      } else if (entry.endsWith('.py')) {
        if (scannedFiles.has(fullPath)) continue
        scannedFiles.add(fullPath)
        scanFile(fullPath, intents)
      }
    }
  }

  walk(cwd)
  return intents
}

function scanFile(filePath: string, intents: Partial<AIPIntent>[]) {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return
  }

  // 1. Matches @app.route('/path', methods=['GET', 'POST']) or @bp.route(...)
  const routePattern = /@(?:app|bp|blueprint|api)\.route\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/gi
  let match: RegExpExecArray | null
  while ((match = routePattern.exec(content)) !== null) {
    let endpoint = match[1]
    const methodsRaw = match[2]

    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }

    // Normalizations:
    // <path:subpath> -> :subpath* (catch-all)
    endpoint = endpoint.replace(/<path:(\w+)>/g, ':$1*')
    // <int:post_id> or other typed converters -> :post_id
    endpoint = endpoint.replace(/<\w+:(\w+)>/g, ':$1')
    // <username> -> :username
    endpoint = endpoint.replace(/<(\w+)>/g, ':$1')

    // Parse methods
    let methods: string[] = ['GET'] // Default in Flask
    if (methodsRaw) {
      methods = methodsRaw
        .split(',')
        .map(m => m.replace(/['"\s]/g, '').toUpperCase())
    }

    for (const method of methods) {
      const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
      if (intents.some(i => i.id === id)) continue

      intents.push({
        id,
        name: `${method} ${endpoint}`,
        description: `Auto-detected Flask route: ${method} ${endpoint}`,
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

  // 2. Matches Flask 2.0 shortcut decorators: @app.get('/path') / @bp.post(...)
  const shortcutPattern = /@(?:app|bp|blueprint|api)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi
  while ((match = shortcutPattern.exec(content)) !== null) {
    const method = match[1].toUpperCase()
    let endpoint = match[2]

    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }

    // Normalizations:
    endpoint = endpoint.replace(/<path:(\w+)>/g, ':$1*')
    endpoint = endpoint.replace(/<\w+:(\w+)>/g, ':$1')
    endpoint = endpoint.replace(/<(\w+)>/g, ':$1')

    const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
    if (intents.some(i => i.id === id)) continue

    intents.push({
      id,
      name: `${method} ${endpoint}`,
      description: `Auto-detected Flask route: ${method} ${endpoint}`,
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
