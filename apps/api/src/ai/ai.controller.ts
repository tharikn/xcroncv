import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AiService } from './ai.service';
import { HelpChatDto } from './dto/help-chat.dto';
import { CreateSuggestionDto, DecideSuggestionDto, SetAiSettingsDto } from './dto/ai.dto';
import { HelpChatService } from './help/help-chat.service';

@Controller('ai')
export class AiController {
  constructor(private svc: AiService, private help: HelpChatService) {}

  @Get('status') status(@CurrentUser() u: AuthUser) { return this.svc.status(u); }
  @Put('settings') settings(@CurrentUser() u: AuthUser, @Body() dto: SetAiSettingsDto) { return this.svc.setEnabled(u, dto.enabled); }
  @Get('usage') usage(@CurrentUser() u: AuthUser) { return this.svc.usage(u); }

  /**
   * Floating in-app assistant: status and quota for the signed-in user.
   * Chat text itself is never persisted; only metering metadata is recorded.
   */
  @Get('help/status') helpStatus(@CurrentUser() u: AuthUser) { return this.help.statusForUser(u); }

  /** Assistant message. Auth required + per-user rate window + daily token budget. */
  @Post('help/chat') @HttpCode(200) @Throttle({ default: { limit: 12, ttl: 60_000 } })
  helpChat(@CurrentUser() u: AuthUser, @Body() dto: HelpChatDto) {
    return this.help.chat(u, dto.message, dto.history ?? [], dto.context ?? {});
  }

  @Post('suggestions') @HttpCode(201) suggest(@CurrentUser() u: AuthUser, @Body() dto: CreateSuggestionDto) { return this.svc.suggest(u, dto); }
  @Get('suggestions') list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Post('suggestions/:id/decision') @HttpCode(200)
  decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideSuggestionDto) { return this.svc.decide(u, id, dto); }
  @Delete('suggestions') purge(@CurrentUser() u: AuthUser) { return this.svc.purge(u); }
}
