import fs from 'fs'
import path from 'path'
import { AIPIntent } from '../types/aip'

/**
 * Rails routes scanner.
 * Parses Rails config/routes.rb for routes definitions.
 * Matches explicit routes: get '/photos/:id' and resources :photos
 * Normalizes wildcard globbing: *other -> :other*
 */
export async function scanRails(cwd: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []
  
  const routesFile = path.join(cwd, 'config', 'routes.rb')
  if (!fs.existsSync(routesFile)) {
    return intents
  }

  let content: string
  try {
    content = fs.readFileSync(routesFile, 'utf-8')
  } catch {
    return intents
  }

  // 1. Explicit verbs: get '/patients/:id', to: 'patients#show'
  const explicitPattern = /\b(get|post|put|patch|delete)\s+['"`]([^'"`]+)['"`]/gi
  let match: RegExpExecArray | null
  while ((match = explicitPattern.exec(content)) !== null) {
    const method = match[1].toUpperCase()
    let endpoint = match[2]

    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint
    }

    // Normalizations:
    // Rails wildcard globbing: *other -> :other*
    endpoint = endpoint.replace(/\*(\w+)/g, ':$1*')

    const id = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`
    if (intents.some(i => i.id === id)) continue

    intents.push({
      id,
      name: `${method} ${endpoint}`,
      description: `Auto-detected Rails route: ${method} ${endpoint}`,
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

  // 2. Resource controllers: resources :photos
  const resourcesPattern = /\bresources\s+:(\w+)/gi
  while ((match = resourcesPattern.exec(content)) !== null) {
    const resource = match[1]
    const baseEndpoint = `/${resource}`

    // Register standard CRUD resources for REST View controllers
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
        description: `Auto-detected Rails resource route: ${ep.method} ${ep.path}`,
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

  return intents
}
