import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { JobAnalyticsController } from './job-analytics.controller';
import { JobAnalyticsService } from './job-analytics.service';

@Module({ imports: [CrmModule], controllers: [JobAnalyticsController], providers: [JobAnalyticsService] })
export class JobAnalyticsModule {}
