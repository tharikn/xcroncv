import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AnalyticsAdminGuard } from './analytics-admin.guard';
import { RecordUsageDto, UsageQueryDto } from './dto/usage.dto';
import { UsageAnalyticsService } from './usage-analytics.service';

@Controller()
export class UsageAnalyticsController {
  constructor(private svc: UsageAnalyticsService) {}

  /** Any authenticated user records their own allowlisted events. */
  @Post('analytics/usage/events') @HttpCode(200)
  record(@CurrentUser() u: AuthUser, @Body() dto: RecordUsageDto) { return this.svc.record(u, dto); }

  /** Admin only: aggregate product usage. Never returns per-user rows or resume content. */
  @Get('admin/analytics/usage') @UseGuards(AnalyticsAdminGuard)
  report(@Query() q: UsageQueryDto) { return this.svc.report(q); }
}
