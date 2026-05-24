import fs from 'fs'
import http from 'http'
import path from 'path'
import { resolveJinJsonPath } from '../utils'

export function serve(options: { port: string }, cwd: string = process.cwd()) {
  const jinJsonPath = resolveJinJsonPath(cwd)
  
  if (!jinJsonPath) {
    console.log('✗ jin.json not found — run: npx jin init')
    process.exit(1)
  }

  const jinJson = fs.readFileSync(jinJsonPath, 'utf-8')

  const server = http.createServer((req, res) => {
    if (req.url === '/.well-known/jin.json') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(jinJson)
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(parseInt(options.port), () => {
    console.log(`\n✓ Serving intent map at:`)
    console.log(`  http://localhost:${options.port}/.well-known/jin.json\n`)
  })
}
