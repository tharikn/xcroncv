import {
  Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import {
  CreatePortfolioDto, CreatePortfolioVersionDto, PreviewDto, PublishDto, SharePolicyDto,
} from './dto/portfolio.dto';
import { PortfolioService } from './portfolio.service';

@Controller('portfolios')
export class PortfolioController {
  constructor(private svc: PortfolioService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreatePortfolioDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query('page') page?: string) { return this.svc.list(u, Math.max(1, Number(page) || 1)); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }

  @Post(':id/versions')
  version(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePortfolioVersionDto) { return this.svc.createVersion(u, id, dto); }

  @Post(':id/preview') @HttpCode(200)
  preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PreviewDto) { return this.svc.preview(u, id, dto); }

  @Post(':id/publish') @HttpCode(200)
  publish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishDto) { return this.svc.publish(u, id, dto); }

  @Post(':id/revoke') @HttpCode(200)
  revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revoke(u, id); }

  @Patch(':id/share-policy')
  policy(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SharePolicyDto) { return this.svc.updateSharePolicy(u, id, dto); }
}

/**
 * The ONLY anonymous route in this module (doc 41 requires an anonymous visitor view). It is narrow on purpose:
 * read-only, token-addressed, rate-limited, uniform 404, never cached, and built from the stored allowlisted snapshot
 * (it does not call the authenticated profile serializer).
 */
@Controller('public/portfolios')
export class PublicPortfolioController {
  constructor(private svc: PortfolioService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  async view(@Param('token') token: string, @Headers('x-portfolio-password') password: string | undefined, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const { noIndex, view } = await this.svc.publicView(token, new Date(), password);
    res.setHeader('Cache-Control', 'no-store'); // revocation must take effect immediately
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (noIndex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return view;
  }
}
