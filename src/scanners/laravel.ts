import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * Laravel router scanner.
 * Scans PHP files, focusing on the routes/ directory if present.
 * Matches Route::get('/path', ...) and Route::match(['get', 'post'], '/path', ...)
 * Normalizes route parameters like {id} -> :id and optional parameters {name?} -> :name
 */
export async function scanLaravel(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  const scannedFiles = new Set<string>()

  const targetDir = fs.existsSync(path.join(cwd, 'routes'))
    ? path.join(cwd, 'routes')
    : cwd

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
        entry === 'vendor' ||
        entry === 'storage' ||
        entry === 'bootstrap'
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
      } else if (entry.endsWith('.php')) {
        if (scannedFiles.has(fullPath)) continue
        scannedFiles.add(fullPath)
        scanFile(fullPath, intents)
      }
    }
  }

  walk(targetDir)
  return intents
}

function scanFile(filePath: string, intents: Partial<AIPIntent>[]) {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return
  }

  // 1. Match Route::get/post/put/patch/delete('path', ...)
  const routePattern = /Route::(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi
  let match: RegExpExecArray | null
  while ((match = routePattern.exec(content)) !== null) {
    const method = match[1].toUpperCase()
    let endpoint = match[2]

    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }

    // Normalizations:
    // {id} -> :id and optional parameter {name?} -> :name
    endpoint = endpoint.replace(/\{(\w+)\??\}/g, ':$1')

    const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
    if (intents.some(i => i.id === id)) continue

    intents.push({
      id,
      name: `${method} ${endpoint}`,
      description: `Auto-detected Laravel route: ${method} ${endpoint}`,
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

  // 2. Match Route::match(['get', 'post'], 'path', ...)
  const matchPattern = /Route::match\s*\(\s*\[([^\]]+)\]\s*,\s*['"`]([^'"`]+)['"`]/gi
  while ((match = matchPattern.exec(content)) !== null) {
    const methodsRaw = match[1]
    let endpoint = match[2]

    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }

    endpoint = endpoint.replace(/\{(\w+)\??\}/g, ':$1')

    const methods = methodsRaw
      .split(',')
      .map(m => m.replace(/['"\s]/g, '').toUpperCase())

    for (const method of methods) {
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue

      const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
      if (intents.some(i => i.id === id)) continue

      intents.push({
        id,
        name: `${method} ${endpoint}`,
        description: `Auto-detected Laravel route: ${method} ${endpoint}`,
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
