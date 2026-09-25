#!/usr/bin/env node
/**
 * ============================================================================
 * 05-functions.mjs — Déploiement des Edge Functions Supabase
 * ============================================================================
 * 1. Charge les secrets depuis supabase/functions/.env (si présent)
 * 2. Déploie toutes les fonctions dans supabase/functions/
 * ============================================================================
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, exec, commandExists, ROOT, SUPABASE_DIR } from './_utils.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
const FUNCTIONS_DIR = join(SUPABASE_DIR, 'functions')
const FUNCTIONS_ENV = join(FUNCTIONS_DIR, '.env')
const ENV_SETUP = join(ROOT, '.env.setup')

function parseEnv(path) {
  if (!existsSync(path)) return {}
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx === -1) continue
    env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
  }
  return env
}

function listFunctions() {
  if (!existsSync(FUNCTIONS_DIR)) return []
  return readdirSync(FUNCTIONS_DIR).filter((name) => {
    const p = join(FUNCTIONS_DIR, name)
    return statSync(p).isDirectory() && existsSync(join(p, 'index.ts'))
  })
}

async function main() {
  console.log(`\n${C.cyan}${C.bold}⚡ Déploiement des Edge Functions${C.reset}\n`)

  if (!(await commandExists('supabase'))) {
    log.err('supabase CLI introuvable.')
    process.exit(1)
  }

  const env = parseEnv(ENV_SETUP)
  if (!env.SUPABASE_ACCESS_TOKEN) {
    log.err('SUPABASE_ACCESS_TOKEN manquant dans .env.setup')
    process.exit(1)
  }
  process.env.SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN

  const functions = listFunctions()
  if (functions.length === 0) {
    log.warn('Aucune fonction trouvée dans supabase/functions/')
    process.exit(0)
  }

  log.info(`${functions.length} fonction(s) détectée(s) :`)
  functions.forEach((f) => log.dim(`• ${f}`))

  if (DRY_RUN) {
    log.dim('(dry-run — fonctions non déployées)')
    process.exit(0)
  }

  // 1. Pousser les secrets (si .env présent)
  if (existsSync(FUNCTIONS_ENV)) {
    log.info('Application des secrets (supabase secrets set)...')
    try {
      await exec(
        'supabase',
        ['secrets', 'set', '--env-file', FUNCTIONS_ENV],
        { cwd: ROOT }
      )
      log.ok('Secrets appliqués')
    } catch (err) {
      log.warn(`Secrets : ${err.message} (continuité)`)
    }
  } else {
    log.dim('Pas de supabase/functions/.env → secrets préservés')
  }

  // 2. Déployer chaque fonction
  log.info(`Déploiement de ${functions.length} fonction(s)...`)
  for (const fn of functions) {
    log.dim(`→ ${fn}`)
    try {
      await exec(
        'supabase',
        ['functions', 'deploy', fn, '--no-verify-jwt'],
        { cwd: ROOT }
      )
    } catch (err) {
      log.warn(`Échec de ${fn} : ${err.message}`)
    }
  }

  log.ok('\nFonctions déployées.')
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})