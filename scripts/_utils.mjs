/**
 * ============================================================================
 * AniXOS — Utilitaires partagés
 * ============================================================================
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Chemins absolus
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
export const SCRIPTS_DIR = dirname(__filename)
export const ROOT = dirname(SCRIPTS_DIR)
export const WEB_DIR = join(ROOT, 'apps', 'web')
export const SUPABASE_DIR = join(ROOT, 'supabase')
export const RELEASE_DIR = join(ROOT, 'release')
export const ANDROID_DIR = join(ROOT, 'android')
export const TAURI_DIR = join(ROOT, 'src-tauri')
export const DOCS_DIR = join(ROOT, 'docs')

// ---------------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------------
const isWin = process.platform === 'win32'
const supportsColor = !isWin || process.env.WT_SESSION || process.env.TERM_PROGRAM

export const C = supportsColor
  ? {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
    }
  : Object.fromEntries(
      ['reset', 'bold', 'dim', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map(
        (k) => [k, '']
      )
    )

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
export const log = {
  info: (m) => console.log(`${C.blue}i${C.reset}  ${m}`),
  ok: (m) => console.log(`${C.green}OK${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}!!${C.reset} ${m}`),
  err: (m) => console.log(`${C.red}XX${C.reset} ${m}`),
  dim: (m) => console.log(`${C.dim}   ${m}${C.reset}`),
  title: (m) => console.log(`\n${C.cyan}${C.bold}>> ${m}${C.reset}`),
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
export function exec(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      cwd: opts.cwd || ROOT,
      env: { ...process.env, ...opts.env },
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`"${cmd} ${args.join(' ')}" a échoué (code ${code})`))
    })
    child.on('error', reject)
  })
}

export function execCapture(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      cwd: opts.cwd || ROOT,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }))
  })
}

export async function commandExists(cmd) {
  const check = process.platform === 'win32' ? 'where' : 'which'
  const { code } = await execCapture(check, [cmd])
  return code === 0
}

export function commandVersion(cmd, args = ['--version']) {
  return execCapture(cmd, args).then((r) => (r.stdout + r.stderr).trim().split('\n')[0] || '')
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------
export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
export const hasFlag = (flag) => process.argv.includes(flag)
export const getArg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`${name}=`))
  return a ? a.split('=').slice(1).join('=') : null
}

// ---------------------------------------------------------------------------
// .env parser
// ---------------------------------------------------------------------------
export function parseEnvFile(path) {
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