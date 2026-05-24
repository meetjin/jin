import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

const EXPORT_METHODS = [
  { regex: /export\s+async\s+function\s+GET/m, method: 'GET' },
  { regex: /export\s+async\s+function\s+POST/m, method: 'POST' },
  { regex: /export\s+async\s+function\s+PUT/m, method: 'PUT' },
  { regex: /export\s+async\s+function\s+DELETE/m, method: 'DELETE' },
  { regex: /export\s+async\s+function\s+PATCH/m, method: 'PATCH' },
]

const REQ_METHOD_PATTERNS = [
  /req\.method\s*===\s*['"](GET|POST|PUT|DELETE|PATCH)['"]/gi,
  /req\.method\s*!==\s*['"](GET|POST|PUT|DELETE|PATCH)['"]/gi,
  /switch\s*\(\s*req\.method\s*\)/gi,
  /case\s+['"](GET|POST|PUT|DELETE|PATCH)['"]\s*:/gi,
]

/**
 * Next.js App Router + Pages API scanner.
 * Scans app/route.ts files and pages/api files for route metadata.
 */
export async function scanNextJS(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []

  const appDir = fs.existsSync(path.join(cwd, 'src/app'))
    ? path.join(cwd, 'src/app')
    : fs.existsSync(path.join(cwd, 'app'))
      ? path.join(cwd, 'app')
      : null

  const pagesApiDir = fs.existsSync(path.join(cwd, 'src/pages/api'))
    ? path.join(cwd, 'src/pages/api')
    : fs.existsSync(path.join(cwd, 'pages/api'))
      ? path.join(cwd, 'pages/api')
      : null

  if (appDir) {
    scanAppRouter(appDir, intents)
  }

  if (pagesApiDir) {
    scanPagesApi(pagesApiDir, intents)
  }

  return intents
}

function scanAppRouter(appDir: string, intents: Partial<AIPIntent>[]) {
  function walk(dir: string) {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const fullPath = path.join(dir, file)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (file === 'route.ts' || file === 'route.js') {
        const relativePath = path.relative(appDir, path.dirname(fullPath))
        const endpoint = '/' + normalizeRoutePath(relativePath)
        scanRouteHandler(fullPath, endpoint, intents)
      }
    }
  }

  try {
    walk(appDir)
  } catch (e) {
    console.error('Error scanning Next.js App Router directory:', e)
  }
}

function scanPagesApi(pagesApiDir: string, intents: Partial<AIPIntent>[]) {
  function walk(dir: string) {
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (/\.(ts|js|mjs|cjs)$/.test(entry) && !entry.endsWith('.d.ts')) {
        const relativePath = path.relative(pagesApiDir, fullPath)
        const endpoint = '/api/' + normalizePagesApiRoute(relativePath)
        scanPagesApiHandler(fullPath, endpoint, intents)
      }
    }
  }

  try {
    walk(pagesApiDir)
  } catch (e) {
    console.error('Error scanning Next.js Pages API directory:', e)
  }
}

function scanRouteHandler(fullPath: string, endpoint: string, intents: Partial<AIPIntent>[]) {
  const content = fs.readFileSync(fullPath, 'utf-8')
  const methods = detectExportedMethods(content)
  for (const method of methods) {
    const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
    if (intents.some(i => i.id === id)) continue
    intents.push(buildIntent(id, method, endpoint))
  }
}

function scanPagesApiHandler(fullPath: string, endpoint: string, intents: Partial<AIPIntent>[]) {
  const content = fs.readFileSync(fullPath, 'utf-8')
  const methods = detectRequestMethods(content)
  for (const method of methods) {
    const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
    if (intents.some(i => i.id === id)) continue
    intents.push(buildIntent(id, method, endpoint))
  }
}

function detectExportedMethods(content: string): string[] {
  const methods = new Set<string>()
  for (const entry of EXPORT_METHODS) {
    if (entry.regex.test(content)) {
      methods.add(entry.method)
    }
  }
  return Array.from(methods)
}

function detectRequestMethods(content: string): string[] {
  const methods = new Set<string>()
  for (const pattern of REQ_METHOD_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const method = match[1].toUpperCase()
      methods.add(method)
    }
  }
  if (methods.size === 0) {
    // Fallback to common API methods if no explicit request checks were found
    methods.add('GET')
    methods.add('POST')
  }
  return Array.from(methods)
}

function normalizeRoutePath(route: string): string {
  let normalized = route.replace(/\\/g, '/')
  normalized = normalized.replace(/\/\/+/g, '/')
  normalized = normalized.replace(/\[\.\.\.\.\.\.\]/g, ':splat*')
  normalized = normalized.replace(/\[\.\.\.\.\.\]/g, ':splat*')
  normalized = normalized.replace(/\[\.\.\.\.]/g, ':splat*')
  normalized = normalized.replace(/\[\.\.\.]/g, ':splat*')
  normalized = normalized.replace(/\[(\.\.\.)?(\w+)\]/g, (_, __, name) => name ? `:${name}` : '')
  normalized = normalized.replace(/\/\/_index$/, '')
  normalized = normalized.replace(/^_index$/, '')
  normalized = normalized.replace(/^\/+/, '')
  return normalized.replace(/\/+$|^$/, '')
}

function normalizePagesApiRoute(relativePath: string): string {
  let route = relativePath.replace(/\.(ts|js|mjs|cjs)$/, '')
  route = route.replace(/\\/g, '/')
  if (route.endsWith('/index')) {
    route = route.slice(0, -'/index'.length)
  }
  route = route.replace(/\[\.\.\.(\w+)\]/g, ':$1*')
  route = route.replace(/\[(\w+)\]/g, ':$1')
  route = route.replace(/\/+/g, '/')
  route = route.replace(/\/+$/, '')
  return route.replace(/^\/|\/$/g, '')
}

function buildIntent(id: string, method: string, endpoint: string): Partial<AIPIntent> {
  return {
    id,
    name: `${method} ${endpoint}`,
    description: `Auto-generated intent for ${method} ${endpoint}`,
    method: method as any,
    endpoint,
    triggers: [`call ${endpoint}`, `${method.toLowerCase()} ${endpoint}`],
    category: 'developer',
    requires_auth: false,
    destructive: method === 'DELETE',
    confirmation_required: method === 'DELETE',
  }
}
