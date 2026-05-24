export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type AuthType = 'none' | 'bearer' | 'oauth2' | 'apikey'

export type AIPCategory =
  | 'commerce' | 'travel' | 'productivity' | 'communication'
  | 'finance' | 'identity' | 'healthcare' | 'legal'
  | 'government' | 'education' | 'media' | 'developer'
  | 'data' | 'social' | 'local'

export interface AIPParameter {
  type: 'string' | 'number' | 'boolean' | 'ISO8601' | 'enum'
  description: string
  required: boolean
  enum?: string[]
  default?: unknown
  example?: unknown
}

export interface AIPIntent {
  id: string
  name: string
  description: string
  triggers: string[]
  category: AIPCategory
  method: HttpMethod
  endpoint: string
  parameters?: Record<string, AIPParameter>
  headers?: Record<string, string>
  returns?: {
    description: string
    schema?: object
  }
  errors?: Array<{
    code: number
    meaning: string
  }>
  rate_limit?: {
    requests_per_minute: number
    note?: string
  }
  requires_auth: boolean
  destructive: boolean
  confirmation_required: boolean
}

export interface AIPOAuth2 {
  authorization_url: string
  token_url: string
  scopes?: Record<string, string>
}

export interface AIPAuth {
  type: AuthType
  oauth2?: AIPOAuth2
  docs?: string
}

export interface AIPApp {
  name: string
  description: string
  url: string
  logo?: string
  contact?: string
}

export interface AIPRegistry {
  verified: boolean
  listing?: string
}

export interface JinJSON {
  aip_version: string
  app: AIPApp
  auth: AIPAuth
  intents: AIPIntent[]
  published: string
  registry?: AIPRegistry
}
