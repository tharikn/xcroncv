import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CreateReviewDto, DecideDto, GrantDto, RecordFeedbackDto } from './dto/expert-review.dto';
import { ExpertReviewService } from './expert-review.service';

/** Owner-side only. There is no reviewer login, token route or public route in this release. */
@Controller()
export class ExpertReviewController {
  constructor(private svc: ExpertReviewService) {}

  @Get('reviewers') reviewers() { return this.svc.reviewers(); }
  @Get('review-packages') packages() { return this.svc.packages(); }

  @Post('expert-reviews') create(@CurrentUser() u: AuthUser, @Body() dto: CreateReviewDto) { return this.svc.create(u, dto); }
  @Get('expert-reviews') list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Get('expert-reviews/:id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Post('expert-reviews/:id/grant') @HttpCode(200) grant(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantDto) { return this.svc.grant(u, id, dto); }
  @Post('expert-reviews/:id/revoke') @HttpCode(200) revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revoke(u, id); }
  @Get('expert-reviews/:id/preview')
  preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.svc.preview(u, id);
  }
  @Post('expert-reviews/:id/feedback') record(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordFeedbackDto) { return this.svc.recordFeedback(u, id, dto); }
  @Get('expert-reviews/:id/feedback') feedback(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listFeedback(u, id); }
  @Patch('expert-reviews/:id/feedback/:fid')
  decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('fid', ParseUUIDPipe) fid: string, @Body() dto: DecideDto) { return this.svc.decide(u, id, fid, dto); }
  @Get('expert-reviews/:id/audit') audit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.audit(u, id); }
  @Delete('expert-reviews/:id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
