#!/usr/bin/env node

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
  .version('0.2.5')

program
  .command('init')
  .description('Scan your codebase and generate a jin.json scaffold')
  .action(async () => {
    await init(process.cwd());
    process.exit(0);
  })

program
  .command('validate')
  .description('Validate your jin.json against the AIP specification')
  .action(async () => {
    await validateAndPrint(process.cwd());
    process.exit(0);
  })

program
  .command('serve')
  .description('Serve your jin.json at /.well-known/jin.json for testing')
  .option('-p, --port <port>', 'Port to serve on', '3001')
  .action((options) => serve(options, process.cwd()))

program
  .command('publish')
  .description('Publish your jin.json to the meetjin.com registry')
  .option('--skip-deploy', 'Skip automated deployment via git')
  .action((options) => publish(options, process.cwd()))

program
  .command('watch')
  .description('Watch your codebase and update jin.json automatically')
  .action(() => watch(process.cwd()))

program
  .command('shield')
  .description('Activate the Jin Shield security boundary for your server')
  .action(async () => {
    await shield(process.cwd());
    process.exit(0);
  })

program.parse()
