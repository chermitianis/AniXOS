#!/usr/bin/env node
/**
 * ============================================================================
 * 04-migrations.mjs — Application des migrations Supabase
 * ============================================================================
 * Exécute `supabase db push` vers le projet distant (ou local).
 * Requiert : supabase CLI + .env.setup avec SUPABASE_ACCESS_TOKEN.
 * ============================================================================
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, exec, commandExists, ROOT, SUPABASE_DIR } from './_utils.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
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

async function main() {
  console.log(`\n${C.cyan}${C.bold}🗄️  Application des migrations Supabase${C.reset}\n`)

  // Vérifier supabase CLI
  if (!(await commandExists('supabase'))) {
    log.err('supabase CLI introuvable.')
    log.info('Installation : https://supabase.com/docs/guides/cli')
    process.exit(1)
  }
  log.ok('supabase CLI détecté')

  // Charger .env.setup
  const env = parseEnv(ENV_SETUP)
  if (!env.SUPABASE_ACCESS_TOKEN) {
    log.err('SUPABASE_ACCESS_TOKEN manquant dans .env.setup')
    process.exit(1)
  }
  if (!env.SUPABASE_PROJECT_REF) {
    log.err('SUPABASE_PROJECT_REF manquant dans .env.setup')
    process.exit(1)
  }

  // Injecter dans l'environnement du process
  process.env.SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN

  // Compter les migrations
  const migDir = join(SUPABASE_DIR, 'migrations')
  if (!existsSync(migDir)) {
    log.err(`Dossier migrations introuvable : ${migDir}`)
    process.exit(1)
  }

  const { readdirSync } = await import('node:fs')
  const migrations = readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  log.info(`${migrations.length} migration(s) détectée(s)`)
  log.dim(`Première : ${migrations[0]}`)
  log.dim(`Dernière : ${migrations[migrations.length - 1]}`)

  if (DRY_RUN) {
    log.dim('(dry-run — migrations non appliquées)')
    process.exit(0)
  }

  // Link (si nécessaire)
  log.info(`Liaison au projet : ${env.SUPABASE_PROJECT_REF}`)
  try {
    await exec('supabase', ['link', '--project-ref', env.SUPABASE_PROJECT_REF], {
      cwd: ROOT,
    })
  } catch (err) {
    // Link peut échouer si déjà lié → pas bloquant
    log.warn('link : déjà lié ou avertissement (continuité).')
  }

  // Push
  log.info('Application des migrations (supabase db push)...')
  try {
    await exec('supabase', ['db', 'push', '--include-all'], { cwd: ROOT })
  } catch (err) {
    log.err(`Échec : ${err.message}`)
    process.exit(1)
  }

  log.ok('\nMigrations appliquées avec succès.')
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})