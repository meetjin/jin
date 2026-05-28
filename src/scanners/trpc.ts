import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * tRPC router scanner.
 * Stateful lexical scanner that tracks brace-depths to resolve nested router contexts.
 * Traverses sub-routers (e.g., posts: router({ ... })) and maps query/mutation procedures.
 * Generates endpoints exposed at:
 * - Queries -> GET /api/trpc/routerPrefix.procedureName
 * - Mutations -> POST /api/trpc/routerPrefix.procedureName
 */
export async function scanTRPC(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  const scannedFiles = new Set<string>()
  const srcDirs = ['src', 'server', 'api', 'lib', '.']

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
      } else if (/\.(ts|js)$/.test(entry) && !entry.endsWith('.d.ts')) {
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

  if (!content.includes('Procedure') && !content.includes('procedure') && !content.includes('Router')) return

  const lines = content.split('\n')
  const prefixStack: string[] = []

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    // 1. Detect sub-router pushing
    // Matches router definitions like: posts: router({  or  posts: t.router({  or  posts: mergeRouters(
    const subRouterMatch = /(\w+)\s*:\s*(?:t\.)?(?:router|mergeRouters)\s*\(/i.exec(line)
    if (subRouterMatch) {
      prefixStack.push(subRouterMatch[1])
      continue
    }

    // 2. Detect brace matching for popping router prefix
    // If a line is just closing brackets and we have prefix layers, pop!
    if (/^\s*\}[),;\s]*$/.test(line) && prefixStack.length > 0) {
      prefixStack.pop()
      continue
    }

    // 3. Detect tRPC query or mutation procedure
    // Matches query/mutation signature with optional inline chains (input validation, middleware, etc.)
    const procedureMatch = /(\w+)\s*:\s*(?:\w+Procedure|t\.procedure)(?:\.[A-Za-z0-9_]+|\.[A-Za-z0-9_]+\([^)]*\))*\.(query|mutation)\s*\(/gi.exec(line)
    if (procedureMatch) {
      const procedureName = procedureMatch[1]
      const type = procedureMatch[2].toLowerCase()

      const fullPath = [...prefixStack, procedureName].join('.')
      const endpoint = `/api/trpc/${fullPath}`
      const method = type === 'query' ? 'GET' : 'POST'

      const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
      if (intents.some(i => i.id === id)) continue

      const destructive = type === 'mutation' && (fullPath.includes('delete') || fullPath.includes('remove') || fullPath.includes('destroy'))

      intents.push({
        id,
        name: `${method} ${endpoint}`,
        description: `Auto-detected tRPC ${type}: ${fullPath}`,
        triggers: [
          `call tRPC ${fullPath}`,
          `${type} ${fullPath}`,
          `call ${endpoint}`
        ],
        category: 'developer',
        method: method as any,
        endpoint,
        requires_auth: false,
        destructive,
        confirmation_required: destructive,
      })
    }
  }
}
