import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * FastAPI scanner.
 * Scans .py files recursively for @app.get('/path') and @router.post(...) style patterns.
 * Normalizes FastAPI parameters like {id:int} -> :id and {file_path:path} -> :file_path*
 */
export async function scanFastAPI(cwd: string): Promise<Partial<AIPIntent>[]> {
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
      
      // Standard folders to ignore in python
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

  // Capture FastAPI decorators: @(app|router|api).(get|post|put|patch|delete)('/path')
  const fastapiPattern = /@(?:app|router|api)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi

  let match: RegExpExecArray | null
  while ((match = fastapiPattern.exec(content)) !== null) {
    const method = match[1].toUpperCase()
    let endpoint = match[2]

    // Ensure leading slash
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }

    // Normalizations:
    // 1. {name:path} -> :name* (catch-all)
    endpoint = endpoint.replace(/\{(\w+):path\}/g, ':$1*')
    // 2. {name:int} -> :name (typed converter)
    endpoint = endpoint.replace(/\{(\w+):\w+\}/g, ':$1')
    // 3. {name} -> :name (standard dynamic param)
    endpoint = endpoint.replace(/\{(\w+)\}/g, ':$1')

    const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`

    if (intents.some(i => i.id === id)) continue

    intents.push({
      id,
      name: `${method} ${endpoint}`,
      description: `Auto-detected FastAPI route: ${method} ${endpoint}`,
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
