import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.fd8e3ad8b8b248d88ffd89189be7cd7b',
  appName: 'Tahleem Academy',
  webDir: 'dist',
  server: {
    url: 'https://fd8e3ad8-b8b2-48d8-8ffd-89189be7cd7b.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#064E3B',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#D4AF37',
      sound: 'adhan.wav',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#064E3B',
    },
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#064E3B',
  },
  android: {
    backgroundColor: '#064E3B',
    allowMixedContent: true,
  },
};

export default config;