import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

const ROUTE_PATTERNS = [
  // <Route path="/something"
  /<Route[^>]*path\s*=\s*['"](\/[^'"]+)['"]/gi,
  // { path: "/something" } (createBrowserRouter)
  /path\s*:\s*['"](\/[^'"]+)['"]/gi,
  // <Route path="something" (relative path)
  /<Route[^>]*path\s*=\s*['"]([^/][^'"]+)['"]/gi,
  // { path: "something" } (relative path)
  /path\s*:\s*['"]([^/][^'"]+)['"]/gi,
]

/**
 * Vite + React SPA Scanner.
 * Scans src/ directory for typical react-router-dom route definitions
 * and extracts them as GET intents (since SPAs typically "load" these views).
 */
export async function scanViteReact(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  const srcDir = path.join(cwd, 'src')

  if (!fs.existsSync(srcDir)) return intents

  const scannedFiles = new Set<string>()
  scanDir(srcDir, scannedFiles, intents)

  return intents
}

function scanDir(dir: string, scannedFiles: Set<string>, intents: Partial<AIPIntent>[]) {
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
      scanDir(fullPath, scannedFiles, intents)
    } else if (/\.(tsx|jsx|ts|js)$/.test(entry) && !entry.endsWith('.d.ts')) {
      if (scannedFiles.has(fullPath)) continue
      scannedFiles.add(fullPath)
      scanFile(fullPath, intents)
    }
  }
}

function scanFile(filePath: string, intents: Partial<AIPIntent>[]) {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return
  }

  // Only scan files that likely contain routing
  if (!content.includes('Route') && !content.includes('path') && !content.includes('react-router')) return

  for (const pattern of ROUTE_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(content)) !== null) {
      let endpoint = match[1]

      // Normalize relative paths to absolute
      if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint
      }

      // Skip root or catch-all routes which are too generic
      if (endpoint === '/' || endpoint === '*' || endpoint.includes('*')) continue

      const id = `get_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`

      // Avoid duplicates
      if (intents.some(i => i.id === id)) continue

      // Convert :param to description
      const params = endpoint.match(/:(\w+)/g)
      const paramDesc = params
        ? ` (params: ${params.map(p => p.slice(1)).join(', ')})`
        : ''

      intents.push({
        id,
        name: `View ${endpoint}`,
        description: `React SPA route: ${endpoint}${paramDesc}`,
        triggers: [
          `open ${endpoint.replace(/^\//, '').replace(/:/g, '')} page`,
          `view ${endpoint}`,
        ],
        category: 'developer',
        method: 'GET',
        endpoint,
        requires_auth: false,
        destructive: false,
        confirmation_required: false,
      })
    }
  }
}
