import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * Dart / Flutter scanner.
 * Scans .dart files for route definitions.
 * Since Flutter is primarily a client-side framework, it looks for
 * navigation routes or API client endpoints.
 */
export async function scanDart(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  
  // Common Dart source directories
  const srcDirs = ['lib', 'packages']
  const scannedFiles = new Set<string>()

  for (const dir of srcDirs) {
    const fullDir = path.join(cwd, dir)
    if (!fs.existsSync(fullDir)) continue
    scanDir(fullDir, scannedFiles, intents)
  }

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
    } else if (entry.endsWith('.dart')) {
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

  // Look for common route patterns in Flutter/Dart
  // 1. Named routes: '/settings'
  // 2. API endpoints in clients: get('/users')
  const ROUTE_PATTERNS = [
    /['"](\/[a-zA-Z0-9\/\-_:]+)['"]/g, // Generic path strings
    /\.get\s*\(\s*['"](\/[^'"]+)['"]/gi, // .get('/path')
    /\.post\s*\(\s*['"](\/[^'"]+)['"]/gi, // .post('/path')
    /\.put\s*\(\s*['"](\/[^'"]+)['"]/gi, // .put('/path')
    /\.delete\s*\(\s*['"](\/[^'"]+)['"]/gi, // .delete('/path')
  ]

  for (const pattern of ROUTE_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(content)) !== null) {
      const endpoint = match[1]
      
      // Basic validation to avoid random strings
      if (endpoint.length < 2 || endpoint.length > 100) continue
      if (endpoint.includes(' ') || endpoint.includes('@')) continue

      // Determine method
      let method: string = 'GET'
      if (pattern.source.includes('.post')) method = 'POST'
      else if (pattern.source.includes('.put')) method = 'PUT'
      else if (pattern.source.includes('.delete')) method = 'DELETE'

      const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`

      if (intents.some(i => i.id === id)) continue

      intents.push({
        id,
        name: `${method} ${endpoint}`,
        description: `Auto-detected Dart/Flutter route: ${endpoint}`,
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
