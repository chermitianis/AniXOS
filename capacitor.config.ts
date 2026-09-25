/**
 * ============================================================================
 * AniXOS — Configuration Capacitor (Android)
 * ============================================================================
 * Capacitor encapsule le build web (Vite) dans une WebView native Android.
 * Le dossier `android/` est généré automatiquement par `npx cap add android`.
 * ============================================================================
 */

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.anixos.app',
  appName: 'AniXOS',
  webDir: 'apps/web/dist',

  // Options globales
  bundledWebRuntime: false,

  // Configuration serveur (pour développement : live reload)
  server: {
    androidScheme: 'https',
    // Décommenter pour le dev en live-reload sur appareil physique :
    // url: 'http://192.168.1.10:5173',
    // cleartext: true,
  },

  // Plugins natifs (à installer séparément si nécessaire)
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0f172a',
    },
  },

  // Configuration Android spécifique
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0f172a',
  },

  // Configuration iOS (optionnelle, si activé plus tard)
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0f172a',
    preferredContentMode: 'mobile',
    scheme: 'AniXOS',
  },
}

export default config