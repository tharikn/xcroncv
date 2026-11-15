// Release APK build (ng build --configuration android). The WebView serves the bundled app from
// https://localhost, so the API must be an absolute https URL and its CORS_ORIGINS must include
// https://localhost (and http://localhost for the debug profile).
export const environment = {
  production: true,
  apiBase: 'https://xcroncv-api.onrender.com/api/v1',
  /** X Cron (host) origin for the Back to X Cron link. */
  hostUrl: 'https://x-cron.onrender.com',
  devAuth: false,
  devAuthIssuer: '',
  devAuthAudience: '',
};
