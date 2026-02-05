import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arcprotocol.app',
  appName: 'Arc Protocol',
  webDir: 'out',
  server: {
    // Load from Vercel in production (your app has API routes that need a server)
    url: 'https://peptide-os.vercel.app',
    cleartext: false,
    // Allow navigation to OAuth providers and back
    allowNavigation: [
      'peptide-os.vercel.app',
      '*.vercel.app',
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
