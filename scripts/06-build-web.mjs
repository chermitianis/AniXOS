#!/usr/bin/env node
/**
 * ============================================================================
 * 06-build-web.mjs — Build du site web (Vite)
 * ============================================================================
 * Produit :
 *   apps/web/dist/           → assets finaux (déployés par Vercel)
 *   release/web/             → copie archivée (.tar.gz)
 * ============================================================================
 */

import { existsSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, exec, WEB_DIR, ROOT, RELEASE_DIR, ensureDir } from './_utils.mjs'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  console.log(`\n${C.cyan}${C.bold}🌐 Build Web (Vite)${C.reset}\n`)

  if (!existsSync(WEB_DIR)) {
    log.err(`Dossier introuvable : ${WEB_DIR}`)
    process.exit(1)
  }

  if (DRY_RUN) {
    log.dim('(dry-run — build non exécuté)')
    process.exit(0)
  }

  // 1. Build Vite
  log.info('Exécution : npm run build (dans apps/web)')
  try {
    await exec('npm', ['run', 'build'], { cwd: WEB_DIR })
  } catch (err) {
    log.err(`Build échoué : ${err.message}`)
    process.exit(1)
  }

  const distDir = join(WEB_DIR, 'dist')
  if (!existsSync(distDir)) {
    log.err('dist/ non créé après build — vérifiez vite.config.ts')
    process.exit(1)
  }

  log.ok(`Build Vite : ${distDir}`)

  // 2. Copier vers release/web
  const releaseWeb = join(RELEASE_DIR, 'web')
  ensureDir(releaseWeb)

  // Nettoyer l'ancien contenu (sauf .gitkeep si présent)
  if (existsSync(releaseWeb)) {
    for (const entry of await import('node:fs').then((m) => m.readdirSync(releaseWeb))) {
      if (entry === '.gitkeep') continue
      rmSync(join(releaseWeb, entry), { recursive: true, force: true })
    }
  }

  cpSync(distDir, releaseWeb, { recursive: true })
  log.ok(`Copié vers : ${releaseWeb}`)

  // 3. Créer archive tar.gz (optionnel sur Windows → on utilise zip)
  const platform = process.platform
  log.info(`Création de l'archive (${platform === 'win32' ? 'zip' : 'tar.gz'})...`)

  if (platform === 'win32') {
    try {
      await exec('powershell', [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path "${releaseWeb}\\*" -DestinationPath "${join(RELEASE_DIR, 'web-dist.zip')}" -Force`,
      ])
      log.ok(`Archive : release/web-dist.zip`)
    } catch (err) {
      log.warn(`Archive zip échouée : ${err.message}`)
    }
  } else {
    try {
      await exec('tar', [
        '-czf',
        join(RELEASE_DIR, 'web-dist.tar.gz'),
        '-C',
        distDir,
        '.',
      ])
      log.ok(`Archive : release/web-dist.tar.gz`)
    } catch (err) {
      log.warn(`Archive tar.gz échouée : ${err.message}`)
    }
  }

  log.ok('\n✅ Build Web terminé.')
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})