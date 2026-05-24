const REGISTRY_URL = 'https://meetjin.com/api/v1'

export interface RegistrySearchResult {
  query: string
  total: number
  limit: number
  offset: number
  results: Array<{
    app: {
      id: string
      name: string
      slug: string
      description: string
      url: string
      logo_url: string | null
      is_verified: boolean
      is_community: boolean
      intent_map_url: string
    }
    intent: {
      id: string
      name: string
      description: string
      triggers: string[]
      category: string
      method: string
      endpoint: string
      requires_auth: boolean
      destructive: boolean
      confirmation_required: boolean
    }
    match_score: number
  }>
}

/**
 * Search the Jin Registry for intents matching a natural language query.
 */
export async function searchRegistry(
  query: string,
  options?: {
    category?: string
    verified?: boolean
    community?: boolean
    limit?: number
    offset?: number
  }
): Promise<RegistrySearchResult> {
  const params = new URLSearchParams({ q: query })
  if (options?.category) params.set('category', options.category)
  if (options?.verified !== undefined) params.set('verified', String(options.verified))
  if (options?.community !== undefined) params.set('community', String(options.community))
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))

  const response = await fetch(`${REGISTRY_URL}/registry/search?${params}`)
  if (!response.ok) {
    throw new Error(`Registry search failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Publish an app to the Jin Registry.
 */
export async function publishToRegistry(
  apiKey: string,
  payload: {
    name: string
    url: string
    description: string
    logo_url?: string
    contact_email?: string
    intent_map_url: string
    is_community: boolean
  }
): Promise<{
  id: string
  slug: string
  registry_url: string
  status: string
  intents_imported: number
}> {
  const response = await fetch(`${REGISTRY_URL}/publisher/apps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Publish failed: ${error.message || response.statusText}`)
  }

  return response.json()
}
