#!/usr/bin/env node
/**
 * ============================================================================
 * 01-clean.mjs — Nettoyage
 * ============================================================================
 */

import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { log, C, ROOT, WEB_DIR, RELEASE_DIR } from './_utils.mjs'

const AUTO_YES = process.argv.includes('--yes')

const TARGETS = [
  { path: join(ROOT, 'node_modules'), label: 'node_modules/' },
  { path: join(WEB_DIR, 'node_modules'), label: 'apps/web/node_modules/' },
  { path: join(WEB_DIR, 'dist'), label: 'apps/web/dist/' },
  { path: join(WEB_DIR, '.vite'), label: 'apps/web/.vite/' },
  { path: join(ROOT, 'android', 'app', 'build'), label: 'android/app/build/' },
  { path: join(ROOT, 'src-tauri', 'target'), label: 'src-tauri/target/' },
  { path: join(RELEASE_DIR), label: 'release/' },
  { path: join(ROOT, '.setup-state.json'), label: '.setup-state.json' },
]

async function confirm(msg) {
  if (AUTO_YES) return true
  const rl = readline.createInterface({ input, output })
  const ans = await rl.question(`${C.yellow}${msg} [y/N] ${C.reset}`)
  rl.close()
  return ans.trim().toLowerCase() === 'y'
}

async function main() {
  console.log(`\n${C.cyan}${C.bold}Nettoyage${C.reset}\n`)

  const existing = TARGETS.filter((t) => existsSync(t.path))
  if (existing.length === 0) {
    log.info('Rien a nettoyer.')
    process.exit(0)
  }

  console.log(`${C.bold}Cibles a supprimer :${C.reset}`)
  existing.forEach((t) => console.log(`  ${C.red}x${C.reset} ${t.label}`))
  console.log()

  if (!(await confirm('Confirmer la suppression ?'))) {
    log.warn('Annule.')
    process.exit(0)
  }

  for (const t of existing) {
    try {
      rmSync(t.path, { recursive: true, force: true })
      log.dim(`supprime : ${t.label}`)
    } catch (err) {
      log.err(`Impossible : ${t.label} (${err.message})`)
    }
  }

  log.ok('Nettoyage termine.')
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})