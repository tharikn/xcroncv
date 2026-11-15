import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AnswerDto, ConsentDto, CreateSessionDto } from './dto/copilot.dto';
import { InterviewCopilotService } from './interview-copilot.service';

@Controller('interview-copilot/sessions')
export class InterviewCopilotController {
  constructor(private svc: InterviewCopilotService) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateSessionDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Post(':id/answers') @HttpCode(200) answer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerDto) { return this.svc.answer(u, id, dto); }
  @Post(':id/feedback') @HttpCode(200) summary(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.summary(u, id); }
  @Post(':id/consent') @HttpCode(200) consent(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsentDto) { return this.svc.consent(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
