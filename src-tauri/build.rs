/**
 * ============================================================================
 * AniXOS — Build Script Tauri
 * ============================================================================
 * Ce script est exécuté par Cargo avant la compilation.
 * Il génère le contexte Tauri (permissions, capabilities, etc.)
 * ============================================================================
 */

 fn main() {
    tauri_build::build()
}