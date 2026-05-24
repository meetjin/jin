import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8'))

/**
 * Fetch a jin.json from a URL and return the parsed content + SHA-256 hash.
 */
export async function fetchIntentMap(url: string): Promise<{
  raw: string
  json: any
  hash: string
}> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'Accept': 'application/json',
      'User-Agent': `jin-cli/${pkg.version}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  const raw = await response.text()
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const json = JSON.parse(raw)

  return { raw, json, hash }
}
