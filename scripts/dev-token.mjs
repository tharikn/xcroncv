// Usage: node scripts/dev-token.mjs [subject] [tenant]   (needs `npm i` first; dev only)
import { SignJWT } from 'jose';
const [sub = 'dev-user-1', tenant = 'xcron-dev', roles = ''] = process.argv.slice(2); // roles: comma list, e.g. analytics_admin
const secret = new TextEncoder().encode(process.env.AUTH_DEV_SECRET ?? 'change-me-dev-only-secret-at-least-32-chars');
const token = await new SignJWT({ tenant_id: tenant, ...(roles ? { roles: roles.split(',') } : {}) })
  .setProtectedHeader({ alg: 'HS256' }).setSubject(sub)
  .setIssuer(process.env.AUTH_ISSUER ?? 'https://xcron.example.com')
  .setAudience(process.env.AUTH_AUDIENCE ?? 'xcroncv')
  .setExpirationTime('8h').sign(secret);
console.log(token);
