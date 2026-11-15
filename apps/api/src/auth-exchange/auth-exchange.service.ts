import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExchangeResult {
  accessToken: string;
  expiresIn: number;
}

/**
 * Exchanges a one-time host (X Cron) handoff code for a short-lived Resume-scoped
 * token, server-to-server (doc 39 section 6.2). The browser never sees the host secret
 * and no bearer token is ever placed in a URL.
 */
@Injectable()
export class AuthExchangeService {
  constructor(private readonly cfg: ConfigService) {}

  async exchange(code: string, redirectUri: string, nonce: string): Promise<ExchangeResult> {
    const base = this.cfg.get<string>('HOST_HANDOFF_URL');
    const secret = this.cfg.get<string>('HOST_HANDOFF_SECRET');
    if (!base || !secret) throw new UnauthorizedException();

    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/+$/, '')}/v1/handoff/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-handoff-secret': secret },
        body: JSON.stringify({ code, redirectUri, nonce }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new UnauthorizedException(); // host unreachable: no detail leakage
    }
    if (!res.ok) throw new UnauthorizedException();

    const body = (await res.json().catch(() => null)) as
      | { access_token?: unknown; expires_in?: unknown }
      | null;
    if (!body || typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      throw new UnauthorizedException();
    }
    return { accessToken: body.access_token, expiresIn: body.expires_in };
  }
}
