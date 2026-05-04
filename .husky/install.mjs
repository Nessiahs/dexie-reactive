import { accessSync, constants, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

if (process.env.CI === 'true' || process.env.npm_command === 'pack') {
    process.exit(0)
}

if (!existsSync('.git') || !existsSync('node_modules/.bin/husky')) {
    process.exit(0)
}

try {
    accessSync('.git/config', constants.W_OK)
} catch {
    process.exit(0)
}

execFileSync('node_modules/.bin/husky', { stdio: 'inherit' })
