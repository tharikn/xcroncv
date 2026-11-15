import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xcron.cv',
  appName: 'XCron CV',
  webDir: 'dist/web/browser',
  // Dev: the WebView is served as http://localhost so it can call the local http API (10.0.2.2:3100 on the emulator).
  // For production use https and remove cleartext.
  server: { androidScheme: 'http', cleartext: true },
  android: { allowMixedContent: true },
  plugins: { SplashScreen: { launchShowDuration: 0 }, Keyboard: { resize: 'body' } },
};
export default config;
