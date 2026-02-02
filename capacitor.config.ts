import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arcprotocol.app',
  appName: 'Arc Protocol',
  webDir: 'out',
  server: {
    // Load from Vercel in production (your app has API routes that need a server)
    url: 'https://peptide-os.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Arc Protocol',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#f8fafc',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
