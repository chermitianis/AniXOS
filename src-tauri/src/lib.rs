/**
 * ============================================================================
 * AniXOS — Bibliothèque Tauri partagée
 * ============================================================================
 * Utilisée à la fois par le binaire desktop et (optionnellement) par les
 * builds mobile (Tauri Mobile).
 * ============================================================================
 */

 #[cfg_attr(mobile, tauri::mobile_entry_point)]
 pub fn run() {
     tauri::Builder::default()
         .plugin(tauri_plugin_shell::init())
         .plugin(tauri_plugin_opener::init())
         .setup(|_app| {
             // Hook de démarrage — peut être utilisé pour logs, configuration, etc.
             #[cfg(debug_assertions)]
             {
                 println!("AniXOS — Mode développement");
             }
             Ok(())
         })
         .run(tauri::generate_context!())
         .expect("Erreur au lancement de l'application Tauri");
 }