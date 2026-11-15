import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { RunQualityReviewDto } from './dto/quality-review.dto';
import { QualityReviewService } from './quality-review.service';

@Controller('resumes')
export class ResumeQualityController {
  constructor(private svc: QualityReviewService) {}

  @Post(':resumeId/quality-reviews')
  run(@CurrentUser() u: AuthUser, @Param('resumeId', ParseUUIDPipe) resumeId: string, @Body() dto: RunQualityReviewDto) { return this.svc.run(u, resumeId, dto.resumeVersionId); }

  @Post(':resumeId/quality-reviews/export-check') @HttpCode(200)
  exportCheck(@CurrentUser() u: AuthUser, @Param('resumeId', ParseUUIDPipe) resumeId: string, @Body() dto: RunQualityReviewDto) { return this.svc.exportCheck(u, resumeId, dto.resumeVersionId); }

  @Get(':resumeId/quality-reviews')
  list(@CurrentUser() u: AuthUser, @Param('resumeId', ParseUUIDPipe) resumeId: string) { return this.svc.list(u, resumeId); }
}

@Controller('quality-reviews')
export class QualityReviewsController {
  constructor(private svc: QualityReviewService) {}

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
