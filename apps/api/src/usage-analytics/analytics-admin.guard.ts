import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

export const ADMIN_ROLE = 'analytics_admin';

/** Runs after AuthGuard. Roles come only from the verified token claim; no role means 403, never partial data. */
@Injectable()
export class AnalyticsAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.roles?.includes(ADMIN_ROLE)) throw new ForbiddenException();
    return true;
  }
}
