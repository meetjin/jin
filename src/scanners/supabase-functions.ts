import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * Supabase Edge Functions Scanner.
 * Scans supabase/functions/ directory for edge function definitions
 * and extracts them as intents.
 */
export async function scanSupabaseFunctions(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  const supabaseDir = path.join(cwd, 'supabase')
  const functionsDir = path.join(supabaseDir, 'functions')

  if (!fs.existsSync(functionsDir)) return intents

  // Try to find the Supabase Project URL
  let projectUrl = 'https://TODO-supabase-project.supabase.co'
  
  // 1. Check .supabase/project-ref
  const refPath = path.join(cwd, '.supabase', 'project-ref')
  if (fs.existsSync(refPath)) {
    try {
      const ref = fs.readFileSync(refPath, 'utf-8').trim()
      if (ref) {
        projectUrl = `https://${ref}.supabase.co`
      }
    } catch {}
  }
  
  // 2. Check .env / .env.local
  if (projectUrl.includes('TODO')) {
    const envPaths = ['.env', '.env.local', '.env.development']
    for (const envFile of envPaths) {
      const p = path.join(cwd, envFile)
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf-8')
          const match = content.match(/(SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL)\s*=\s*(https:\/\/[^\s'"]+)/)
          if (match && match[2]) {
            projectUrl = match[2].trim()
            break
          }
        } catch {}
      }
    }
  }

  let functionDirs: string[] = []
  try {
    functionDirs = fs.readdirSync(functionsDir)
  } catch {
    return intents
  }

  for (const dirName of functionDirs) {
    const fullPath = path.join(functionsDir, dirName)
    let stat: fs.Stats
    try {
      stat = fs.statSync(fullPath)
    } catch {
      continue
    }

    if (!stat.isDirectory()) continue

    // Check for index.ts or index.js
    const files = ['index.ts', 'index.js']
    let handlerPath: string | null = null
    for (const f of files) {
      if (fs.existsSync(path.join(fullPath, f))) {
        handlerPath = path.join(fullPath, f)
        break
      }
    }

    if (!handlerPath) continue

    // Parse Edge Function
    try {
      const content = fs.readFileSync(handlerPath, 'utf-8')
      const methods: string[] = []

      // Simple regex / string checks for methods
      if (content.includes("req.method === 'GET'") || content.includes('req.method === "GET"') || content.includes("method === 'GET'")) {
        methods.push('GET')
      }
      if (content.includes("req.method === 'POST'") || content.includes('req.method === "POST"') || content.includes("method === 'POST'")) {
        methods.push('POST')
      }
      if (content.includes("req.method === 'PUT'") || content.includes('req.method === "PUT"') || content.includes("method === 'PUT'")) {
        methods.push('PUT')
      }
      if (content.includes("req.method === 'DELETE'") || content.includes('req.method === "DELETE"') || content.includes("method === 'DELETE'")) {
        methods.push('DELETE')
      }

      // Default to POST if no explicit method checks are found
      if (methods.length === 0) {
        methods.push('POST')
      }

      const endpoint = `${projectUrl}/functions/v1/${dirName}`

      for (const method of methods) {
        const id = `${method.toLowerCase()}_supabase_${dirName.replace(/[^a-zA-Z0-9]/g, '_')}`
        intents.push({
          id,
          name: `${dirName} Edge Function (${method})`,
          description: `Supabase Edge Function at ${endpoint}`,
          method: method as any,
          endpoint,
          triggers: [
            `run supabase function ${dirName}`,
            `call edge function ${dirName}`,
            `execute ${dirName}`
          ],
          category: 'developer',
          requires_auth: true,
          destructive: method === 'DELETE',
          confirmation_required: method === 'DELETE'
        })
      }
    } catch (e) {
      console.error(`Error scanning Supabase function ${dirName}:`, e)
    }
  }

  return intents
}
