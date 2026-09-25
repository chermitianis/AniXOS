#!/usr/bin/env node
/**
 * ============================================================================
 * 02-install.mjs — Installation des dépendances (version anti-EPERM)
 * ============================================================================
 * Stratégie intelligente pour éviter les erreurs "EPERM unlink" sous Windows :
 *
 *   1. Si node_modules existe → utilise "npm install" (au lieu de "npm ci")
 *      → npm ci supprime TOUT, ce qui déclenche les EPERM sur fichiers verrouillés
 *      → npm install met simplement à jour
 *
 *   2. Si node_modules absent (première install) → "npm ci" si lock existe
 *
 *   3. Si "npm ci" échoue avec EPERM → fallback automatique sur "npm install"
 *
 *   4. Si "npm install" échoue aussi → continue quand même (on suppose que
 *      node_modules existe déjà et est fonctionnel)
 * ============================================================================
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, exec, ROOT, WEB_DIR } from './_utils.mjs'

const DRY_RUN = process.argv.includes('--dry-run')

// ---------------------------------------------------------------------------
// Installation intelligente dans un dossier
// ---------------------------------------------------------------------------
async function installIn(dir, label) {
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) {
    log.dim(`Pas de package.json dans ${label} -> skip`)
    return { ok: true, skipped: true }
  }

  const nodeModules = join(dir, 'node_modules')
  const lockPath = join(dir, 'package-lock.json')

  const hasNodeModules = existsSync(nodeModules)
  const hasLock = existsSync(lockPath)

  // ---------------------------------------------------------------------------
  // Cas 1 : node_modules déjà présent → npm install (mise à jour, safe)
  // ---------------------------------------------------------------------------
  if (hasNodeModules) {
    log.info(`${label} : npm install (mise a jour safe)`)
    if (DRY_RUN) {
      log.dim('(dry-run, ignore)')
      return { ok: true }
    }

    try {
      await exec('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir })
      log.ok(`${label} : deps a jour`)
      return { ok: true }
    } catch (err) {
      // Si npm install échoue (EPERM), on continue quand même
      // → node_modules existe déjà, il est probablement fonctionnel
      log.warn(`${label} : npm install a échoué (on continue avec l'existant)`)
      log.dim(`Raison : ${err.message}`)
      return { ok: true, warning: true }
    }
  }

  // ---------------------------------------------------------------------------
  // Cas 2 : node_modules absent → npm ci si lock, sinon npm install
  // ---------------------------------------------------------------------------
  const cmdArgs = hasLock ? ['ci'] : ['install']
  log.info(`${label} : npm ${cmdArgs[0]} (installation fraiche)`)
  log.dim(`Cible : ${dir}`)

  if (DRY_RUN) {
    log.dim('(dry-run, ignore)')
    return { ok: true }
  }

  try {
    await exec('npm', [...cmdArgs, '--no-audit', '--no-fund'], { cwd: dir })
    log.ok(`${label} : deps installees`)
    return { ok: true }
  } catch (err) {
    // ---------------------------------------------------------------------
    // Fallback : si "npm ci" échoue avec EPERM, on tente "npm install"
    // ---------------------------------------------------------------------
    if (hasLock && cmdArgs[0] === 'ci') {
      log.warn(`${label} : npm ci a échoué → fallback sur npm install`)

      try {
        await exec('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir })
        log.ok(`${label} : deps installees (via fallback)`)
        return { ok: true }
      } catch (err2) {
        log.err(`${label} : npm install a aussi échoué`)
        log.dim(`Raison : ${err2.message}`)
        return { ok: false, error: err2 }
      }
    }

    log.err(`${label} : installation échouée`)
    log.dim(`Raison : ${err.message}`)
    return { ok: false, error: err }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n${C.cyan}${C.bold}📦 Installation des dependances${C.reset}\n`)

  if (DRY_RUN) {
    log.info('Mode DRY-RUN — aucune modification')
  }

  const results = []

  // 1. Root
  log.title('1. Root')
  results.push({
    label: 'root',
    result: await installIn(ROOT, 'root'),
  })

  console.log()

  // 2. apps/web
  log.title('2. apps/web')
  results.push({
    label: 'apps/web',
    result: await installIn(WEB_DIR, 'apps/web'),
  })

  // -------------------------------------------------------------------------
  // Résumé
  // -------------------------------------------------------------------------
  console.log(`\n${C.cyan}${C.bold}Resume :${C.reset}`)

  let hasError = false

  for (const { label, result } of results) {
    if (result.skipped) {
      log.dim(`${label.padEnd(12)} : ignore`)
    } else if (result.ok && result.warning) {
      log.warn(`${label.padEnd(12)} : OK (avec avertissement)`)
    } else if (result.ok) {
      log.ok(`${label.padEnd(12)} : OK`)
    } else {
      log.err(`${label.padEnd(12)} : ECHEC`)
      hasError = true
    }
  }

  console.log()

  if (hasError) {
    log.err('Certaines installations ont echoue.')
    log.info('Solutions possibles :')
    log.dim('  1. Fermez Cursor et relancez')
    log.dim('  2. Verifiez que node_modules existe deja')
    log.dim('  3. Desactivez temporairement l\'antivirus')
    process.exit(1)
  }

  log.ok('Installation terminee.')
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur fatale : ${err.message}`)
  process.exit(1)
})