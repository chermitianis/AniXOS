#!/usr/bin/env node
/**
 * ============================================================================
 * 10-summary.mjs — Résumé final du build
 * ============================================================================
 * Affiche un rapport esthétique avec tous les livrables produits,
 * leurs tailles, et les instructions de déploiement.
 * ============================================================================
 */

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, WEB_DIR, RELEASE_DIR, ROOT } from './_utils.mjs'

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function safeSize(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function collectArtifacts() {
  const artifacts = {
    web: [],
    android: [],
    desktop: [],
    archive: [],
  }

  // Web dist
  const dist = join(WEB_DIR, 'dist')
  if (existsSync(dist)) {
    artifacts.web.push({ name: 'apps/web/dist/', path: dist, isDir: true })
  }

  // Release folders
  for (const [key, sub] of [
    ['web', 'web'],
    ['android', 'android'],
    ['desktop', 'desktop'],
  ]) {
    const dir = join(RELEASE_DIR, sub)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      artifacts[key].push({ name, path: p, isDir: st.isDirectory(), size: st.size })
    }
  }

  // Archives
  for (const name of readdirSync(RELEASE_DIR)) {
    if (name.endsWith('.zip') || name.endsWith('.tar.gz')) {
      const p = join(RELEASE_DIR, name)
      artifacts.archive.push({ name, path: p, size: statSync(p).size })
    }
  }

  return artifacts
}

function printSection(title, items, icon) {
  if (items.length === 0) return
  console.log(`\n${C.bold}${icon} ${title}${C.reset}`)
  for (const item of items) {
    if (item.isDir) {
      console.log(`   ${C.cyan}▸${C.reset} ${item.name}${C.dim} (dossier)${C.reset}`)
    } else {
      const size = item.size != null ? item.size : safeSize(item.path)
      console.log(
        `   ${C.green}✓${C.reset} ${item.name} ${C.dim}(${fmtSize(size)})${C.reset}`
      )
    }
  }
}

async function main() {
  console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════════╗${C.reset}`)
  console.log(`${C.bold}${C.magenta}║${C.reset}   ${C.bold}🎉 AniXOS — Résumé du Build${C.reset}                        ${C.bold}${C.magenta}║${C.reset}`)
  console.log(`${C.bold}${C.magenta}╚══════════════════════════════════════════════════════╝${C.reset}`)

  const artifacts = collectArtifacts()

  printSection('Site Web (production)', artifacts.web, '🌐')
  printSection('Android', artifacts.android, '📱')
  printSection('Desktop', artifacts.desktop, '🖥️ ')
  printSection('Archives', artifacts.archive, '📦')

  // --- Instructions ---
  console.log(`\n${C.bold}🚀 Déploiement :${C.reset}`)
  console.log(`   ${C.cyan}Web${C.reset}       → Vercel (auto depuis GitHub) : ${C.bold}https://anixos.vercel.app${C.reset}`)
  console.log(`   ${C.cyan}PWA${C.reset}       → Installable depuis le navigateur (même URL)`)
  console.log(`   ${C.cyan}Android${C.reset}   → release/android/AniXOS.apk (sideload / Play Store)`)
  console.log(`   ${C.cyan}Desktop${C.reset}   → release/desktop/AniXOS_setup.exe (installeur Windows)`)

  // --- Log file ---
  const logPath = join(ROOT, 'docs', 'SETUP_AUTOMATION_LOG.md')
  const now = new Date().toISOString()
  const logContent = `
## Build — ${now}

### Artefacts

**Web:**
${artifacts.web.map((a) => `- ${a.name}`).join('\n') || '- (aucun)'}

**Android:**
${artifacts.android.map((a) => `- ${a.name} (${fmtSize(a.size || 0)})`).join('\n') || '- (aucun)'}

**Desktop:**
${artifacts.desktop.map((a) => `- ${a.name} (${fmtSize(a.size || 0)})`).join('\n') || '- (aucun)'}

**Archives:**
${artifacts.archive.map((a) => `- ${a.name} (${fmtSize(a.size || 0)})`).join('\n') || '- (aucune)'}
`.trimStart()

  try {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(logPath, `\n\n${logContent}\n`, 'utf8')
    log.dim(`Log ajouté : ${logPath}`)
  } catch {
    // ignore
  }

  console.log(`\n${C.green}${C.bold}✅ Terminé.${C.reset}\n`)
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})