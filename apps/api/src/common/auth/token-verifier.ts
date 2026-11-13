import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

/**
 * Validates issuer, audience, signature and expiry.
 * Production: remote JWKS (OIDC). Development only: HS256 shared secret.
 */
export class TokenVerifier {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly devSecret?: Uint8Array;

  constructor(cfg: ConfigService) {
    this.issuer = cfg.getOrThrow<string>('AUTH_ISSUER');
    this.audience = cfg.getOrThrow<string>('AUTH_AUDIENCE');
    const isProd = cfg.get('NODE_ENV') === 'production';
    const jwksUrl = cfg.get<string>('AUTH_JWKS_URL');
    const dev = cfg.get<string>('AUTH_DEV_SECRET');
    if (jwksUrl) this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    if (!isProd && dev) this.devSecret = new TextEncoder().encode(dev);
    if (!this.jwks && !this.devSecret) {
      throw new Error('Configure AUTH_JWKS_URL (or AUTH_DEV_SECRET outside production)');
    }
  }

  async verify(token: string): Promise<JWTPayload> {
    const opts = { issuer: this.issuer, audience: this.audience };
    if (this.jwks) return (await jwtVerify(token, this.jwks, opts)).payload;
    return (await jwtVerify(token, this.devSecret!, { ...opts, algorithms: ['HS256'] })).payload;
  }
}
