import fs from 'fs'
import path from 'path'
import { AIPIntent, HttpMethod, AIPCategory } from '../types/aip'

/**
 * OpenAPI / Swagger scanner.
 * Reads an openapi.json / swagger.json file and converts operations to AIP intents.
 * Supports both OpenAPI 3.x and Swagger 2.x formats (JSON only for now).
 */
export async function scanOpenAPI(filePath: string): Promise<Partial<AIPIntent>[]> {
  const intents: Partial<AIPIntent>[] = []

  if (!fs.existsSync(filePath)) return intents

  let spec: any
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      try {
        // @ts-ignore: optional YAML parser dependency
        const yaml = await import('yaml')
        spec = yaml.parse(raw)
      } catch (importError) {
        console.log('   ⚠ YAML OpenAPI specs require the yaml package. Install yaml or use JSON.')
        return intents
      }
    } else {
      spec = JSON.parse(raw)
    }
  } catch (e) {
    console.log(`   ⚠ Failed to parse ${path.basename(filePath)}`)
    return intents
  }

  const paths = spec.paths
  if (!paths || typeof paths !== 'object') {
    console.log('   ⚠ No paths found in OpenAPI spec')
    return intents
  }

  for (const [endpoint, methods] of Object.entries(paths)) {
    if (typeof methods !== 'object' || methods === null) continue

    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      const upperMethod = method.toUpperCase()
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(upperMethod)) continue

      const op = operation as any
      const operationId = op.operationId || `${method}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`
      const summary = op.summary || ''
      const description = op.description || summary || `${upperMethod} ${endpoint}`
      const tags = op.tags || []

      // Try to infer a category from tags
      const category = inferCategory(tags)

      // Build triggers from summary
      const triggers: string[] = []
      if (summary) {
        triggers.push(summary.toLowerCase())
      }
      triggers.push(`${method} ${endpoint}`)
      if (description && description !== summary) {
        // Take first sentence
        const firstSentence = description.split('.')[0].trim()
        if (firstSentence && !triggers.includes(firstSentence.toLowerCase())) {
          triggers.push(firstSentence.toLowerCase())
        }
      }

      // Detect auth requirements
      const requiresAuth = !!(op.security && op.security.length > 0) ||
                           !!(spec.security && spec.security.length > 0)

      // Build parameters description
      const params: Record<string, any> = {}
      if (op.parameters) {
        for (const param of op.parameters) {
          if (param.name && param.in !== 'header') {
            params[param.name] = {
              type: param.schema?.type || 'string',
              description: param.description || '',
              required: param.required || false,
            }
          }
        }
      }

      intents.push({
        id: operationId.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_'),
        name: summary || `${upperMethod} ${endpoint}`,
        description,
        triggers,
        category,
        method: upperMethod as HttpMethod,
        endpoint,
        parameters: Object.keys(params).length > 0 ? params : undefined,
        requires_auth: requiresAuth,
        destructive: upperMethod === 'DELETE',
        confirmation_required: upperMethod === 'DELETE',
      })
    }
  }

  return intents
}

/**
 * Try to map OpenAPI tags to AIP categories.
 */
function inferCategory(tags: string[]): AIPCategory {
  const tagStr = tags.join(' ').toLowerCase()

  const mapping: Record<string, AIPCategory> = {
    'shop': 'commerce', 'product': 'commerce', 'cart': 'commerce', 'order': 'commerce', 'payment': 'commerce',
    'travel': 'travel', 'flight': 'travel', 'hotel': 'travel', 'booking': 'travel',
    'task': 'productivity', 'project': 'productivity', 'calendar': 'productivity', 'todo': 'productivity',
    'message': 'communication', 'chat': 'communication', 'email': 'communication', 'notification': 'communication',
    'finance': 'finance', 'bank': 'finance', 'invoice': 'finance', 'billing': 'finance',
    'auth': 'identity', 'user': 'identity', 'account': 'identity', 'login': 'identity',
    'health': 'healthcare', 'patient': 'healthcare', 'medical': 'healthcare', 'fitness': 'healthcare',
    'legal': 'legal', 'contract': 'legal', 'compliance': 'legal',
    'government': 'government', 'civic': 'government',
    'education': 'education', 'course': 'education', 'student': 'education',
    'media': 'media', 'video': 'media', 'image': 'media', 'content': 'media',
    'api': 'developer', 'webhook': 'developer', 'integration': 'developer',
    'data': 'data', 'analytics': 'data', 'report': 'data',
    'social': 'social', 'feed': 'social', 'profile': 'social',
    'local': 'local', 'location': 'local', 'map': 'local',
  }

  for (const [keyword, category] of Object.entries(mapping)) {
    if (tagStr.includes(keyword)) return category
  }

  return 'developer'
}
