#!/usr/bin/env node

import path from 'path'
import { Command } from 'commander'
import { init } from './commands/init'
import { validateAndPrint } from './commands/validate'
import { publish } from './commands/publish'
import { serve } from './commands/serve'
import { watch } from './commands/watch'
import { shield } from './commands/shield'

const program = new Command()

program
  .name('jin')
  .description('Agent Intent Protocol — make your app agent-ready')
  .version('0.2.7')

program
  .command('init [dir]')
  .description('Scan your codebase and generate a jin.json scaffold')
  .action(async (dir) => {
    const cwd = typeof dir === 'string' ? path.resolve(dir) : process.cwd()
    await init(cwd);
    process.exit(0);
  })

program
  .command('validate [dir]')
  .description('Validate your jin.json against the AIP specification')
  .action(async (dir) => {
    const cwd = typeof dir === 'string' ? path.resolve(dir) : process.cwd()
    await validateAndPrint(cwd);
    process.exit(0);
  })

program
  .command('serve [dir]')
  .description('Serve your jin.json at /.well-known/jin.json for testing')
  .option('-p, --port <port>', 'Port to serve on', '3001')
  .action((dir, options) => {
    let targetDir = process.cwd()
    let opts = options
    if (typeof dir === 'string') {
      targetDir = path.resolve(dir)
    } else if (dir && typeof dir === 'object') {
      opts = dir
    }
    serve(opts, targetDir)
  })

program
  .command('publish [dir]')
  .description('Publish your jin.json to the meetjin.com registry')
  .option('--skip-deploy', 'Skip automated deployment via git')
  .action(async (dir, options) => {
    let targetDir = process.cwd()
    let opts = options
    if (typeof dir === 'string') {
      targetDir = path.resolve(dir)
    } else if (dir && typeof dir === 'object') {
      opts = dir
    }
    await publish(opts, targetDir)
  })

program
  .command('watch [dir]')
  .description('Watch your codebase and update jin.json automatically')
  .action((dir) => {
    const cwd = typeof dir === 'string' ? path.resolve(dir) : process.cwd()
    watch(cwd)
  })

program
  .command('shield [dir]')
  .description('Activate the Jin Shield security boundary for your server')
  .action(async (dir) => {
    const cwd = typeof dir === 'string' ? path.resolve(dir) : process.cwd()
    await shield(cwd);
    process.exit(0);
  })

program.parse()
