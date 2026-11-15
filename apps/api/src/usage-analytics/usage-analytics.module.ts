import { Module } from '@nestjs/common';
import { AnalyticsAdminGuard } from './analytics-admin.guard';
import { UsageAnalyticsController } from './usage-analytics.controller';
import { UsageAnalyticsService } from './usage-analytics.service';

@Module({ controllers: [UsageAnalyticsController], providers: [UsageAnalyticsService, AnalyticsAdminGuard] })
export class UsageAnalyticsModule {}
