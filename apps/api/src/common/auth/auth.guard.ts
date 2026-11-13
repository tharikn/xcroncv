import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC } from './public.decorator';
import { TokenVerifier } from './token-verifier';

@Injectable()
export class AuthGuard implements CanActivate {
  private verifier: TokenVerifier;
  private tenantClaim: string;

  constructor(cfg: ConfigService, private reflector: Reflector, private prisma: PrismaService) {
    this.verifier = new TokenVerifier(cfg);
    this.tenantClaim = cfg.get<string>('AUTH_TENANT_CLAIM') ?? 'tenant_id';
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();

    try {
      const claims = await this.verifier.verify(header.slice(7));
      const subject = claims.sub;
      const issuer = claims.iss;
      const tenantId = claims[this.tenantClaim];
      if (!subject || !issuer || typeof tenantId !== 'string' || !tenantId) throw new Error('missing claims');

      // Identity key is issuer+subject, never email or body-supplied ids.
      const user = await this.prisma.user.upsert({
        where: { issuer_subject: { issuer, subject } },
        create: { issuer, subject, tenantId },
        update: { lastSeen: new Date(), tenantId },
      });
      req.user = { userId: user.id, tenantId: user.tenantId, issuer, subject };
      return true;
    } catch {
      throw new UnauthorizedException(); // no detail leakage
    }
  }
}
