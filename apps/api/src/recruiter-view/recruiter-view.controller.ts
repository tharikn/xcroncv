import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { RecruiterPreviewDto, RecruiterViewQueryDto } from './dto/recruiter-view.dto';
import { RecruiterViewService } from './recruiter-view.service';

/** Read-only endpoints (GET + a POST that only returns a projection). No public sharing endpoints in this release. */
@Controller('resumes')
export class RecruiterViewController {
  constructor(private svc: RecruiterViewService) {}

  @Get(':id/recruiter-view')
  view(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: RecruiterViewQueryDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.svc.view(u, id, { mode: q.mode, anonymize: q.anonymize, annotations: q.annotations, versionId: q.versionId });
  }

  @Post(':id/recruiter-view/preview') @HttpCode(200)
  preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecruiterPreviewDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.svc.view(u, id, { mode: dto.mode, anonymize: dto.anonymize, annotations: dto.includeAnnotations, versionId: dto.resumeVersionId, targetRole: dto.targetRole, keywords: dto.keywords });
  }

  @Get(':id/recruiter-view/annotations')
  annotations(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: RecruiterViewQueryDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.svc.annotations(u, id, q.versionId, q.anonymize);
  }
}
