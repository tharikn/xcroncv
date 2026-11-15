import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CreateJobDescriptionDto, CreateMatchReportDto, ImportUrlDto, UpdateJobDescriptionDto } from './dto/resume-match.dto';
import { ResumeMatchService } from './resume-match.service';

@Controller('job-descriptions')
export class JobDescriptionsController {
  constructor(private svc: ResumeMatchService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateJobDescriptionDto) { return this.svc.createJd(u, dto); }

  /** Outbound fetch: tightly rate limited. Returns a status; never claims success unless content was actually retrieved. */
  @Post('import-url') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  importUrl(@CurrentUser() u: AuthUser, @Body() dto: ImportUrlDto) { return this.svc.importUrl(u, dto); }

  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.listJds(u); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getJd(u, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDescriptionDto) { return this.svc.updateJd(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteJd(u, id); }
}

@Controller('resumes')
export class ResumeMatchController {
  constructor(private svc: ResumeMatchService) {}

  @Post(':resumeId/match-reports')
  create(@CurrentUser() u: AuthUser, @Param('resumeId', ParseUUIDPipe) resumeId: string, @Body() dto: CreateMatchReportDto) { return this.svc.createReport(u, resumeId, dto); }

  @Get(':resumeId/match-reports')
  list(@CurrentUser() u: AuthUser, @Param('resumeId', ParseUUIDPipe) resumeId: string, @Query('jobDescriptionId') jd?: string) {
    return this.svc.listReports(u, resumeId, jd && /^[0-9a-f-]{36}$/i.test(jd) ? jd : undefined);
  }
}

@Controller('resume-match-reports')
export class MatchReportsController {
  constructor(private svc: ResumeMatchService) {}

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getReport(u, id); }
  @Post(':id/recalculate') @HttpCode(200) recalc(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.recalculate(u, id); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteReport(u, id); }
}
