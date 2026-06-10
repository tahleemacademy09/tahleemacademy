import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tahleemacademy.app',
  appName: 'Tahleem Academy',
  webDir: 'dist',
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
