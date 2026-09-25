#!/usr/bin/env node
/**
 * ============================================================================
 * AniXOS — Build Orchestrator
 * ============================================================================
 * Coordinateur principal : exécute les étapes dans l'ordre, gère les options
 * CLI, et offre un mode interactif.
 *
 * Usage:
 *   node setup.mjs                 -> menu interactif
 *   node setup.mjs --all           -> tout
 *   node setup.mjs --only=web      -> web seul
 *   node setup.mjs --only=android  -> APK seul
 *   node setup.mjs --only=desktop  -> EXE/DMG/DEB seul
 *   node setup.mjs --deploy        -> + deploy Supabase
 *   node setup.mjs --fresh         -> clean + install
 *   node setup.mjs --update        -> sans clean
 *   node setup.mjs --dry-run       -> afficher seulement
 *   node setup.mjs --yes           -> mode CI
 *   node setup.mjs --resume        -> reprendre
 * ============================================================================
 */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const __filename = fileURLToPath(import.meta.url)
const ROOT = dirname(__filename)
const SCRIPTS_DIR = join(ROOT, 'scripts')
const STATE_FILE = join(ROOT, '.setup-state.json')

const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
const getArg = (name) => {
  const a = args.find((x) => x.startsWith(`${name}=`))
  return a ? a.split('=').slice(1).join('=') : null
}

const OPTIONS = {
  all: has('--all'),
  only: getArg('--only'),
  deploy: has('--deploy'),
  fresh: has('--fresh'),
  update: has('--update'),
  dryRun: has('--dry-run'),
  yes: has('--yes'),
  resume: has('--resume'),
  interactive: args.length === 0,
  skipMobile: has('--skip-mobile'),
}

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
}

const log = {
  banner: (t) => console.log(`\n${C.bgBlue}${C.white}${C.bold}  ${t}  ${C.reset}\n`),
  step: (n, total, t) =>
    console.log(`\n${C.cyan}${C.bold}[${n}/${total}]${C.reset} ${C.bold}${t}${C.reset}`),
  info: (m) => console.log(`${C.blue}i${C.reset}  ${m}`),
  ok: (m) => console.log(`${C.green}OK${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}!!${C.reset} ${m}`),
  err: (m) => console.log(`${C.red}XX${C.reset} ${m}`),
  dim: (m) => console.log(`${C.dim}   ${m}${C.reset}`),
}

async function runScript(scriptName, extraArgs = []) {
  const scriptPath = join(SCRIPTS_DIR, scriptName)
  if (!existsSync(scriptPath)) {
    log.err(`Script introuvable : ${scriptName}`)
    return 1
  }
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath, ...extraArgs], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', (err) => {
      log.err(`Erreur spawn : ${err.message}`)
      resolve(1)
    })
  })
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { completed: [], failed: null }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return { completed: [], failed: null }
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

function markCompleted(id) {
  const s = loadState()
  if (!s.completed.includes(id)) s.completed.push(id)
  s.failed = null
  saveState(s)
}

function markFailed(id, error) {
  const s = loadState()
  s.failed = { step: id, error: String(error), at: new Date().toISOString() }
  saveState(s)
}

async function interactiveMenu() {
  const rl = readline.createInterface({ input, output })

  console.log(`\n${C.bold}${C.magenta}+--------------------------------------------------+${C.reset}`)
  console.log(`${C.bold}${C.magenta}|${C.reset}   ${C.bold}AniXOS -- Build Orchestrator${C.reset}                     ${C.bold}${C.magenta}|${C.reset}`)
  console.log(`${C.bold}${C.magenta}+--------------------------------------------------+${C.reset}\n`)

  console.log(`${C.bold}Que voulez-vous faire ?${C.reset}\n`)
  console.log(`  ${C.cyan}1.${C.reset} Web uniquement (rapide)`)
  console.log(`  ${C.cyan}2.${C.reset} Android (APK)`)
  console.log(`  ${C.cyan}3.${C.reset} Desktop (EXE/DMG/DEB)`)
  console.log(`  ${C.cyan}4.${C.reset} TOUT (web + android + desktop)`)
  console.log(`  ${C.cyan}5.${C.reset} Deploy Supabase (migrations + functions)`)
  console.log(`  ${C.cyan}6.${C.reset} Fresh install (clean + install)`)
  console.log(`  ${C.cyan}7.${C.reset} Diagnostic (prerequis)`)
  console.log(`  ${C.cyan}0.${C.reset} Quitter\n`)

  const choice = (await rl.question(`${C.bold}Votre choix [1-7, 0]: ${C.reset}`)).trim()
  rl.close()

  switch (choice) {
    case '1': return { ...OPTIONS, only: 'web', interactive: false }
    case '2': return { ...OPTIONS, only: 'android', interactive: false }
    case '3': return { ...OPTIONS, only: 'desktop', interactive: false }
    case '4': return { ...OPTIONS, all: true, interactive: false }
    case '5': return { ...OPTIONS, only: 'deploy', interactive: false }
    case '6': return { ...OPTIONS, fresh: true, all: true, interactive: false }
    case '7': return { ...OPTIONS, only: 'prereqs', interactive: false }
    case '0':
      console.log(`${C.dim}Au revoir.${C.reset}`)
      process.exit(0)
    default:
      log.err('Choix invalide.')
      process.exit(1)
  }
}

