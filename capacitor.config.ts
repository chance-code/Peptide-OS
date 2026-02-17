import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arcprotocol.app',
  appName: 'Arc Protocol Web',
  webDir: 'out',
  server: {
    // Load from Railway in production (your app has API routes that need a server)
    url: 'https://peptide-os-production.up.railway.app',
    cleartext: false,
    // Allow navigation to OAuth providers and back
    allowNavigation: [
      'peptide-os-production.up.railway.app',
      '*.railway.app',
      'accounts.google.com',
      '*.google.com',
      'appleid.apple.com',
      '*.apple.com',
    ],
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Arc Protocol',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#121010',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: process.env.GOOGLE_CLIENT_ID || '',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
