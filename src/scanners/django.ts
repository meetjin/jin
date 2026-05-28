import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * Django REST Framework scanner.
 * Scans .py files recursively (primarily urls.py).
 * Normalizes patterns like path('users/<int:pk>/') -> /users/:pk and re_path(r'^users/(?P<pk>[0-9]+)/$') -> /users/:pk
 * Also infers CRUD endpoints for router.register(r'users', UserViewSet)
 */
export async function scanDjango(cwd: string): Promise<Partial<AIPIntent>[]> {
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

  // 1. Match paths: path('api/v1/users/', ...)
  const pathPattern = /\bpath\s*\(\s*['"`]([^'"`]*)['"`]/gi
  let match: RegExpExecArray | null
  while ((match = pathPattern.exec(content)) !== null) {
    let endpoint = match[1]

    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }
    if (endpoint.endsWith('/') && endpoint.length > 1) {
      endpoint = endpoint.slice(0, -1)
    }

    // Normalize path parameters: <int:pk> or <slug:name> or <pk> -> :pk
    endpoint = endpoint.replace(/<(?:\w+:)?(\w+)>/g, ':$1')

    const hasParams = endpoint.includes(':')
    const methods = hasParams ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']

    for (const method of methods) {
      const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
      if (intents.some(i => i.id === id)) continue

      intents.push({
        id,
        name: `${method} ${endpoint}`,
        description: `Auto-detected Django route: ${method} ${endpoint}`,
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

  // 2. Match re_paths: re_path(r'^users/(?P<pk>[0-9]+)/$', ...)
  const rePathPattern = /\bre_path\s*\(\s*r?['"`]([^'"`]*)['"`]/gi
  while ((match = rePathPattern.exec(content)) !== null) {
    let rawEndpoint = match[1]
    
    let endpoint = rawEndpoint.replace(/^\^/, '').replace(/\$$/, '')
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }
    if (endpoint.endsWith('/') && endpoint.length > 1) {
      endpoint = endpoint.slice(0, -1)
    }

    // Capture groups: (?P<pk>[0-9]+) -> :pk
    endpoint = endpoint.replace(/\(\?P<(\w+)>[^)]+\)/g, ':$1')
    // Strip nested parens to simplify
    endpoint = endpoint.replace(/\([^)]+\)/g, ':param')

    const hasParams = endpoint.includes(':')
    const methods = hasParams ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']

    for (const method of methods) {
      const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
      if (intents.some(i => i.id === id)) continue

      intents.push({
        id,
        name: `${method} ${endpoint}`,
        description: `Auto-detected Django re_path route: ${method} ${endpoint}`,
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

  // 3. Match router.register(r'users', UserViewSet)
  const routerPattern = /router\.register\s*\(\s*r?['"`]([^'"`]*)['"`]/gi
  while ((match = routerPattern.exec(content)) !== null) {
    const prefix = match[1]
    let baseEndpoint = `/${prefix}`
    if (baseEndpoint.endsWith('/')) {
      baseEndpoint = baseEndpoint.slice(0, -1)
    }

    const restEndpoints = [
      { method: 'GET', path: baseEndpoint },
      { method: 'POST', path: baseEndpoint },
      { method: 'GET', path: `${baseEndpoint}/:id` },
      { method: 'PUT', path: `${baseEndpoint}/:id` },
      { method: 'DELETE', path: `${baseEndpoint}/:id` }
    ]

    for (const ep of restEndpoints) {
      const id = `${ep.method.toLowerCase()}_${ep.path.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
      if (intents.some(i => i.id === id)) continue

      intents.push({
        id,
        name: `${ep.method} ${ep.path}`,
        description: `Auto-detected Django DRF ViewSet route: ${ep.method} ${ep.path}`,
        triggers: [
          `call ${ep.path}`,
          `${ep.method.toLowerCase()} ${ep.path}`,
        ],
        category: 'developer',
        method: ep.method as any,
        endpoint: ep.path,
        requires_auth: false,
        destructive: ep.method === 'DELETE',
        confirmation_required: ep.method === 'DELETE',
      })
    }
  }
}
