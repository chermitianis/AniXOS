#!/usr/bin/env node
/**
 * ============================================================================
 * 09-verify-artifacts.mjs — Vérification des artefacts produits
 * ============================================================================
 * Vérifie que :
 *   - apps/web/dist/index.html existe
 *   - Le manifest PWA est bien présent
 *   - release/ contient les livrables attendus
 * ============================================================================
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, WEB_DIR, RELEASE_DIR } from './_utils.mjs'

function listFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).map((n) => ({
    name: n,
    path: join(dir, n),
    isDir: statSync(join(dir, n)).isDirectory(),
  }))
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function check(cond, msg, isCritical = true) {
  if (cond) {
    console.log(`  ${C.green}✅${C.reset} ${msg}`)
    return true
  }
  if (isCritical) console.log(`  ${C.red}❌${C.reset} ${msg}`)
  else console.log(`  ${C.yellow}⚠️ ${C.reset} ${msg}`)
  return false
}

async function main() {
  console.log(`\n${C.cyan}${C.bold}🔍 Vérification des artefacts${C.reset}\n`)

  let allOk = true

  // --- Web ---
  console.log(`${C.bold}Web (apps/web/dist) :${C.reset}`)
  const dist = join(WEB_DIR, 'dist')
  allOk &= check(existsSync(dist), 'Dossier dist/ présent')
  allOk &= check(existsSync(join(dist, 'index.html')), 'index.html présent')

  const assetsDir = join(dist, 'assets')
  if (existsSync(assetsDir)) {
    const files = readdirSync(assetsDir)
    allOk &= check(
      files.some((f) => f.endsWith('.js')),
      'Assets JS présents'
    )
    allOk &= check(
      files.some((f) => f.endsWith('.css')),
      'Assets CSS présents'
    )
  } else {
    log.dim('Pas de dossier assets/ (ignoré)')
  }

  // Manifest PWA
  const hasManifest =
    existsSync(join(dist, 'manifest.webmanifest')) ||
    existsSync(join(dist, 'planning-manifest.webmanifest'))
  check(hasManifest, 'Manifest PWA présent', false)

  // Service Worker
  const hasSW =
    existsSync(join(dist, 'sw.js')) ||
    existsSync(join(dist, 'service-worker.js'))
  check(hasSW, 'Service Worker présent', false)

  // --- Release ---
  console.log(`\n${C.bold}Release (release/) :${C.reset}`)

  const webDir = join(RELEASE_DIR, 'web')
  check(existsSync(webDir), 'release/web/ présent', false)

  const androidDir = join(RELEASE_DIR, 'android')
  const androidApk = existsSync(androidDir)
    ? listFiles(androidDir).filter((f) => f.name.endsWith('.apk'))
    : []
  check(
    androidApk.length > 0,
    `release/android/*.apk (${androidApk.length})`,
    false
  )

  const desktopDir = join(RELEASE_DIR, 'desktop')
  const desktopFiles = existsSync(desktopDir) ? listFiles(desktopDir) : []
  check(
    desktopFiles.length > 0,
    `release/desktop/ (${desktopFiles.length} artefact(s))`,
    false
  )

  // --- Listing ---
  console.log(`\n${C.bold}Contenu de release/ :${C.reset}`)
  for (const sub of ['web', 'android', 'desktop']) {
    const dir = join(RELEASE_DIR, sub)
    if (!existsSync(dir)) {
      log.dim(`${sub}/ — absent`)
      continue
    }
    const files = listFiles(dir).filter((f) => !f.isDir)
    console.log(`  ${C.cyan}${sub}/${C.reset} (${files.length} fichier(s))`)
    for (const f of files.slice(0, 5)) {
      const size = statSync(f.path).size
      console.log(`    ${C.dim}•${C.reset} ${f.name} ${C.dim}(${fmtSize(size)})${C.reset}`)
    }
    if (files.length > 5) {
      console.log(`    ${C.dim}... et ${files.length - 5} autre(s)${C.reset}`)
    }
  }

  console.log()
  if (allOk) {
    log.ok('Vérification réussie.')
  } else {
    log.warn('Certains artefacts critiques manquent.')
  }

  process.exit(allOk ? 0 : 1)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})