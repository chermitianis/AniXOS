#!/usr/bin/env node
/**
 * ============================================================================
 * 07-build-android.mjs — Build APK Android (Capacitor)
 * ============================================================================
 * Prérequis : Java 17+, Android SDK (via Android Studio ou sdkmanager)
 * Produit : release/android/AniXOS-<version>.apk
 * ============================================================================
 */

import { existsSync, copyFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { log, C, exec, commandExists, ROOT, WEB_DIR, RELEASE_DIR, ensureDir } from './_utils.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
const ANDROID_DIR = join(ROOT, 'android')

async function main() {
  console.log(`\n${C.cyan}${C.bold}📱 Build Android (APK)${C.reset}\n`)

  // 1. Vérifier Capacitor
  if (!existsSync(join(ROOT, 'capacitor.config.ts'))) {
    log.err('capacitor.config.ts introuvable à la racine.')
    log.info('Exécutez : npx cap init (ou créez le fichier)')
    process.exit(1)
  }

  // 2. Vérifier Java
  if (!(await commandExists('java'))) {
    log.err('Java introuvable. Installer JDK 17+.')
    process.exit(1)
  }

  // 3. Vérifier dist/ (nécessite build web préalable)
  if (!existsSync(join(WEB_DIR, 'dist'))) {
    log.err('apps/web/dist introuvable — lancez d\'abord : --only=web')
    process.exit(1)
  }

  if (DRY_RUN) {
    log.dim('(dry-run — build Android non exécuté)')
    process.exit(0)
  }

  // 4. Ajouter la plateforme Android (idempotent)
  if (!existsSync(ANDROID_DIR)) {
    log.info('Ajout de la plateforme Android (cap add android)...')
    try {
      await exec('npx', ['cap', 'add', 'android'], { cwd: ROOT })
    } catch (err) {
      log.err(`cap add android échoué : ${err.message}`)
      process.exit(1)
    }
  } else {
    log.dim('Plateforme Android déjà présente')
  }

  // 5. Sync Capacitor
  log.info('Synchronisation (cap sync android)...')
  try {
    await exec('npx', ['cap', 'sync', 'android'], { cwd: ROOT })
  } catch (err) {
    log.err(`cap sync échoué : ${err.message}`)
    process.exit(1)
  }

  // 6. Gradle assembleRelease
  log.info('Compilation APK (gradlew assembleRelease)...')
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
  const gradlewPath = join(ANDROID_DIR, gradlew)

  if (!existsSync(gradlewPath)) {
    log.err(`gradlew introuvable : ${gradlewPath}`)
    process.exit(1)
  }

  try {
    await exec(gradlewPath, ['assembleRelease'], {
      cwd: ANDROID_DIR,
      shell: process.platform === 'win32',
    })
  } catch (err) {
    log.err(`Gradle échoué : ${err.message}`)
    process.exit(1)
  }

  // 7. Copier l'APK vers release/
  const apkDir = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release')
  if (!existsSync(apkDir)) {
    log.err(`Dossier APK introuvable : ${apkDir}`)
    process.exit(1)
  }

  const apkFiles = readdirSync(apkDir).filter((f) => f.endsWith('.apk'))
  if (apkFiles.length === 0) {
    log.err('Aucun APK produit.')
    process.exit(1)
  }

  ensureDir(join(RELEASE_DIR, 'android'))
  const finalName = 'AniXOS.apk'
  const finalPath = join(RELEASE_DIR, 'android', finalName)
  copyFileSync(join(apkDir, apkFiles[0]), finalPath)

  log.ok(`APK : ${finalPath}`)
  log.ok('\n✅ Build Android terminé.')
  process.exit(0)
}

main().catch((err) => {
  log.err(`Erreur : ${err.message}`)
  process.exit(1)
})