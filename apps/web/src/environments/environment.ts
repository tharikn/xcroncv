// Development defaults. Production replaces this file with environment.prod.ts (see angular.json).
export const environment = {
  production: false,
  apiBase: 'http://localhost:3100/api/v1',
  /** Dev-only: allows signing a local HS256 token in the browser (mirrors scripts/dev-token.mjs). Never true in prod. */
  /** X Cron (host) origin for the Back to X Cron link. */
  hostUrl: 'http://localhost:4000',
  devAuth: true,
  devAuthIssuer: 'https://xcron.example.com',
  devAuthAudience: 'xcroncv',
};
