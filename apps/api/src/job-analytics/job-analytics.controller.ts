import { Body, Controller, Delete, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AnalyticsQueryDto, ConfirmIngestDto, DeleteEventsQuery, RecordEventsDto } from './dto/analytics.dto';
import { JobAnalyticsService } from './job-analytics.service';

@Controller('analytics')
export class JobAnalyticsController {
  constructor(private svc: JobAnalyticsService) {}

  @Post('job-search/events') record(@CurrentUser() u: AuthUser, @Body() dto: RecordEventsDto) { return this.svc.record(u, dto.events); }
  @Post('job-search/ingest/vault') @HttpCode(200) ingestVault(@CurrentUser() u: AuthUser, @Body() _dto: ConfirmIngestDto) { return this.svc.ingestFromVault(u); }
  @Post('job-search/ingest/host') @HttpCode(200) ingestHost(@CurrentUser() u: AuthUser, @Body() _dto: ConfirmIngestDto) { return this.svc.ingestFromHost(u); }
  @Get('job-search/overview') overview(@CurrentUser() u: AuthUser, @Query() q: AnalyticsQueryDto) { return this.svc.overview(u, q); }
  @Get('job-search/funnel') funnel(@CurrentUser() u: AuthUser, @Query() q: AnalyticsQueryDto) { return this.svc.funnel(u, q); }
  @Get('job-search/resume-versions') versions(@CurrentUser() u: AuthUser, @Query() q: AnalyticsQueryDto) { return this.svc.resumeVersions(u, q); }
  @Get('job-search/activity') activity(@CurrentUser() u: AuthUser, @Query() q: AnalyticsQueryDto) { return this.svc.activity(u, q); }

  @Post('exports') @HttpCode(200)
  async export(@CurrentUser() u: AuthUser, @Body() q: AnalyticsQueryDto, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="job-search-analytics.json"');
    res.json(await this.svc.export(u, q));
  }

  @Delete('events') deleteEvents(@CurrentUser() u: AuthUser, @Query() q: DeleteEventsQuery) { return this.svc.deleteEvents(u, q.applicationRef); }
}
