import fs from 'fs'
import path from 'path'
import { validate } from './validate'
import { resolveJinJsonPath, promptUser } from '../utils'
import { execSync } from 'child_process'

const REGISTRY_URL = process.env.JIN_REGISTRY_URL || 'https://www.meetjin.com/api/v1'


async function waitForDeployment(url: string) {
  console.log('\nWaiting for deployment...')
  
  for (let i = 0; i < 24; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        console.log(`  ✓ Live at ${url}\n`)
        return
      }
    } catch {}
    
    process.stdout.write(`  ⠋ Checking ${url}\r`)
    await new Promise(r => setTimeout(r, 5000))
  }
  
  console.log('\n  ✗ Deployment taking longer than expected')
  console.log('  Run: npx @papercargo/jin-cli publish --skip-deploy')
  console.log('  once your app is live')
  process.exit(1)
}

export async function publish(options: { skipDeploy?: boolean } = {}, cwd: string = process.cwd()) {
  const jinJsonPath = resolveJinJsonPath(cwd)
  
  if (!jinJsonPath) {
    console.log('✗ jin.json not found — run: npx jin init')
    process.exit(1)
  }

  // Validate first
  const validation = validate(jinJsonPath)
  if (!validation.valid) {
    console.log('✗ Validation failed. Fix errors before publishing.')
    process.exit(1)
  }
  console.log('✓ jin.json is valid\n')

  const relPath = path.relative(cwd, jinJsonPath) || 'jin.json'
  console.log(`✓ ${relPath} is in place\n`)

  // Load jin.json
  const jinJson = JSON.parse(fs.readFileSync(jinJsonPath, 'utf-8'))
  const intentMapUrl = `${jinJson.app.url}/.well-known/jin.json`

  // Automated deployment via git
  if (!options.skipDeploy) {
    let isGitRepo = true
    try {
      execSync('git status', { stdio: 'pipe' })
    } catch {
      isGitRepo = false
    }

    if (!isGitRepo) {
      console.log('  ⚠ Not a git repository')
      console.log('  Deploy manually then re-run: npx @papercargo/jin-cli publish --skip-deploy')
      process.exit(1)
    }

    const ans = await promptUser('Deploy to GitHub and publish? (y/n): ')
    if (ans === 'y' || ans === 'yes') {
      console.log('\nDeploying your intent map...\n')

      console.log('  Staging changes:')
      console.log(`  $ git add ${relPath}`)
      try {
        execSync(`git add ${relPath}`, { stdio: 'pipe' })
        console.log('  ✓ Staged\n')
      } catch (err) {
        console.log(`  ✗ Failed to stage: ${err}`)
        process.exit(1)
      }

      console.log('  Committing:')
      console.log('  $ git commit -m "feat: add AIP intent map (jin v0.1)"')
      try {
        execSync('git commit -m "feat: add AIP intent map (jin v0.1)"', { stdio: 'pipe' })
        console.log('  ✓ Committed\n')
      } catch (err) {
        // Might be already committed
        console.log('  ✓ No new changes to commit\n')
      }

      console.log('  Pushing to remote:')
      console.log('  $ git push')
      try {
        execSync('git push', { stdio: 'pipe' })
        console.log('  ✓ Pushed\n')
      } catch (err) {
        console.log(`  ✗ Failed to push. You may need to set upstream branch.`)
        process.exit(1)
      }

      await waitForDeployment(intentMapUrl)
    } else {
      console.log('\n  Aborted. Deploy manually or use --skip-deploy flag.')
      process.exit(0)
    }
  } else {
    // skip-deploy mode
    console.log('Before publishing, confirm your intent map is live.\n')
    console.log(`Checking ${intentMapUrl}...`)
    try {
      const res = await fetch(intentMapUrl)
      if (!res.ok) {
        console.log(`✗ Cannot reach ${intentMapUrl}`)
        console.log('  Deploy jin.json to your server before publishing')
        process.exit(1)
      }
      const text = await res.text()
      try {
        JSON.parse(text)
      } catch {
        console.log(`✗ ${intentMapUrl} is not returning valid JSON!`)
        console.log('  Your server is likely returning an HTML fallback/404 page instead of the jin.json file.')
        console.log('  Please ensure jin.json is placed in your public/.well-known/ folder and deployed.')
        process.exit(1)
      }
      console.log('✓ Found and valid\n')
    } catch {
      console.log(`✗ Cannot reach ${intentMapUrl}`)
      console.log('  Make sure jin.json is deployed and accessible')
      process.exit(1)
    }
  }

  // Publish to registry
  const apiKey = process.env.JIN_API_KEY || ''
  console.log('Publishing to meetjin.com registry...')

  let override = false

  async function pushToRegistry() {
    const response = await fetch(`${REGISTRY_URL}/publisher/apps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        name: jinJson.app.name,
        url: jinJson.app.url,
        description: jinJson.app.description,
        logo_url: jinJson.app.logo,
        contact_email: jinJson.app.contact,
        intent_map_url: intentMapUrl,
        is_community: false,
        override
      })
    })

    if (!response.ok) {
      if (response.status === 409 && !override) {
        const ans = await promptUser(`\n⚠ App slug already exists in registry. Override? (y/n): `)
        if (ans === 'y' || ans === 'yes') {
          override = true
          return await pushToRegistry()
        } else {
          console.log('\n  Aborted.')
          process.exit(0)
        }
      }
      const error = await response.json()
      console.log(`✗ Publish failed: ${error.error || error.message || 'Unknown error'}`)
      process.exit(1)
    }

    const data = await response.json()
    console.log(`  ✓ Published successfully`)
    console.log(`  ✓ ${data.intents_imported} intents imported\n`)
    console.log(`Registry URL: ${data.registry_url}`)
  }

  await pushToRegistry()
}