function buildPipeline(opts) {
  const steps = []
  steps.push({ id: 'prereqs', script: '00-prereqs.mjs', label: 'Prerequis systeme' })

  if (opts.only === 'prereqs') return steps

  if (opts.only === 'deploy') {
    steps.push({ id: 'env-check', script: '03-env-check.mjs', label: 'Verification .env' })
    steps.push({ id: 'migrations', script: '04-migrations.mjs', label: 'Migrations Supabase' })
    steps.push({ id: 'functions', script: '05-functions.mjs', label: 'Edge Functions' })
    return steps
  }

  if (opts.fresh) {
    steps.push({ id: 'clean', script: '01-clean.mjs', label: 'Nettoyage' })
  }

  if (!opts.update) {
    steps.push({ id: 'install', script: '02-install.mjs', label: 'Installation' })
  }

  steps.push({ id: 'env-check', script: '03-env-check.mjs', label: 'Verification .env' })

  if (opts.deploy) {
    steps.push({ id: 'migrations', script: '04-migrations.mjs', label: 'Migrations Supabase' })
    steps.push({ id: 'functions', script: '05-functions.mjs', label: 'Edge Functions' })
  }

  const needWeb =
    opts.all || opts.only === 'web' || opts.only === 'android' || opts.only === 'desktop'
  if (needWeb) {
    steps.push({ id: 'build-web', script: '06-build-web.mjs', label: 'Build Web' })
  }

  if (!opts.skipMobile && (opts.all || opts.only === 'android')) {
    steps.push({ id: 'build-android', script: '07-build-android.mjs', label: 'Build Android' })
  }

  if (!opts.skipMobile && (opts.all || opts.only === 'desktop')) {
    steps.push({ id: 'build-desktop', script: '08-build-desktop.mjs', label: 'Build Desktop' })
  }

  steps.push({ id: 'verify', script: '09-verify-artifacts.mjs', label: 'Verification' })
  steps.push({ id: 'summary', script: '10-summary.mjs', label: 'Resume' })

  return steps
}

async function executePipeline(opts) {
  const pipeline = buildPipeline(opts)
  const state = opts.resume ? loadState() : { completed: [], failed: null }

  log.banner('AniXOS -- Build Orchestrator')

  if (opts.dryRun) {
    log.info(`${C.bold}Mode DRY-RUN${C.reset}\n`)
    pipeline.forEach((s, i) => {
      const done = state.completed.includes(s.id) ? `${C.green}v${C.reset}` : ' '
      console.log(`  ${done} ${C.cyan}${String(i + 1).padStart(2, '0')}.${C.reset} ${s.label}`)
    })
    console.log()
    return 0
  }

  const total = pipeline.length
  let n = 0

  for (const step of pipeline) {
    n++

    if (opts.resume && state.completed.includes(step.id)) {
      log.dim(`[${n}/${total}] ${step.label} -- deja complete (skip)`)
      continue
    }

    log.step(n, total, step.label)

    const extraArgs = []
    if (opts.dryRun) extraArgs.push('--dry-run')
    if (opts.yes) extraArgs.push('--yes')
    if (opts.deploy) extraArgs.push('--deploy')

    const code = await runScript(step.script, extraArgs)

    if (code !== 0) {
      markFailed(step.id, `exit code ${code}`)
      log.err(`Echec : ${step.label}`)
      log.info(`Reprenez avec : ${C.bold}node setup.mjs --resume${C.reset}`)
      return code
    }

    markCompleted(step.id)
  }

  log.ok(`\n${C.bold}${C.green}Build termine avec succes !${C.reset}\n`)
  return 0
}

async function main() {
  try {
    let opts = OPTIONS

    if (OPTIONS.interactive) {
      opts = await interactiveMenu()
    } else if (!opts.all && !opts.only && !opts.fresh && !opts.deploy) {
      log.warn('Aucune cible -> --all par defaut')
      opts.all = true
    }

    const code = await executePipeline(opts)
    process.exit(code)
  } catch (err) {
    log.err(`Erreur fatale : ${err.message}`)
    if (err.stack) log.dim(err.stack)
    process.exit(1)
  }
}

main()