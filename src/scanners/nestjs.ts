import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * NestJS controller scanner.
 * Scans .controller.ts (and general .ts files) for NestJS route decorators.
 * Reads class-level @Controller('prefix') and concatenates it with method-level
 * route decorators like @Get(':id') or @Post()
 */
export async function scanNestJS(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  const scannedFiles = new Set<string>()
  const srcDirs = ['src', 'apps', 'libs', '.']

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
      } else if (entry.endsWith('.controller.ts') || (entry.endsWith('.ts') && !entry.endsWith('.d.ts'))) {
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

  // 1. Detect Controller prefix
  // Matches @Controller('prefix') or @Controller()
  const controllerMatch = /@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/i.exec(content)
  if (!controllerMatch) return // Only parse NestJS controllers

  const prefix = controllerMatch[1] || ''

  // 2. Find all route decorators
  // Matches @Get('path'), @Post(), @Delete(':id') etc.
  const decoratorPattern = /@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/gi
  let match: RegExpExecArray | null
  while ((match = decoratorPattern.exec(content)) !== null) {
    const method = match[1].toUpperCase()
    const methodPath = match[2] || ''

    // Combine prefix and methodPath
    let endpoint = '/' + [prefix, methodPath].filter(Boolean).join('/')
    // Standardize slashes
    endpoint = endpoint.replace(/\/+/g, '/')
    if (endpoint.endsWith('/') && endpoint.length > 1) {
      endpoint = endpoint.slice(0, -1)
    }

    const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
    if (intents.some(i => i.id === id)) continue

    intents.push({
      id,
      name: `${method} ${endpoint}`,
      description: `Auto-detected NestJS controller route: ${method} ${endpoint}`,
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
