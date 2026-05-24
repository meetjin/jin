import fs from 'fs'
import path from 'path'

/**
 * Resolves the path to jin.json based on common directory structures.
 * Checks in order:
 * 1. public/.well-known/jin.json
 * 2. .well-known/jin.json
 * 3. jin.json
 */
export function resolveJinJsonPath(cwd: string = process.cwd()): string | null {
  const paths = [
    path.join(cwd, 'public', '.well-known', 'jin.json'),
    path.join(cwd, '.well-known', 'jin.json'),
    path.join(cwd, 'jin.json')
  ]

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  return null
}

import readline from 'readline'

export function promptUser(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  return new Promise(resolve => rl.question(query, ans => {
    rl.close()
    resolve(ans.trim().toLowerCase())
  }))
}

