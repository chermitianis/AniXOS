#!/usr/bin/env node
/**
 * ============================================================================
 * 03-env-check.mjs — Vérification des variables d'environnement
 * ============================================================================
 */

import { existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, parseEnvFile, ROOT, WEB_DIR } from './_utils.mjs'

const envLocal = join(WEB_DIR, '.env.local')
const envExample = join(WEB_DIR, '.env.local.example')
const envSetup = join(ROOT, '.env.setup')
const envSetupExample = join(ROOT, '.env.setup.example')

const NEED_DEPLOY = process.argv.includes('--deploy')

function validateEnvLocal(env) {
  const issues = []
  if (!env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL.includes('xxxxx')) {
    issues.push('VITE_SUPABASE_URL manquant ou placeholder')
  }
  if (!env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY.includes('xxxxx')) {
    issues.push('VITE_SUPABASE_ANON_KEY manquant ou placeholder')
  }
  return issues
}

function validateEnvSetup(env) {
  const issues = []
  if (!env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN.includes('YOUR_')) {
    issues.push('SUPABASE_ACCESS_TOKEN manquant ou placeholder')
  }
  if (!env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF.includes('YOUR_')) {
    issues.push('SUPABASE_PROJECT_REF manquant ou placeholder')
  }
  return issues
}

async function main() {
  console.log(`\n${C.cyan}${C.bold}Verification des variables d'environnement${C.reset}\n`)

  // 1. apps/web/.env.local
  if (!existsSync(envLocal)) {
    if (existsSync(envExample)) {
      copyFileSync(envExample, envLocal)
      log.warn(`apps/web/.env.local cree depuis l'exemple.`)
      log.dim(`Editez : ${envLocal}`)
    } else {
      log.err(`apps/web/.env.local manquant et aucun exemple trouve.`)
      process.exit(1)
    }
  }

  const webEnv = parseEnvFile(envLocal)
  const webIssues = validateEnvLocal(webEnv)
  if (webIssues.length > 0) {
    log.err(`apps/web/.env.local presente ${webIssues.length} probleme(s) :`)
    webIssues.forEach((i) => log.dim(`- ${i}`))
    log.info(`Corrigez : ${envLocal}`)
    process.exit(1)
  }
  log.ok('apps/web/.env.local : OK')

  // 2. .env.setup (uniquement si --deploy)
  if (NEED_DEPLOY) {
    if (!existsSync(envSetup)) {
      if (existsSync(envSetupExample)) {
        copyFileSync(envSetupExample, envSetup)
        log.warn(`.env.setup cree depuis l'exemple.`)
        log.info(`Editez : ${envSetup}`)
        log.err('Remplissez SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF puis relancez.')
        process.exit(1)
      } else {
        log.err(`.env.setup manquant (requis pour --deploy).`)
        process.exit(1)
      }
    }

    const setupEnv = parseEnvFile(envSetup)
    const setupIssues = validateEnvSetup(setupEnv)
    if (setupIssues.length > 0) {
      log.err(`.env.setup presente ${setupIssues.length} probleme(s) :`)
      setupIssues.forEach((i) => log.dim(`- ${i}`))
      process.exit(1)
    }
    log.ok('.env.setup : OK (deploy active)')
  } else {
    log.dim('.env.setup non requis (--deploy non specifie)')
  }

  log.ok("\nVariables d'environnement valides.")
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})