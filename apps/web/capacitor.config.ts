import type { CapacitorConfig } from '@capacitor/cli';

const prod = process.env.CAP_PROD === '1';

const config: CapacitorConfig = {
  appId: 'com.xcron.cv',
  appName: 'XCron CV',
  webDir: 'dist/web/browser',
  // Dev (default): the WebView is served as http://localhost so it can call the local http API (10.0.2.2:3100 on the emulator).
  // Release APK (CAP_PROD=1, set by the GitHub Actions workflow): https://localhost, no cleartext, no mixed content.
  server: prod ? { androidScheme: 'https' } : { androidScheme: 'http', cleartext: true },
  android: { path: '../android', allowMixedContent: !prod },
  plugins: { SplashScreen: { launchShowDuration: 0 }, Keyboard: { resize: 'body' } },
};
export default config;
