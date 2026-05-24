import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * React Router scanner for file-based routing (Remix / React Router v7).
 * Scans the routes/ or app/routes/ directory for route files and extracts
 * loader (GET) and action (POST) exports.
 */
export async function scanReactRouter(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []

  // Find routes directory (Remix convention)
  const routesDirs = [
    path.join(cwd, 'app', 'routes'),
    path.join(cwd, 'src', 'routes'),
    path.join(cwd, 'routes'),
  ]

  let routesDir: string | null = null
  for (const d of routesDirs) {
    if (fs.existsSync(d)) {
      routesDir = d
      break
    }
  }

  if (!routesDir) return intents

  scanRoutesDir(routesDir, routesDir, intents)

  return intents
}

function scanRoutesDir(dir: string, baseDir: string, intents: Partial<AIPIntent>[]) {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    
    let stat: fs.Stats
    try {
      stat = fs.statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      scanRoutesDir(fullPath, baseDir, intents)
    } else if (/\.(tsx?|jsx?)$/.test(entry) && !entry.endsWith('.d.ts')) {
      scanRouteFile(fullPath, baseDir, intents)
    }
  }
}

function scanRouteFile(filePath: string, baseDir: string, intents: Partial<AIPIntent>[]) {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return
  }

  // Convert file path to route path (Remix flat routes convention)
  const relativePath = path.relative(baseDir, filePath)
  const routePath = filePathToRoute(relativePath)

  // Skip root layout files
  if (routePath === '/' && !content.includes('loader') && !content.includes('action')) return

  const hasLoader = /export\s+(async\s+)?function\s+loader/m.test(content) ||
                    /export\s+const\s+loader/m.test(content)
  const hasAction = /export\s+(async\s+)?function\s+action/m.test(content) ||
                    /export\s+const\s+action/m.test(content)

  if (hasLoader) {
    const id = `get_${routePath.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}` || 'get_root'
    intents.push({
      id,
      name: `GET ${routePath}`,
      description: `Remix loader for route ${routePath}`,
      triggers: [`load ${routePath}`, `get ${routePath}`],
      category: 'developer',
      method: 'GET',
      endpoint: routePath,
      requires_auth: false,
      destructive: false,
      confirmation_required: false,
    })
  }

  if (hasAction) {
    const id = `post_${routePath.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}` || 'post_root'
    intents.push({
      id,
      name: `POST ${routePath}`,
      description: `Remix action for route ${routePath}`,
      triggers: [`submit to ${routePath}`, `post ${routePath}`],
      category: 'developer',
      method: 'POST',
      endpoint: routePath,
      requires_auth: false,
      destructive: false,
      confirmation_required: false,
    })
  }
}

/**
 * Convert Remix flat-file route path to URL path.
 * e.g. "users.$userId.tsx" → "/users/:userId"
 *      "api.v1.products.tsx" → "/api/v1/products"
 *      "_index.tsx" → "/"
 */
function filePathToRoute(filePath: string): string {
  // Remove extension
  let route = filePath.replace(/\.(tsx?|jsx?)$/, '')

  // Remove _index suffix
  route = route.replace(/\/_index$/, '').replace(/^_index$/, '')

  // Convert dots to slashes (flat routes)
  route = route.replace(/\./g, '/')

  // Convert $ params to :params
  route = route.replace(/\$(\w+)/g, ':$1')

  // Remove layout prefix (_)
  route = route.replace(/\/_([^/]+)/g, '/$1')

  // Clean up
  route = '/' + route.replace(/^\/+/, '')
  if (route === '/') return '/'

  // Remove trailing slashes
  return route.replace(/\/+$/, '')
}
