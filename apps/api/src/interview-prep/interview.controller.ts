import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AnswerFeedbackDto, CreatePrepDto, UpdateQuestionDto } from './dto/interview.dto';
import { InterviewService } from './interview.service';

@Controller('interview-preps')
export class InterviewController {
  constructor(private svc: InterviewService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreatePrepDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id/questions/:qid')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('qid') qid: string, @Body() dto: UpdateQuestionDto) { return this.svc.updateQuestion(u, id, qid, dto); }
  @Post(':id/questions/:qid/feedback') @HttpCode(200)
  feedback(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('qid') qid: string, @Body() dto: AnswerFeedbackDto) { return this.svc.feedback(u, id, qid, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
