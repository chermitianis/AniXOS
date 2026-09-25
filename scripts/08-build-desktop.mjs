#!/usr/bin/env node
/**
 * ============================================================================
 * 08-build-desktop.mjs — Build Desktop (Tauri v2)
 * ============================================================================
 * Prérequis : Rust (rustup), dépendances système Tauri
 * Produit : 
 *   Windows : AniXOS_setup.exe + AniXOS.msi
 *   macOS   : AniXOS.dmg
 *   Linux   : AniXOS_*.deb / *.AppImage
 * ============================================================================
 */

import { existsSync, copyFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, exec, commandExists, ROOT, WEB_DIR, RELEASE_DIR, ensureDir } from './_utils.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
const TAURI_DIR = join(ROOT, 'src-tauri')

function findRecursive(dir, matcher) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...findRecursive(p, matcher))
    else if (matcher(entry)) out.push(p)
  }
  return out
}

async function main() {
  console.log(`\n${C.cyan}${C.bold}🖥️  Build Desktop (Tauri v2)${C.reset}\n`)

  // 1. Vérifier Tauri config
  if (!existsSync(join(TAURI_DIR, 'tauri.conf.json'))) {
    log.err('src-tauri/tauri.conf.json introuvable.')
    process.exit(1)
  }

  // 2. Vérifier Rust/Cargo
  if (!(await commandExists('cargo'))) {
    log.err('Rust/Cargo introuvable.')
    log.info('Installation : https://rustup.rs/')
    process.exit(1)
  }

  // 3. Vérifier dist/ (nécessite build web)
  if (!existsSync(join(WEB_DIR, 'dist'))) {
    log.err('apps/web/dist introuvable — lancez d\'abord : --only=web')
    process.exit(1)
  }

  if (DRY_RUN) {
    log.dim('(dry-run — build Desktop non exécuté)')
    process.exit(0)
  }

  // 4. Installer @tauri-apps/cli si absent (root)
  log.info('Vérification de @tauri-apps/cli...')
  const hasTauriCli = existsSync(join(ROOT, 'node_modules', '@tauri-apps', 'cli'))
  if (!hasTauriCli) {
    log.info('Installation de @tauri-apps/cli (dev)...')
    try {
      await exec('npm', ['install', '-D', '@tauri-apps/cli@^2'], { cwd: ROOT })
    } catch (err) {
      log.err(`Installation CLI échouée : ${err.message}`)
      process.exit(1)
    }
  }

  // 5. Build Tauri
  log.info('Compilation Tauri (npm run tauri:build)...')
  try {
    await exec('npx', ['tauri', 'build'], { cwd: ROOT })
  } catch (err) {
    log.err(`Tauri build échoué : ${err.message}`)
    process.exit(1)
  }

  // 6. Récupérer les artefacts
  const bundleDir = join(TAURI_DIR, 'target', 'release', 'bundle')
  if (!existsSync(bundleDir)) {
    log.err(`Dossier bundle introuvable : ${bundleDir}`)
    process.exit(1)
  }

  ensureDir(join(RELEASE_DIR, 'desktop'))

  const targets = [
    { ext: '.exe', label: 'Installeur Windows (.exe)' },
    { ext: '.msi', label: 'Installateur MSI Windows' },
    { ext: '.dmg', label: 'Image macOS (.dmg)' },
    { ext: '.deb', label: 'Paquet Debian (.deb)' },
    { ext: '.rpm', label: 'Paquet RPM' },
    { ext: '.AppImage', label: 'AppImage Linux' },
  ]

  let copied = 0
  for (const t of targets) {
    const found = findRecursive(bundleDir, (name) => name.endsWith(t.ext))
    for (const src of found) {
      const filename = src.split(/[\\/]/).pop()
      const dst = join(RELEASE_DIR, 'desktop', filename)
      copyFileSync(src, dst)
      log.ok(`${t.label} → ${dst}`)
      copied++
    }
  }

  if (copied === 0) {
    log.warn('Aucun artefact trouvé dans src-tauri/target/release/bundle/')
  }

  log.ok(`\n✅ Build Desktop terminé (${copied} artefact(s)).`)
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})