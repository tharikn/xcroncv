import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CreateShareDto, DecideFeedbackDto, LogFeedbackDto } from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

/** Owner-side only. There is deliberately no anonymous or token route in this release. */
@Controller('feedback-shares')
export class FeedbackController {
  constructor(private svc: FeedbackService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateShareDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Post(':id/revoke') @HttpCode(200) revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revoke(u, id); }
  @Get(':id/preview')
  preview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.svc.preview(u, id);
  }
  @Post(':id/feedback') logFeedback(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LogFeedbackDto) { return this.svc.logFeedback(u, id, dto); }
  @Get(':id/feedback') feedback(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listFeedback(u, id); }
  @Get(':id/summary') summary(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.summary(u, id); }
  @Patch(':id/feedback/:fid')
  decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('fid', ParseUUIDPipe) fid: string, @Body() dto: DecideFeedbackDto) { return this.svc.decide(u, id, fid, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
