import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.frdistribuidora.acertos',
  appName: 'FR Acertos',
  webDir: 'dist',
  server: {
    url: 'https://52a01238-0fa7-4289-b81f-44666ac2925d.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
