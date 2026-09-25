#!/usr/bin/env node
/**
 * ============================================================================
 * 00-prereqs.mjs — Vérification des prérequis système
 * ============================================================================
 */

import { log, C, commandExists, commandVersion } from './_utils.mjs'

const TOOLS = [
  {
    name: 'node',
    required: true,
    minVersion: 20,
    install: {
      win: 'https://nodejs.org/ (LTS 20+)',
      mac: 'brew install node@20',
      linux: 'nvm install 20 && nvm use 20',
    },
    for: 'Runtime principal',
  },
  {
    name: 'npm',
    required: true,
    minVersion: 10,
    install: {
      win: '(inclus avec Node.js)',
      mac: '(inclus avec Node.js)',
      linux: '(inclus avec Node.js)',
    },
    for: 'Gestion des dépendances',
  },
  {
    name: 'git',
    required: true,
    install: {
      win: 'https://git-scm.com/download/win',
      mac: 'brew install git',
      linux: 'sudo apt install git',
    },
    for: 'Contrôle de version',
  },
  {
    name: 'supabase',
    required: false,
    install: {
      win: 'scoop install supabase',
      mac: 'brew install supabase/tap/supabase',
      linux: 'https://github.com/supabase/cli#install-the-cli',
    },
    for: 'Deploy DB + Functions (--deploy)',
  },
  {
    name: 'java',
    required: false,
    minVersion: 17,
    versionFlag: '-version',
    install: {
      win: 'https://adoptium.net/temurin/releases/?version=17',
      mac: 'brew install openjdk@17',
      linux: 'sudo apt install openjdk-17-jdk',
    },
    for: 'Build Android (APK)',
  },
  {
    name: 'cargo',
    required: false,
    install: {
      win: 'https://rustup.rs/',
      mac: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
      linux: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
    },
    for: 'Build Desktop (Tauri)',
  },
]

function getPlatform() {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'darwin') return 'mac'
  return 'linux'
}

function parseVersion(str) {
  const m = str.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3] }
}

async function checkTool(tool) {
  const exists = await commandExists(tool.name)
  if (!exists) return { ...tool, status: 'missing' }

  const version = await commandVersion(tool.name, tool.versionFlag ? [tool.versionFlag] : ['--version'])
  const parsed = parseVersion(version)

  if (tool.minVersion && parsed && parsed.major < tool.minVersion) {
    return { ...tool, status: 'outdated', version, parsed }
  }
  return { ...tool, status: 'ok', version, parsed }
}

async function main() {
  const platform = getPlatform()
  console.log(`\n${C.cyan}${C.bold}Verification des prerequis systeme${C.reset}`)
  console.log(`${C.dim}   Plateforme : ${platform}${C.reset}\n`)

  const results = []
  for (const tool of TOOLS) {
    const r = await checkTool(tool)
    results.push(r)

    const icon =
      r.status === 'ok'
        ? `${C.green}[OK]${C.reset}`
        : r.status === 'outdated'
          ? `${C.yellow}[!!]${C.reset}`
          : r.required
            ? `${C.red}[XX]${C.reset}`
            : `${C.dim}[--]${C.reset}`

    const versionStr = r.version ? `${C.dim}${r.version}${C.reset}` : ''
    const req = r.required ? `${C.red}[requis]${C.reset}` : `${C.dim}[optionnel]${C.reset}`

    console.log(`  ${icon} ${C.bold}${r.name.padEnd(10)}${C.reset} ${versionStr} ${req}`)
    console.log(`     ${C.dim}-> ${r.for}${C.reset}`)

    if (r.status === 'missing') {
      console.log(`     ${C.yellow}Installation :${C.reset} ${tool.install[platform]}`)
    } else if (r.status === 'outdated') {
      console.log(`     ${C.yellow}Version minimale : ${tool.minVersion}.x${C.reset}`)
      console.log(`     ${C.yellow}Mise a jour :${C.reset} ${tool.install[platform]}`)
    }
    console.log()
  }

  const requiredMissing = results.filter((r) => r.required && r.status !== 'ok')
  const optionalMissing = results.filter((r) => !r.required && r.status !== 'ok')

  if (requiredMissing.length > 0) {
    log.err(`${requiredMissing.length} outil(s) requis manquant(s).`)
    log.info(`Installez-les puis relancez : ${C.bold}node setup.mjs --all${C.reset}`)
    process.exit(1)
  }

  if (optionalMissing.length > 0) {
    log.warn(`${optionalMissing.length} outil(s) optionnel(s) manquant(s).`)
    log.dim(`Certaines options (--only=android, --only=desktop) seront indisponibles.`)
  }

  log.ok('Tous les prerequis requis sont satisfaits.')
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})